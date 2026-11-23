'use strict';

// Entry point: tiny router over node:http. Zero dependencies.

const http = require('node:http');
const config = require('./config');
const store = require('./lib/store');
const session = require('./lib/session');
const { sendJson } = require('./lib/http');
const auth = require('./handlers/auth');
const pages = require('./handlers/pages');
const api = require('./handlers/api');

// [method, pathPattern, handler]. ":name" captures a path segment.
const routes = [
  ['GET', '/', pages.landing],
  ['GET', '/health', (_req, res) => sendJson(res, 200, { ok: true })],

  ['GET', '/login', auth.login],
  ['GET', '/auth/discord/callback', auth.callback],
  ['GET', '/logout', auth.logout],
  ['GET', '/dev-login', auth.devLoginForm],
  ['POST', '/dev-login', auth.devLoginSubmit],

  ['GET', '/dashboard', (_req, res) => require('./lib/http').redirect(res, '/account')],
  ['GET', '/account', pages.accountPage],
  ['GET', '/groups', pages.groupsPage],
  ['GET', '/about', pages.about],
  ['POST', '/accounts', pages.createAccount],
  ['POST', '/accounts/:id/limit', pages.setAccountLimit],
  ['POST', '/accounts/:id/rotate', pages.rotateAccount],
  ['POST', '/accounts/:id/delete', pages.deleteAccount],

  ['POST', '/groups', pages.createGroup],
  ['GET', '/groups/:id', pages.groupPage],
  ['POST', '/groups/:id/remove', pages.removeMember],
  ['POST', '/groups/:id/rotate-key', pages.rotateGroupKey],
  ['POST', '/groups/:id/delete', pages.deleteGroup],

  ['GET', '/join/:code', pages.joinPage],
  ['POST', '/join/:code', pages.joinSubmit],

  ['POST', '/api/telemetry', api.ingest],
  ['POST', '/telemetry', api.ingest],          // alias for the existing tool
  ['GET', '/api/telemetry', api.accountLatest],
  ['GET', '/api/groups/:id/latest', api.groupLatest],
  ['GET', '/api/groups/:id/history', api.groupHistory],
];

const compiled = routes.map(([method, pattern, handler]) => {
  const names = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$');
  return { method, rx, names, handler };
});

function match(method, pathname) {
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = r.rx.exec(pathname);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    return { handler: r.handler, params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, config.baseUrl);
  const route = match(req.method, url.pathname);
  if (!route) return sendJson(res, 404, { error: 'not found' });

  const ctx = {
    store,
    params: route.params,
    query: Object.fromEntries(url.searchParams),
    url,
    user: null,
  };
  const uid = session.userIdFrom(req);
  if (uid) ctx.user = store.getUser(uid);

  try {
    await route.handler(req, res, ctx);
  } catch (e) {
    console.error(`${req.method} ${url.pathname}:`, e.message);
    if (!res.writableEnded) sendJson(res, 500, { error: 'internal error' });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`SC Telemetry web on http://${config.host}:${config.port}  (base ${config.baseUrl})`);
  console.log(`  discord login: ${config.discordConfigured ? 'configured' : 'NOT configured'}${config.allowDevLogin ? ', dev-login ON' : ''}`);
});
