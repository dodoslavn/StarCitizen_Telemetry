'use strict';

// Minimal telemetry receiver — pure Node.js, no dependencies.
//
//   POST /telemetry   receive a JSON frame from the telemetry tool (kept in memory)
//   GET  /telemetry   the latest frame as JSON
//   GET  /history     the recent frames as JSON
//   GET  /            a small auto-refreshing HTML view
//   GET  /health      liveness probe

const http = require('node:http');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 1 << 20;        // 1 MiB cap on a posted frame
const HISTORY = 50;              // frames kept in memory
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';   // if set, required on POST /telemetry

const state = {
  latest: null,                 // parsed JSON of the last frame
  updatedAt: null,              // ISO time we received it
  count: 0,                     // total frames received
  history: [],                  // [{ at, frame }], newest last
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/telemetry') return ingest(req, res);
  if (req.method === 'GET' && url.pathname === '/telemetry') return sendLatest(res);
  if (req.method === 'GET' && url.pathname === '/history') return sendHistory(res);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/') return sendPage(res);

  json(res, 404, { error: 'not found' });
});

function ingest(req, res) {
  if (AUTH_TOKEN && req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
    req.resume();   // drain the body we're rejecting
    return json(res, 401, { error: 'unauthorized' });
  }
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      json(res, 413, { error: 'payload too large' });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    const body = Buffer.concat(chunks).toString('utf8');
    let frame;
    try {
      frame = JSON.parse(body);
    } catch {
      return json(res, 400, { error: 'body is not valid JSON' });
    }
    const at = new Date().toISOString();
    state.latest = frame;
    state.updatedAt = at;
    state.count += 1;
    state.history.push({ at, frame });
    if (state.history.length > HISTORY) state.history.shift();
    json(res, 200, { ok: true, count: state.count });
  });
}

function sendLatest(res) {
  if (state.latest === null) return json(res, 404, { error: 'no telemetry received yet' });
  json(res, 200, { updatedAt: state.updatedAt, count: state.count, frame: state.latest });
}

function sendHistory(res) {
  json(res, 200, { count: state.count, frames: state.history });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendPage(res) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SC Telemetry</title>
  <style>
    body { margin: 0; background: #0e1116; color: #e6edf3; font: 14px/1.5 ui-monospace, Menlo, Consolas, monospace; }
    header { padding: 12px 16px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; gap: 16px; align-items: baseline; }
    h1 { font-size: 15px; margin: 0; color: gold; }
    .meta { color: #8b949e; }
    pre { margin: 0; padding: 16px; white-space: pre-wrap; word-break: break-word; }
    .stale { color: #f85149; }
  </style>
</head>
<body>
  <header>
    <h1>SC Telemetry</h1>
    <span class="meta" id="meta">waiting…</span>
  </header>
  <pre id="out">waiting for data…</pre>
  <script>
    async function tick() {
      try {
        const r = await fetch('/telemetry', { cache: 'no-store' });
        const meta = document.getElementById('meta');
        const out = document.getElementById('out');
        if (r.status === 404) { meta.textContent = 'no telemetry received yet'; return; }
        const d = await r.json();
        const ageMs = Date.now() - new Date(d.updatedAt).getTime();
        meta.className = 'meta' + (ageMs > 5000 ? ' stale' : '');
        meta.textContent = 'frames: ' + d.count + ' · updated ' + Math.round(ageMs / 1000) + 's ago (' + d.updatedAt + ')';
        out.textContent = JSON.stringify(d.frame, null, 2);
      } catch (e) {
        document.getElementById('meta').textContent = 'fetch error: ' + e.message;
      }
    }
    tick();
    setInterval(tick, 1000);
  </script>
</body>
</html>`;

server.listen(PORT, HOST, () => {
  console.log(`telemetry receiver listening on http://${HOST}:${PORT}`);
  console.log(`  POST /telemetry   GET /telemetry   GET /history   GET /  (view)`);
});
