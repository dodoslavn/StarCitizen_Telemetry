'use strict';

const config = require('../config');
const http = require('../lib/http');
const store = require('../lib/store');
const { layout, esc } = require('../lib/html');

function requireUser(req, res, ctx) {
  if (ctx.user) return ctx.user;
  http.redirect(res, '/login');
  return null;
}

const plainTime = (iso) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
const fmtTime = (iso) => plainTime(iso) + 'Z';

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ---------------------------------------------------------------- public

function landing(req, res, ctx) {
  if (ctx.user) return http.redirect(res, '/sources');
  return http.sendHtml(res, 200, layout({
    title: 'Home', user: null,
    body: `<div class="card">
      <p>Collect telemetry from the desktop tool, group sources together, and read a whole group over one HTTP call.</p>
      <p><a class="btn discord" href="/login">Log in with Discord</a></p>
    </div>`,
  }));
}

function about(req, res, ctx) {
  const s = store.stats();
  const body = `<h1>About</h1>
    <div class="card">
      <p><strong>${esc(config.app.name)}</strong> — ${esc(config.app.tagline)}.</p>
      <p>Version <code>${esc(config.app.version)}</code> · Source <a href="${esc(config.app.repo)}" target="_blank" rel="noopener">${esc(config.app.repo)}</a></p>
    </div>
    <h2>Live stats</h2>
    <div class="card"><table>
      <tr><th>Accounts</th><td>${s.users}</td></tr>
      <tr><th>Sources</th><td>${s.sources}</td></tr>
      <tr><th>Groups</th><td>${s.groups}</td></tr>
      <tr><th>Frames in memory</th><td>${s.frames}</td></tr>
      <tr><th>Memory used by data</th><td>${fmtBytes(s.dataBytes)}</td></tr>
      <tr><th>Submits total</th><td>${s.totalSubmits}</td></tr>
      <tr><th>Submits · last 5s</th><td>${s.submits5s}</td></tr>
      <tr><th>Submits · last 1m</th><td>${s.submits1m}</td></tr>
      <tr><th>Bad-credential submits · last 1m</th><td>${s.badCreds1m}</td></tr>
      <tr><th>Uptime</th><td>${s.uptimeSec}s</td></tr>
    </table></div>`;
  return http.sendHtml(res, 200, layout({ title: 'About', user: ctx.user, active: 'about', body }));
}

// ---------------------------------------------------------------- sources

function sourcesPage(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const err = ctx.query.err === 'name'
    ? '<div class="card" style="border-top-color:var(--danger)"><p style="color:var(--danger)">Source name must be letters only (a–z, A–Z) — no spaces, numbers or dashes.</p></div>'
    : '';

  const rows = store.listSources(user.id).map((s) => {
    const last = store.latest(s.id);
    const when = last ? `<span class="nowrap">${esc(plainTime(last.at))}</span>` : '<span class="muted">never</span>';
    return `<tr>
      <td>${esc(s.name)}</td>
      <td>${s.historyLimit}</td>
      <td>${when}</td>
      <td><div class="actions">
        <a class="btn secondary" href="/sources/${esc(s.id)}/data">Data</a>
        <a class="btn secondary" href="/sources/${esc(s.id)}/edit">Edit</a>
      </div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="4" class="muted">No sources yet — create one above.</td></tr>`;

  const body = `
    <h1>Sources</h1>
    <p class="muted">Management of sources owned by this account — each source represents one running instance of the Star Citizen game.</p>
    ${err}
    <div class="card">
      <form method="post" action="/sources">
        <input type="text" name="name" placeholder="source name (letters only, e.g. MainRig)" required>
        <button type="submit">Create source</button>
      </form>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <tr><th>Name</th><th>History size</th><th>Last update (UTC)</th><th></th></tr>
      ${rows}
    </table></div></div>`;

  return http.sendHtml(res, 200, layout({ title: 'Sources', user, active: 'sources', body }));
}

async function createSource(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const { name } = await http.readForm(req);
  try { store.createSource(user.id, (name || '').trim()); }
  catch { return http.redirect(res, '/sources?err=name'); }
  return http.redirect(res, '/sources');
}

function sourceDataPage(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const src = store.ownedSource(user.id, ctx.params.id);
  if (!src) return http.sendHtml(res, 404, layout({ title: 'Not found', user, active: 'sources', body: '<div class="card">Source not found.</div>' }));

  const available = store.history(src.id).length;
  const n = Math.min(Math.max(1, parseInt(ctx.query.n, 10) || 1), Math.max(1, available));
  const rec = store.nthLatest(src.id, n);

  if (ctx.query.raw !== undefined) return http.sendJson(res, 200, rec?.frame ?? null);

  const options = [];
  for (let i = 1; i <= available; i++) options.push(`<option value="${i}"${i === n ? ' selected' : ''}>${i}${i === 1 ? ' (latest)' : ''}</option>`);
  const picker = available ? `
    <form method="get" action="/sources/${esc(src.id)}/data" class="inline">
      <label class="muted">Show</label>
      <select name="n" onchange="this.form.submit()">${options.join('')}</select>
      <label class="muted">of ${available} latest</label>
    </form>` : '<span class="muted">no data received yet</span>';

  const pretty = rec ? esc(JSON.stringify(rec.frame, null, 2)) : '(no data)';

  const body = `
    <h1>${esc(src.name)} — data</h1>
    <div class="card">
      <p class="muted">Source memory: <code>${fmtBytes(store.sourceBytes(src.id))}</code> across ${available} frame${available === 1 ? '' : 's'}
         · last message: <code>${fmtBytes(store.lastMsgBytes(src.id))}</code></p>
      <p>${picker} ${rec ? `· <a href="/sources/${esc(src.id)}/data?n=${n}&raw=1" target="_blank">view raw JSON</a>` : ''}</p>
      ${rec ? `<p class="muted nowrap">received ${esc(fmtTime(rec.at))}</p>` : ''}
    </div>
    <div class="card"><pre>${pretty}</pre></div>
    <p><a href="/sources">← back to sources</a></p>`;
  return http.sendHtml(res, 200, layout({ title: src.name + ' data', user, active: 'sources', body }));
}

function sourceEditPage(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const src = store.ownedSource(user.id, ctx.params.id);
  if (!src) return http.sendHtml(res, 404, layout({ title: 'Not found', user, active: 'sources', body: '<div class="card">Source not found.</div>' }));

  const body = `
    <h1>${esc(src.name)} — settings</h1>
    <h2>Bearer token</h2>
    <div class="card">
      <p class="muted">The desktop tool uses this to read and write this source.</p>
      <p>
        <input id="tok" type="text" readonly value="${esc(src.token)}" style="width:56%">
        <button class="secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('tok').value);this.textContent='Copied'">Copy</button>
        <form class="inline" method="post" action="/sources/${esc(src.id)}/rotate"><button class="secondary" type="submit">Rotate</button></form>
      </p>
    </div>
    <h2>History size</h2>
    <div class="card">
      <form method="post" action="/sources/${esc(src.id)}/limit">
        <input type="number" name="limit" value="${src.historyLimit}" min="1" max="${config.maxHistory}" style="width:90px">
        <button type="submit">Save</button>
        <span class="muted">frames kept in memory (max ${config.maxHistory})</span>
      </form>
    </div>
    <h2>Danger zone</h2>
    <div class="card">
      <form method="post" action="/sources/${esc(src.id)}/delete" onsubmit="return confirm('Delete this source and its data?')"><button class="danger" type="submit">Delete source</button></form>
    </div>
    <p><a href="/sources">← back to sources</a></p>`;
  return http.sendHtml(res, 200, layout({ title: src.name + ' settings', user, active: 'sources', body }));
}

async function setSourceLimit(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const { limit } = await http.readForm(req);
  store.setHistoryLimit(user.id, ctx.params.id, Number(limit));
  return http.redirect(res, '/sources/' + ctx.params.id + '/edit');
}

function rotateSource(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  store.rotateSourceToken(user.id, ctx.params.id);
  return http.redirect(res, '/sources/' + ctx.params.id + '/edit');
}

function deleteSource(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  store.deleteSource(user.id, ctx.params.id);
  return http.redirect(res, '/sources');
}

// ---------------------------------------------------------------- groups

function groupsPage(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const rows = store.groupsForUser(user.id).map((g) => `
    <tr>
      <td><a href="/groups/${esc(g.id)}">${esc(g.name)}</a></td>
      <td>${store.groupSourceCount(g.id)}</td>
      <td>${store.groupAccountCount(g.id)}</td>
      <td><a class="btn secondary" href="/groups/${esc(g.id)}">Manage</a></td>
    </tr>`).join('') || `<tr><td colspan="4" class="muted">No groups yet — create one above.</td></tr>`;

  const body = `
    <h1>Groups</h1>
    <p class="muted">Groups of data from individual sources, exposed through one read-only endpoint.</p>
    <div class="card">
      <form method="post" action="/groups">
        <input type="text" name="name" placeholder="group name" required>
        <button type="submit">Create group</button>
      </form>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <tr><th>Name</th><th>Sources</th><th>Accounts</th><th></th></tr>
      ${rows}
    </table></div></div>`;
  return http.sendHtml(res, 200, layout({ title: 'Groups', user, active: 'groups', body }));
}

async function createGroup(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const { name } = await http.readForm(req);
  const g = store.createGroup(user.id, name);
  return http.redirect(res, '/groups/' + g.id);
}

function groupPage(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const g = store.getGroup(ctx.params.id);
  if (!g || !store.canViewGroup(user.id, g.id)) {
    return http.sendHtml(res, 404, layout({ title: 'Not found', user, active: 'groups', body: '<div class="card">Group not found.</div>' }));
  }
  const isOwner = g.ownerId === user.id;
  const inviteUrl = `${config.baseUrl}/join/${g.inviteCode}`;
  const latestUrl = `${config.baseUrl}/api/groups/${g.id}/latest?key=${g.readKey}`;

  const accountRows = store.memberUserIds(g.id).map((uid) => {
    const u = store.getUser(uid);
    const owner = uid === g.ownerId;
    const make = (isOwner && !owner)
      ? `<form class="inline" method="post" action="/groups/${esc(g.id)}/set-owner"><input type="hidden" name="userId" value="${esc(uid)}"><button class="secondary" type="submit">Make owner</button></form>`
      : '';
    return `<tr><td>${esc(u?.username || '?')}</td><td>${owner ? '<span class="pill">owner</span>' : '<span class="muted">member</span>'}</td><td>${make}</td></tr>`;
  }).join('') || `<tr><td colspan="3" class="muted">No accounts yet.</td></tr>`;

  const sourceRows = store.memberSources(g.id).map((s) => {
    const owner = store.getUser(s.userId);
    const last = store.latest(s.id);
    const canRemove = isOwner || s.userId === user.id;
    const latestCell = last ? `<details><summary>${esc(fmtTime(last.at))}</summary><pre>${esc(JSON.stringify(last.frame, null, 2))}</pre></details>` : '<span class="muted">no data</span>';
    const remove = canRemove ? `<form class="inline" method="post" action="/groups/${esc(g.id)}/remove"><input type="hidden" name="sourceId" value="${esc(s.id)}"><button class="danger" type="submit">Remove</button></form>` : '';
    return `<tr><td>${esc(store.groupSourceKey(s))}</td><td>${esc(owner?.username || '?')}</td><td>${latestCell}</td><td>${remove}</td></tr>`;
  }).join('') || `<tr><td colspan="4" class="muted">No sources yet — share the invite link.</td></tr>`;

  const endpointBox = `
    <h2>Read endpoint</h2>
    <div class="card">
      <p class="muted">Read-only — every source's latest data in one call (JSON).</p>
      <p>
        <input id="gurl" type="text" readonly value="${esc(latestUrl)}" style="width:60%">
        <button class="secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('gurl').value);this.textContent='Copied'">Copy</button>
        <a class="btn secondary" href="${esc(latestUrl)}" target="_blank">Open</a>
      </p>
      <p class="muted">Add a <code>&amp;path=</code> to pull just part of it — see <a href="/api">API</a>.</p>
    </div>`;

  const ownerApi = isOwner ? `
    <h2>Read key</h2>
    <div class="card">
      <p class="muted">Secret — anyone with it can read this group.</p>
      <p>
        <input id="rkey" type="text" readonly value="${esc(g.readKey)}" style="width:56%">
        <button class="secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('rkey').value);this.textContent='Copied'">Copy</button>
        <form class="inline" method="post" action="/groups/${esc(g.id)}/rotate-key"><button class="secondary" type="submit">Rotate</button></form>
      </p>
    </div>` : '';

  const ownerDanger = isOwner ? `
    <h2>Danger zone</h2>
    <div class="card">
      <form class="inline" method="post" action="/groups/${esc(g.id)}/delete" onsubmit="return confirm('Delete this group?')"><button class="danger" type="submit">Delete group</button></form>
    </div>` : '';

  const body = `
    <h1>${esc(g.name)}</h1>
    <h2>Invite</h2>
    <div class="card">
      <p class="muted">Anyone with this link can add one of their sources to the group:</p>
      <pre>${esc(inviteUrl)}</pre>
    </div>
    <h2>Accounts</h2>
    <div class="card"><div class="table-wrap"><table><tr><th>Account</th><th>Role</th><th></th></tr>${accountRows}</table></div></div>
    <h2>Sources</h2>
    <div class="card"><div class="table-wrap"><table><tr><th>Source id</th><th>Account</th><th>Latest</th><th></th></tr>${sourceRows}</table></div></div>
    ${endpointBox}
    ${ownerApi}
    ${ownerDanger}
    <p><a href="/groups">← back to groups</a></p>`;
  return http.sendHtml(res, 200, layout({ title: g.name, user, active: 'groups', body }));
}

async function removeMember(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const { sourceId } = await http.readForm(req);
  store.removeSourceFromGroup(user.id, ctx.params.id, sourceId);
  return http.redirect(res, '/groups/' + ctx.params.id);
}

async function setOwner(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const { userId } = await http.readForm(req);
  store.setGroupOwner(user.id, ctx.params.id, userId);
  return http.redirect(res, '/groups/' + ctx.params.id);
}

function rotateGroupKey(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  store.rotateReadKey(user.id, ctx.params.id);
  return http.redirect(res, '/groups/' + ctx.params.id);
}

function deleteGroup(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  store.deleteGroup(user.id, ctx.params.id);
  return http.redirect(res, '/groups');
}

// ---------------------------------------------------------------- join

function joinPage(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const g = store.getGroupByInvite(ctx.params.code);
  if (!g) return http.sendHtml(res, 404, layout({ title: 'Invite', user, active: 'groups', body: '<div class="card">This invite link is not valid.</div>' }));

  const inGroup = new Set(store.memberSourceIds(g.id));
  const all = store.listSources(user.id);
  const options = all.filter((s) => !inGroup.has(s.id));
  const form = options.length ? `
    <form method="post" action="/join/${esc(ctx.params.code)}">
      <select name="sourceId">${options.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select>
      <button type="submit">Add to ${esc(g.name)}</button>
    </form>`
    : (all.length
        ? '<p class="muted">All your sources are already in this group.</p>'
        : '<p class="muted">You have no sources yet. <a href="/sources">Create one</a> first.</p>');

  return http.sendHtml(res, 200, layout({
    title: 'Join ' + g.name, user, active: 'groups',
    body: `<div class="card"><h1>Join “${esc(g.name)}”</h1><p>Pick which of your sources to add:</p>${form}
      <p><a href="/groups">Cancel</a></p></div>`,
  }));
}

async function joinSubmit(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const g = store.getGroupByInvite(ctx.params.code);
  if (!g) return http.sendHtml(res, 404, 'invalid invite');
  const { sourceId } = await http.readForm(req);
  const src = store.ownedSource(user.id, sourceId);
  if (src) store.addSourceToGroup(g.id, src.id);
  return http.redirect(res, '/groups/' + g.id);
}

// ---------------------------------------------------------------- api docs

function apiDocs(req, res, ctx) {
  const b = config.baseUrl;
  const ep = (method, path, desc, auth, example, sample) => `
    <div class="card">
      <div class="ep"><span class="method ${method.toLowerCase()}">${method}</span> <code>${esc(path)}</code></div>
      <p>${desc}</p>
      <p class="muted">Auth: ${auth}</p>
      <pre>${esc(example)}</pre>
      ${sample ? `<p class="muted">Response:</p><pre>${esc(sample)}</pre>` : ''}</div>`;

  const body = `
    <h1>API</h1>
    <p class="muted">All responses are JSON. Base URL <code>${esc(b)}</code>. A source's bearer token comes from its
      <a href="/sources">Edit</a> page; a group's read key from its page.</p>

    <h2>Is it up? / are my credentials valid?</h2>
    ${ep('GET', '/api/ping',
      'Liveness check with a dynamic response (time + nonce), so a client can prove it reached this app.',
      'none',
      `curl ${b}/api/ping`,
      '{ "app": "SCTelemetry", "ok": true, "time": "...", "uptimeSec": 1234, "nonce": "a1b2c3d4" }')}
    ${ep('GET', '/api/telemetry',
      'Returns the source for a valid token — also the simplest credential test.',
      '<code>Authorization: Bearer &lt;source token&gt;</code>',
      `curl ${b}/api/telemetry -H "Authorization: Bearer <source token>"`,
      '{ "ok": true, "source": "MainRig", "n": 1, "available": 100, "updatedAt": "...", "frame": { ... } }')}

    <h2>Write to a source</h2>
    ${ep('POST', '/api/telemetry',
      'Store one frame. This is what the desktop tool calls. Only valid JSON is accepted.',
      '<code>Authorization: Bearer &lt;source token&gt;</code>',
      `curl -X POST ${b}/api/telemetry \\\n  -H "Authorization: Bearer <source token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"telemetry": { "...": "..." }}'`,
      '{ "ok": true, "source": "MainRig", "stored": 42 }')}

    <h2>Read a source</h2>
    ${ep('GET', '/api/telemetry?n=1',
      'The n-th latest frame (n=1 newest, up to the source history size).',
      '<code>Authorization: Bearer &lt;source token&gt;</code>',
      `curl "${b}/api/telemetry?n=2" -H "Authorization: Bearer <source token>"`,
      '{ "ok": true, "source": "MainRig", "n": 2, "available": 100, "updatedAt": "...", "frame": { ... } }')}

    <h2>Read a group (read-only)</h2>
    ${ep('GET', '/api/groups/:id/latest',
      'Newest frame from every source, keyed by &lt;account&gt;_&lt;source&gt;.',
      '<code>?key=&lt;read key&gt;</code> or <code>Authorization: Bearer &lt;read key&gt;</code>',
      `curl "${b}/api/groups/<id>/latest?key=<read key>"`,
      '{ "group": { "id": "...", "name": "Squad" }, "sources": { "Pilot_MainRig": { ... }, "Wingman_Rig": { ... } } }')}
    ${ep('GET', '/api/groups/:id/history',
      'Full in-memory history per source.',
      '<code>?key=&lt;read key&gt;</code> or bearer',
      `curl "${b}/api/groups/<id>/history?key=<read key>"`,
      '{ "group": { ... }, "sources": { "Pilot_MainRig": { "count": 100, "frames": [ ... ] } } }')}

    <h2>Pick one value — ?path=</h2>
    <div class="card">
      <p>Add <code>path</code> (a dotted JSON path) to any read call to get just that value. Missing → <code>-</code>.</p>
      <pre>curl "${esc(b)}/api/telemetry?path=telemetry.actor.state.uec_balance" \\\n  -H "Authorization: Bearer <source token>"
# -> 15001986

curl "${esc(b)}/api/groups/<id>/latest?key=<read key>&path=telemetry.vehicle.state.class_name"
# -> { "group": {...}, "sources": { "Pilot_MainRig": "ANVL Asgard", "Wingman_Rig": "-" } }</pre>
    </div>

    <h2>Errors</h2>
    <div class="card"><p class="muted"><code>401</code> bad/missing token or key · <code>404</code> unknown group · <code>400</code> invalid JSON body · <code>413</code> body too large.</p></div>`;

  return http.sendHtml(res, 200, layout({ title: 'API', user: ctx.user, active: 'api', body }));
}

module.exports = {
  landing, about, apiDocs,
  sourcesPage, createSource, sourceDataPage, sourceEditPage, setSourceLimit, rotateSource, deleteSource,
  groupsPage, createGroup, groupPage, removeMember, setOwner, rotateGroupKey, deleteGroup,
  joinPage, joinSubmit,
};
