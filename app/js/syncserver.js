/* ============================================================
   syncserver.js — multi-user sync through your own server
   ============================================================ */

var Srv = {
  timer: null,
  secs: 10,
  busy: false,
  lastAt: '',
  lastMsg: '',
  user: null,

  url: function () { return (settings().serverUrl || '').replace(/\/+$/, ''); },
  token: function () { return settings().serverToken || ''; },
  running: function () { return !!Srv.timer; },
  configured: function () { return !!(Srv.url() && Srv.token()); },

  api: function (pathname, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (Srv.token()) headers['Authorization'] = 'Bearer ' + Srv.token();
    return fetch(Srv.url() + pathname, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  },

  /* ---------- sign in ---------- */
  login: function (url, username, password) {
    var clean = String(url || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(clean)) clean = 'http://' + clean;
    return fetch(clean + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Sign in failed');
        var st = settings();
        st.serverUrl = clean;
        st.serverToken = j.token;
        st.serverUser = j.user;
        S.meta.updatedAt = Date.now();
        save(true);
        Srv.user = j.user;
        Srv.adoptUser(j.user);
        Srv.start(st.serverSecs || 10);
        return j.user;
      });
    });
  },

  /* the server user becomes the local session, so menus follow their permissions */
  adoptUser: function (u) {
    var id = 'srv-' + u.username;
    var existing = S.users.find(function (x) { return x.id === id; });
    var rec = existing || { id: id, username: u.username };
    rec.name = u.name || u.username;
    rec.role = u.role || 'staff';
    rec.perms = u.perms || [];
    rec.serverUser = true;
    rec.active = true;
    rec.branchId = rec.branchId || (S.branches[0] || {}).id;
    upsert('users', rec);
    S.session.userId = id;
    save(true);
    Shell.refreshDrawer();
  },

  logout: function () {
    Srv.stop();
    var st = settings();
    delete st.serverToken;
    delete st.serverUser;
    S.meta.updatedAt = Date.now();
    S.session.userId = null;
    save(true);
    Shell.refreshDrawer();
    Router.go('login');
  },

  /* ---------- the sync cycle ---------- */
  start: function (secs) {
    Srv.stop();
    Srv.secs = Math.max(3, num(secs) || 10);
    settings().serverSecs = Srv.secs;
    S.meta.updatedAt = Date.now();
    save(true);
    Srv.timer = setInterval(Srv.tick, Srv.secs * 1000);
    Srv.tick();
  },

  stop: function () {
    if (Srv.timer) clearInterval(Srv.timer);
    Srv.timer = null;
  },

  tick: function () {
    if (Srv.busy || !Srv.configured()) return;
    Srv.busy = true;
    var since = num(settings().serverSince || 0);
    var mine = deviceId();
    var got = 0;

    Srv.api('/api/sync', {
      method: 'POST',
      body: { deviceId: mine, packet: Sync.packet(), since: since }
    }).then(function (res) {
      (res.packets || []).forEach(function (p) {
        if (!p || !p.packet) return;
        if (p.packet.deviceId === mine) return;
        var st = Sync.merge(p.packet);
        got += st.added + st.updated + st.deleted;
      });
      settings().serverSince = res.at || Date.now();
      S.meta.updatedAt = Date.now();
      save(true);
      Srv.lastAt = new Date().toTimeString().slice(0, 8);
      Srv.lastMsg = 'Synced ' + Srv.lastAt + ' · ' + (res.devices || 1) + ' device(s)' +
        (got ? ' · received ' + got + ' change(s)' : ' · up to date');
      var el = document.getElementById('srvStatus');
      if (el) el.innerHTML = '<b class="green">' + esc(Srv.lastMsg) + '</b>';
      if (got && Router.current === 'sync') Router.render();
    }).catch(function (e) {
      Srv.lastMsg = 'Not connected — ' + e.message;
      var el = document.getElementById('srvStatus');
      if (el) el.innerHTML = '<b class="red">' + esc(Srv.lastMsg) + '</b>';
    }).then(function () { Srv.busy = false; });
  },

  resume: function () {
    if (Srv.configured() && settings().serverAuto !== false) {
      var u = settings().serverUser;
      if (u) { Srv.user = u; Srv.adoptUser(u); }
      Srv.start(settings().serverSecs || 10);
    }
  },

  /* ---------- user administration ---------- */
  listUsers: function () { return Srv.api('/api/users'); },
  saveUser: function (u) { return Srv.api('/api/users', { method: 'POST', body: u }); },
  changePassword: function (oldPw, newPw) {
    return Srv.api('/api/password', { method: 'POST', body: { oldPassword: oldPw, newPassword: newPw } });
  }
};
