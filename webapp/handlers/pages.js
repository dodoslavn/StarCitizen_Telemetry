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

// Compact UTC timestamp: "2026-11-23 07:20:46Z"
function fmtTime(iso) {
  return new Date(iso).toISOString().slice(0, 19).replace('T', ' ') + 'Z';
}

function landing(req, res, ctx) {
  if (ctx.user) return http.redirect(res, '/account');
  return http.sendHtml(res, 200, layout({
    title: 'Home',
    user: null,
    body: `<div class="card">
      <p>Collect telemetry from the desktop tool, group accounts together, and read a whole group over one HTTP call.</p>
      <p><a class="btn discord" href="/login">Log in with Discord</a></p>
    </div>`,
  }));
}

function about(req, res, ctx) {
  const body = `<h1>About</h1>
    <div class="card">
      <p><strong>${esc(config.app.name)}</strong> — ${esc(config.app.tagline)}.</p>
      <p>Version <code>${esc(config.app.version)}</code></p>
      <p>Source: <a href="${esc(config.app.repo)}" target="_blank" rel="noopener">${esc(config.app.repo)}</a></p>
      <p class="muted">The desktop tool reads Star Citizen's local gRPC telemetry, decodes it to readable JSON, and uploads it here. Accounts can be bundled into groups and read over one HTTP call.</p>
    </div>`;
  return http.sendHtml(res, 200, layout({ title: 'About', user: ctx.user, active: 'about', body }));
}

function apiDocs(req, res, ctx) {
  const b = esc(config.baseUrl);
  const ep = (method, path, desc, auth, example, sample) => `
    <div class="card">
      <div class="ep"><span class="method ${method.toLowerCase()}">${method}</span> <code>${esc(path)}</code></div>
      <p>${desc}</p>
      <p class="muted">Auth: ${auth}</p>
      <pre>${esc(example)}</pre>
      ${sample ? `<p class="muted">Response:</p><pre>${esc(sample)}</pre>` : ''}
    </div>`;

  const body = `
    <h1>API</h1>
    <p class="muted">All responses are JSON. Base URL <code>${b}</code>.
      Account tokens come from <a href="/account">My account</a>; group read keys from each group's page.</p>

    <h2>Upload a frame</h2>
    ${ep('POST', '/api/telemetry',
      'Store one telemetry frame for the account (this is what the desktop tool calls). The newest frames up to the account history limit are kept.',
      '<code>Authorization: Bearer &lt;account token&gt;</code>',
      `curl -X POST ${config.baseUrl}/api/telemetry \\\n  -H "Authorization: Bearer <account token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"telemetry": { "...": "..." }}'`,
      '{ "ok": true, "account": "Main PC", "stored": 42 }')}

    <h2>Read one account</h2>
    ${ep('GET', '/api/telemetry',
      'The latest frame for the account whose token you send.',
      '<code>Authorization: Bearer &lt;account token&gt;</code>',
      `curl ${config.baseUrl}/api/telemetry \\\n  -H "Authorization: Bearer <account token>"`,
      '{ "account": "Main PC", "updatedAt": "...", "frame": { ... } }')}

    <h2>Read a group — latest</h2>
    ${ep('GET', '/api/groups/:id/latest',
      'The newest frame from every account in the group.',
      '<code>?key=&lt;read key&gt;</code> or <code>Authorization: Bearer &lt;read key&gt;</code>',
      `curl "${config.baseUrl}/api/groups/<group id>/latest?key=<read key>"`,
      '{ "group": { "id": "...", "name": "..." }, "accounts": [ { "account": "Main PC", "updatedAt": "...", "frame": { ... } } ] }')}

    <h2>Read a group — history</h2>
    ${ep('GET', '/api/groups/:id/history',
      'Full stored history (up to each account history limit) for every account in the group.',
      '<code>?key=&lt;read key&gt;</code> or <code>Authorization: Bearer &lt;read key&gt;</code>',
      `curl "${config.baseUrl}/api/groups/<group id>/history?key=<read key>"`,
      '{ "group": { ... }, "accounts": [ { "account": "Main PC", "count": 100, "frames": [ { "at": "...", "frame": { ... } } ] } ] }')}

    <h2>Errors</h2>
    <div class="card"><p class="muted"><code>401</code> bad/missing token or key · <code>404</code> unknown group · <code>400</code> invalid JSON body · <code>413</code> body too large.</p></div>`;

  return http.sendHtml(res, 200, layout({ title: 'API', user: ctx.user, active: 'api', body }));
}

function accountPage(req, res, ctx) {
  const user = requireUser(req, res, ctx);
  if (!user) return;

  const accounts = store.listAccounts(user.id);
  const ingestUrl = config.baseUrl + '/api/telemetry';

  const accountRows = accounts.length ? accounts.map((a) => {
    const last = store.latest(a.id);
    const when = last ? '<span class="nowrap">' + esc(fmtTime(last.at)) + '</span>' : '<span class="muted">never</span>';
    return `<tr>
      <td>${esc(a.name)}</td>
      <td>
        <code class="tok" title="${esc(a.token)}">${esc(a.token.slice(0, 8))}…</code>
        <button class="secondary" type="button" onclick="navigator.clipboard.writeText('${esc(a.token)}');this.textContent='Copied'">Copy</button>
      </td>
      <td>
        <form class="inline" method="post" action="/accounts/${esc(a.id)}/limit">
          <input type="number" name="limit" value="${esc(a.historyLimit)}" min="1" max="${config.maxHistory}" style="width:70px">
          <button class="secondary" type="submit">Set</button>
        </form>
      </td>
      <td>${when}</td>
      <td>
        <div class="actions">
          <form class="inline" method="post" action="/accounts/${esc(a.id)}/rotate"><button class="secondary" type="submit">Rotate</button></form>
          <form class="inline" method="post" action="/accounts/${esc(a.id)}/delete" onsubmit="return confirm('Delete this account?')"><button class="danger" type="submit">Delete</button></form>
        </div>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" class="muted">No accounts yet — create one below.</td></tr>`;

  const body = `
    <h1>My account</h1>
    <p class="muted">Each entry below is a credential for the desktop tool. Point the tool at
      <code>${esc(ingestUrl)}</code> and use the token as the Bearer token.</p>
    <div class="card">
      <div class="table-wrap"><table>
        <tr><th>Name</th><th>Token</th><th>History</th><th>Last upload</th><th></th></tr>
        ${accountRows}
      </table></div>
    </div>
    <div class="card">
      <form method="post" action="/accounts">
        <input type="text" name="name" placeholder="account name (e.g. Main PC)" required>
        <button type="submit">Create account</button>
      </form>
    </div>`;

  return http.sendHtml(res, 200, layout({ title: 'My account', user, active: 'account', body }));
}

function groupsPage(req, res, ctx) {
  const user = requireUser(req, res, ctx);
  if (!user) return;

  const groups = store.groupsForUser(user.id);
  const groupRows = groups.length ? groups.map((g) => {
    const role = g.ownerId === user.id ? 'owner' : 'member';
    const count = store.memberAccountIds(g.id).length;
    return `<tr>
      <td><a href="/groups/${esc(g.id)}">${esc(g.name)}</a></td>
      <td><span class="pill">${role}</span></td>
      <td>${count} account${count === 1 ? '' : 's'}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="3" class="muted">No groups yet — create one below.</td></tr>`;

  const body = `
    <h1>Groups</h1>
    <div class="card">
      <div class="table-wrap"><table><tr><th>Name</th><th>Role</th><th>Accounts</th></tr>${groupRows}</table></div>
    </div>
    <div class="card">
      <form method="post" action="/groups">
        <input type="text" name="name" placeholder="group name" required>
        <button type="submit">Create group</button>
      </form>
    </div>`;

  return http.sendHtml(res, 200, layout({ title: 'Groups', user, active: 'groups', body }));
}

// ---- account actions ----

async function createAccount(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const { name } = await http.readForm(req);
  store.createAccount(user.id, name);
  return http.redirect(res, '/account');
}

async function setAccountLimit(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const { limit } = await http.readForm(req);
  store.setHistoryLimit(user.id, ctx.params.id, Number(limit));
  return http.redirect(res, '/account');
}

function rotateAccount(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  store.rotateAccountToken(user.id, ctx.params.id);
  return http.redirect(res, '/account');
}

function deleteAccount(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  store.deleteAccount(user.id, ctx.params.id);
  return http.redirect(res, '/account');
}

// ---- group actions ----

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
  const historyUrl = `${config.baseUrl}/api/groups/${g.id}/history?key=${g.readKey}`;
  const myAccountIds = new Set(store.listAccounts(user.id).map((a) => a.id));

  const rows = store.memberAccounts(g.id).map((a) => {
    const owner = store.getUser(a.userId);
    const last = store.latest(a.id);
    const canRemove = isOwner || a.userId === user.id;
    const summary = last ? `<details><summary>${esc(fmtTime(last.at))}</summary><pre>${esc(JSON.stringify(last.frame, null, 2))}</pre></details>` : '<span class="muted">no data</span>';
    const remove = canRemove ? `<form class="inline" method="post" action="/groups/${esc(g.id)}/remove"><input type="hidden" name="accountId" value="${esc(a.id)}"><button class="danger" type="submit">Remove</button></form>` : '';
    return `<tr><td>${esc(a.name)}</td><td>${esc(owner?.username || '?')}</td><td>${summary}</td><td>${remove}</td></tr>`;
  }).join('') || `<tr><td colspan="4" class="muted">No accounts in this group yet. Share the invite link.</td></tr>`;

  const ownerBox = isOwner ? `
    <h2>Read API (keep the key secret)</h2>
    <div class="card">
      <p>Latest from every account:</p>
      <pre>curl "${esc(latestUrl)}"</pre>
      <p>Full history:</p>
      <pre>curl "${esc(historyUrl)}"</pre>
      <p class="muted">Or send header <code>Authorization: Bearer ${esc(g.readKey)}</code>.</p>
      <form class="inline" method="post" action="/groups/${esc(g.id)}/rotate-key"><button class="secondary" type="submit">Rotate read key</button></form>
      <form class="inline" method="post" action="/groups/${esc(g.id)}/delete" onsubmit="return confirm('Delete this group?')"><button class="danger" type="submit">Delete group</button></form>
    </div>` : '';

  const body = `
    <h1>${esc(g.name)}</h1>
    <p>${isOwner ? '<span class="pill">owner</span>' : '<span class="pill">member</span>'}</p>

    <h2>Invite</h2>
    <div class="card">
      <p>Anyone with this link can add one of their accounts to the group:</p>
      <pre>${esc(inviteUrl)}</pre>
    </div>

    <h2>Accounts in this group</h2>
    <div class="card">
      <div class="table-wrap"><table><tr><th>Account</th><th>Owner</th><th>Latest</th><th></th></tr>${rows}</table></div>
    </div>
    ${ownerBox}
    <p><a href="/groups">← back to groups</a></p>`;

  return http.sendHtml(res, 200, layout({ title: g.name, user, active: 'groups', body }));
}

async function removeMember(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const { accountId } = await http.readForm(req);
  store.removeAccountFromGroup(user.id, ctx.params.id, accountId);
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

// ---- join via invite ----

function joinPage(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const g = store.getGroupByInvite(ctx.params.code);
  if (!g) return http.sendHtml(res, 404, layout({ title: 'Invite', user, active: 'groups', body: '<div class="card">This invite link is not valid.</div>' }));

  const accounts = store.listAccounts(user.id);
  const inGroup = new Set(store.memberAccountIds(g.id));
  const options = accounts.filter((a) => !inGroup.has(a.id));

  const form = options.length ? `
    <form method="post" action="/join/${esc(ctx.params.code)}">
      <select name="accountId">${options.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>
      <button type="submit">Add to ${esc(g.name)}</button>
    </form>`
    : (accounts.length
        ? '<p class="muted">All your accounts are already in this group.</p>'
        : '<p class="muted">You have no accounts yet. <a href="/account">Create one</a> first.</p>');

  return http.sendHtml(res, 200, layout({
    title: 'Join ' + g.name, user, active: 'groups',
    body: `<div class="card"><h1>Join “${esc(g.name)}”</h1>
      <p>Pick which of your accounts to add:</p>${form}
      <p><a href="/groups">Cancel</a></p></div>`,
  }));
}

async function joinSubmit(req, res, ctx) {
  const user = requireUser(req, res, ctx); if (!user) return;
  const g = store.getGroupByInvite(ctx.params.code);
  if (!g) return http.sendHtml(res, 404, 'invalid invite');
  const { accountId } = await http.readForm(req);
  const acc = store.ownedAccount(user.id, accountId);   // only your own account
  if (acc) store.addAccountToGroup(g.id, acc.id);
  return http.redirect(res, '/groups/' + g.id);
}

module.exports = {
  landing, about, apiDocs, accountPage, groupsPage,
  createAccount, setAccountLimit, rotateAccount, deleteAccount,
  createGroup, groupPage, removeMember, rotateGroupKey, deleteGroup,
  joinPage, joinSubmit,
};
