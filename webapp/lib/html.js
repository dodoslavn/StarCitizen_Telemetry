'use strict';

// Minimal server-side HTML: escaping + a shared page layout. No template engine.

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
  header { display: flex; align-items: center; gap: 16px; padding: 12px 20px; background: #161b22; border-bottom: 1px solid #30363d; }
  header .brand { color: gold; font-weight: 700; }
  header .spacer { flex: 1; }
  main { max-width: 960px; margin: 0 auto; padding: 24px 20px; }
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
`;

function layout({ title, user, body }) {
  const nav = user
    ? `<a href="/dashboard">Dashboard</a>
       <span class="spacer"></span>
       <span class="muted">${esc(user.username)}</span>
       <a href="/logout">Log out</a>`
    : `<span class="spacer"></span><a href="/login" class="btn discord">Log in with Discord</a>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · SC Telemetry</title>
<style>${STYLE}</style>
</head><body>
<header><span class="brand">SC Telemetry</span>${nav}</header>
<main>${body}</main>
</body></html>`;
}

module.exports = { esc, layout };
