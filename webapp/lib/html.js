'use strict';

// Minimal server-side HTML: escaping + a shared page layout. No template engine.

const config = require('../config');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0e1116; color: #e6edf3; font: 15px/1.5 system-ui, "Segoe UI", sans-serif; }
  a { color: #58a6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .app { display: flex; min-height: 100vh; }
  .side { width: 220px; flex: 0 0 220px; background: #161b22; border-right: 1px solid #30363d; padding: 18px 0; display: flex; flex-direction: column; }
  .side .brand { padding: 0 18px 4px; color: gold; font-weight: 700; font-size: 18px; }
  .side .tag { padding: 0 18px 18px; color: #8b949e; font-size: 12px; }
  .side nav { display: flex; flex-direction: column; }
  .side nav a { padding: 10px 18px; color: #c9d1d9; border-left: 3px solid transparent; }
  .side nav a:hover { background: #1c2129; text-decoration: none; }
  .side nav a.active { background: #1c2129; border-left-color: gold; color: #fff; }
  .side .foot { margin-top: auto; padding: 12px 18px; color: #8b949e; font-size: 12px; }
  .content { flex: 1; min-width: 0; }
  main { max-width: 900px; margin: 0 auto; padding: 24px 24px 48px; }
  h1 { font-size: 20px; } h2 { font-size: 17px; margin-top: 32px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #21262d; vertical-align: top; }
  th { color: #8b949e; font-weight: 600; font-size: 13px; }
  code, pre { font-family: ui-monospace, Menlo, Consolas, monospace; }
  code { background: #0b0f14; padding: 2px 6px; border-radius: 4px; word-break: break-all; }
  pre { background: #0b0f14; padding: 12px; border-radius: 6px; overflow: auto; }
  input[type=text], input[type=number] { background: #0b0f14; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 7px 9px; font: inherit; }
  button, .btn { background: #238636; color: #fff; border: 0; border-radius: 6px; padding: 7px 12px; font: inherit; cursor: pointer; }
  button.secondary, .btn.secondary { background: #30363d; }
  button.danger { background: #8b2a2a; }
  form.inline { display: inline; }
  .muted { color: #8b949e; }
  .pill { background: #30363d; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
  .discord { background: #5865F2; }
  .center { max-width: 560px; margin: 10vh auto; padding: 0 20px; }
`;

const TABS = [
  { key: 'account', href: '/account', label: 'My account' },
  { key: 'groups', href: '/groups', label: 'Groups' },
  { key: 'about', href: '/about', label: 'About' },
  { key: 'logout', href: '/logout', label: 'Log out' },
];

function sidebar(active) {
  const links = TABS.map((t) =>
    `<a href="${t.href}"${t.key === active ? ' class="active"' : ''}>${t.label}</a>`
  ).join('');
  return `<aside class="side">
    <div class="brand">${esc(config.app.name)}</div>
    <div class="tag">${esc(config.app.tagline)}</div>
    <nav>${links}</nav>
    <div class="foot">v${esc(config.app.version)}</div>
  </aside>`;
}

// Logged-in layout with the left panel.
function layout({ title, user, active, body }) {
  if (!user) return plain({ title, body });
  return page(title, `<div class="app">${sidebar(active)}<div class="content"><main>${body}</main></div></div>`);
}

// Simple centered layout for logged-out pages.
function plain({ title, body }) {
  return page(title, `<div class="center"><div class="brand" style="color:gold;font-weight:700;font-size:22px">${esc(config.app.name)}</div><p class="muted">${esc(config.app.tagline)}</p>${body}</div>`);
}

function page(title, inner) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(config.app.name)}</title>
<style>${STYLE}</style>
</head><body>${inner}</body></html>`;
}

module.exports = { esc, layout, plain };
