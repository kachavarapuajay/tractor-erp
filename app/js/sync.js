/* ============================================================
   sync.js — multi-device sync (Wi-Fi + file) and automatic backup
   ============================================================ */

var SYNC_COLLECTIONS = [
  'users', 'departments', 'employees', 'branches', 'parties', 'items', 'units', 'moves', 'transfers',
  'quotations', 'invoices', 'purchases', 'payments', 'notes', 'expenses', 'jobcards', 'leads',
  'attendance', 'salaries', 'tada', 'fuel', 'logbook', 'petty', 'insurers', 'policies', 'exchanges',
  'marginReceipts', 'gstSlabs', 'makes', 'models', 'mandals', 'villages', 'states', 'bankAccounts',
  'transporters', 'transports', 'warranties', 'rta', 'hsrp', 'agreements'
];

/* ---------------- sync engine ---------------- */
var Sync = {
  packet: function () {
    var data = {};
    SYNC_COLLECTIONS.forEach(function (k) { data[k] = S[k] || []; });
    return {
      app: 'tractor-erp', packetVersion: 1,
      deviceId: deviceId(), deviceName: (org().name || 'Device') + ' · ' + deviceId(),
      at: Date.now(), orgName: org().name || '',
      data: data,
      counters: S.counters || {},
      tombstones: S.tombstones || {},
      meta: { org: org(), settings: settings(), metaUpdatedAt: S.meta.updatedAt || 0 }
    };
  },

  /* cheap fingerprint: changes whenever any record is added, edited or deleted */
  rev: function () {
    var n = 0, newest = 0;
    SYNC_COLLECTIONS.forEach(function (k) {
      var arr = S[k] || [];
      n += arr.length;
      arr.forEach(function (r) { if (num(r._u) > newest) newest = num(r._u); });
    });
    return n + ':' + newest + ':' + Sync.tombstoneCount();
  },

  merge: function (pkt) {
    if (!pkt || pkt.app !== 'tractor-erp' || !pkt.data) throw new Error('This is not a Tractor ERP sync file');
    var stats = { added: 0, updated: 0, deleted: 0, unchanged: 0 };
    SYNC_COLLECTIONS.forEach(function (name) {
      var remote = pkt.data[name] || [];
      var local = coll(name);
      var index = {};
      local.forEach(function (r) { index[r.id] = r; });

      remote.forEach(function (rr) {
        if (!rr || !rr.id) return;
        var lr = index[rr.id];
        if (!lr) { local.push(rr); index[rr.id] = rr; stats.added++; return; }
        if (num(rr._u) > num(lr._u)) { Object.assign(lr, rr); stats.updated++; }
        else stats.unchanged++;
      });

      // apply incoming deletions
      var tomb = (pkt.tombstones && pkt.tombstones[name]) || {};
      Object.keys(tomb).forEach(function (id) {
        var lr = index[id];
        if (lr && num(tomb[id]) > num(lr._u)) {
          var i = local.indexOf(lr);
          if (i > -1) { local.splice(i, 1); stats.deleted++; }
        }
        S.tombstones[name] = S.tombstones[name] || {};
        if (!S.tombstones[name][id] || num(tomb[id]) > num(S.tombstones[name][id])) S.tombstones[name][id] = tomb[id];
      });
    });

    Object.keys(pkt.counters || {}).forEach(function (k) {
      S.counters[k] = Math.max(num(S.counters[k]), num(pkt.counters[k]));
    });

    if (pkt.meta && num(pkt.meta.metaUpdatedAt) > num(S.meta.updatedAt)) {
      S.meta.org = pkt.meta.org || S.meta.org;
      S.meta.settings = Object.assign({}, S.meta.settings || {}, pkt.meta.settings || {});
      S.meta.updatedAt = pkt.meta.metaUpdatedAt;
    }

    S.meta.lastSyncAt = Date.now();
    S.meta.lastSyncWith = pkt.deviceName || pkt.deviceId || 'another device';
    save(true);
    return stats;
  },

  recordCount: function () {
    var n = 0;
    SYNC_COLLECTIONS.forEach(function (k) { n += (S[k] || []).length; });
    return n;
  },

  tombstoneCount: function () {
    var n = 0, t = S.tombstones || {};
    Object.keys(t).forEach(function (k) { n += Object.keys(t[k] || {}).length; });
    return n;
  }
};

/* ---------------- backup engine ---------------- */
var Backup = {
  busy: false,
  config: function () {
    var st = settings();
    if (st.autoBackup === undefined) st.autoBackup = true;
    if (!st.backupEveryHours) st.backupEveryHours = 24;
    if (!st.backupKeep) st.backupKeep = 10;
    return st;
  },
  lastAt: function () { return num(S.meta.lastBackupAt || 0); },
  lastLabel: function () {
    var t = Backup.lastAt();
    if (!t) return 'never';
    var mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + ' hour(s) ago';
    return Math.round(hrs / 24) + ' day(s) ago';
  },
  maybe: function () {
    if (Backup.busy) return;
    var st = Backup.config();
    if (st.autoBackup === false) return;
    var everyMs = num(st.backupEveryHours) * 3600000;
    if (Date.now() - Backup.lastAt() < everyMs) return;
    Backup.create(true);
  },
  create: function (silent) {
    if (Backup.busy) return null;
    Backup.busy = true;
    var st = Backup.config();
    var json = JSON.stringify(S);
    var d = new Date();
    var name = 'backup-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '-' +
      String(d.getMilliseconds()).padStart(3, '0') + '.json';
    var ok = false;
    try {
      if (window.AppBridge && window.AppBridge.saveBackup) {
        ok = !!window.AppBridge.saveBackup(json, name, num(st.backupKeep));
      } else {
        var idx = JSON.parse(localStorage.getItem('terp_backups') || '[]');
        localStorage.setItem('terp_backup_' + name, json);
        idx.push({ name: name, at: Date.now(), size: json.length });
        while (idx.length > num(st.backupKeep)) {
          var old = idx.shift();
          localStorage.removeItem('terp_backup_' + old.name);
        }
        localStorage.setItem('terp_backups', JSON.stringify(idx));
        ok = true;
      }
    } catch (e) { ok = false; }
    Backup.busy = false;
    if (ok) {
      S.meta.lastBackupAt = Date.now();
      S.meta.lastBackupName = name;
      try { STORE.set(JSON.stringify(S)); } catch (e) {}
      if (!silent) toast('Backup saved · also copied to ' + Backup.folderLabel());
    } else if (!silent) {
      toast('Backup failed — check storage', 'err');
    }
    return ok ? name : null;
  },
  folder: function () {
    try {
      if (window.AppBridge && window.AppBridge.backupLocation) {
        return JSON.parse(window.AppBridge.backupLocation() || '{}');
      }
    } catch (e) {}
    return {};
  },
  folderLabel: function () {
    var f = Backup.folder();
    return f.public || 'Documents/Tractor ERP';
  },
  copyToDocuments: function (name) {
    if (!(window.AppBridge && window.AppBridge.copyBackupToDocuments)) { toast('Available in the Android app', 'err'); return; }
    var ok = window.AppBridge.copyBackupToDocuments(name);
    toast(ok ? 'Copied to ' + Backup.folderLabel() : 'Could not copy that backup', ok ? '' : 'err');
  },
  list: function () {
    try {
      if (window.AppBridge && window.AppBridge.listBackups) {
        return JSON.parse(window.AppBridge.listBackups() || '[]');
      }
      return JSON.parse(localStorage.getItem('terp_backups') || '[]');
    } catch (e) { return []; }
  },
  read: function (name) {
    try {
      if (window.AppBridge && window.AppBridge.readBackup) return window.AppBridge.readBackup(name);
      return localStorage.getItem('terp_backup_' + name);
    } catch (e) { return null; }
  },
  restore: function (name) {
    var raw = Backup.read(name);
    if (!raw) { toast('Backup could not be read', 'err'); return; }
    confirmDlg('Restore ' + name + '? Everything currently on this device is replaced.', function () {
      try {
        var obj = JSON.parse(raw);
        if (!obj.meta || !obj.users) throw new Error('bad file');
        S = obj; save(true);
        toast('Backup restored');
        Router.go('dashboard');
      } catch (e) { toast('That backup file is damaged', 'err'); }
    }, 'Restore');
  }
};

/* ---------------- sync screen ---------------- */
screen('sync', {
  title: 'Sync & Backup',
  render: function (view, params) {
    var tab = params.tab || 'status';
    var st = Backup.config();
    var backups = Backup.list();
    var h = pageHead('Sync & Backup', [], 'Keep two phones and one head office in step');
    h += '<div class="tabs">' + [['status', 'Status'], ['server', 'Server'], ['wifi', 'Wi-Fi'], ['cloud', 'Cloud'], ['file', 'File'], ['backup', 'Backup']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    if (tab === 'status') {
      h += '<div class="stats">' +
        statCard('Records', String(Sync.recordCount()), 'across all modules', 'blue') +
        statCard('This device', deviceId(), 'device id') +
        statCard('Last sync', S.meta.lastSyncAt ? Backup.ago(S.meta.lastSyncAt) : 'never', S.meta.lastSyncWith || '—', 'green') +
        statCard('Last backup', Backup.lastLabel(), (S.meta.lastBackupName || 'no backup yet'), 'amber') +
        '</div>';
      h += '<div class="card"><h3>How sync works</h3><div class="tiny muted">' +
        'Every record carries the time it was last changed and the device that changed it. When two devices meet, ' +
        'the newer version of each record wins, and deletions are carried as tombstones so a record deleted on one phone ' +
        'does not come back from the other. Counters (invoice numbers) take the higher value on both sides, so numbers never clash.' +
        '</div><div class="note">Sync is manual and offline by design — nothing leaves your phones unless you start a Wi-Fi session or share a sync file.</div></div>';
      h += '<div class="card"><h3>Pending deletions</h3><div class="kv"><span>Tombstones carried</span><span>' +
        Sync.tombstoneCount() + '</span></div>' +
        '<div class="tiny muted">These are kept so a delete on one device propagates on the next sync.</div></div>';
    }

    if (tab === 'wifi') {
      var ip = (window.AppBridge && window.AppBridge.syncIp) ? window.AppBridge.syncIp() : '';
      h += '<div class="card"><h3>Host on this phone</h3>' +
        '<div class="tiny muted">Both phones must be on the same Wi-Fi. Start the host here, then join from the other phone using the address shown.</div>' +
        '<div id="hostBox" style="margin-top:10px">' +
        (ip ? '<div class="note"><b>Sharing at</b> <span class="mono">http://' + esc(ip) + ':8089</span></div>' +
          '<button class="btn danger block" id="stopHost" style="margin-top:10px">Stop sharing</button>'
          : '<button class="btn primary block" id="startHost">Start sharing</button>') +
        '</div>' +
        '<div id="hostLog" class="tiny muted" style="margin-top:8px"></div></div>';

      h += '<div class="card"><h3>Auto sync</h3>' +
        '<div class="tiny muted">Keeps this device and the host in step every few seconds while both are on the same Wi-Fi. ' +
        'The phone must be hosting; this side polls it, merges what changed and sends back its own changes.</div>' +
        '<label class="fld" style="margin-top:10px"><span>Host address</span><input id="autoHost" placeholder="192.168.1.5" value="' +
        esc(Sync.auto.host || settings().syncHost || params.peer || '') + '"></label>' +
        '<label class="fld" style="margin-top:8px"><span>Check every</span><select id="autoSecs">' +
        [[2, '2 seconds'], [5, '5 seconds'], [10, '10 seconds'], [30, '30 seconds'], [60, '1 minute']].map(function (o) {
          return '<option value="' + o[0] + '"' + (num(Sync.auto.secs || settings().syncSecs) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></label>' +
        '<div id="autoStatus" class="tiny" style="margin:10px 0">' +
        (Sync.autoRunning() ? '<b class="green">Running</b> · ' + esc(Sync.auto.host) : 'Not running') + '</div>' +
        '<button class="btn ' + (Sync.autoRunning() ? 'danger' : 'primary') + ' block" id="btnAuto">' +
        (Sync.autoRunning() ? 'Stop auto sync' : 'Start auto sync') + '</button></div>';

      h += '<div class="card"><h3>One-time transfer</h3>' +
        '<label class="fld"><span>Host address</span><input id="peerIp" placeholder="192.168.1.5" value="' + esc(params.peer || '') + '"></label>' +
        '<button class="btn primary block" id="btnPull" style="margin-top:10px">Pull data from that phone</button>' +
        '<button class="btn block" id="btnPush" style="margin-top:8px">Send my data to that phone</button>' +
        '<div id="joinLog" class="tiny muted" style="margin-top:8px"></div></div>';
    }

    if (tab === 'server') {
      var signedIn = Srv.configured();
      var su = settings().serverUser;
      h += '<div class="card"><h3>Company server</h3>' +
        '<div class="tiny muted">Sign in to your own server and every device shares one set of books. ' +
        'Each person gets their own login and only sees the modules you allow.</div>';

      if (!signedIn) {
        h += '<label class="fld" style="margin-top:10px"><span>Server address</span>' +
          '<input id="srvUrl" placeholder="http://192.168.1.5:8080" value="' + esc(settings().serverUrl || '') + '"></label>' +
          '<label class="fld" style="margin-top:8px"><span>Username</span><input id="srvUser" autocomplete="username"></label>' +
          '<label class="fld" style="margin-top:8px"><span>Password</span><input id="srvPass" type="password" autocomplete="current-password"></label>' +
          '<button class="btn primary block" id="btnSrvLogin" style="margin-top:10px">Sign in</button>' +
          '<div id="srvStatus" class="tiny" style="margin-top:8px">' + esc(Srv.lastMsg || '') + '</div>';
      } else {
        h += '<div class="kv" style="margin-top:10px"><span>Server</span><span class="mono tiny" style="text-align:right;word-break:break-all">' +
          esc(Srv.url()) + '</span></div>' +
          '<div class="kv"><span>Signed in as</span><span>' + esc((su && su.name) || '') +
          ' <span class="tiny muted">(' + esc((su && su.role) || '') + ')</span></span></div>' +
          '<div class="kv"><span>This device</span><span class="mono tiny">' + esc(deviceId()) + '</span></div>' +
          '<div id="srvStatus" class="tiny" style="margin:10px 0">' +
          (Srv.running() ? '<b class="green">' + esc(Srv.lastMsg || 'Connected') + '</b>' : 'Not running') + '</div>' +
          '<label class="fld"><span>Sync every</span><select id="srvSecs">' +
          [[5, '5 seconds'], [10, '10 seconds'], [30, '30 seconds'], [60, '1 minute']].map(function (o) {
            return '<option value="' + o[0] + '"' + (num(Srv.secs || settings().serverSecs) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></label>' +
          '<button class="btn ' + (Srv.running() ? 'danger' : 'primary') + ' block" id="btnSrvToggle" style="margin-top:8px">' +
          (Srv.running() ? 'Pause sync' : 'Resume sync') + '</button>' +
          '<button class="btn ghost block" id="btnSrvLogout" style="margin-top:8px">Sign out of server</button>';
      }
      h += '</div>';

      if (signedIn) {
        h += '<div class="card"><h3>Team on the server</h3><div id="srvUsers" class="tiny muted">Loading…</div>' +
          '<button class="btn block" id="btnSrvAddUser" style="margin-top:10px">Add / update a user</button></div>' +
          '<div class="card"><h3>Change my password</h3>' +
          '<label class="fld"><span>Current password</span><input id="pwOld" type="password"></label>' +
          '<label class="fld" style="margin-top:8px"><span>New password</span><input id="pwNew" type="password"></label>' +
          '<button class="btn block" id="btnPw" style="margin-top:10px">Change password</button></div>';
      }
    }

    if (tab === 'cloud') {
      var folder = Cloud.name();
      h += '<div class="card"><h3>Sync through a cloud folder</h3>' +
        '<div class="tiny muted">Works over the internet with no server and no login. Point both devices at the same folder — ' +
        'on a PC that is your Google Drive / OneDrive / Dropbox folder, on the phone it is a folder kept in step by a folder-sync app. ' +
        'Each device writes one small file and reads the others.</div>' +
        '<div class="kv" style="margin-top:10px"><span>Folder</span><span class="mono tiny" style="text-align:right;word-break:break-all">' +
        (folder ? esc(folder) : '<span class="muted">not connected</span>') + '</span></div>' +
        '<div class="kv"><span>This device</span><span class="mono tiny">' + esc(Cloud.myFile()) + '</span></div>' +
        '<div class="kv"><span>Folder access</span><span class="tiny">' + esc(Cloud.backendLabel()) + '</span></div>' +
        '<div id="cloudStatus" class="tiny" style="margin:10px 0">' +
        (Cloud.running() ? '<b class="green">' + esc(Cloud.lastMsg || 'Running') + '</b>' : 'Not running') + '</div>' +
        '<button class="btn block" id="btnPickFolder">' + (folder ? 'Change folder' : 'Choose folder') + '</button>' +
        '<label class="fld" style="margin-top:10px"><span>Check every</span><select id="cloudSecs">' +
        [[15, '15 seconds'], [30, '30 seconds'], [60, '1 minute'], [300, '5 minutes'], [900, '15 minutes']].map(function (o) {
          return '<option value="' + o[0] + '"' + (num(Cloud.secs || settings().cloudSecs) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></label>' +
        '<button class="btn ' + (Cloud.running() ? 'danger' : 'primary') + ' block" id="btnCloud" style="margin-top:8px">' +
        (Cloud.running() ? 'Stop cloud sync' : 'Start cloud sync') + '</button></div>';

      h += '<div class="card"><h3>Setting it up</h3><div class="tiny muted">' +
        '<b>On the PC:</b> install Google Drive / OneDrive / Dropbox, then choose its folder here. ' +
        'The browser asks once for permission and remembers it.<br><br>' +
        '<b>On the phone:</b> choose the same folder through the file picker. Android cloud apps do not keep folders in step on their own, ' +
        'so install a folder-sync app (FolderSync, Autosync, Dropbox with folder sync) and point it at that same folder, every 1-5 minutes.<br><br>' +
        'Each device keeps one file - <span class="mono">terp-device.json</span> - and merges the others. ' +
        'Changes flow both ways and never overwrite each other; the newer version of a record wins.</div></div>';
    }

    if (tab === 'file') {
      h += '<div class="card"><h3>Share a sync file</h3>' +
        '<div class="tiny muted">Exports a single file containing every record. Send it on WhatsApp, Drive or USB; open it on the other phone with "Import" below.</div>' +
        '<button class="btn primary block" id="btnExportSync" style="margin-top:10px">Create sync file</button></div>';
      h += '<div class="card"><h3>Import a sync file</h3>' +
        '<div class="tiny muted">Records are merged, not replaced — newer versions win and nothing is duplicated.</div>' +
        '<button class="btn block" id="btnImportSync" style="margin-top:10px">Choose sync file</button></div>';
      h += '<div class="card"><h3>Restore a full backup instead</h3><div class="tiny muted">A backup replaces everything on this device. Use it only to recover, not to sync.</div>' +
        '<button class="btn block" id="goBackup" style="margin-top:10px">Open backups</button></div>';
    }

    if (tab === 'backup') {
      h += '<div class="card"><h3>Automatic backup</h3>' +
        '<label class="fld"><span>Run automatic backups</span><div class="switchrow"><input type="checkbox" id="autoOn"' + (st.autoBackup !== false ? ' checked' : '') + '><span>' + (st.autoBackup !== false ? 'On' : 'Off') + '</span></div></label>' +
        '<div class="formgrid" style="margin-top:10px">' +
        '<label class="fld"><span>Frequency</span><select id="everySel">' +
        [[1, 'Every hour'], [6, 'Every 6 hours'], [24, 'Daily'], [72, 'Every 3 days'], [168, 'Weekly']].map(function (o) {
          return '<option value="' + o[0] + '"' + (num(st.backupEveryHours) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></label>' +
        '<label class="fld"><span>Keep</span><select id="keepSel">' +
        [5, 10, 15, 20, 30].map(function (n) {
          return '<option value="' + n + '"' + (num(st.backupKeep) === n ? ' selected' : '') + '>' + n + ' copies</option>';
        }).join('') + '</select></label></div>' +
        '<div class="note">Backups are written inside the app\'s own storage, so they survive app updates and stay private. The newest ' + num(st.backupKeep) + ' are kept.</div>' +
        '<button class="btn primary block" id="btnBackupNow" style="margin-top:10px">Back up now</button>' +
        '<div class="kv" style="margin-top:10px"><span>Last backup</span><span>' + Backup.lastLabel() + '</span></div></div>';

      var loc = Backup.folder();
      h += '<div class="card"><h3>Where backups are kept</h3>' +
        '<div class="kv"><span>App storage<div class="tiny muted">used by Restore on this screen</div></span>' +
        '<span class="mono tiny" style="text-align:right;word-break:break-all">' + esc(loc.private || 'app private storage / backups') + '</span></div>' +
        '<div class="kv"><span>Documents copy<div class="tiny muted">visible in any file manager</div></span>' +
        '<span class="mono tiny" style="text-align:right;word-break:break-all">' + esc(loc.public || 'Documents/Tractor ERP') + '</span></div>' +
        '<div class="note">Every backup is written twice — once inside the app, and once to the Documents folder under <b>' +
        esc(org().name || 'Tractor ERP') + '</b>. The Documents copy is what you copy to a pen drive or send on WhatsApp; it survives uninstalling the app.</div>' +
        '<button class="btn block" id="btnCopyAll" style="margin-top:10px">Copy latest backup to Documents</button></div>';

      h += '<div class="card tight"><h3 style="padding:12px 14px 0">Available backups</h3>';
      if (!backups.length) h += '<div class="empty small">No backups yet. One will be created automatically, or tap "Back up now".</div>';
      else h += backups.slice().reverse().map(function (b) {
        var id = 'bk' + b.name.replace(/[^a-z0-9]/gi, '');
        setTimeout(function () {
          var e = document.getElementById(id);
          if (e) e.onclick = function () { Backup.restore(b.name); };
        }, 0);
        var cid = id + 'c';
        setTimeout(function () {
          var c = document.getElementById(cid);
          if (c) c.onclick = function (ev) { ev.stopPropagation(); Backup.copyToDocuments(b.name); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(b.name) + '</div>' +
          '<div class="rc-sub">' + (b.at ? Backup.ago(b.at) : '') + ' · ' + (b.size ? (b.size / 1024).toFixed(0) + ' KB' : '') + '</div></div>' +
          '<div class="rc-right"><button class="btn sm" id="' + cid + '">Copy</button><small>tap row to restore</small></div></div>';
      }).join('');
      h += '</div>';
    }

    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('sync', { tab: b.getAttribute('data-tab') }); }; });

    /* ---- status tab ---- */

    /* ---- wifi tab ---- */
    var startBtn = document.getElementById('startHost');
    if (startBtn) startBtn.onclick = function () {
      if (!(window.AppBridge && window.AppBridge.startSync)) { toast('Wi-Fi sync needs the Android app', 'err'); return; }
      window.AppBridge.setSyncPacket(JSON.stringify(Sync.packet()));
      var res = window.AppBridge.startSync(8089);
      var box = document.getElementById('hostBox');
      try {
        var obj = JSON.parse(res);
        if (obj.error) { toast(obj.error, 'err'); return; }
        box.innerHTML = '<div class="note"><b>Sharing at</b> <span class="mono">http://' + esc(obj.ip) + ':8089</span></div>' +
          '<button class="btn danger block" id="stopHost" style="margin-top:10px">Stop sharing</button>';
        document.getElementById('stopHost').onclick = function () {
          window.AppBridge.stopSync(); toast('Sharing stopped'); Router.render();
        };
        Sync.watchIncoming();
      } catch (e) { toast('Could not start sharing', 'err'); }
    };
    var stopBtn = document.getElementById('stopHost');
    if (stopBtn) stopBtn.onclick = function () {
      if (window.AppBridge && window.AppBridge.stopSync) window.AppBridge.stopSync();
      toast('Sharing stopped'); Router.render();
    };

    var srvLogin = document.getElementById('btnSrvLogin');
    if (srvLogin) srvLogin.onclick = function () {
      var u = (document.getElementById('srvUrl').value || '').trim();
      var un = (document.getElementById('srvUser').value || '').trim();
      var pw = document.getElementById('srvPass').value;
      if (!u || !un || !pw) { toast('Fill the server, username and password', 'err'); return; }
      srvLogin.textContent = 'Signing in…';
      Srv.login(u, un, pw).then(function (user) {
        toast('Signed in as ' + user.name);
        Router.go('dashboard');
      }).catch(function (e) {
        srvLogin.textContent = 'Sign in';
        var el = document.getElementById('srvStatus');
        if (el) el.innerHTML = '<b class="red">' + esc(e.message) + '</b>';
      });
    };

    var srvToggle = document.getElementById('btnSrvToggle');
    if (srvToggle) srvToggle.onclick = function () {
      if (Srv.running()) { Srv.stop(); settings().serverAuto = false; S.meta.updatedAt = Date.now(); save(true); toast('Sync paused'); }
      else { settings().serverAuto = true; Srv.start(num(document.getElementById('srvSecs').value) || 10); toast('Sync resumed'); }
      Router.render();
    };

    var srvLogout = document.getElementById('btnSrvLogout');
    if (srvLogout) srvLogout.onclick = function () {
      confirmDlg('Sign out of the server? This device keeps its copy of the books.', function () { Srv.logout(); }, 'Sign out');
    };

    var srvAddUser = document.getElementById('btnSrvAddUser');
    if (srvAddUser) srvAddUser.onclick = function () {
      editEntity({
        title: 'Server user', wide: true,
        defaults: { role: 'staff', active: true },
        fields: [
          { k: 'name', label: 'Full name', required: true, span: 2 },
          { k: 'username', label: 'Username', required: true },
          { k: 'password', label: 'Password', help: 'Leave blank to keep the current one' },
          { k: 'role', label: 'Role', type: 'select', options: [['admin', 'Admin'], ['manager', 'Manager'], ['staff', 'Staff']], def: 'staff' },
          { k: 'active', label: 'Active', type: 'checkbox', def: true }
        ],
        onSave: function (v, old) {
          Srv.saveUser(v).then(function () { toast('User saved'); Router.render(); })
            .catch(function (e) { toast(e.message, 'err'); });
        }
      });
    };

    var pwBtn = document.getElementById('btnPw');
    if (pwBtn) pwBtn.onclick = function () {
      Srv.changePassword(document.getElementById('pwOld').value, document.getElementById('pwNew').value)
        .then(function () { toast('Password changed'); Router.go('sync', { tab: 'server' }); })
        .catch(function (e) { toast(e.message, 'err'); });
    };

    if (tab === 'server' && Srv.configured()) {
      var box = document.getElementById('srvUsers');
      Srv.listUsers().then(function (r) {
        if (!box) return;
        box.innerHTML = (r.users || []).map(function (u) {
          return '<div class="kv"><span>' + esc(u.name) + ' <span class="tiny muted">@' + esc(u.username) + '</span></span>' +
            '<span class="tiny">' + esc(u.role) + (u.active === false ? ' · inactive' : '') + '</span></div>';
        }).join('') || 'No users yet';
      }).catch(function (e) {
        if (box) box.innerHTML = '<span class="red">' + esc(e.message) + '</span>';
      });
    }

    var pickFolder = document.getElementById('btnPickFolder');
    if (pickFolder) pickFolder.onclick = function () { Cloud.pick(); };

    var cloudBtn = document.getElementById('btnCloud');
    if (cloudBtn) cloudBtn.onclick = function () {
      if (Cloud.running()) {
        Cloud.stop();
        settings().cloudAuto = false;
        S.meta.updatedAt = Date.now();
        save(true);
        toast('Cloud sync stopped');
        Router.render();
        return;
      }
      if (!Cloud.name() && Cloud.backend() !== 'web') { toast('Choose a folder first', 'err'); return; }
      var secsEl = document.getElementById('cloudSecs');
      settings().cloudAuto = true;
      Cloud.start(secsEl ? num(secsEl.value) : 15);
      toast('Cloud sync started');
      Router.render();
    };

    var autoBtn = document.getElementById('btnAuto');
    if (autoBtn) autoBtn.onclick = function () {
      if (Sync.autoRunning()) {
        Sync.autoStop();
        settings().syncAuto = false;
        S.meta.updatedAt = Date.now();
        save(true);
        toast('Auto sync stopped');
        Router.render();
        return;
      }
      var hostEl = document.getElementById('autoHost');
      var secsEl = document.getElementById('autoSecs');
      var host = (hostEl && hostEl.value || '').trim();
      if (!host) { toast('Enter the host address', 'err'); return; }
      settings().syncAuto = true;
      Sync.autoStart(host, secsEl ? num(secsEl.value) : 5);
      toast('Auto sync started');
      Router.render();
    };

    var pull = document.getElementById('btnPull');
    if (pull) pull.onclick = function () {
      var ipv = (document.getElementById('peerIp').value || '').trim();
      if (!ipv) { toast('Enter the host address', 'err'); return; }
      var log = document.getElementById('joinLog');
      log.textContent = 'Connecting to ' + ipv + '…';
      fetch('http://' + ipv + ':8089/packet', { method: 'GET' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (pkt) {
          var stats = Sync.merge(pkt);
          log.innerHTML = '<b class="green">Merged ' + pkt.deviceName + '</b> — ' + stats.added + ' added, ' +
            stats.updated + ' updated, ' + stats.deleted + ' deleted';
          toast('Sync complete');
        })
        .catch(function (e) {
          log.innerHTML = '<b class="red">Could not reach that phone</b> — ' + esc(e.message) +
            '. Check both phones are on the same Wi-Fi and sharing is started there.';
        });
    };

    var push = document.getElementById('btnPush');
    if (push) push.onclick = function () {
      var ipv = (document.getElementById('peerIp').value || '').trim();
      if (!ipv) { toast('Enter the host address', 'err'); return; }
      var log = document.getElementById('joinLog');
      log.textContent = 'Sending to ' + ipv + '…';
      fetch('http://' + ipv + ':8089/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Sync.packet())
      }).then(function (r) { return r.json(); })
        .then(function () { log.innerHTML = '<b class="green">Sent.</b> The other phone will merge it the next time it checks.'; })
        .catch(function (e) { log.innerHTML = '<b class="red">Send failed</b> — ' + esc(e.message); });
    };

    /* ---- file tab ---- */
    var ex = document.getElementById('btnExportSync');
    if (ex) ex.onclick = function () {
      var json = JSON.stringify(Sync.packet());
      var name = 'tractor-erp-sync-' + today() + '.terp.json';
      if (window.AppBridge && window.AppBridge.saveFile) window.AppBridge.saveFile(name, json);
      else Export.deliver(name, json, 'application/json');
      toast('Sync file created');
    };
    var im = document.getElementById('btnImportSync');
    if (im) im.onclick = function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try {
            var pkt = JSON.parse(rd.result);
            var stats = Sync.merge(pkt);
            toast('Merged: ' + stats.added + ' added, ' + stats.updated + ' updated');
            Router.render();
          } catch (e) { toast('That is not a valid sync file', 'err'); }
        };
        rd.readAsText(f);
      };
      inp.click();
    };
    var gb = document.getElementById('goBackup');
    if (gb) gb.onclick = function () { Router.go('sync', { tab: 'backup' }); };

    /* ---- backup tab ---- */
    var auto = document.getElementById('autoOn');
    if (auto) auto.onchange = function () {
      settings().autoBackup = auto.checked;
      S.meta.updatedAt = Date.now();
      save(true);
      Router.render();
    };
    var ev2 = document.getElementById('everySel');
    if (ev2) ev2.onchange = function () { settings().backupEveryHours = num(ev2.value); S.meta.updatedAt = Date.now(); save(true); Router.render(); };
    var kp = document.getElementById('keepSel');
    if (kp) kp.onchange = function () { settings().backupKeep = num(kp.value); S.meta.updatedAt = Date.now(); save(true); Router.render(); };
    var bn = document.getElementById('btnBackupNow');
    if (bn) bn.onclick = function () { Backup.create(false); Router.render(); };
    var ca = document.getElementById('btnCopyAll');
    if (ca) ca.onclick = function () {
      var list2 = Backup.list();
      if (!list2.length) { toast('No backup to copy yet', 'err'); return; }
      Backup.copyToDocuments(list2[0].name);
    };
  }
});

/* ---------------- automatic sync (polling) ---------------- */
Sync.auto = { host: '', secs: 5, timer: null, last: '', busy: false };

Sync.autoStart = function (host, secs) {
  Sync.autoStop();
  Sync.auto.host = String(host || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  Sync.auto.secs = Math.max(1, num(secs) || 5);
  settings().syncHost = Sync.auto.host;
  settings().syncSecs = Sync.auto.secs;
  S.meta.updatedAt = Date.now();
  save(true);
  Sync.auto.timer = setInterval(Sync.autoTick, Sync.auto.secs * 1000);
  Sync.autoTick();
};

Sync.autoStop = function () {
  if (Sync.auto.timer) clearInterval(Sync.auto.timer);
  Sync.auto.timer = null;
};

Sync.autoRunning = function () { return !!Sync.auto.timer; };

Sync.autoTick = function () {
  if (!Sync.auto.host || Sync.auto.busy) return;
  Sync.auto.busy = true;
  var base = 'http://' + Sync.auto.host + ':8089';
  fetch(base + '/packet', { method: 'GET', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (pkt) {
      var rev = Sync.rev();
      var changed = false;
      if (pkt && pkt.app === 'tractor-erp') {
        var stats = Sync.merge(pkt);
        changed = (stats.added + stats.updated + stats.deleted) > 0;
      }
      // send anything the other side has not seen yet
      return fetch(base + '/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Sync.packet())
      }).then(function () {
        if (changed) {
          Sync.lastStats = true;
          if (Router.current === 'sync') Router.render();
        }
        Sync.auto.last = today() + ' ' + new Date().toTimeString().slice(0, 8);
        var el = document.getElementById('autoStatus');
        if (el) {
          el.innerHTML = '<b class="green">Connected</b> · last sync ' + Sync.auto.last +
            (changed ? ' · received changes' : ' · up to date');
        }
      });
    })
    .catch(function (e) {
      var el = document.getElementById('autoStatus');
      if (el) el.innerHTML = '<b class="red">Not reachable</b> — ' + esc(e.message) +
        '. Check the phone is hosting and both are on the same Wi-Fi.';
    })
    .then(function () { Sync.auto.busy = false; });
};

/* keep the packet the phone serves fresh while it is hosting */
Sync._outboxAt = 0;
Sync.refreshOutbox = function (force) {
  try {
    if (!(window.AppBridge && window.AppBridge.setSyncPacket)) return;
    var now = Date.now();
    if (!force && now - Sync._outboxAt < 2000) return;
    Sync._outboxAt = now;
    window.AppBridge.setSyncPacket(JSON.stringify(Sync.packet()));
  } catch (e) {}
};

/* restart auto-sync after the app is reopened */
Sync.resumeAuto = function () {
  var st = settings();
  if (st.syncHost && st.syncAuto !== false) {
    Sync.autoStart(st.syncHost, st.syncSecs || 5);
  }
};

/* poll the native inbox while hosting */
Sync.watchIncoming = function () {
  if (Sync._timer) clearInterval(Sync._timer);
  var log = document.getElementById('hostLog');
  Sync._timer = setInterval(function () {
    if (!(window.AppBridge && window.AppBridge.getIncoming)) return;
    var raw = window.AppBridge.getIncoming();
    if (!raw) return;
    try {
      var pkt = JSON.parse(raw);
      var stats = Sync.merge(pkt);
      if (log) log.innerHTML = '<b class="green">Received ' + esc(pkt.deviceName || 'device') + '</b> — ' +
        stats.added + ' added, ' + stats.updated + ' updated';
      Sync.refreshOutbox(true);
      toast('Received data from ' + (pkt.deviceName || 'another phone'));
      if (Router.current === 'sync') Router.render();
    } catch (e) { /* ignore malformed */ }
  }, 2500);
};

/* human "x ago" */
Backup.ago = function (ts) {
  var mins = Math.round((Date.now() - num(ts)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  var hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + ' hr ago';
  return Math.round(hrs / 24) + ' days ago';
};
