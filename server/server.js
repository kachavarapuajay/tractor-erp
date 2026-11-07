#!/usr/bin/env node
/* ============================================================
   Tractor ERP — sync server
   Zero dependencies. Node 14+.

     node server.js            # starts on port 8080
     PORT=9000 node server.js  # different port

   It serves the web app, holds the company data, and keeps every
   device in step. Devices merge locally with the same rules as
   the offline app, so nothing is ever overwritten blindly.
   ============================================================ */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const LOG_FILE = path.join(DATA_DIR, 'activity.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- storage ---------------- */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

let users = readJson(USERS_FILE, null);
let devices = readJson(DEVICES_FILE, {});   // deviceId -> { packet, at, user }
const sessions = new Map();                  // token -> { username, until }

/* ---------------- passwords ---------------- */
function hash(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash: h };
}
function check(password, rec) {
  if (!rec || !rec.salt) return false;
  const h = crypto.scryptSync(String(password), rec.salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(rec.hash, 'hex'));
}

function saveUsers() { writeJson(USERS_FILE, users); }

if (!users) {
  const p = hash('admin123');
  users = {
    admin: {
      username: 'admin', name: 'Administrator', role: 'admin',
      salt: p.salt, hash: p.hash, perms: ['*'], active: true, createdAt: new Date().toISOString()
    }
  };
  saveUsers();
  console.log('\n  First run — an administrator account was created');
  console.log('    username: admin');
  console.log('    password: admin123');
  console.log('  Change it after signing in.\n');
}

function log(who, what) {
  const line = new Date().toISOString() + '  ' + who + '  ' + what + '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) {}
}

/* ---------------- helpers ---------------- */
function send(res, code, body, type) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(data);
}
function auth(req) {
  const h = req.headers['authorization'] || '';
  const token = h.replace(/^Bearer\s+/i, '').trim();
  const s = sessions.get(token);
  if (!s) return null;
  if (s.until < Date.now()) { sessions.delete(token); return null; }
  return Object.assign({ token }, s);
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 40 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/* ---------------- API ---------------- */
async function api(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname === '/api/health') {
    return send(res, 200, {
      ok: true, app: 'tractor-erp-server', version: 1,
      devices: Object.keys(devices).length, users: Object.keys(users).length
    });
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const b = await body(req);
    const rec = users[String(b.username || '').toLowerCase()];
    if (!rec || rec.active === false || !check(b.password, rec)) {
      log(b.username || '?', 'failed sign-in');
      return send(res, 401, { error: 'Wrong username or password' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { username: rec.username, until: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    log(rec.username, 'signed in');
    return send(res, 200, {
      token,
      user: { username: rec.username, name: rec.name, role: rec.role, perms: rec.perms || [] }
    });
  }

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    const me = auth(req);
    if (!me) return send(res, 401, { error: 'Please sign in again' });
    const b = await body(req);
    const deviceId = String(b.deviceId || '').slice(0, 40);
    if (!deviceId) return send(res, 400, { error: 'deviceId required' });

    // store this device's packet
    if (b.packet && typeof b.packet === 'object') {
      devices[deviceId] = { packet: b.packet, at: Date.now(), user: me.username };
      writeJson(DEVICES_FILE, devices);
    }

    // hand back everything from other devices that changed since last time
    const since = Number(b.since || 0);
    const out = [];
    Object.keys(devices).forEach(id => {
      if (id === deviceId) return;
      const d = devices[id];
      if (d && d.at > since && d.packet) out.push({ deviceId: id, at: d.at, packet: d.packet });
    });
    return send(res, 200, { at: Date.now(), packets: out, devices: Object.keys(devices).length });
  }

  /* ---- user management (admin only) ---- */
  if (url.pathname === '/api/users' && req.method === 'GET') {
    const me = auth(req);
    if (!me) return send(res, 401, { error: 'Please sign in again' });
    if ((users[me.username] || {}).role !== 'admin') return send(res, 403, { error: 'Admins only' });
    return send(res, 200, {
      users: Object.keys(users).map(k => ({
        username: users[k].username, name: users[k].name, role: users[k].role,
        perms: users[k].perms || [], active: users[k].active !== false
      }))
    });
  }

  if (url.pathname === '/api/users' && req.method === 'POST') {
    const me = auth(req);
    if (!me) return send(res, 401, { error: 'Please sign in again' });
    if ((users[me.username] || {}).role !== 'admin') return send(res, 403, { error: 'Admins only' });
    const b = await body(req);
    const username = String(b.username || '').toLowerCase().trim();
    if (!username) return send(res, 400, { error: 'username required' });
    const existing = users[username];
    const rec = existing || { username, createdAt: new Date().toISOString() };
    rec.name = b.name || rec.name || username;
    rec.role = b.role || rec.role || 'staff';
    rec.perms = Array.isArray(b.perms) ? b.perms : (rec.perms || []);
    rec.active = b.active === undefined ? true : !!b.active;
    if (b.password) {
      const p = hash(b.password);
      rec.salt = p.salt; rec.hash = p.hash;
    } else if (!existing) {
      return send(res, 400, { error: 'password required for a new user' });
    }
    users[username] = rec;
    saveUsers();
    log(me.username, (existing ? 'updated' : 'created') + ' user ' + username);
    return send(res, 200, { ok: true, username });
  }

  if (url.pathname === '/api/password' && req.method === 'POST') {
    const me = auth(req);
    if (!me) return send(res, 401, { error: 'Please sign in again' });
    const b = await body(req);
    const rec = users[me.username];
    if (!rec || !check(b.oldPassword, rec)) return send(res, 400, { error: 'Current password is wrong' });
    if (!b.newPassword || String(b.newPassword).length < 6) return send(res, 400, { error: 'Use at least 6 characters' });
    const p = hash(b.newPassword);
    rec.salt = p.salt; rec.hash = p.hash;
    saveUsers();
    log(me.username, 'changed password');
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Unknown endpoint' });
}

/* ---------------- static files ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serveStatic(req, res, url) {
  let file = decodeURIComponent(url.pathname);
  if (file === '/' || file === '') file = '/Tractor-ERP-Web.html';
  const full = path.join(ROOT, 'public', file);
  if (!full.startsWith(path.join(ROOT, 'public'))) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
  });
}

/* ---------------- server ---------------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(e => send(res, 500, { error: e.message }));
  } else {
    serveStatic(req, res, url);
  }
});

server.listen(PORT, () => {
  const nets = require('os').networkInterfaces();
  const ips = [];
  Object.keys(nets).forEach(n => nets[n].forEach(i => {
    if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  }));
  console.log('\n  Tractor ERP server running');
  console.log('    this computer : http://localhost:' + PORT);
  ips.forEach(ip => console.log('    on the network: http://' + ip + ':' + PORT));
  console.log('    data folder   : ' + DATA_DIR + '\n');
});
