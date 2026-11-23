'use strict';

const http = require('../lib/http');
const store = require('../lib/store');

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// POST /api/telemetry  (and alias /telemetry) — upload from the desktop tool.
async function ingest(req, res) {
  const token = bearer(req);
  const account = token && store.getAccountByToken(token);
  if (!account) return http.sendJson(res, 401, { error: 'unauthorized' });

  let frame;
  try { frame = await http.readJson(req); }
  catch { return http.sendJson(res, 400, { error: 'body is not valid JSON' }); }

  store.addTelemetry(account.id, frame);
  return http.sendJson(res, 200, { ok: true, account: account.name, stored: store.history(account.id).length });
}

// GET /api/telemetry — latest for the authenticated account (handy for testing).
function accountLatest(req, res) {
  const token = bearer(req);
  const account = token && store.getAccountByToken(token);
  if (!account) return http.sendJson(res, 401, { error: 'unauthorized' });
  const last = store.latest(account.id);
  return http.sendJson(res, 200, { account: account.name, updatedAt: last?.at || null, frame: last?.frame ?? null });
}

function readKey(req, ctx) {
  return ctx.query.key || bearer(req);
}

function authorizedGroup(req, res, ctx) {
  const g = store.getGroup(ctx.params.id);
  if (!g) { http.sendJson(res, 404, { error: 'group not found' }); return null; }
  if (readKey(req, ctx) !== g.readKey) { http.sendJson(res, 401, { error: 'unauthorized' }); return null; }
  return g;
}

// GET /api/groups/:id/latest?key=...
function groupLatest(req, res, ctx) {
  const g = authorizedGroup(req, res, ctx);
  if (!g) return;
  return http.sendJson(res, 200, { group: { id: g.id, name: g.name }, accounts: store.groupData(g.id, { history: false }) });
}

// GET /api/groups/:id/history?key=...
function groupHistory(req, res, ctx) {
  const g = authorizedGroup(req, res, ctx);
  if (!g) return;
  return http.sendJson(res, 200, { group: { id: g.id, name: g.name }, accounts: store.groupData(g.id, { history: true }) });
}

module.exports = { ingest, accountLatest, groupLatest, groupHistory };
