'use strict';

// Discord OAuth2 (scope: identify) over raw https — no library.

const https = require('node:https');
const config = require('../config');

function authorizeUrl(state) {
  const q = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  return 'https://discord.com/api/oauth2/authorize?' + q.toString();
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`discord ${res.statusCode}: ${text.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  }).toString();

  const data = await request({
    method: 'POST',
    hostname: 'discord.com',
    path: '/api/oauth2/token',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': Buffer.byteLength(body),
    },
  }, body);
  return data.access_token;
}

async function fetchUser(accessToken) {
  const data = await request({
    method: 'GET',
    hostname: 'discord.com',
    path: '/api/users/@me',
    headers: { authorization: 'Bearer ' + accessToken },
  });
  return {
    discordId: data.id,
    username: data.global_name || data.username,
    avatar: data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
      : null,
  };
}

module.exports = { authorizeUrl, exchangeCode, fetchUser };
