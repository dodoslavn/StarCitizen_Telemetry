'use strict';

// Stateless signed-cookie sessions (HMAC-SHA256). No session store.

const crypto = require('node:crypto');
const config = require('../config');
const http = require('./http');

const COOKIE = 'sid';
const MAX_AGE = 30 * 24 * 3600;   // 30 days

function sign(value) {
  const mac = crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
  return `${value}.${mac}`;
}

function unsign(signed) {
  if (!signed) return null;
  const dot = signed.lastIndexOf('.');
  if (dot < 0) return null;
  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

// --- login session: cookie holds "<userId>:<issuedAtSeconds>" ---

function setSession(res, userId) {
  const token = sign(`${userId}:${Math.floor(Date.now() / 1000)}`);
  http.setCookie(res, COOKIE, token, { maxAge: MAX_AGE, secure: isSecure() });
}

function clearSession(res) {
  http.setCookie(res, COOKIE, '', { maxAge: 0, secure: isSecure() });
}

function userIdFrom(req) {
  const raw = http.parseCookies(req)[COOKIE];
  const value = unsign(raw);
  if (!value) return null;
  const [userId, issued] = value.split(':');
  if (!userId || !issued) return null;
  if (Date.now() / 1000 - Number(issued) > MAX_AGE) return null;
  return userId;
}

// --- short-lived signed value for the OAuth 'state' parameter ---

function makeState() {
  return sign(`${crypto.randomBytes(12).toString('hex')}:${Math.floor(Date.now() / 1000)}`);
}

function checkState(state) {
  const value = unsign(state);
  if (!value) return false;
  const issued = Number(value.split(':')[1]);
  return Number.isFinite(issued) && Date.now() / 1000 - issued < 600;   // 10 min
}

function isSecure() {
  return config.baseUrl.startsWith('https://');
}

module.exports = { setSession, clearSession, userIdFrom, makeState, checkState };
