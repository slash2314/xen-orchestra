import { asyncEach } from '@vates/async-each'
import { createGzip } from 'node:zlib'
import { defer } from 'golike-defer'
import { every } from '@vates/predicates'
import { ifDef } from '@xen-orchestra/defined'
import { featureUnauthorized, invalidCredentials, noSuchObject } from 'xo-common/api-errors.js'
import { pipeline } from 'node:stream/promises'
import { json, Router } from 'express'
import cloneDeep from 'lodash/cloneDeep.js'
import path from 'node:path'
import pick from 'lodash/pick.js'
import * as CM from 'complex-matcher'
import { VDI_FORMAT_RAW, VDI_FORMAT_VHD } from '@xen-orchestra/xapi'

import { getUserPublicProperties } from '../utils.mjs'
import { compileXoJsonSchema } from './_xoJsonSchema.mjs'

const { join } = path.posix
const noop = Function.prototype

function compressMaybe(req, res) {
  let transform

  const acceptEncoding = req.headers['accept-encoding']
  if (
    acceptEncoding !== undefined &&
    acceptEncoding.split(',').some(_ => _.split(';')[0].trim().toLocaleLowerCase() === 'gzip')
  ) {
    res.setHeader('content-encoding', 'gzip')
    transform = createGzip()
  }

  if (transform !== undefined) {
    pipeline(transform, res).catch(noop)
    return transform
  }
  return res
}

async function* makeObjectsStream(iterable, makeResult, json) {
  // use Object.values() on non-iterable objects
  if (
    iterable != null &&
    typeof iterable === 'object' &&
    typeof iterable[Symbol.iterator] !== 'function' &&
    typeof iterable[Symbol.asyncIterator] !== 'function'
  ) {
    iterable = Object.values(iterable)
  }

  if (json) {
    yield '['
    let first = true
    for await (const object of iterable) {
      if (first) {
        first = false
        yield '\n'
      } else {
        yield ',\n'
      }
      yield JSON.stringify(makeResult(object), null, 2)
    }
    yield '\n]\n'
  } else {
    for await (const object of iterable) {
      yield JSON.stringify(makeResult(object))
      yield '\n'
    }
  }
}

async function sendObjects(iterable, req, res, path = req.path) {
  const { query } = req

  const basePath = join(req.baseUrl, path)
  const makeUrl = ({ id }) => join(basePath, typeof id === 'number' ? String(id) : id)

  let makeResult
  let { fields } = query
  if (fields === undefined) {
    makeResult = makeUrl
  } else if (fields === '*') {
    makeResult = object => ({
      ...object,
      href: makeUrl(object),
    })
  } else {
    fields = fields.split(',')
    makeResult = object => {
      const url = makeUrl(object)
      object = pick(object, fields)
      object.href = url
      return object
    }
  }

  const json = !Object.hasOwn(query, 'ndjson')

  res.setHeader('content-type', json ? 'application/json' : 'application/x-ndjson')
  return pipeline(makeObjectsStream(iterable, makeResult, json, res), res)
}

function handleArray(array, filter, limit) {
  if (filter !== undefined) {
    array = array.filter(filter)
  }
  if (limit < array.length) {
    array.length = limit
  }

  return array
}

const handleOptionalUserFilter = filter => filter && CM.parse(filter).createPredicate()

const subRouter = (app, path) => {
  const router = Router({ strict: false })
  app.use(path, router)
  return router
}

// wraps an async middleware
function wrap(middleware, handleNoSuchObject = false) {
  return async function asyncMiddlewareWrapped(req, res, next) {
    try {
      await middleware.apply(this, arguments)
    } catch (error) {
      if (featureUnauthorized.is(error)) {
        res.sendStatus(403)
      } else if (handleNoSuchObject && noSuchObject.is(error)) {
        res.sendStatus(404)
      } else {
        next(error)
      }
    }
  }
}

export default class RestApi {
  #api

  constructor(app, { express }) {
    // don't setup the API if express is not present
    //
    // that can happen when the app is instanciated in another context like xo-server-recover-account
    if (express === undefined) {
      return
    }

    const api = subRouter(express, '/rest/v0')
    this.#api = api

    api.use((req, res, next) => {
      const { cookies } = req
      app.authenticateUser({ token: cookies.authenticationToken ?? cookies.token }).then(
        ({ user }) => {
          if (user.permission === 'admin') {
            req.user = user
            return next()
          }

          res.sendStatus(401)
        },
        error => {
          if (invalidCredentials.is(error)) {
            res.sendStatus(401)
          } else {
            next(error)
          }
        }
      )
    })

    const collections = { __proto__: null }

    const withParams = (fn, paramsSchema) => {
      fn.params = paramsSchema
      fn.validateParams = compileXoJsonSchema({ type: 'object', properties: cloneDeep(paramsSchema) })
      return fn
    }

    {
      const types = [
        'host',
        'message',
        'network',
        'pool',
        'SR',
        'VBD',
        'VDI-snapshot',
        'VDI',
        'VIF',
        'VM-snapshot',
        'VM-template',
        'VM',
      ]
      function getObject(id, req) {
        const { type } = this
        const object = app.getObject(id, type)

        // add also the XAPI version of the object
        req.xapiObject = app.getXapiObject(object)

        return object
      }
      function getObjects(filter, limit) {
        return app.getObjects({
          filter: every(this.isCorrectType, filter),
          limit,
        })
      }
      async function messages(req, res) {
        const {
          object: { id },
          query,
        } = req
        await sendObjects(
          app.getObjects({
            filter: every(_ => _.type === 'message' && _.$object === id, handleOptionalUserFilter(query.filter)),
            limit: ifDef(query.limit, Number),
          }),
          req,
          res,
          '/messages'
        )
      }
      for (const type of types) {
        const id = type.toLocaleLowerCase() + 's'

        collections[id] = { getObject, getObjects, routes: { messages }, isCorrectType: _ => _.type === type, type }
      }

      collections.hosts.routes = {
        ...collections.hosts.routes,

        async 'audit.txt'(req, res) {
          const host = req.xapiObject

          res.setHeader('content-type', 'text/plain')
          await pipeline(await host.$xapi.getResource('/audit_log', { host }), compressMaybe(req, res))
        },

        async 'logs.tar'(req, res) {
          const host = req.xapiObject

          res.setHeader('content-type', 'application/x-tar')
          await pipeline(await host.$xapi.getResource('/host_logs_download', { host }), compressMaybe(req, res))
        },

        async missing_patches(req, res) {
          await app.checkFeatureAuthorization('LIST_MISSING_PATCHES')

          const host = req.xapiObject
          res.json(await host.$xapi.listMissingPatches(host))
        },

        async smt({ xapiObject }, res) {
          res.json({ enabled: await xapiObject.$xapi.isHyperThreadingEnabled(xapiObject.$id) })
        },
      }

      collections.pools.routes = {
        ...collections.pools.routes,

        async missing_patches(req, res) {
          await app.checkFeatureAuthorization('LIST_MISSING_PATCHES')

          const xapi = req.xapiObject.$xapi
          const missingPatches = new Map()
          await asyncEach(Object.values(xapi.objects.indexes.type.host ?? {}), async host => {
            try {
              for (const patch of await xapi.listMissingPatches(host)) {
                const { uuid: key = `${patch.name}-${patch.version}-${patch.release}` } = patch
                missingPatches.set(key, patch)
              }
            } catch (error) {
              console.warn(host.uuid, error)
            }
          })
          res.json(Array.from(missingPatches.values()))
        },
      }

      collections.pools.actions = {
        create_vm: withParams(
          defer(async ($defer, { xapiObject: { $xapi } }, { affinity, boot, install, template, ...params }, req) => {
            params.affinityHost = affinity
            params.installRepository = install?.repository

            const vm = await $xapi.createVm(template, params, undefined, req.user.id)
            $defer.onFailure.call($xapi, 'VM_destroy', vm.$ref)

            if (boot) {
              await $xapi.callAsync('VM.start', vm.$ref, false, false)
            }

            return vm.uuid
          }),
          {
            affinity: { type: 'string', optional: true },
            auto_poweron: { type: 'boolean', optional: true },
            boot: { type: 'boolean', default: false },
            clone: { type: 'boolean', default: true },
            install: {
              type: 'object',
              optional: true,
              properties: {
                method: { enum: ['cdrom', 'network'] },
                repository: { type: 'string' },
              },
            },
            memory: { type: 'integer', optional: true },
            name_description: { type: 'string', minLength: 0, optional: true },
            name_label: { type: 'string' },
            template: { type: 'string' },
          }
        ),
        emergency_shutdown: async ({ xapiObject }) => {
          await app.checkFeatureAuthorization('POOL_EMERGENCY_SHUTDOWN')

          await xapiObject.$xapi.pool_emergencyShutdown()
        },
        rolling_update: async ({ object }) => {
          await app.checkFeatureAuthorization('ROLLING_POOL_UPDATE')

          await app.rollingPoolUpdate(object)
        },
      }
      collections.vms.actions = {
        clean_reboot: ({ xapiObject: vm }) => vm.$callAsync('clean_reboot').then(noop),
        clean_shutdown: ({ xapiObject: vm }) => vm.$callAsync('clean_shutdown').then(noop),
        hard_reboot: ({ xapiObject: vm }) => vm.$callAsync('hard_reboot').then(noop),
        hard_shutdown: ({ xapiObject: vm }) => vm.$callAsync('hard_shutdown').then(noop),
        snapshot: withParams(
          async ({ xapiObject: vm }, { name_label }) => {
            const ref = await vm.$snapshot({ name_label })
            return vm.$xapi.getField('VM', ref, 'uuid')
          },
          { name_label: { type: 'string', optional: true } }
        ),
        start: ({ xapiObject: vm }) => vm.$callAsync('start', false, false).then(noop),
      }
    }

    collections.backup = {}
    collections.groups = {
      getObject(id) {
        return app.getGroup(id)
      },
      async getObjects(filter, limit) {
        return handleArray(await app.getAllGroups(), filter, limit)
      },
      routes: {
        async users(req, res) {
          const { filter, limit } = req.query
          await sendObjects(
            handleArray(
              await Promise.all(req.object.users.map(id => app.getUser(id).then(getUserPublicProperties))),
              handleOptionalUserFilter(filter),
              ifDef(limit, Number)
            ),
            req,
            res,
            '/users'
          )
        },
      },
    }
    collections.restore = {}
    collections.tasks = {}
    collections.users = {
      getObject(id) {
        return app.getUser(id).then(getUserPublicProperties)
      },
      async getObjects(filter, limit) {
        return handleArray(await app.getAllUsers(), filter, limit)
      },
      routes: {
        async groups(req, res) {
          const { filter, limit } = req.query
          await sendObjects(
            handleArray(
              await Promise.all(req.object.groups.map(id => app.getGroup(id))),
              handleOptionalUserFilter(filter),
              ifDef(limit, Number)
            ),
            req,
            res,
            '/groups'
          )
        },
      },
    }

    // normalize collections
    for (const id of Object.keys(collections)) {
      const collection = collections[id]

      // inject id into the collection
      collection.id = id

      // set null as prototypes to speed-up look-ups
      Object.setPrototypeOf(collection, null)
      const { actions, routes } = collection
      if (actions !== undefined) {
        Object.setPrototypeOf(actions, null)
      }
      if (routes !== undefined) {
        Object.setPrototypeOf(routes, null)
      }
    }

    api.param('collection', (req, res, next) => {
      const id = req.params.collection
      const collection = collections[id]
      if (collection === undefined) {
        next('route')
      } else {
        req.collection = collection
        next()
      }
    })
    api.param('object', async (req, res, next) => {
      const id = req.params.object
      try {
        // eslint-disable-next-line require-atomic-updates
        req.object = await req.collection.getObject(id, req)
        return next()
      } catch (error) {
        if (noSuchObject.is(error, { id })) {
          next('route')
        } else {
          next(error)
        }
      }
    })

    api.get(
      '/',
      wrap((req, res) => sendObjects(collections, req, res))
    )

    // For compatibility redirect from /backups* to /backup
    api.get('/backups*', (req, res) => {
      res.redirect(308, req.baseUrl + '/backup' + req.params[0])
    })

    const backupTypes = {
      __proto__: null,

      metadata: 'metadataBackup',
      mirror: 'mirrorBackup',
      vm: 'backup',
    }

    api
      .get(
        '/backup',
        wrap((req, res) => sendObjects([{ id: 'jobs' }, { id: 'logs' }], req, res))
      )
      .get(
        '/backup/logs',
        wrap(async (req, res) => {
          const { filter, limit } = req.query
          const logs = await app.getBackupNgLogsSorted({
            filter: every(({ message: m }) => m === 'backup' || m === 'metadata', handleOptionalUserFilter(filter)),
            limit: ifDef(limit, Number),
          })
          await sendObjects(logs, req, res)
        })
      )
      .get(
        '/backup/jobs',
        wrap((req, res) =>
          sendObjects(
            Object.keys(backupTypes).map(id => ({ id })),
            req,
            res
          )
        )
      )

    for (const [collection, type] of Object.entries(backupTypes)) {
      api
        .get(
          '/backup/jobs/' + collection,
          wrap(async (req, res) => sendObjects(await app.getAllJobs(type), req, res))
        )
        .get(
          `/backup/jobs/${collection}/:id`,
          wrap(async (req, res) => {
            res.json(await app.getJob(req.params.id, type))
          }, true)
        )
    }

    // For compatibility, redirect /backup/jobs/:id to /backup/jobs/vm/:id
    api.get('/backup/jobs/:id', (req, res) => {
      res.redirect(308, req.baseUrl + '/backup/jobs/vm/' + req.params.id)
    })

    api
      .get(
        '/restore',
        wrap((req, res) => sendObjects([{ id: 'logs' }], req, res))
      )
      .get(
        '/restore/logs',
        wrap(async (req, res) => {
          const { filter, limit } = req.query
          const logs = await app.getBackupNgLogsSorted({
            filter: every(_ => _.message === 'restore', handleOptionalUserFilter(filter)),
            limit: ifDef(limit, Number),
          })
          await sendObjects(logs, req, res)
        })
      )
      .get(
        ['/backup/logs/:id', '/restore/logs/:id'],
        wrap(async (req, res) => {
          res.json(await app.getBackupNgLogs(req.params.id))
        })
      )

    api
      .get(
        '/tasks',
        wrap(async (req, res) => {
          const { filter, limit } = req.query
          const tasks = app.tasks.list({
            filter: handleOptionalUserFilter(filter),
            limit: ifDef(limit, Number),
          })
          await sendObjects(tasks, req, res)
        })
      )
      .delete(
        '/tasks',
        wrap(async (req, res) => {
          await app.tasks.clearLogs()
          res.sendStatus(200)
        })
      )
      .get(
        '/tasks/:id',
        wrap(async (req, res) => {
          const {
            params: { id },
            query: { wait },
          } = req
          if (wait !== undefined) {
            const stopWatch = await app.tasks.watch(id, task => {
              if (wait !== 'result' || task.status !== 'pending') {
                stopWatch()
                res.json(task)
              }
            })
            req.on('close', stopWatch)
          } else {
            res.json(await app.tasks.get(id))
          }
        }, true)
      )
      .delete(
        '/tasks/:id',
        wrap(async (req, res) => {
          await app.tasks.deleteLog(req.params.id)
          res.sendStatus(200)
        })
      )
      .get(
        '/tasks/:id/actions',
        wrap(async (req, res) => {
          const task = await app.tasks.get(req.params.id)

          await sendObjects(task.status === 'pending' ? [{ id: 'abort' }] : [], req, res)
        })
      )
      .post(
        '/tasks/:id/actions/abort',
        wrap(async (req, res) => {
          const { id } = req.params
          await app.tasks.abort(id)
          res.status = 202
          res.end(req.baseUrl + '/tasks/' + id)
        }, true)
      )

    api.get(
      '/:collection',
      wrap(async (req, res) => {
        const { query } = req
        await sendObjects(
          await req.collection.getObjects(handleOptionalUserFilter(query.filter), ifDef(query.limit, Number)),
          req,
          res
        )
      })
    )

    // should go before routes /:collection/:object because they will match but
    // will not work due to the extension being included in the object identifer
    api.get(
      '/:collection(vdis|vdi-snapshots)/:object.:format(vhd|raw)',
      wrap(async (req, res) => {
        const preferNbd = Object.hasOwn(req.query, 'preferNbd')
        const nbdConcurrency = req.query.nbdConcurrency && parseInt(req.query.nbdConcurrency)
        const stream = await req.xapiObject.$exportContent({ format: req.params.format, preferNbd, nbdConcurrency })

        res.writeHead(200, 'OK', { 'content-disposition': 'attachment', 'content-length': stream.length })
        await pipeline(stream, res)
      })
    )
    api.put(
      '/:collection(vdis|vdi-snapshots)/:object.:format(vhd|raw)',
      wrap(async (req, res) => {
        req.length = +req.headers['content-length']
        await req.xapiObject.$importContent(req, { format: req.params.format })

        res.sendStatus(204)
      })
    )
    api.get(
      '/:collection(vms|vm-snapshots|vm-templates)/:object.xva',
      wrap(async (req, res) => {
        const { body, headers, statusCode, statusMessage } = await req.xapiObject.$export({
          compress: req.query.compress,
        })

        res.writeHead(statusCode, statusMessage != null ? statusMessage : '', {
          ...headers,
          'content-disposition': 'attachment',
        })

        await pipeline(body, res)
      })
    )

    api.get('/:collection/:object', (req, res) => {
      let result = req.object

      // add locations of sub-routes for discoverability
      const { routes } = req.collection
      if (routes !== undefined) {
        result = { ...result }
        for (const route of Object.keys(routes)) {
          result[route.split('.')[0] + '_href'] = join(req.baseUrl, req.path, route)
        }
      }

      res.json(result)
    })
    api
      .patch(
        '/:collection/:object',
        json(),
        wrap(async (req, res) => {
          const obj = req.xapiObject

          const promises = []
          const { body } = req

          for (const key of ['name_description', 'name_label', 'tags']) {
            const value = body[key]
            if (value !== undefined) {
              promises.push(obj['set_' + key](value))
            }
          }

          await promises
          res.sendStatus(204)
        })
      )
      .delete(
        '/:collection/:object/tags/:tag',
        wrap(async (req, res) => {
          await req.xapiObject.$call('remove_tags', req.params.tag)

          res.sendStatus(204)
        })
      )
      .put(
        '/:collection/:object/tags/:tag',
        wrap(async (req, res) => {
          await req.xapiObject.$call('add_tags', req.params.tag)

          res.sendStatus(204)
        })
      )

    api.get(
      '/:collection/:object/tasks',
      wrap(async (req, res) => {
        const { query } = req
        const objectId = req.object.id
        const tasks = app.tasks.list({
          filter: every(
            _ => _.status === 'pending' && _.properties.objectId === objectId,
            handleOptionalUserFilter(query.filter)
          ),
          limit: ifDef(query.limit, Number),
        })
        await sendObjects(tasks, req, res, '/tasks')
      })
    )

    api.get(
      '/:collection/:object/actions',
      wrap((req, res) => {
        const { actions } = req.collection
        return sendObjects(
          actions === undefined ? [] : Array.from(Object.keys(actions), id => ({ ...actions[id], id })),
          req,
          res
        )
      })
    )
    api.post('/:collection/:object/actions/:action', json(), (req, res, next) => {
      const { action } = req.params
      const fn = req.collection.actions?.[action]
      if (fn === undefined) {
        return next()
      }

      const params = req.body

      const { validateParams } = fn
      if (validateParams !== undefined) {
        if (!validateParams(params)) {
          res.statusCode = 400
          return res.json(validateParams.errors)
        }
      }

      const { object, xapiObject } = req
      const task = app.tasks.create({ name: `REST: ${action} ${req.collection.type}`, objectId: object.id })
      const pResult = task.run(() => fn({ object, xapiObject }, params, req))
      if (Object.hasOwn(req.query, 'sync')) {
        pResult.then(result => res.json(result), next)
      } else {
        pResult.catch(noop)
        res.statusCode = 202
        res.end(req.baseUrl + '/tasks/' + task.id)
      }
    })

    api.get(
      '/:collection/:object/:route',
      wrap((req, res, next) => {
        const handler = req.collection.routes?.[req.params.route]
        if (handler !== undefined) {
          return handler(req, res, next)
        }
        return next()
      })
    )

    api.post(
      '/:collection(pools)/:object/vms',
      wrap(async (req, res) => {
        let srRef
        const { sr } = req.params
        if (sr !== undefined) {
          srRef = app.getXapiObject(sr, 'SR').$ref
        }

        const { $xapi } = req.xapiObject
        const ref = await $xapi.VM_import(req, srRef)

        res.end(await $xapi.getField('VM', ref, 'uuid'))
      })
    )

    api.post(
      '/:collection(srs)/:object/vdis',
      wrap(async (req, res) => {
        const sr = req.xapiObject
        req.length = +req.headers['content-length']

        const { name_label, name_description, raw } = req.query
        const vdiRef = await sr.$importVdi(req, {
          format: raw !== undefined ? VDI_FORMAT_RAW : VDI_FORMAT_VHD,
          name_label,
          name_description,
        })

        res.end(await sr.$xapi.getField('VDI', vdiRef, 'uuid'))
      })
    )

    api.delete(
      '/:collection(vdis|vdi-snapshots|vms|vm-snapshots|vm-templates)/:object',
      wrap(async (req, res) => {
        await req.xapiObject.$destroy()
        res.sendStatus(200)
      })
    )
  }

  registerRestApi(spec, base = '/') {
    for (const path of Object.keys(spec)) {
      if (path[0] === '_') {
        const handler = spec[path]
        this.#api[path.slice(1)](base, json(), async (req, res, next) => {
          try {
            const result = await handler(req, res, next)
            if (result !== undefined) {
              const isIterable =
                result !== null && typeof (result[Symbol.iterator] ?? result[Symbol.asyncIterator]) === 'function'
              if (isIterable) {
                await sendObjects(result, req, res)
              } else {
                res.json(result)
              }
            }
          } catch (error) {
            next(error)
          }
        })
      } else {
        this.registerRestApi(spec[path], join(base, path))
      }
    }
    return () => {
      throw new Error('not implemented')
    }
  }
}
