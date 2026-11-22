# Telemetry receiver (Node.js)

A tiny in-memory HTTP server to prove the pipeline end to end: the Windows
telemetry tool POSTs decoded JSON here, and you can view the latest frame in a
browser. Pure Node.js, **no dependencies**.

## Run

```bash
cd receiver
npm start            # or: node server.js
# PORT=9000 node server.js              change the port (default 8080)
# HOST=127.0.0.4 node server.js         bind a specific address (default 0.0.0.0)
# AUTH_TOKEN=secret node server.js      require 'Authorization: Bearer secret' on POST /telemetry
```

### Auth

If `AUTH_TOKEN` is set, `POST /telemetry` requires a matching
`Authorization: Bearer <token>` header (401 otherwise). The GET view endpoints stay
open. If `AUTH_TOKEN` is unset, uploads are accepted without a token (dev mode).

Then point the Windows app's `config.ini` at it:

```
url = http://<this-machine-ip>:8080/telemetry
url_ssl_verify = false
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/telemetry` | Receive a JSON frame (kept in memory) |
| GET | `/telemetry` | The latest frame as JSON |
| GET | `/history` | The recent frames (last 50) as JSON |
| GET | `/` | Auto-refreshing HTML view of the latest frame |
| GET | `/health` | `{ "ok": true }` |

## Quick local test (no game needed)

```bash
node server.js &
curl -s -X POST localhost:8080/telemetry -H 'content-type: application/json' \
  -d '{"telemetry":{"actor":{"state":{"uec_balance":15001986}}}}'
curl -s localhost:8080/telemetry
# open http://localhost:8080/ in a browser
```

It keeps everything in memory only — restart and it's empty. This is a
throwaway for verifying the flow, not a store.
