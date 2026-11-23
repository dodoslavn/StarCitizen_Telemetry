'use strict';

const http = require('../lib/http');
const store = require('../lib/store');
const config = require('../config');
const { getByPath } = require('../lib/jsonpath');

const NOT_FOUND = '-';   // returned when a ?path= misses

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// GET /api/ping — liveness + a dynamic value so a client can prove it reached us.
function ping(req, res) {
  const s = store.stats();
  return http.sendJson(res, 200, {
    app: config.app.name,
    ok: true,
    time: new Date().toISOString(),
    uptimeSec: s.uptimeSec,
    nonce: require('node:crypto').randomBytes(8).toString('hex'),
  });
}

// POST /api/telemetry — write a frame (source identified by its bearer token).
async function ingest(req, res) {
  const src = store.getSourceByToken(bearer(req));
  if (!src) { store.recordBadCred(); return http.sendJson(res, 401, { error: 'unauthorized' }); }

  let frame;
  try { frame = await http.readJson(req); }
  catch { return http.sendJson(res, 400, { error: 'body is not valid JSON' }); }

  store.addData(src.id, frame);
  return http.sendJson(res, 200, { ok: true, source: src.name, stored: store.history(src.id).length });
}

// GET /api/telemetry — read this source. ?n=x (x-th latest), ?path=a.b.c, also a creds test.
function sourceRead(req, res, ctx) {
  const src = store.getSourceByToken(bearer(req));
  if (!src) { store.recordBadCred(); return http.sendJson(res, 401, { error: 'unauthorized' }); }

  const n = Math.max(1, parseInt(ctx.query.n, 10) || 1);
  const rec = store.nthLatest(src.id, n);
  if (ctx.query.path !== undefined) {
    return http.sendJson(res, 200, getByPath(rec?.frame, ctx.query.path, NOT_FOUND));
  }
  return http.sendJson(res, 200, {
    ok: true, source: src.name, n, available: store.history(src.id).length,
    updatedAt: rec?.at || null, frame: rec?.frame ?? null,
  });
}

function authorizedGroup(req, res, ctx) {
  const g = store.getGroup(ctx.params.id);
  if (!g) { http.sendJson(res, 404, { error: 'group not found' }); return null; }
  const key = ctx.query.key || bearer(req);
  if (key !== g.readKey) { store.recordBadCred(); http.sendJson(res, 401, { error: 'unauthorized' }); return null; }
  return g;
}

// GET /api/groups/:id/latest — newest frame per source. ?path=a.b.c applies to each.
function groupLatest(req, res, ctx) {
  const g = authorizedGroup(req, res, ctx);
  if (!g) return;
  const payload = store.groupPayload(g.id, { history: false });
  if (ctx.query.path !== undefined) {
    for (const k of Object.keys(payload.sources)) {
      payload.sources[k] = getByPath(payload.sources[k], ctx.query.path, NOT_FOUND);
    }
  }
  return http.sendJson(res, 200, { group: { id: g.id, name: g.name }, ...payload });
}

// GET /api/groups/:id/history — full history per source.
function groupHistory(req, res, ctx) {
  const g = authorizedGroup(req, res, ctx);
  if (!g) return;
  return http.sendJson(res, 200, { group: { id: g.id, name: g.name }, ...store.groupPayload(g.id, { history: true }) });
}

module.exports = { ping, ingest, sourceRead, groupLatest, groupHistory };
