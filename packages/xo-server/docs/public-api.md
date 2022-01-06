This [REST](https://en.wikipedia.org/wiki/Representational_state_transfer)-oriented API is available at the address `/api/public/v0`.

### Authentication

A valid authentication token should be attached as a cookie to all HTTP
requests:

```http
GET /api/public/v0 HTTP/1.1
Cookie: authenticationToken=TN2YBOMYtXB_hHtf4wTzm9p5tTuqq2i15yeuhcz2xXM
```

The server will respond to an invalid token with a `401 Unauthorized` status.

The server can request the client to update its token with a `Set-Cookie` header:

```http
HTTP/1.1 200 OK
Set-Cookie: authenticationToken=KQxQdm2vMiv7jBIK0hgkmgxKzemd8wSJ7ugFGKFkTbs
```

Usage with cURL:

```
curl -b authenticationToken=KQxQdm2vMiv7jBIK0hgkmgxKzemd8wSJ7ugFGKFkTbs https://xo.company.lan/api/proxy/v0
```

### Collections

Collections of objects are available at `/<name>` (e.g. `/vms`)

Following query parameters are supported:

- `limit`: max number of objects returned
- `fields`: if specified, instead of plain URLs, the results will be objects containing the requested fields
- `filter`: a string that will be used to select only matching objects, see [the syntax documentation](https://xen-orchestra.com/docs/manage_infrastructure.html#live-filter-search)
- `ndjson`: if specified, the result will be in [NDJSON format](http://ndjson.org/)

Simple request:

```
GET /api/public/v0/vms HTTP/1.1
Cookie: authenticationToken=TN2YBOMYtXB_hHtf4wTzm9p5tTuqq2i15yeuhcz2xXM

HTTP/1.1 200 OK
Content-Type: application/json

[
  "/api/public/v0/vms/770aa52a-fd42-8faf-f167-8c5c4a237cac",
  "/api/public/v0/vms/5019156b-f40d-bc57-835b-4a259b177be1"
]
```

With custom fields:

```
GET /api/public/v0/vms?fields=name_label,power_state HTTP/1.1
Cookie: authenticationToken=TN2YBOMYtXB_hHtf4wTzm9p5tTuqq2i15yeuhcz2xXM

HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "name_label": "Debian 10 Cloudinit",
    "power_state": "Running",
    "url": "/api/public/v0/vms/770aa52a-fd42-8faf-f167-8c5c4a237cac"
  },
  {
    "name_label": "Debian 10 Cloudinit self-service",
    "power_state": "Halted",
    "url": "/api/public/v0/vms/5019156b-f40d-bc57-835b-4a259b177be1"
  }
]
```

As NDJSON:

```
GET /api/public/v0/vms?fields=name_label,power_state&ndjson HTTP/1.1
Cookie: authenticationToken=TN2YBOMYtXB_hHtf4wTzm9p5tTuqq2i15yeuhcz2xXM

HTTP/1.1 200 OK
Content-Type: application/x-ndjson

{"name_label":"Debian 10 Cloudinit","power_state":"Running","url":"/api/public/v0/vms/770aa52a-fd42-8faf-f167-8c5c4a237cac"}
{"name_label":"Debian 10 Cloudinit self-service","power_state":"Halted","url":"/api/public/v0/vms/5019156b-f40d-bc57-835b-4a259b177be1"}
```
