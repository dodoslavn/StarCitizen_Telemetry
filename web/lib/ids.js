'use strict';

const crypto = require('node:crypto');

// Short url-safe id for records.
function id() {
  return crypto.randomUUID();
}

// Secret token/key (hex). 24 bytes = 48 hex chars.
function secret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Shorter human-ish invite code.
function inviteCode() {
  return crypto.randomBytes(9).toString('base64url');   // 12 chars, url-safe
}

module.exports = { id, secret, inviteCode };
