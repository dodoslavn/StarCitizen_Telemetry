'use strict';

// Datastore. CONFIG (users, sources, groups, members) persists to a JSON file;
// DATA (the telemetry frames) lives only in memory and is gone on restart.
// Zero dependencies. Single process, synchronous mutations, atomic config writes.

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { id, secret, inviteCode } = require('./ids');

const EMPTY = { users: {}, sources: {}, groups: {}, members: {} };
const START = Date.now();

function nameValid(s) {
  return /^[A-Za-z]+$/.test(s || '');
}

class Store {
  constructor(file) {
    this.file = file;
    this.cfg = this._read();           // persisted config
    this.data = {};                    // in-memory: sourceId -> [{at, frame, size}]
    this.metrics = { submits: [], badCreds: [], totalSubmits: 0, totalBadCreds: 0 };
    this._reindex();
  }

  _read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      // migrate the pre-0.3 shape: "accounts" became "sources"; telemetry is now in-memory
      if (raw.accounts && !raw.sources) raw.sources = raw.accounts;
      delete raw.accounts;
      delete raw.telemetry;
      return { ...structuredClone(EMPTY), ...raw };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  _reindex() {
    this.byToken = new Map();
    this.byInvite = new Map();
    this.byReadKey = new Map();
    for (const s of Object.values(this.cfg.sources)) this.byToken.set(s.token, s.id);
    for (const g of Object.values(this.cfg.groups)) {
      this.byInvite.set(g.inviteCode, g.id);
      this.byReadKey.set(g.readKey, g.id);
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.cfg, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // ---- users ------------------------------------------------------------

  upsertUserByDiscord(profile) {
    let user = Object.values(this.cfg.users).find((u) => u.discordId === profile.discordId);
    if (user) {
      user.username = profile.username;
      user.avatar = profile.avatar;
    } else {
      user = { id: id(), discordId: profile.discordId, username: profile.username, avatar: profile.avatar, createdAt: new Date().toISOString() };
      this.cfg.users[user.id] = user;
    }
    this._save();
    return user;
  }

  getUser(userId) { return this.cfg.users[userId] || null; }

  // ---- sources ----------------------------------------------------------

  static nameValid = nameValid;

  createSource(userId, name) {
    if (!nameValid(name)) throw new Error('Source name must be letters only (a-z, A-Z).');
    const src = {
      id: id(),
      userId,
      name,
      token: secret(24),
      historyLimit: config.defaultHistory,
      createdAt: new Date().toISOString(),
    };
    this.cfg.sources[src.id] = src;
    this.data[src.id] = [];
    this.byToken.set(src.token, src.id);
    this._save();
    return src;
  }

  getSource(sourceId) { return this.cfg.sources[sourceId] || null; }

  getSourceByToken(token) {
    const sid = this.byToken.get(token);
    return sid ? this.cfg.sources[sid] : null;
  }

  ownedSource(userId, sourceId) {
    const s = this.getSource(sourceId);
    return s && s.userId === userId ? s : null;
  }

  listSources(userId) {
    return Object.values(this.cfg.sources)
      .filter((s) => s.userId === userId)
      .sort((a, b) => (this.lastAtMs(b.id) - this.lastAtMs(a.id)) || a.name.localeCompare(b.name));
  }

  deleteSource(userId, sourceId) {
    const s = this.ownedSource(userId, sourceId);
    if (!s) return false;
    this.byToken.delete(s.token);
    delete this.cfg.sources[sourceId];
    delete this.data[sourceId];
    for (const list of Object.values(this.cfg.members)) {
      const i = list.indexOf(sourceId);
      if (i >= 0) list.splice(i, 1);
    }
    this._save();
    return true;
  }

  setHistoryLimit(userId, sourceId, limit) {
    const s = this.ownedSource(userId, sourceId);
    if (!s) return false;
    s.historyLimit = Math.max(1, Math.min(config.maxHistory, Math.floor(limit) || config.defaultHistory));
    const hist = this.data[sourceId] || [];
    if (hist.length > s.historyLimit) this.data[sourceId] = hist.slice(-s.historyLimit);
    this._save();
    return true;
  }

  rotateSourceToken(userId, sourceId) {
    const s = this.ownedSource(userId, sourceId);
    if (!s) return null;
    this.byToken.delete(s.token);
    s.token = secret(24);
    this.byToken.set(s.token, s.id);
    this._save();
    return s.token;
  }

  // ---- data (in memory only) -------------------------------------------

  addData(sourceId, frame) {
    const s = this.getSource(sourceId);
    if (!s) return false;
    const hist = this.data[sourceId] || (this.data[sourceId] = []);
    hist.push({ at: new Date().toISOString(), frame, size: Buffer.byteLength(JSON.stringify(frame)) });
    const limit = s.historyLimit || config.defaultHistory;
    if (hist.length > limit) hist.splice(0, hist.length - limit);
    this.recordSubmit();
    return true;
  }

  history(sourceId) { return this.data[sourceId] || []; }

  // nth-latest, 1 = most recent. Returns {at, frame} or null.
  nthLatest(sourceId, n = 1) {
    const hist = this.data[sourceId] || [];
    const idx = hist.length - n;
    return idx >= 0 ? hist[idx] : null;
  }

  latest(sourceId) { return this.nthLatest(sourceId, 1); }

  lastAtMs(sourceId) {
    const last = this.latest(sourceId);
    return last ? Date.parse(last.at) : 0;
  }

  // ---- memory accounting ------------------------------------------------

  sourceBytes(sourceId) {
    return (this.data[sourceId] || []).reduce((n, e) => n + e.size, 0);
  }

  lastMsgBytes(sourceId) {
    const hist = this.data[sourceId] || [];
    return hist.length ? hist[hist.length - 1].size : 0;
  }

  totalDataBytes() {
    let n = 0;
    for (const sid of Object.keys(this.data)) n += this.sourceBytes(sid);
    return n;
  }

  totalFrames() {
    let n = 0;
    for (const list of Object.values(this.data)) n += list.length;
    return n;
  }

  // ---- metrics ----------------------------------------------------------

  recordSubmit() { this.metrics.totalSubmits++; this.metrics.submits.push(Date.now()); this._trim(); }
  recordBadCred() { this.metrics.totalBadCreds++; this.metrics.badCreds.push(Date.now()); this._trim(); }

  _trim() {
    const cut = Date.now() - 65000;
    const p = (a) => { while (a.length && a[0] < cut) a.shift(); };
    p(this.metrics.submits); p(this.metrics.badCreds);
  }

  countIn(arrName, ms) {
    const cut = Date.now() - ms;
    return this.metrics[arrName].filter((t) => t >= cut).length;
  }

  stats() {
    return {
      users: Object.keys(this.cfg.users).length,
      sources: Object.keys(this.cfg.sources).length,
      groups: Object.keys(this.cfg.groups).length,
      frames: this.totalFrames(),
      dataBytes: this.totalDataBytes(),
      totalSubmits: this.metrics.totalSubmits,
      totalBadCreds: this.metrics.totalBadCreds,
      submits5s: this.countIn('submits', 5000),
      submits1m: this.countIn('submits', 60000),
      badCreds1m: this.countIn('badCreds', 60000),
      uptimeSec: Math.floor((Date.now() - START) / 1000),
    };
  }

  // ---- groups -----------------------------------------------------------

  createGroup(userId, name) {
    const g = {
      id: id(), name: (name || 'group').slice(0, 60), ownerId: userId,
      inviteCode: inviteCode(), readKey: secret(24), createdAt: new Date().toISOString(),
    };
    this.cfg.groups[g.id] = g;
    this.cfg.members[g.id] = [];
    this.byInvite.set(g.inviteCode, g.id);
    this.byReadKey.set(g.readKey, g.id);
    this._save();
    return g;
  }

  getGroup(groupId) { return this.cfg.groups[groupId] || null; }
  getGroupByInvite(code) { const gid = this.byInvite.get(code); return gid ? this.cfg.groups[gid] : null; }
  getGroupByReadKey(key) { const gid = this.byReadKey.get(key); return gid ? this.cfg.groups[gid] : null; }

  memberSourceIds(groupId) { return this.cfg.members[groupId] || []; }
  memberSources(groupId) { return this.memberSourceIds(groupId).map((sid) => this.getSource(sid)).filter(Boolean); }

  // distinct owning users in a group
  memberUserIds(groupId) {
    return [...new Set(this.memberSources(groupId).map((s) => s.userId))];
  }

  groupSourceCount(groupId) { return this.memberSourceIds(groupId).length; }
  groupAccountCount(groupId) { return this.memberUserIds(groupId).length; }

  groupsForUser(userId) {
    const mine = new Set(this.listSources(userId).map((s) => s.id));
    return Object.values(this.cfg.groups)
      .filter((g) => g.ownerId === userId || this.memberSourceIds(g.id).some((sid) => mine.has(sid)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  canViewGroup(userId, groupId) {
    const g = this.getGroup(groupId);
    if (!g) return false;
    if (g.ownerId === userId) return true;
    const mine = new Set(this.listSources(userId).map((s) => s.id));
    return this.memberSourceIds(groupId).some((sid) => mine.has(sid));
  }

  addSourceToGroup(groupId, sourceId) {
    const list = this.cfg.members[groupId] || (this.cfg.members[groupId] = []);
    if (!list.includes(sourceId)) { list.push(sourceId); this._save(); }
    return true;
  }

  removeSourceFromGroup(userId, groupId, sourceId) {
    const g = this.getGroup(groupId);
    const src = this.getSource(sourceId);
    if (!g || !src) return false;
    if (g.ownerId !== userId && src.userId !== userId) return false;
    const list = this.cfg.members[groupId] || [];
    const i = list.indexOf(sourceId);
    if (i >= 0) { list.splice(i, 1); this._save(); }
    return true;
  }

  deleteGroup(userId, groupId) {
    const g = this.getGroup(groupId);
    if (!g || g.ownerId !== userId) return false;
    this.byInvite.delete(g.inviteCode);
    this.byReadKey.delete(g.readKey);
    delete this.cfg.groups[groupId];
    delete this.cfg.members[groupId];
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

  // transfer ownership to another user who has a source in the group
  setGroupOwner(userId, groupId, newOwnerId) {
    const g = this.getGroup(groupId);
    if (!g || g.ownerId !== userId) return false;
    if (!this.memberUserIds(groupId).includes(newOwnerId)) return false;
    g.ownerId = newOwnerId;
    this._save();
    return true;
  }

  // id used inside a group payload: "<ownerName>_<sourceName>" (unique within the group)
  groupSourceKey(source) {
    const u = this.getUser(source.userId);
    const uname = (u?.username || 'user').replace(/[^A-Za-z0-9]+/g, '');
    return `${uname}_${source.name}`;
  }

  // { sources: { key: <latest frame> } }  — or history when history=true
  groupPayload(groupId, { history = false } = {}) {
    const sources = {};
    for (const s of this.memberSources(groupId)) {
      const key = this.groupSourceKey(s);
      if (history) {
        const frames = this.history(s.id);
        sources[key] = { count: frames.length, frames };
      } else {
        const last = this.latest(s.id);
        sources[key] = last ? last.frame : null;
      }
    }
    return { sources };
  }
}

module.exports = new Store(config.dataFile);
