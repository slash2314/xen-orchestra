import {
  computeBatSize,
  computeSectorOfBitmap,
  computeSectorsPerBlock,
  sectorsRoundUpNoZero,
  sectorsToBytes,
} from './_utils'
import { PLATFORMS, SECTOR_SIZE, PARENT_LOCATOR_ENTRIES, FOOTER_SIZE, HEADER_SIZE, BLOCK_UNUSED } from '../_constants'
import assert from 'assert'
import path from 'path'
import asyncIteratorToStream from 'async-iterator-to-stream'
import { checksumStruct, fuFooter, fuHeader } from '../_structs'
import { isVhdAlias, resolveAlias } from '../_resolveAlias'

export class VhdAbstract {
  #header
  footer

  get bitmapSize() {
    return sectorsToBytes(this.sectorsOfBitmap)
  }

  get fullBlockSize() {
    return sectorsToBytes(this.sectorsOfBitmap + this.sectorsPerBlock)
  }

  get header() {
    assert.notStrictEqual(this.#header, undefined, `header must be read before it's used`)
    return this.#header
  }

  get sectorsOfBitmap() {
    return computeSectorOfBitmap(this.header.blockSize)
  }

  get sectorsPerBlock() {
    return computeSectorsPerBlock(this.header.blockSize)
  }

  set header(header) {
    this.#header = header
  }

  /**
   * instantiate a Vhd
   *
   * @returns {AbstractVhd}
   */
  static async open() {
    throw new Error('open not implemented')
  }

  /**
   * Check if this vhd contains a block with id blockId
   * Must be called after readBlockAllocationTable
   *
   * @param {number} blockId
   * @returns {boolean}
   *
   */
  containsBlock(blockId) {
    throw new Error(`checking if this vhd contains the block ${blockId} is not implemented`)
  }

  /**
   * Read the header and the footer
   * check their integrity
   * if checkSecondFooter also checks that the footer at the end is equal to the one at the beginning
   *
   * @param {boolean} checkSecondFooter
   */
  readHeaderAndFooter(checkSecondFooter = true) {
    throw new Error(
      `reading and checking footer, ${checkSecondFooter ? 'second footer,' : ''} and header is not implemented`
    )
  }

  readBlockAllocationTable() {
    throw new Error(`reading block allocation table is not implemented`)
  }

  /**
   *
   * @param {number} blockId
   * @param {boolean} onlyBitmap
   * @returns {Buffer}
   */
  readBlock(blockId, onlyBitmap = false) {
    throw new Error(`reading  ${onlyBitmap ? 'bitmap of block' : 'block'} ${blockId} is not implemented`)
  }

  /**
   * coalesce the block with id blockId from the child vhd into
   * this vhd
   *
   * @param {AbstractVhd} child
   * @param {number} blockId
   *
   * @returns {number} the merged data size
   */
  async coalesceBlock(child, blockId) {
    const block = await child.readBlock(blockId)
    await this.writeEntireBlock(block)
    return block.data.length
  }

  /**
   * ensure the bat size can store at least entries block
   * move blocks if needed
   * @param {number} entries
   */
  ensureBatSize(entries) {
    throw new Error(`ensuring batSize can store at least  ${entries} is not implemented`)
  }

  // Write a context footer. (At the end and beginning of a vhd file.)
  writeFooter(onlyEndFooter = false) {
    throw new Error(`writing footer   ${onlyEndFooter ? 'only at end' : 'on both side'} is not implemented`)
  }

  writeHeader() {
    throw new Error(`writing header is not implemented`)
  }

  _writeParentLocatorData(parentLocatorId, platformDataOffset, data) {
    throw new Error(`write Parent locator ${parentLocatorId} is not implemented`)
  }

  _readParentLocatorData(parentLocatorId, platformDataOffset, platformDataSpace) {
    throw new Error(`read Parent locator ${parentLocatorId} is not implemented`)
  }
  // common
  get batSize() {
    return computeBatSize(this.header.maxTableEntries)
  }

  async writeParentLocator({ id, platformCode = PLATFORMS.NONE, data = Buffer.alloc(0) }) {
    assert(id >= 0, 'parent Locator id must be a positive number')
    assert(id < PARENT_LOCATOR_ENTRIES, `parent Locator id  must be less than ${PARENT_LOCATOR_ENTRIES}`)

    await this._writeParentLocatorData(id, data)

    const entry = this.header.parentLocatorEntry[id]
    const dataSpaceSectors = Math.ceil(data.length / SECTOR_SIZE)
    entry.platformCode = platformCode
    entry.platformDataSpace = dataSpaceSectors * SECTOR_SIZE
    entry.platformDataLength = data.length
  }

  async readParentLocator(id) {
    assert(id >= 0, 'parent Locator id must be a positive number')
    assert(id < PARENT_LOCATOR_ENTRIES, `parent Locator id  must be less than ${PARENT_LOCATOR_ENTRIES}`)
    const data = await this._readParentLocatorData(id)
    // offset is storage specific, don't expose it
    const { platformCode } = this.header.parentLocatorEntry[id]
    return {
      platformCode,
      id,
      data,
    }
  }

  async setUniqueParentLocator(fileNameString) {
    await this.writeParentLocator({
      id: 0,
      platformCode: PLATFORMS.W2KU,
      data: Buffer.from(fileNameString, 'utf16le'),
    })

    for (let i = 1; i < PARENT_LOCATOR_ENTRIES; i++) {
      await this.writeParentLocator({
        id: i,
        platformCode: PLATFORMS.NONE,
        data: Buffer.alloc(0),
      })
    }
  }

  async *blocks() {
    const nBlocks = this.header.maxTableEntries
    for (let blockId = 0; blockId < nBlocks; ++blockId) {
      if (await this.containsBlock(blockId)) {
        yield await this.readBlock(blockId)
      }
    }
  }

  static async rename(handler, sourcePath, targetPath) {
    try {
      // delete target if it already exists
      await VhdAbstract.unlink(handler, targetPath)
    } catch (e) {}
    await handler.rename(sourcePath, targetPath)
  }

  static async unlink(handler, path) {
    const resolved = await resolveAlias(handler, path)
    try {
      await handler.unlink(resolved)
    } catch (err) {
      if (err.code === 'EISDIR') {
        await handler.rmtree(resolved)
      } else {
        throw err
      }
    }

    // also delete the alias file
    if (path !== resolved) {
      await handler.unlink(path)
    }
  }

  static async createAlias(handler, aliasPath, targetPath) {
    if (!isVhdAlias(aliasPath)) {
      throw new Error(`Alias must be named *.alias.vhd,  ${aliasPath} given`)
    }
    if (isVhdAlias(targetPath)) {
      throw new Error(`Chaining alias is forbidden ${aliasPath} to ${targetPath}`)
    }
    // aliasPath and targetPath are absolute path from the root of the handler
    // normalize them so they can't  escape this dir
    const aliasDir = path.dirname(path.resolve('/', aliasPath))
    // only store the relative path from alias to target
    const relativePathToTarget = path.relative(aliasDir, path.resolve('/', targetPath))
    await handler.writeFile(aliasPath, relativePathToTarget)
  }

  async stream() {
    const { footer, batSize } = this
    const { ...header } = this.header // copy since we don't ant to modifiy the current header
    const rawFooter = fuFooter.pack(footer)
    checksumStruct(rawFooter, fuFooter)

    // compute parent locator place and size
    // update them in header
    // update checksum in header

    let offset = FOOTER_SIZE + HEADER_SIZE + batSize
    for (let i = 0; i < PARENT_LOCATOR_ENTRIES; i++) {
      const { ...entry } = header.parentLocatorEntry[i]
      if (entry.platformDataSpace > 0) {
        entry.platformDataOffset = offset
        offset += entry.platformDataSpace
      }
      header.parentLocatorEntry[i] = entry
    }

    const rawHeader = fuHeader.pack(header)
    checksumStruct(rawHeader, fuHeader)

    assert.strictEqual(offset % SECTOR_SIZE, 0)
    const bat = Buffer.allocUnsafe(batSize)
    let offsetSector = offset / SECTOR_SIZE
    const blockSizeInSectors = this.fullBlockSize / SECTOR_SIZE
    let fileSize = offsetSector * SECTOR_SIZE + FOOTER_SIZE /* the footer at the end */
    for (let i = 0; i < PARENT_LOCATOR_ENTRIES; i++) {
      if (header.parentLocatorEntry[i].platformDataSpace > 0) {
        // align parent locator to sector
        const parentLocator = await this.readParentLocator(i)
        const space = sectorsToBytes(sectorsRoundUpNoZero(parentLocator.data.length))
        header.parentLocatorEntry[i].platformDataLength = parentLocator.data.length
        header.parentLocatorEntry[i].platformDataOffset = offsetSector * SECTOR_SIZE
        header.parentLocatorEntry[i].platformDataSpace = space
        fileSize += space
        offsetSector += space / SECTOR_SIZE
      }
    }

    header.tableOffset = HEADER_SIZE + FOOTER_SIZE

    // compute BAT , blocks starts after parent locator entries
    for (let i = 0; i < header.maxTableEntries; i++) {
      if (this.containsBlock(i)) {
        bat.writeUInt32BE(offsetSector, i * 4)
        offsetSector += blockSizeInSectors
        fileSize += this.fullBlockSize
      } else {
        bat.writeUInt32BE(BLOCK_UNUSED, i * 4)
      }
    }

    const self = this
    async function* iterator() {
      yield rawFooter
      yield rawHeader
      yield bat

      let size = rawFooter.length + rawHeader.length + bat.length
      // yield parent locator entries
      for (let i = 0; i < PARENT_LOCATOR_ENTRIES; i++) {
        if (header.parentLocatorEntry[i].platformDataLength > 0) {
          const parentLocator = await self.readParentLocator(i)
          // @ todo pad to platformDataSpacerawHeader
          // align parent locator to sector
          const buffer = Buffer.alloc(sectorsToBytes(sectorsRoundUpNoZero(parentLocator.data.length)), 0)
          parentLocator.data.copy(buffer)
          size += buffer.length
          yield buffer
        }
      }
      // yield all blocks
      // since contains() can be costly for synthetic vhd, use the computed bat
      for (let i = 0; i < header.maxTableEntries; i++) {
        if (bat.readUInt32BE(i * 4) !== BLOCK_UNUSED) {
          const block = await self.readBlock(i)
          size += block.buffer.length
          yield block.buffer
        }
      }
      // some empty bytes ate the end
      yield Buffer.alloc(fileSize - size - 512, 0)
      size += fileSize - size - 512
      // the foter again
      yield rawFooter
      size += rawFooter.length
    }

    const stream = asyncIteratorToStream(iterator())
    stream.length = fileSize
    return stream
  }

  rawContent() {
    const { header, footer } = this
    const { blockSize } = header
    const self = this
    async function* iterator() {
      const nBlocks = header.maxTableEntries
      let remainingSize = footer.currentSize
      const EMPTY = Buffer.alloc(blockSize, 0)
      for (let blockId = 0; blockId < nBlocks; ++blockId) {
        let buffer = self.containsBlock(blockId) ? (await self.readBlock(blockId)).data : EMPTY
        // the last block can be truncated since raw size is not a multiple of blockSize
        buffer = remainingSize < blockSize ? buffer.slice(0, remainingSize) : buffer
        remainingSize -= blockSize
        yield buffer
      }
    }
    const stream = asyncIteratorToStream(iterator())
    stream.length = footer.currentSize
    return stream
  }
}
