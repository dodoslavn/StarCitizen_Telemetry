# SCTelemetry — website

Full telemetry service: **Discord login**, per-source **client credentials**, **groups**
with invite links, and a read-only **group API**. Pure Node.js — **no dependencies**.
Config (users, sources, groups) persists to a JSON file; the telemetry **data itself is
kept in memory only** and is gone on restart.

## Concepts

- **Account** — a person, logged in via Discord.
- **Source** — one running instance of Star Citizen. Has a letters-only name, a secret
  **bearer token** (read + write), and a **history size** (default 100 frames kept in
  memory). An account can own many sources.
- **Group** — bundles sources together behind one **read-only** endpoint (keyed by a
  secret **read key**). Anyone can create one; sources join via its **invite link**.
  Ownership can be transferred to another member.

## Endpoints

### Web (Discord session)
`/` · `/login` · `/logout` · `/sources` (+ `/sources/:id/data|edit`) · `/groups`
(+ `/groups/:id`) · `/join/:code` · `/about` · `/api` docs.

### API
| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/ping` | none | liveness + dynamic nonce/uptime |
| POST | `/api/telemetry` (alias `/telemetry`) | `Bearer <source token>` | stores a frame |
| GET | `/api/telemetry?n=1` | `Bearer <source token>` | the n-th latest frame (creds test) |
| GET | `/api/groups/:id/latest` | `?key=` or `Bearer <read key>` | `{ sources: { "<acct>_<src>": frame } }` |
| GET | `/api/groups/:id/history` | `?key=` or `Bearer <read key>` | history per source |

Any read call accepts `?path=a.b.c` to return just that value (missing → `-`). Only
valid JSON is accepted on write.

## Configure

Copy `.env.example` → `.env` and fill it in (see the file for every key). The essentials:

```ini
BASE_URL=https://example.com
SESSION_SECRET=<openssl rand -hex 32>
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
```

### Discord app (one-time)
1. https://discord.com/developers/applications → **New Application**.
2. **OAuth2** → add redirect `https://example.com/auth/discord/callback`.
3. Copy the **Client ID** and **Client Secret** into `.env`.
   (Scope used is just `identify`.)

## Run

```bash
cd web
cp .env.example .env    # then edit
npm start               # node server.js
```

For local testing without Discord, set `ALLOW_DEV_LOGIN=1` and visit `/dev-login`.
**Never enable that in production.**

## Point the desktop tool at it

Create an account on the dashboard, then in the tool's Settings:

```
url   = https://example.com/api/v1/telemetry
token = <the source token>
```

## Notes

- Sessions are stateless signed cookies (`HttpOnly`, `SameSite=Lax`, `Secure` on https).
- Data is a single JSON file (`DATA_FILE`), written atomically. Back it up to keep users/groups.
- The group **read key** is a secret — anyone with it can read that group's telemetry.
