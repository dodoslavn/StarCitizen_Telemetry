'use strict';

const config = require('../config');
const http = require('../lib/http');
const session = require('../lib/session');
const discord = require('../lib/discord');
const store = require('../lib/store');
const { layout, esc } = require('../lib/html');

function login(req, res) {
  if (config.discordConfigured) {
    const state = session.makeState();
    http.setCookie(res, 'oauth_state', state, { maxAge: 600, secure: config.baseUrl.startsWith('https://') });
    return http.redirect(res, discord.authorizeUrl(state));
  }
  if (config.allowDevLogin) return http.redirect(res, '/dev-login');
  return http.sendHtml(res, 503, layout({
    title: 'Login unavailable',
    body: '<div class="card">Discord login is not configured on this server yet.</div>',
  }));
}

async function callback(req, res, ctx) {
  const { code, state } = ctx.query;
  const cookieState = http.parseCookies(req).oauth_state;
  if (!code || !state || state !== cookieState || !session.checkState(state)) {
    return http.sendHtml(res, 400, layout({ title: 'Login failed', body: '<div class="card">Invalid or expired login attempt. <a href="/login">Try again</a>.</div>' }));
  }
  try {
    const accessToken = await discord.exchangeCode(code);
    const profile = await discord.fetchUser(accessToken);
    const user = store.upsertUserByDiscord(profile);
    session.setSession(res, user.id);
    http.setCookie(res, 'oauth_state', '', { maxAge: 0 });
    return http.redirect(res, '/dashboard');
  } catch (e) {
    return http.sendHtml(res, 502, layout({ title: 'Login failed', body: `<div class="card">Discord login failed: ${esc(e.message)}</div>` }));
  }
}

function logout(req, res) {
  session.clearSession(res);
  return http.redirect(res, '/');
}

// --- dev-only login bypass (no Discord), for local testing ---

function devLoginForm(req, res) {
  if (!config.allowDevLogin) return http.sendHtml(res, 404, 'not found');
  return http.sendHtml(res, 200, layout({
    title: 'Dev login',
    body: `<div class="card"><h1>Dev login</h1>
      <form method="post" action="/dev-login">
        <input type="text" name="name" placeholder="username" required>
        <button type="submit">Log in</button>
      </form>
      <p class="muted">Enabled only because ALLOW_DEV_LOGIN=1.</p></div>`,
  }));
}

async function devLoginSubmit(req, res) {
  if (!config.allowDevLogin) return http.sendHtml(res, 404, 'not found');
  const { name } = await http.readForm(req);
  const clean = (name || 'dev').trim().slice(0, 40) || 'dev';
  const user = store.upsertUserByDiscord({ discordId: 'dev:' + clean, username: clean, avatar: null });
  session.setSession(res, user.id);
  return http.redirect(res, '/dashboard');
}

module.exports = { login, callback, logout, devLoginForm, devLoginSubmit };
