/* ============================================================
   ui.js — router, shell, tables, forms, modals, charts
   ============================================================ */

var Screens = {};      // name -> {title, group, render(params), noAuth}
var NAV = [];          // menu structure

function screen(name, def) { Screens[name] = def; if (def.nav) NAV.push(Object.assign({ name: name }, def.nav)); }

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function el(html) {
  var d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}
function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/* ---------------- router ---------------- */
var Router = {
  current: null,
  go: function (name, params) {
    var p = params ? encodeURIComponent(JSON.stringify(params)) : '';
    location.hash = '#/' + name + (p ? '?p=' + p : '');
  },
  parse: function () {
    var h = location.hash.replace(/^#\/?/, '');
    if (!h) return { name: 'dashboard', params: {} };
    var parts = h.split('?p=');
    var params = {};
    if (parts[1]) { try { params = JSON.parse(decodeURIComponent(parts[1])); } catch (e) { params = {}; } }
    return { name: parts[0], params: params };
  },
  render: function () {
    var r = Router.parse();
    var sc = Screens[r.name];
    if (!sc) { Router.go('dashboard'); return; }
    if (!S.meta.setupDone && r.name !== 'setup') { Router.go('setup'); return; }
    if (S.meta.setupDone && !S.session.userId && r.name !== 'login') { Router.go('login'); return; }
    if (S.meta.setupDone && S.session.userId && r.name === 'login') { Router.go('dashboard'); return; }
    Router.current = r.name;
    Shell.setTitle(sc.title || '');
    var view = document.getElementById('view');
    view.innerHTML = '';
    view.scrollTop = 0;
    try { sc.render(view, r.params || {}); }
    catch (e) {
      console.error(e);
      view.innerHTML = '<div class="pad"><div class="empty">Something went wrong rendering this screen.<br><small>' + esc(e.message) + '</small></div></div>';
    }
    Shell.closeDrawer();
    window.scrollTo(0, 0);
  }
};
window.addEventListener('hashchange', function () { Router.render(); });

/* ---------------- shell ---------------- */
var Shell = {
  build: function () {
    var u = me();
    document.getElementById('root').innerHTML =
      '<div class="shell">' +
        '<header class="topbar">' +
          '<button class="iconbtn" id="btnMenu" aria-label="Menu">' + icon('menu') + '</button>' +
          '<div class="tb-title" id="tbTitle">Tractor ERP</div>' +
          '<button class="iconbtn" id="btnUser" aria-label="Account">' + icon('user') + '</button>' +
        '</header>' +
        '<div class="drawer-scrim" id="scrim"></div>' +
        '<aside class="drawer" id="drawer">' + Shell.drawerHtml() + '</aside>' +
        '<main id="view" class="view"></main>' +
        '<div class="toast" id="toast"></div>' +
        '<div id="modalRoot"></div>' +
      '</div>';
    document.getElementById('btnMenu').onclick = Shell.openDrawer;
    document.getElementById('scrim').onclick = Shell.closeDrawer;
    document.getElementById('btnUser').onclick = function () { Router.go('myaccount'); };
    Shell.bindDrawer();
  },
  drawerHtml: function () {
    var u = me();
    var groups = [
      ['Overview', [['dashboard', 'Dashboard', 'grid'], ['reports', 'Reports & GST', 'chart'], ['documents', 'Documents & Print', 'print']]],
      ['Sales', [['sales', 'Sales & Invoicing', 'cart'], ['quotations', 'Quotations', 'doc'], ['agreements', 'Sale Agreements', 'doc'], ['jobcards', 'Job Cards', 'wrench'], ['leads', 'Sales Team & Leads', 'users'], ['exchanges', 'Tractor Exchange', 'swap']]],
      ['Purchase', [['purchases', 'Purchase Bills', 'box'], ['expenses', 'Expenses', 'wallet'], ['parties', 'Customers & Suppliers', 'people']]],
      ['Inventory', [['stock', 'Tractor & Stock', 'tractor'], ['stockitems', 'Items & Spares', 'box'], ['transfers', 'Stock Transfer', 'swap']]],
      ['Accounts', [['payments', 'Payments In / Out', 'rupee'], ['notes', 'Credit / Debit Notes', 'doc'], ['fininvoices', 'Financer & Margin', 'building'], ['cashbook', 'Cashbook', 'book'], ['bankbook', 'Bank Book', 'building'], ['petty', 'Petty Cash', 'coins'], ['transportledger', 'Transport Ledger', 'road'], ['advances', 'Trade Advance', 'coins']]],
      ['Vehicle Desk', [['pdi', 'PDI', 'check'], ['registration', 'RTA & HSRP', 'road'], ['warranty', 'Warranty', 'shield'], ['insurance', 'Insurance', 'shield'], ['fuel', 'Fuel Book', 'fuel'], ['logbook', 'Vehicle Logbook', 'road']]],
      ['People', [['employees', 'Employees', 'people'], ['attendance', 'Attendance', 'check'], ['salary', 'Salary', 'rupee'], ['tada', 'TADA / Travel', 'plane'], ['taledger', 'TADA Ledger', 'book'], ['incentives', 'Incentive Ledger', 'rupee'], ['commission', 'Commission Ledger', 'coins']]],
      ['Masters', [['masters', 'All Masters', 'layers'], ['dataio', 'Import & Export', 'download']]],
      ['System', [['fyclose', 'FY Closing', 'clock'], ['sync', 'Sync & Backup', 'swap'], ['settings', 'App Settings', 'gear']]]
    ];
    var h = '<div class="drawer-head">' +
      '<div class="orglogo">' + esc((org().name || 'T').slice(0, 1).toUpperCase()) + '</div>' +
      '<div><div class="dorg">' + esc(org().name || 'Set up organisation') + '</div>' +
      '<div class="dsub">' + esc(org().gstin || 'GSTIN not set') + '</div></div></div>' +
      '<div class="drawer-user">' + esc(u.name || 'User') + ' · ' + esc(u.role || '') + '</div><nav class="dnav">';
    groups.forEach(function (g) {
      h += '<div class="dgroup">' + g[0] + '</div>';
      g[1].forEach(function (it) {
        h += '<a class="ditem" data-nav="' + it[0] + '">' + icon(it[2]) + '<span>' + it[1] + '</span></a>';
      });
    });
    h += '</nav><div class="drawer-foot"><a class="ditem" data-nav="myaccount">' + icon('user') + '<span>My Account</span></a>' +
      '<a class="ditem danger" id="btnLogout">' + icon('logout') + '<span>Sign out</span></a></div>';
    return h;
  },
  bindDrawer: function () {
    qsa('[data-nav]').forEach(function (a) {
      a.onclick = function () { Router.go(a.getAttribute('data-nav')); };
    });
    var lo = document.getElementById('btnLogout');
    if (lo) lo.onclick = function () {
      confirmDlg('Sign out of the app?', function () { S.session.userId = null; save(true); Shell.refreshDrawer(); Router.go('login'); });
    };
  },
  refreshDrawer: function () {
    var d = document.getElementById('drawer');
    if (!d) return;
    d.innerHTML = Shell.drawerHtml();
    Shell.bindDrawer();
  },
  openDrawer: function () {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('scrim').classList.add('show');
  },
  closeDrawer: function () {
    var d = document.getElementById('drawer');
    if (d) d.classList.remove('open');
    var s = document.getElementById('scrim');
    if (s) s.classList.remove('show');
  },
  setTitle: function (t) {
    var e = document.getElementById('tbTitle');
    if (e) e.textContent = t || 'Tractor ERP';
  }
};

/* ---------------- icons (inline svg) ---------------- */
var ICONS = {
  menu: 'M3 6h18M3 12h18M3 18h18', user: 'M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', chart: 'M3 21h18M7 17V9M12 17V5M17 17v-6',
  cart: 'M6 6h15l-2 9H7L5 3H2M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  doc: 'M6 2h8l4 4v16H6zM14 2v5h5', wrench: 'M14 7a4 4 0 1 0 4 4l4 4-4 4-4-4a4 4 0 0 1-4-4z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8', wallet: 'M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2',
  people: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
  tractor: 'M4 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0M15 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0M7 14V7h5l2 4h4v4M12 7V4h4',
  swap: 'M7 4v13M7 4L4 7M7 4l3 3M17 20V7M17 20l3-3M17 20l-3-3',
  rupee: 'M7 4h10M7 9h10M7 4c6 0 6 5 0 5h1l6 7', book: 'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM18 4h2v16h-2',
  coins: 'M9 11a5 4 0 1 0 0-8 5 4 0 0 0 0 8M4 7v8c0 2 2 4 5 4s5-2 5-4V7M20 12a5 4 0 0 1-5 4',
  fuel: 'M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M4 21h11M14 9h3a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3',
  road: 'M6 21 9 3M18 21 15 3M12 7v2M12 13v2M12 19v2', check: 'M20 6 9 17l-5-5',
  plane: 'M2 12l20-8-8 20-2-8-10-4z', building: 'M3 21V7l6-4v18M9 21h12V11l-6-4M13 12h2M13 16h2M17 12h2M17 16h2',
  branch: 'M6 3v12a3 3 0 0 0 3 3h9M6 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4M18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5', shield: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L6 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  back: 'M15 18l-6-6 6-6', trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  print: 'M6 9V2h12v7M6 18H4v-6h16v6h-2M6 14h12v8H6z', close: 'M18 6 6 18M6 6l12 12',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5L22 3z', share: 'M4 12v8h16v-8M12 3v13M8 7l4-4 4 4',
  download: 'M12 3v13M7 11l5 5 5-5M4 21h16', arrowUp: 'M12 19V5M5 12l7-7 7 7', arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2'
};
function icon(n, cls) {
  var p = ICONS[n] || ICONS.grid;
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + p + '"/></svg>';
}

/* ---------------- page pieces ---------------- */
var ACTS = {};
var _actSeq = 0;
function pageHead(title, actions, sub) {
  var key = 'a' + (++_actSeq);
  ACTS[key] = actions || [];
  var h = '<div class="pagehead" data-actkey="' + key + '"><div><h1>' + esc(title) + '</h1>' +
    (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div><div class="acts">';
  (actions || []).forEach(function (a, i) {
    h += '<button class="btn ' + (a.cls || 'ghost') + '" data-act="' + i + '">' + (a.icon ? icon(a.icon) : '') + esc(a.label) + '</button>';
  });
  return h + '</div></div>';
}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!b) return;
  var head = b.closest('.pagehead');
  if (!head) return;
  var list = ACTS[head.getAttribute('data-actkey')] || [];
  var a = list[Number(b.getAttribute('data-act'))];
  if (a && a.onClick) { e.preventDefault(); a.onClick(e); }
});
function bindActions(root, actions) {
  qsa('[data-act]', root).forEach(function (b) {
    var a = actions[Number(b.getAttribute('data-act'))];
    if (a && a.onClick) b.onclick = function (ev) { a.onClick(ev); };
  });
}
function statCard(label, value, sub, tone) {
  return '<div class="stat ' + (tone || '') + '"><div class="slabel">' + esc(label) + '</div><div class="svalue">' + value + '</div>' +
    (sub ? '<div class="ssub">' + sub + '</div>' : '') + '</div>';
}
function emptyState(msg, actionLabel, onClick) {
  var id = 'e' + uid('x');
  var h = '<div class="empty">' + icon('box') + '<p>' + esc(msg) + '</p>' +
    (actionLabel ? '<button class="btn primary" id="' + id + '">' + esc(actionLabel) + '</button>' : '') + '</div>';
  setTimeout(function () {
    var b = document.getElementById(id);
    if (b && onClick) b.onclick = onClick;
  }, 0);
  return h;
}

/* ---------------- table / cards ---------------- */
function table(cfg) {
  var cols = cfg.cols, rows = cfg.rows || [];
  if (!rows.length) return '<div class="empty small">' + esc(cfg.empty || 'No records yet') + '</div>';
  var h = '<div class="twrap"><table class="tbl ' + (cfg.cls || '') + '"><thead><tr>';
  cols.forEach(function (c) { h += '<th class="' + (c.cls || '') + '">' + esc(c.label) + '</th>'; });
  h += '</tr></thead><tbody>';
  rows.forEach(function (r, ri) {
    h += '<tr data-ri="' + ri + '">';
    cols.forEach(function (c) {
      var v = c.render ? c.render(r, ri) : esc(r[c.k]);
      h += '<td class="' + (c.cls || '') + '">' + v + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody>';
  if (cfg.totals) {
    h += '<tfoot><tr>';
    cols.forEach(function (c, i) {
      h += '<td class="' + (c.cls || '') + '">' + (i === 0 ? '<b>Total</b>' : (cfg.totals[c.k] !== undefined ? '<b>' + cfg.totals[c.k] + '</b>' : '')) + '</td>';
    });
    h += '</tr></tfoot>';
  }
  return h + '</table></div>';
}
function cardRow(opts) {
  var id = 'r' + uid('x');
  setTimeout(function () {
    var e = document.getElementById(id);
    if (e && opts.onClick) e.onclick = opts.onClick;
  }, 0);
  return '<div class="rowcard ' + (opts.cls || '') + '" id="' + id + '">' +
    '<div class="rc-main"><div class="rc-title">' + (opts.title || '') + '</div>' +
    '<div class="rc-sub">' + (opts.sub || '') + '</div></div>' +
    '<div class="rc-right">' + (opts.right || '') + '</div></div>';
}
function badge(text, tone) { return '<span class="badge ' + (tone || '') + '">' + esc(text) + '</span>'; }
function statusTone(st) {
  var m = { paid: 'green', open: 'amber', partial: 'amber', in_stock: 'green', sold: 'blue', reserved: 'amber',
    draft: 'grey', sent: 'blue', accepted: 'green', rejected: 'red', completed: 'green', delivered: 'blue',
    cancelled: 'red', active: 'green', inactive: 'grey', approved: 'green', pending: 'amber', P: 'green', A: 'red', H: 'amber', L: 'blue' };
  return m[st] || 'grey';
}

/* ---------------- modal ---------------- */
function modal(cfg) {
  var root = document.getElementById('modalRoot');
  var id = 'm' + uid('x');
  var h = '<div class="modalwrap" id="' + id + '"><div class="scrim" data-close></div>' +
    '<div class="modal ' + (cfg.wide ? 'wide' : '') + '">' +
    '<div class="mhead"><div class="mtitle">' + esc(cfg.title || '') + '</div>' +
    '<button class="iconbtn" data-close>' + icon('close') + '</button></div>' +
    '<div class="mbody">' + (cfg.body || '') + '</div>' +
    (cfg.footer === false ? '' : '<div class="mfoot" id="' + id + 'f">' + (cfg.footer || '') + '</div>') +
    '</div></div>';
  root.appendChild(el(h));
  var wrap = document.getElementById(id);
  qsa('[data-close]', wrap).forEach(function (b) { b.onclick = function () { close(); }; });
  function close() { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); if (cfg.onClose) cfg.onClose(); }
  setTimeout(function () { wrap.classList.add('in'); }, 10);
  return { el: wrap, close: close, footer: document.getElementById(id + 'f') };
}
function confirmDlg(msg, onYes, yesLabel) {
  var m = modal({
    title: 'Please confirm',
    body: '<p class="confirmmsg">' + esc(msg) + '</p>',
    footer: '<button class="btn ghost" data-no>Cancel</button><button class="btn danger" data-yes>' + esc(yesLabel || 'Yes, continue') + '</button>'
  });
  qs('[data-no]', m.el).onclick = m.close;
  qs('[data-yes]', m.el).onclick = function () { m.close(); onYes(); };
}
function promptDlg(title, label, value, onOk, type) {
  var m = modal({
    title: title,
    body: '<label class="fld"><span>' + esc(label) + '</span><input class="js-pv" type="' + (type || 'text') + '" value="' + esc(value || '') + '"></label>',
    footer: '<button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-ok>Save</button>'
  });
  var inp = qs('.js-pv', m.el);
  qs('[data-no]', m.el).onclick = m.close;
  qs('[data-ok]', m.el).onclick = function () { m.close(); onOk(inp.value); };
  setTimeout(function () { inp.focus(); }, 80);
}

/* ---------------- form engine ---------------- */
function fieldHtml(f, val) {
  if (f.type === 'section') return '<div class="section-label span2">' + esc(f.label) + '</div>';
  var v = val === undefined || val === null ? (f.def !== undefined ? f.def : '') : val;
  var req = f.required ? ' required' : '';
  var h = '<label class="fld ' + (f.span === 2 ? 'span2' : '') + '"><span>' + esc(f.label) + (f.required ? ' <b>*</b>' : '') + '</span>';
  var name = 'name="' + f.k + '"';
  if (f.type === 'select') {
    var opts = typeof f.options === 'function' ? f.options() : (f.options || []);
    h += '<select ' + name + req + '>';
    if (!f.required || f.placeholder) h += '<option value="">' + esc(f.placeholder || '— select —') + '</option>';
    opts.forEach(function (o) {
      var ov = Array.isArray(o) ? o[0] : o.v, ol = Array.isArray(o) ? o[1] : o.l;
      h += '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + esc(ol) + '</option>';
    });
    h += '</select>';
  } else if (f.type === 'textarea') {
    h += '<textarea ' + name + ' rows="' + (f.rows || 3) + '"' + req + ' placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';
  } else if (f.type === 'checkbox') {
    h += '<div class="switchrow"><input type="checkbox" ' + name + (v ? ' checked' : '') + '><span>' + esc(f.help || 'Enabled') + '</span></div>';
  } else {
    h += '<input type="' + (f.type || 'text') + '" ' + name + req +
      (f.step ? ' step="' + f.step + '"' : '') +
      (f.min !== undefined ? ' min="' + f.min + '"' : '') +
      (f.max !== undefined ? ' max="' + f.max + '"' : '') +
      (f.inputmode ? ' inputmode="' + f.inputmode + '"' : '') +
      ' value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '">';
  }
  if (f.help && f.type !== 'checkbox') h += '<small class="help">' + esc(f.help) + '</small>';
  return h + '</label>';
}
function formHtml(fields, values) {
  values = values || {};
  return '<div class="formgrid">' + fields.map(function (f) { return fieldHtml(f, values[f.k]); }).join('') + '</div>';
}
function readForm(root, fields) {
  var out = {};
  fields.forEach(function (f) {
    if (f.type === 'section' || !f.k) return;
    var e = root.querySelector('[name="' + f.k + '"]');
    if (!e) return;
    if (f.type === 'checkbox') out[f.k] = e.checked;
    else if (f.type === 'number') out[f.k] = e.value === '' ? '' : num(e.value);
    else out[f.k] = e.value;
  });
  return out;
}
function Form(cfg) {
  var m = modal({
    title: cfg.title,
    wide: cfg.wide,
    body: formHtml(cfg.fields, cfg.values) + (cfg.note ? '<div class="note">' + cfg.note + '</div>' : ''),
    footer: '<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>' + esc(cfg.saveLabel || 'Save') + '</button>'
  });
  qs('[data-cancel]', m.el).onclick = m.close;
  qs('[data-save]', m.el).onclick = function () {
    var vals = readForm(m.el, cfg.fields);
    var missing = cfg.fields.filter(function (f) { return f.required && (vals[f.k] === '' || vals[f.k] === undefined); });
    if (missing.length) { toast('Please fill: ' + missing.map(function (f) { return f.label; }).join(', '), 'err'); return; }
    m.close();
    cfg.onSave(vals);
  };
  return m;
}

/* ---------------- small chart ---------------- */
function barChart(data, opts) {
  opts = opts || {};
  if (!data.length) return '<div class="empty small">No data</div>';
  var max = Math.max.apply(null, data.map(function (d) { return Math.abs(d.v); })) || 1;
  var h = '<div class="bars">';
  data.forEach(function (d) {
    var w = Math.round(Math.abs(d.v) / max * 100);
    h += '<div class="bar-row"><div class="bl">' + esc(d.l) + '</div>' +
      '<div class="btrack"><div class="bfill ' + (d.tone || '') + '" style="width:' + w + '%"></div></div>' +
      '<div class="bv">' + esc(opts.fmt ? opts.fmt(d.v) : fmt(d.v, 0)) + '</div></div>';
  });
  return h + '</div>';
}
function lineChart(data) {
  if (!data.length) return '<div class="empty small">No data</div>';
  var w = 320, hgt = 120, pad = 6;
  var max = Math.max.apply(null, data.map(function (d) { return d.v; })) || 1;
  var pts = data.map(function (d, i) {
    var x = pad + i * ((w - pad * 2) / Math.max(1, data.length - 1));
    var y = hgt - pad - (d.v / max) * (hgt - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  var area = pad + ',' + (hgt - pad) + ' ' + pts + ' ' + (w - pad) + ',' + (hgt - pad);
  return '<svg class="linechart" viewBox="0 0 ' + w + ' ' + hgt + '" preserveAspectRatio="none">' +
    '<polygon points="' + area + '" fill="rgba(21,101,192,.12)"/>' +
    '<polyline points="' + pts + '" fill="none" stroke="#1565c0" stroke-width="2.2" stroke-linejoin="round"/></svg>' +
    '<div class="xlabels">' + data.map(function (d) { return '<span>' + esc(d.l) + '</span>'; }).join('') + '</div>';
}
