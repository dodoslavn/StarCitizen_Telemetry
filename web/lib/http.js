'use strict';

// Small HTTP helpers on top of node:http.

const MAX_BODY = 1 << 20;   // 1 MiB

function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req, max) {
  const body = await readBody(req, max);
  if (!body) return {};
  return JSON.parse(body);
}

async function readForm(req, max) {
  const body = await readBody(req, max);
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  appendHeader(res, 'Set-Cookie', parts.join('; '));
}

function appendHeader(res, name, value) {
  const prev = res.getHeader(name);
  if (prev == null) res.setHeader(name, value);
  else res.setHeader(name, Array.isArray(prev) ? [...prev, value] : [prev, value]);
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendHtml(res, code, html) {
  res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirect(res, location, code = 302) {
  res.writeHead(code, { location });
  res.end();
}

module.exports = {
  MAX_BODY, readBody, readJson, readForm, parseCookies, setCookie, appendHeader,
  sendJson, sendHtml, redirect,
};
