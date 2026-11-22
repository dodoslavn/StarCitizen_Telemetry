# StarCitizen_Telemetry

A small native Windows tray app that reads Star Citizen's local game telemetry and
forwards it to an HTTP endpoint as clean, readable JSON.

It pulls from the gRPC telemetry server the game runs on `127.0.0.1:50051`, decodes
each frame using the protobuf schema **read straight out of your `StarCitizen.exe`**
(so field numbers and enum ids become real names, and it keeps working after game
patches), and POSTs the result to a URL you configure.

**Zero third-party dependencies** — only the .NET base class library. No gRPC
library, no protobuf library; the schema reader, gRPC call and decoder are all
hand-rolled.

## How it works

```
StarCitizen.exe ──gRPC/HTTP2──▶ ScTelemetry ──HTTP POST (JSON)──▶ your URL
   (127.0.0.1:50051)                 │
                                     └─ schema extracted from StarCitizen.exe (cached)
```

Every `interval` seconds it opens the game's `TelemetryStream`, takes one frame,
decodes it, and uploads JSON like:

```json
{
  "capturedAt": "2026-11-22T21:40:12.3Z",
  "source": "127.0.0.1:50051",
  "telemetry": {
    "actor": {
      "vitals": { "health": { "current": 100, "max": 100 }, "heart_rate": 59.57 },
      "state": { "locomotion": "ACTOR_LOCOMOTION_STATE_WALK", "uec_balance": 15001986 }
    }
  }
}
```

Enum values are the game's own names (e.g. `VEHICLE_MASTER_MODE_SCM`). The `vehicle`
section appears only while you're seated in a ship.

## Configuration

A plain INI file, `config.ini`, next to the exe (see [`config.example.ini`](config.example.ini)).
On first run the app creates one for you — edit `url`, then pick **Reload config**.

| Key | Meaning | Default |
|---|---|---|
| `interval` | How often to pull, in seconds (decimals allowed) | `1` |
| `url` | HTTP endpoint the JSON is POSTed to | *(required)* |
| `url_ssl_verify` | Verify the endpoint's TLS certificate | `true` |
| `source` | The game's gRPC server, `ip:port` | `127.0.0.1:50051` |
| `exe` | Path to `StarCitizen.exe` (empty = auto-detect) | *(auto)* |

## Enabling the game's telemetry

The app only reads a server the game itself provides; you have to switch it on once.
Add these to `StarCitizen\<channel>\user.cfg` (the folder containing `Bin64`) and set
the user environment variable `GRPC_CLIENT_SERVER_ENABLED=true`, then restart the game:

```
grpc.client.server.enabled = 1
grpc.client.server.port = 50051
server.game.telemetry.enabled = 1
```

Check it's live from PowerShell: `Test-NetConnection 127.0.0.1 -Port 50051` → `TcpTestSucceeded : True`.

## Tray menu

- **Pull one frame (test)** — fetch, decode and open one frame as JSON (no upload).
- **Open config** — open `config.ini`.
- **Reload config** — re-read config and restart the pump.
- **Exit**.

The status line shows `ok · N sent · Xs ago`, or the last error.

## Build & run

Requires the [.NET 9 SDK](https://dotnet.microsoft.com/download).

```powershell
# run from source
dotnet run --project src\ScTelemetry

# headless test in a terminal (prints decoded JSON, no tray)
dotnet run --project src\ScTelemetry -- --once     # one frame
dotnet run --project src\ScTelemetry -- --print    # loop

# tests (pure-protobuf logic; cross-platform)
dotnet run --project tests\ScTelemetry.Tests
```

### Publish a single exe

Framework-dependent (small; needs the [.NET Desktop Runtime 9](https://dotnet.microsoft.com/download)):

```powershell
dotnet publish src\ScTelemetry -c Release -r win-x64 --self-contained false ^
  -p:PublishSingleFile=true
```

Self-contained (large; no runtime needed): add `--self-contained true` instead.

The exe lands in `src\ScTelemetry\bin\Release\net9.0-windows\win-x64\publish\`.
Put `config.ini` beside it.

## Notes

- The gRPC server listens on loopback only; this app connects locally and never
  exposes it to the network.
- The extracted schema is cached under `%LOCALAPPDATA%\ScTelemetry\`, keyed by the
  exe's size and timestamp, so it's re-read automatically after a game update.
