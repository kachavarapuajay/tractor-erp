/* ============================================================
   auth.js — first-run setup wizard, login, my account
   ============================================================ */

function hashPw(s) {
  var h = 5381, i;
  var str = 'terp$' + String(s);
  for (i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return 'h' + h.toString(16) + String(s).length;
}

/* ---------------- setup wizard ---------------- */
var setupDraft = { step: 1, org: {}, branch: {}, depts: [], admin: {} };

screen('setup', {
  title: 'Organisation Setup',
  render: function (view) {
    var d = setupDraft;
    if (!d.depts.length) {
      d.depts = ['Sales', 'Service', 'Accounts', 'Spares', 'Administration'].map(function (n) {
        return { id: uid('dep'), name: n, head: '' };
      });
    }
    function steps() {
      var h = '<div class="steps">';
      for (var i = 1; i <= 3; i++) h += '<div class="step ' + (d.step >= i ? 'on' : '') + '"></div>';
      return h + '</div>';
    }
    var body = '';
    if (d.step === 1) {
      body = '<h1>Set up your dealership</h1><p class="sub">Step 1 of 3 · Organisation &amp; head office</p>' + steps() +
        formHtml([
          { k: 'name', label: 'Business / Firm name', required: true, span: 2, placeholder: 'e.g. Sri Balaji Tractors' },
          { k: 'legalName', label: 'Legal name (for GST)', span: 2 },
          { k: 'gstin', label: 'GSTIN', placeholder: '36ABCDE1234F1Z5' },
          { k: 'pan', label: 'PAN' },
          { k: 'stateCode', label: 'State', type: 'select', required: true, options: function () { return STATES; }, def: '36' },
          { k: 'phone', label: 'Phone', type: 'tel' },
          { k: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
          { k: 'email', label: 'Email', type: 'email' },
          { k: 'fyStart', label: 'FY start', type: 'date', def: today().slice(0, 4) + '-04-01' }
        ], d.org) +
        '<div class="section-label">Head office branch</div>' +
        formHtml([
          { k: 'bname', label: 'Branch name', required: true, def: 'Head Office' },
          { k: 'bcode', label: 'Branch code', def: 'HO' },
          { k: 'bgstin', label: 'Branch GSTIN' },
          { k: 'bphone', label: 'Branch phone', type: 'tel' }
        ], d.branch);
    } else if (d.step === 2) {
      body = '<h1>Departments</h1><p class="sub">Step 2 of 3 · Who does what</p>' + steps() +
        '<div class="note">These can be edited later. Department heads are optional.</div>' +
        '<div id="deptList">' + d.depts.map(function (dp, i) {
          return '<div class="formgrid" style="margin-top:10px">' +
            fieldHtml({ k: 'dn' + i, label: 'Department ' + (i + 1), required: true }, dp.name) +
            fieldHtml({ k: 'dh' + i, label: 'Head / In-charge' }, dp.head) + '</div>';
        }).join('') + '</div>' +
        '<button class="addline" id="addDept">+ Add department</button>';
    } else {
      body = '<h1>Your admin account</h1><p class="sub">Step 3 of 3 · Owner / administrator login</p>' + steps() +
        formHtml([
          { k: 'name', label: 'Your name', required: true, span: 2 },
          { k: 'username', label: 'Username', required: true, placeholder: 'admin' },
          { k: 'phone', label: 'Mobile', type: 'tel' },
          { k: 'password', label: 'Password', type: 'password', required: true, help: 'Minimum 4 characters' },
          { k: 'password2', label: 'Confirm password', type: 'password', required: true }
        ], d.admin) +
        '<div class="note">This account gets full access to every module. You can create restricted logins for your team afterwards under <b>Users &amp; Permissions</b>.</div>';
    }
    view.innerHTML = '<div class="authwrap"><div class="authcard">' +
      '<div class="authlogo">' + icon('tractor') + '</div>' + body +
      '<div class="flex" style="margin-top:16px">' +
      (d.step > 1 ? '<button class="btn ghost" id="bPrev">Back</button>' : '') +
      '<button class="btn primary" id="bNext" style="flex:1;justify-content:center">' +
      (d.step === 3 ? 'Create organisation' : 'Continue') + '</button></div>' +
      '</div></div>';

    var prev = document.getElementById('bPrev');
    if (prev) prev.onclick = function () {
      if (d.step === 1) return;
      d.step--; Router.render();
    };
    var add = document.getElementById('addDept');
    if (add) add.onclick = function () {
      d.depts.push({ id: uid('dep'), name: '', head: '' });
      Router.render();
    };
    document.getElementById('bNext').onclick = function () {
      var root = document.querySelector('.authcard');
      if (d.step === 1) {
        var f1 = [
          { k: 'name', required: true }, { k: 'legalName' }, { k: 'gstin' }, { k: 'pan' },
          { k: 'stateCode', required: true }, { k: 'phone' }, { k: 'address' }, { k: 'email' }, { k: 'fyStart' },
          { k: 'bname', required: true }, { k: 'bcode' }, { k: 'bgstin' }, { k: 'bphone' }
        ];
        var v = readForm(root, f1);
        if (!v.name || !v.stateCode || !v.bname) { toast('Business name, state and branch name are required', 'err'); return; }
        d.org = v; d.branch = v; d.step = 2; Router.render();
      } else if (d.step === 2) {
        d.depts.forEach(function (dp, i) {
          var a = root.querySelector('[name="dn' + i + '"]');
          var b = root.querySelector('[name="dh' + i + '"]');
          dp.name = a ? a.value.trim() : dp.name;
          dp.head = b ? b.value.trim() : '';
        });
        d.depts = d.depts.filter(function (x) { return x.name; });
        d.step = 3; Router.render();
      } else {
        var v3 = readForm(root, [
          { k: 'name' }, { k: 'username' }, { k: 'phone' }, { k: 'password' }, { k: 'password2' }
        ]);
        if (!v3.name || !v3.username) { toast('Name and username are required', 'err'); return; }
        if ((v3.password || '').length < 4) { toast('Password must be at least 4 characters', 'err'); return; }
        if (v3.password !== v3.password2) { toast('Passwords do not match', 'err'); return; }
        finishSetup(v3);
      }
    };
  }
});

function finishSetup(admin) {
  var d = setupDraft;
  S.meta.org = {
    name: d.org.name, legalName: d.org.legalName || d.org.name, gstin: (d.org.gstin || '').toUpperCase(),
    pan: (d.org.pan || '').toUpperCase(), stateCode: d.org.stateCode, phone: d.org.phone,
    email: d.org.email, address: d.org.address, fyStart: d.org.fyStart || today()
  };
  S.meta.setupDone = true;
  var b = {
    id: uid('br'), name: d.branch.bname, code: d.branch.bcode || 'HO',
    gstin: (d.branch.bgstin || d.org.gstin || '').toUpperCase(), stateCode: d.org.stateCode,
    phone: d.branch.bphone || d.org.phone, address: d.org.address, active: true
  };
  S.branches = [b];
  S.departments = d.depts.map(function (x) { return { id: x.id, name: x.name, head: x.head, branchId: b.id }; });
  var u = {
    id: uid('usr'), name: admin.name, username: admin.username.toLowerCase(), phone: admin.phone,
    pass: hashPw(admin.password), role: 'owner', perms: permList().map(function (p) { return p[0]; }),
    branchId: b.id, deptId: (S.departments[0] || {}).id, active: true, createdAt: today()
  };
  S.users = [u];
  S.session.userId = u.id;
  settings();
  save(true);
  Shell.refreshDrawer();
  toast('Organisation created — your books are ready');
  Router.go('dashboard');
}

/* ---------------- login ---------------- */
screen('login', {
  title: 'Sign in',
  render: function (view) {
    view.innerHTML = '<div class="authwrap"><div class="authcard">' +
      '<div class="authlogo">' + icon('tractor') + '</div>' +
      '<h1>' + esc(org().name || 'Tractor ERP') + '</h1>' +
      '<p class="sub">Sign in to continue to your dealership workspace</p>' +
      formHtml([
        { k: 'username', label: 'Username', required: true },
        { k: 'password', label: 'Password', type: 'password', required: true }
      ]) +
      '<button class="btn primary block" id="bLogin" style="margin-top:16px">Sign in</button>' +
      '<div class="authfoot">Tractor ERP · offline business suite</div>' +
      '</div></div>';
    var root = document.querySelector('.authcard');
    function doLogin() {
      var v = readForm(root, [{ k: 'username' }, { k: 'password' }]);
      var u = S.users.find(function (x) {
        return x.username === String(v.username || '').trim().toLowerCase() && x.pass === hashPw(v.password || '') && x.active !== false;
      });
      if (!u) { toast('Invalid username or password', 'err'); return; }
      S.session.userId = u.id; save(true);
      Shell.refreshDrawer();
      Router.go('dashboard');
    }
    document.getElementById('bLogin').onclick = doLogin;
    qsa('.fld input', root).forEach(function (i) {
      i.onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    });
  }
});

/* ---------------- my account ---------------- */
screen('myaccount', {
  title: 'My Account',
  render: function (view) {
    var u = me();
    var deptName = (dept(u.deptId) || {}).name || '—';
    view.innerHTML = '<div class="pagehead"><div><h1>' + esc(u.name || '') + '</h1><div class="sub">' +
      esc(u.username || '') + ' · ' + esc(u.role || '') + ' · ' + esc(deptName) + '</div></div></div>' +
      '<div class="card"><div class="kv"><span>Branch</span><span>' + esc(branchName(u.branchId)) + '</span></div>' +
      '<div class="kv"><span>Mobile</span><span>' + esc(u.phone || '—') + '</span></div>' +
      '<div class="kv"><span>Organisation</span><span>' + esc(org().name || '—') + '</span></div>' +
      '<div class="kv"><span>GSTIN</span><span class="mono">' + esc(org().gstin || '—') + '</span></div>' +
      '<div class="kv"><span>Financial year</span><span>' + fyOf(today()) + '</span></div></div>' +
      '<div class="card"><h3>Permissions</h3><div class="chipset">' +
      (u.role === 'owner' || u.role === 'admin' ? '<span class="chip">Full access</span>' :
        (u.perms || []).map(function (p) {
          var m = permList().find(function (x) { return x[0] === p; });
          return '<span class="chip">' + esc(m ? m[1] : p) + '</span>';
        }).join('')) + '</div></div>' +
      '<div class="card"><h3>Security</h3>' +
      '<button class="btn block" id="bPw">Change password</button>' +
      '<div style="height:8px"></div><button class="btn block" id="bBackup">Backup / Export data</button>' +
      '<div style="height:8px"></div><button class="btn block" id="bRestore">Restore from backup</button></div>' +
      '<div class="card"><h3>Data</h3>' +
      '<div class="kv"><span>Parties</span><span>' + S.parties.length + '</span></div>' +
      '<div class="kv"><span>Items</span><span>' + S.items.length + '</span></div>' +
      '<div class="kv"><span>Tractor units</span><span>' + S.units.length + '</span></div>' +
      '<div class="kv"><span>Invoices</span><span>' + S.invoices.length + '</span></div>' +
      '<div class="kv"><span>Storage used</span><span>' + (JSON.stringify(S).length / 1024).toFixed(0) + ' KB</span></div>' +
      '<div class="kv"><span>Device id</span><span class="mono">' + deviceId() + '</span></div>' +
      '<div class="kv"><span>Last backup</span><span>' + Backup.lastLabel() + '</span></div>' +
      '<div class="kv"><span>Backup folder</span><span class="tiny mono" style="text-align:right;word-break:break-all">' +
      esc(Backup.folderLabel()) + '</span></div>' +
      '<div class="kv"><span>Last sync</span><span>' + (S.meta.lastSyncAt ? Backup.ago(S.meta.lastSyncAt) : 'never') + '</span></div>' +
      '<div style="height:8px"></div><button class="btn primary block" id="bSync">Sync &amp; backup</button>' +
      '<div style="height:8px"></div><button class="btn danger block" id="bReset">Reset all data</button></div>';

    document.getElementById('bPw').onclick = function () {
      Form({
        title: 'Change password',
        fields: [
          { k: 'old', label: 'Current password', type: 'password', required: true },
          { k: 'p1', label: 'New password', type: 'password', required: true },
          { k: 'p2', label: 'Confirm new password', type: 'password', required: true }
        ],
        onSave: function (v) {
          if (hashPw(v.old) !== u.pass) { toast('Current password is wrong', 'err'); return; }
          if (v.p1.length < 4) { toast('Use at least 4 characters', 'err'); return; }
          if (v.p1 !== v.p2) { toast('Passwords do not match', 'err'); return; }
          u.pass = hashPw(v.p1); save(true); toast('Password changed');
        }
      });
    };
    document.getElementById('bBackup').onclick = function () {
      var data = JSON.stringify(S);
      var name = 'tractor-erp-backup-' + today() + '.json';
      if (window.AppBridge && window.AppBridge.saveFile) {
        window.AppBridge.saveFile(name, data);
      } else {
        var blob = new Blob([data], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
      }
      toast('Backup created');
    };
    document.getElementById('bRestore').onclick = function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try {
            var obj = JSON.parse(rd.result);
            if (!obj.meta || !obj.users) throw new Error('Not a valid backup file');
            confirmDlg('Replace all current data with this backup?', function () {
              S = obj; save(true); toast('Backup restored'); Router.go('dashboard');
            });
          } catch (e) { toast('Invalid backup file', 'err'); }
        };
        rd.readAsText(f);
      };
      inp.click();
    };
    document.getElementById('bSync').onclick = function () { Router.go('sync'); };
    document.getElementById('bReset').onclick = function () {
      confirmDlg('This deletes every record in the app. Continue?', function () {
        localStorage.removeItem(DB_KEY);
        S = blankState(); save(true);
        Router.go('setup');
      }, 'Delete everything');
    };
  }
});
