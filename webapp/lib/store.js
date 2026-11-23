'use strict';

// JSON-file datastore (zero dependencies). Single process, synchronous mutations,
// atomic writes (temp file + rename). In-memory indexes for token/invite/read-key.

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { id, secret, inviteCode } = require('./ids');

const EMPTY = { users: {}, accounts: {}, telemetry: {}, groups: {}, members: {} };

class Store {
  constructor(file) {
    this.file = file;
    this.data = this._read();
    this._reindex();
  }

  _read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { ...structuredClone(EMPTY), ...raw };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  _reindex() {
    this.byToken = new Map();     // account token -> accountId
    this.byInvite = new Map();    // invite code  -> groupId
    this.byReadKey = new Map();   // read key      -> groupId
    for (const a of Object.values(this.data.accounts)) this.byToken.set(a.token, a.id);
    for (const g of Object.values(this.data.groups)) {
      this.byInvite.set(g.inviteCode, g.id);
      this.byReadKey.set(g.readKey, g.id);
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // ---- users ------------------------------------------------------------

  upsertUserByDiscord(profile) {
    let user = Object.values(this.data.users).find((u) => u.discordId === profile.discordId);
    if (user) {
      user.username = profile.username;
      user.avatar = profile.avatar;
    } else {
      user = { id: id(), discordId: profile.discordId, username: profile.username, avatar: profile.avatar, createdAt: new Date().toISOString() };
      this.data.users[user.id] = user;
    }
    this._save();
    return user;
  }

  getUser(userId) {
    return this.data.users[userId] || null;
  }

  // ---- accounts ---------------------------------------------------------

  createAccount(userId, name) {
    const acc = {
      id: id(),
      userId,
      name: (name || 'account').slice(0, 60),
      token: secret(24),
      historyLimit: config.defaultHistory,
      createdAt: new Date().toISOString(),
    };
    this.data.accounts[acc.id] = acc;
    this.data.telemetry[acc.id] = [];
    this.byToken.set(acc.token, acc.id);
    this._save();
    return acc;
  }

  listAccounts(userId) {
    return Object.values(this.data.accounts)
      .filter((a) => a.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getAccount(accountId) {
    return this.data.accounts[accountId] || null;
  }

  getAccountByToken(token) {
    const accId = this.byToken.get(token);
    return accId ? this.data.accounts[accId] : null;
  }

  ownedAccount(userId, accountId) {
    const a = this.getAccount(accountId);
    return a && a.userId === userId ? a : null;
  }

  deleteAccount(userId, accountId) {
    const a = this.ownedAccount(userId, accountId);
    if (!a) return false;
    this.byToken.delete(a.token);
    delete this.data.accounts[accountId];
    delete this.data.telemetry[accountId];
    for (const list of Object.values(this.data.members)) {
      const i = list.indexOf(accountId);
      if (i >= 0) list.splice(i, 1);
    }
    this._save();
    return true;
  }

  setHistoryLimit(userId, accountId, limit) {
    const a = this.ownedAccount(userId, accountId);
    if (!a) return false;
    a.historyLimit = Math.max(1, Math.min(config.maxHistory, Math.floor(limit) || config.defaultHistory));
    const hist = this.data.telemetry[accountId] || [];
    if (hist.length > a.historyLimit) this.data.telemetry[accountId] = hist.slice(-a.historyLimit);
    this._save();
    return true;
  }

  rotateAccountToken(userId, accountId) {
    const a = this.ownedAccount(userId, accountId);
    if (!a) return null;
    this.byToken.delete(a.token);
    a.token = secret(24);
    this.byToken.set(a.token, a.id);
    this._save();
    return a.token;
  }

  // ---- telemetry --------------------------------------------------------

  addTelemetry(accountId, frame) {
    const a = this.getAccount(accountId);
    if (!a) return false;
    const hist = this.data.telemetry[accountId] || (this.data.telemetry[accountId] = []);
    hist.push({ at: new Date().toISOString(), frame });
    const limit = a.historyLimit || config.defaultHistory;
    if (hist.length > limit) hist.splice(0, hist.length - limit);
    this._save();
    return true;
  }

  latest(accountId) {
    const hist = this.data.telemetry[accountId] || [];
    return hist.length ? hist[hist.length - 1] : null;
  }

  history(accountId) {
    return this.data.telemetry[accountId] || [];
  }

  // ---- groups -----------------------------------------------------------

  createGroup(userId, name) {
    const g = {
      id: id(),
      name: (name || 'group').slice(0, 60),
      ownerId: userId,
      inviteCode: inviteCode(),
      readKey: secret(24),
      createdAt: new Date().toISOString(),
    };
    this.data.groups[g.id] = g;
    this.data.members[g.id] = [];
    this.byInvite.set(g.inviteCode, g.id);
    this.byReadKey.set(g.readKey, g.id);
    this._save();
    return g;
  }

  getGroup(groupId) {
    return this.data.groups[groupId] || null;
  }

  getGroupByInvite(code) {
    const gid = this.byInvite.get(code);
    return gid ? this.data.groups[gid] : null;
  }

  getGroupByReadKey(key) {
    const gid = this.byReadKey.get(key);
    return gid ? this.data.groups[gid] : null;
  }

  memberAccountIds(groupId) {
    return this.data.members[groupId] || [];
  }

  memberAccounts(groupId) {
    return this.memberAccountIds(groupId)
      .map((aid) => this.getAccount(aid))
      .filter(Boolean);
  }

  // Groups the user owns or has any account in.
  groupsForUser(userId) {
    const mine = new Set(this.listAccounts(userId).map((a) => a.id));
    return Object.values(this.data.groups)
      .filter((g) => g.ownerId === userId || this.memberAccountIds(g.id).some((aid) => mine.has(aid)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  canViewGroup(userId, groupId) {
    const g = this.getGroup(groupId);
    if (!g) return false;
    if (g.ownerId === userId) return true;
    const mine = new Set(this.listAccounts(userId).map((a) => a.id));
    return this.memberAccountIds(groupId).some((aid) => mine.has(aid));
  }

  addAccountToGroup(groupId, accountId) {
    const list = this.data.members[groupId] || (this.data.members[groupId] = []);
    if (!list.includes(accountId)) { list.push(accountId); this._save(); }
    return true;
  }

  removeAccountFromGroup(userId, groupId, accountId) {
    const g = this.getGroup(groupId);
    const acc = this.getAccount(accountId);
    if (!g || !acc) return false;
    // allowed if the user owns the group or owns the account
    if (g.ownerId !== userId && acc.userId !== userId) return false;
    const list = this.data.members[groupId] || [];
    const i = list.indexOf(accountId);
    if (i >= 0) { list.splice(i, 1); this._save(); }
    return true;
  }

  deleteGroup(userId, groupId) {
    const g = this.getGroup(groupId);
    if (!g || g.ownerId !== userId) return false;
    this.byInvite.delete(g.inviteCode);
    this.byReadKey.delete(g.readKey);
    delete this.data.groups[groupId];
    delete this.data.members[groupId];
    this._save();
    return true;
  }

  rotateReadKey(userId, groupId) {
    const g = this.getGroup(groupId);
    if (!g || g.ownerId !== userId) return null;
    this.byReadKey.delete(g.readKey);
    g.readKey = secret(24);
    this.byReadKey.set(g.readKey, g.id);
    this._save();
    return g.readKey;
  }

  // Data for a group's accounts: latest frame, or full history.
  groupData(groupId, { history = false } = {}) {
    return this.memberAccounts(groupId).map((a) => {
      if (history) {
        const frames = this.history(a.id);
        return { account: a.name, accountId: a.id, count: frames.length, frames };
      }
      const last = this.latest(a.id);
      return { account: a.name, accountId: a.id, updatedAt: last?.at || null, frame: last?.frame ?? null };
    });
  }
}

module.exports = new Store(config.dataFile);
