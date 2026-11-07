/* ============================================================
   cloudsync.js — sync through a shared cloud folder
   (Google Drive / OneDrive / Dropbox folder on the PC,
    a folder picked through Android's file picker on the phone)
   ============================================================ */

var Cloud = {
  timer: null,
  secs: 15,
  lastAt: '',
  lastMsg: '',
  busy: false,
  _handle: null,
  _peers: 0,

  backend: function () {
    if (window.AppBridge && window.AppBridge.cloudWrite) return 'android';
    if (typeof window.showDirectoryPicker === 'function') return 'web';
    return 'none';
  },

  backendLabel: function () {
    var b = Cloud.backend();
    if (b === 'android') return 'Android folder picker';
    if (b === 'web') return 'Browser folder access';
    return 'not available in this browser';
  },

  name: function () {
    if (Cloud.backend() === 'android') {
      try { return window.AppBridge.cloudFolderName() || ''; } catch (e) { return ''; }
    }
    return Cloud._handle ? Cloud._handle.name : '';
  },

  running: function () { return !!Cloud.timer; },

  /* ---------- folder selection ---------- */
  pick: function () {
    if (Cloud.backend() === 'android') {
      window.AppBridge.pickCloudFolder();
      return;
    }
    if (Cloud.backend() === 'web') {
      window.showDirectoryPicker({ mode: 'readwrite' }).then(function (h) {
        Cloud._handle = h;
        return Cloud.storeHandle(h);
      }).then(function () {
        toast('Folder connected: ' + Cloud.name());
        Router.render();
      }).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        toast('Could not open that folder', 'err');
      });
      return;
    }
    toast('Use Chrome or Edge on a PC, or the Android app', 'err');
  },

  /* called from the Android side once the user has chosen a folder */
  picked: function () {
    toast('Folder connected: ' + Cloud.name());
    Router.render();
  },

  /* ---------- web handle persistence ---------- */
  storeHandle: function (h) {
    return new Promise(function (res) {
      try {
        var req = indexedDB.open('terp-cloud', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () {
          var db = req.result;
          var tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(h, 'dir');
          tx.oncomplete = function () { db.close(); res(); };
          tx.onerror = function () { db.close(); res(); };
        };
        req.onerror = function () { res(); };
      } catch (e) { res(); }
    });
  },

  loadHandle: function () {
    return new Promise(function (res) {
      try {
        var req = indexedDB.open('terp-cloud', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () {
          var db = req.result;
          var tx = db.transaction('kv', 'readonly');
          var g = tx.objectStore('kv').get('dir');
          g.onsuccess = function () { db.close(); res(g.result || null); };
          g.onerror = function () { db.close(); res(null); };
        };
        req.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  },

  /* ---------- file access ---------- */
  list: function () {
    if (Cloud.backend() === 'android') {
      try { return Promise.resolve(JSON.parse(window.AppBridge.cloudList() || '[]')); }
      catch (e) { return Promise.reject(e); }
    }
    var dir = Cloud._handle;
    if (!dir) return Promise.resolve([]);
    var out = [];
    return (async function () {
      for await (var entry of dir.values()) {
        if (entry.kind === 'file') out.push(entry.name);
      }
      return out;
    })();
  },

  read: function (name) {
    if (Cloud.backend() === 'android') {
      try { return Promise.resolve(window.AppBridge.cloudRead(name) || ''); }
      catch (e) { return Promise.reject(e); }
    }
    var dir = Cloud._handle;
    if (!dir) return Promise.resolve('');
    return dir.getFileHandle(name).then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.text(); });
  },

  write: function (name, text) {
    if (Cloud.backend() === 'android') {
      try { return Promise.resolve(window.AppBridge.cloudWrite(name, text)); }
      catch (e) { return Promise.reject(e); }
    }
    var dir = Cloud._handle;
    if (!dir) return Promise.reject(new Error('no folder'));
    return dir.getFileHandle(name, { create: true })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(text).then(function () { return w.close(); }); });
  },

  /* ---------- the sync loop ---------- */
  start: function (secs) {
    Cloud.stop();
    Cloud.secs = Math.max(5, num(secs) || 15);
    settings().cloudSecs = Cloud.secs;
    S.meta.updatedAt = Date.now();
    save(true);
    Cloud.timer = setInterval(Cloud.tick, Cloud.secs * 1000);
    Cloud.tick();
  },

  stop: function () {
    if (Cloud.timer) clearInterval(Cloud.timer);
    Cloud.timer = null;
  },

  myFile: function () { return 'terp-' + deviceId() + '.json'; },

  tick: function () {
    if (Cloud.busy) return;
    if (Cloud.backend() === 'none') { Cloud.lastMsg = 'Cloud folders are not available here'; return; }
    Cloud.busy = true;
    var got = 0, seen = 0;
    var mine = Cloud.myFile();

    var ready = Cloud.backend() === 'web' && !Cloud._handle ? Cloud.loadHandle().then(function (h) { Cloud._handle = h; }) : Promise.resolve();

    ready
      .then(function () { return Cloud.list(); })
      .then(function (names) {
        var peers = names.filter(function (n) { return /^terp-.*\.json$/i.test(n) && n !== mine; });
        seen = peers.length;
        return peers.reduce(function (chain, n) {
          return chain.then(function () {
            return Cloud.read(n).then(function (txt) {
              if (!txt) return;
              var pkt;
              try { pkt = JSON.parse(txt); } catch (e) { return; }
              var st = Sync.merge(pkt);
              got += (st.added + st.updated + st.deleted);
            }).catch(function () {});
          });
        }, Promise.resolve());
      })
      .then(function () { return Cloud.write(mine, JSON.stringify(Sync.packet())); })
      .then(function () {
        Cloud._peers = seen;
        Cloud.lastAt = new Date().toTimeString().slice(0, 8);
        Cloud.lastMsg = 'Synced ' + Cloud.lastAt + ' · ' + seen + ' other device(s)' + (got ? ' · received ' + got + ' change(s)' : '');
        if (got && Router.current === 'sync') Router.render();
        var el = document.getElementById('cloudStatus');
        if (el) el.innerHTML = '<b class="green">' + esc(Cloud.lastMsg) + '</b>';
      })
      .catch(function (e) {
        Cloud.lastMsg = 'Sync failed — ' + (e && e.message ? e.message : 'folder not reachable');
        var el = document.getElementById('cloudStatus');
        if (el) el.innerHTML = '<b class="red">' + esc(Cloud.lastMsg) + '</b>';
      })
      .then(function () { Cloud.busy = false; });
  },

  resume: function () {
    if (settings().cloudAuto !== false && (settings().cloudFolder || Cloud.name())) {
      Cloud.start(settings().cloudSecs || 15);
    }
  }
};
