# SC Telemetry — website

Full telemetry service: **Discord login**, per-user **client credentials**, **groups**
with invite links, and a **read API** that returns data from every account in a group.
Pure Node.js — **no dependencies** — with a JSON-file datastore.

## Concepts

- **User** — a person, logged in via Discord.
- **Account** — a credential for the desktop tool. Has a secret **token** and a
  **history limit** (default 100). The tool uploads with `Authorization: Bearer <token>`.
- **Group** — groups accounts together. Anyone can create one; it has an **invite link**
  (to add accounts) and a secret **read key** (to read its data over HTTP).

## Endpoints

### Web (Discord session)
`/` landing · `/login` · `/auth/discord/callback` · `/logout` · `/dashboard`
· `/groups/:id` · `/join/:code` — plus POST actions for creating/rotating/deleting
accounts and groups.

### API
| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/api/telemetry` (alias `/telemetry`) | `Bearer <account token>` | stores a frame |
| GET | `/api/telemetry` | `Bearer <account token>` | that account's latest frame |
| GET | `/api/groups/:id/latest` | `?key=` or `Bearer <read key>` | newest frame per account |
| GET | `/api/groups/:id/history` | `?key=` or `Bearer <read key>` | full history per account |

`latest` is the default; `history` returns up to each account's limit.

## Configure

Copy `.env.example` → `.env` and fill it in (see the file for every key). The essentials:

```ini
BASE_URL=https://sctelemetry.dodoslav.eu
SESSION_SECRET=<openssl rand -hex 32>
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
```

### Discord app (one-time)
1. https://discord.com/developers/applications → **New Application**.
2. **OAuth2** → add redirect `https://sctelemetry.dodoslav.eu/auth/discord/callback`.
3. Copy the **Client ID** and **Client Secret** into `.env`.
   (Scope used is just `identify`.)

## Run

```bash
cd webapp
cp .env.example .env    # then edit
npm start               # node server.js
```

For local testing without Discord, set `ALLOW_DEV_LOGIN=1` and visit `/dev-login`.
**Never enable that in production.**

## Point the desktop tool at it

Create an account on the dashboard, then in the tool's Settings:

```
url   = https://sctelemetry.dodoslav.eu/api/telemetry
token = <the account token>
```

## Notes

- Sessions are stateless signed cookies (`HttpOnly`, `SameSite=Lax`, `Secure` on https).
- Data is a single JSON file (`DATA_FILE`), written atomically. Back it up to keep users/groups.
- The group **read key** is a secret — anyone with it can read that group's telemetry.
