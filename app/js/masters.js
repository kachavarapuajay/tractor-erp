/* ============================================================
   masters.js — parties, items, branches, departments,
   employees, users & permissions, organisation, settings
   ============================================================ */

/* ---------- generic edit modal with delete ---------- */
function editEntity(cfg) {
  var isNew = cfg.isNew !== undefined ? cfg.isNew : !cfg.rec;
  var rec = Object.assign({}, cfg.defaults || {}, cfg.preset || cfg.rec || {});
  var body = formHtml(cfg.fields, rec) + (cfg.extraHtml ? cfg.extraHtml(rec) : '');
  var m = modal({
    title: cfg.title || (isNew ? 'Add' : 'Edit'),
    wide: cfg.wide,
    body: body,
    footer: (isNew ? '' : '<button class="btn danger" data-del>' + icon('trash') + '</button>') +
      '<button class="btn ghost" data-cancel>Cancel</button>' +
      '<button class="btn primary" data-save>' + (isNew ? 'Add' : 'Save') + '</button>'
  });
  qs('[data-cancel]', m.el).onclick = m.close;
  if (!isNew) {
    qs('[data-del]', m.el).onclick = function () {
      confirmDlg('Delete this record permanently?', function () { m.close(); cfg.onDelete(rec); }, 'Delete');
    };
  }
  if (cfg.onOpen) { try { cfg.onOpen(m.el, isNew); } catch (e) { console.error(e); } }
  qs('[data-save]', m.el).onclick = function () {
    var v = readForm(m.el, cfg.fields);
    var miss = cfg.fields.filter(function (f) { return f.required && (v[f.k] === '' || v[f.k] === undefined); });
    if (miss.length) { toast('Required: ' + miss.map(function (f) { return f.label; }).join(', '), 'err'); return; }
    if (cfg.validate) { var e = cfg.validate(v, isNew ? null : rec); if (e) { toast(e, 'err'); return; } }
    m.close();
    cfg.onSave(v, isNew ? null : rec);
  };
  return m;
}

function branchOptions() {
  return S.branches.filter(function (b) { return b.active !== false; }).map(function (b) { return { v: b.id, l: b.name }; });
}
function deptOptions() {
  return S.departments.map(function (d) { return { v: d.id, l: d.name }; });
}

/* ---------- generic list screen ---------- */
function crudScreen(cfg) {
  var self = function (view, params) {
    var q = params.q || '';
    var rows = coll(cfg.coll).filter(function (r) {
      if (cfg.filter && !cfg.filter(r)) return false;
      if (!q) return true;
      return cfg.search(r).toLowerCase().indexOf(q.toLowerCase()) > -1;
    });
    rows = cfg.sort ? cfg.sort(rows) : sortBy(rows, cfg.sortKey || 'name');
    var acts = [{ label: 'Add', icon: 'plus', cls: 'primary', onClick: function () { open(null); } }];
    if (cfg.exportCols) {
      acts.unshift({
        label: 'Export', icon: 'download',
        onClick: function () {
          Export.menu(cfg.title, cfg.exportCols, rows.map(cfg.exportRow), {
            label: function (r) { return r[cfg.exportCols[0].k]; }
          });
        }
      });
    }
    var h = pageHead(cfg.title, acts, cfg.sub);
    h += '<div class="searchbar"><input id="q" placeholder="' + esc(cfg.searchLabel || 'Search…') + '" value="' + esc(q) + '">' +
      (cfg.extraButton ? '<button class="btn" id="xbtn">' + esc(cfg.extraButton.label) + '</button>' : '') + '</div>';
    h += '<div class="card tight">';
    if (!rows.length) h += '<div class="empty small">' + esc(cfg.empty || 'Nothing here yet — tap Add to create the first record.') + '</div>';
    else h += rows.map(function (r) {
      var id = 'c' + r.id;
      setTimeout(function () {
        var e = document.getElementById(id);
        if (e) e.onclick = function () { open(r); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main">' + cfg.row(r) + '</div>' +
        '<div class="rc-right">' + (cfg.rowRight ? cfg.rowRight(r) : '') + '</div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;

    function refresh(qq) {
      if (cfg.renderWith) cfg.renderWith(view, qq);
      else self(view, { q: qq });
    }
    var inp = document.getElementById('q');
    inp.oninput = function () {
      clearTimeout(inp._t);
      inp._t = setTimeout(function () { refresh(inp.value); }, 280);
    };
    if (cfg.extraButton) {
      document.getElementById('xbtn').onclick = function () { cfg.extraButton.onClick(); };
    }
    function open(r) {
      _itemCat = (r && r.category) || (typeof cfg.defaults === 'function' ? cfg.defaults().category : (cfg.defaults || {}).category) || 'spare';
      _itemMake = (r && r.makeId) || '';
      editEntity({
        title: cfg.title + (r ? '' : ' — new'),
        fields: cfg.fields,
        rec: r,
        defaults: (typeof cfg.defaults === 'function' ? cfg.defaults() : cfg.defaults),
        wide: cfg.wide,
        validate: cfg.validate,
        onOpen: cfg.onOpen,
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v);
          if (!old) rec.id = uid(cfg.coll.slice(0, 3));
          upsert(cfg.coll, rec);
          if (cfg.after) cfg.after(rec, !old);
          toast(old ? 'Saved' : 'Added');
          refresh(q);
        },
        onDelete: function (old) {
          if (cfg.beforeDelete && cfg.beforeDelete(old) === false) return;
          removeRec(cfg.coll, old.id);
          toast('Deleted');
          refresh(q);
        }
      });
    }
  };
  return self;
}

/* ================= PARTIES ================= */
var partyFields = [
  { k: 'name', label: 'Name', required: true, span: 2 },
  { k: 'type', label: 'Type', type: 'select', required: true, options: [['customer', 'Customer'], ['supplier', 'Supplier / Dealer'], ['financer', 'Financer / Bank'], ['broker', 'Broker / Commission agent'], ['transporter', 'Transporter']], def: 'customer' },
  { k: 'commissionAmount', label: 'Broker commission (amount)', type: 'number', step: '0.01', help: 'Fixed amount per deal, only for brokers' },
  { k: 'contact', label: 'Contact person' },
  { k: 'phone', label: 'Phone', type: 'tel' },
  { k: 'phone2', label: 'Phone 2', type: 'tel' },
  { k: 'email', label: 'Email', type: 'email' },
  { k: 'guardian', label: "Father's / husband's name" },
  { k: 'aadhaar', label: 'Aadhaar no.', inputmode: 'numeric' },
  { k: 'pan', label: 'PAN' },
  { k: 'gstin', label: 'GSTIN', span: 2, help: 'Leave blank for unregistered / B2C' },
  { k: 'stateCode', label: 'State', type: 'select', options: function () { return stateOptions(); }, def: '36' },
  { k: 'creditDays', label: 'Credit days', type: 'number', def: 0 },
  { k: 'villageId', label: 'Village', type: 'select', options: function () { return villageOptions(); } },
  { k: 'mandalId', label: 'Mandal', type: 'select', options: function () { return mandalOptions(); } },
  { k: 'occupation', label: 'Occupation' },
  { k: 'dob', label: 'Date of birth', type: 'date' },
  { k: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
  { k: 'city', label: 'City / District' },
  { k: 'pincode', label: 'PIN code' },
  { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true },
  { k: 'openingBal', label: 'Opening balance', type: 'number', def: 0 },
  { k: 'openingType', label: 'Opening type', type: 'select', options: [['dr', 'Dr (receivable)'], ['cr', 'Cr (payable)']], def: 'dr' }
];

screen('parties', {
  title: 'Customers & Suppliers',
  render: function (view, params) {
    var tab = params.tab || 'all';
    var tabs = [['all', 'All'], ['customer', 'Customers'], ['supplier', 'Suppliers'], ['financer', 'Financers']];
    var base = crudScreen({
      title: 'Customers & Suppliers',
      coll: 'parties',
      fields: partyFields,
      wide: true,
      defaults: { type: tab === 'all' ? 'customer' : tab, stateCode: org().stateCode, branchId: (S.branches[0] || {}).id, openingBal: 0, creditDays: 0 },
      filter: function (r) { return tab === 'all' ? true : r.type === tab; },
      search: function (r) { return [r.name, r.phone, r.gstin, r.city].join(' '); },
      searchLabel: 'Search name, phone, GSTIN…',
      row: function (r) {
        var loc = [villageName(r.villageId), mandalName(r.mandalId), districtOfMandal(r.mandalId)]
          .filter(Boolean).join(', ');
        return '<div class="rc-title">' + esc(r.name) + (r.aadhaar || r.pan ? ' ' + badge('KYC', 'blue') : '') + '</div><div class="rc-sub">' +
          esc((r.type || '').toUpperCase()) + (r.gstin ? ' · ' + esc(r.gstin) : ' · unregistered') +
          (r.phone ? ' · ' + esc(r.phone) : '') + (loc ? ' · ' + esc(loc) : '') + '</div>';
      },
      rowRight: function (r) {
        var b = partyBalance(r.id);
        return '<span class="' + (b >= 0 ? '' : 'green') + '">' + inr(Math.abs(b)) + '</span><small>' + (b >= 0 ? 'receivable' : 'payable') + '</small>';
      },
      sort: function (rows) { return sortBy(rows, 'name'); },
      exportCols: [
        { k: 'name', label: 'Name' }, { k: 'type', label: 'Type' }, { k: 'phone', label: 'Phone' },
        { k: 'aadhaar', label: 'Aadhaar' }, { k: 'pan', label: 'PAN' }, { k: 'gstin', label: 'GSTIN' },
        { k: 'village', label: 'Village' }, { k: 'balance', label: 'Balance' }
      ],
      exportRow: function (r) {
        return {
          name: r.name, type: r.type, phone: r.phone || '', aadhaar: r.aadhaar || '', pan: r.pan || '',
          gstin: r.gstin || '', village: villageName(r.villageId), balance: partyBalance(r.id)
        };
      },
      empty: 'Add your first customer, supplier or financer.'
    });
    base.renderWith = function (v, q) { Router.go('parties', { tab: tab, q: q }); };
    // render tabs then delegate
    base(view, params);
    var head = qs('.pagehead', view);
    if (head) head.insertAdjacentHTML('afterend', '<div class="tabs">' + tabs.map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>');
    qsa('[data-tab]', view).forEach(function (b) {
      b.onclick = function () { Router.go('parties', { tab: b.getAttribute('data-tab') }); };
    });
  }
});

/* ================= ITEMS ================= */
var _itemCat = 'spare';
var _itemMake = '';

var ITEM_CATS = [['tractor', 'Tractor (unit tracked)'], ['implement', 'Implement'], ['accessory', 'Accessory'], ['spare', 'Spare part'], ['service', 'Service / Labour'], ['other', 'Other']];
var itemFields = [
  { k: 'name', label: 'Item name', required: true, span: 2 },
  { k: 'code', label: 'Item code' },
  { k: 'partNo', label: 'Part no.', help: 'Spare parts & accessories' },
  { k: 'category', label: 'Category', type: 'select', required: true, options: ITEM_CATS, def: 'spare' },
  { k: 'makeId', label: 'Make', type: 'select', options: function () { return makeOptions(itemMakeCategory(_itemCat)); } },
  { k: 'modelId', label: 'Model', type: 'select', options: function () { return modelOptions(_itemMake || '', itemMakeCategory(_itemCat)); } },
  { k: 'brand', label: 'Brand (free text)' },
  { k: 'model', label: 'Model (free text)' },
  { k: 'hsn', label: 'HSN / SAC' },
  { k: 'uom', label: 'UOM', type: 'select', options: function () { return uomOptions(); }, def: 'NOS' },
  { k: 'gstRate', label: 'GST %', type: 'select', options: function () { return gstOptions(); }, def: '18' },
  { k: 'serialTracked', label: 'Serial tracking', type: 'checkbox', span: 2, help: 'Track every piece by serial number (implements & accessories)' },
  { k: 'saleRate', label: 'Sale rate', type: 'number', step: '0.01', def: 0 },
  { k: 'purchaseRate', label: 'Purchase rate', type: 'number', step: '0.01', def: 0 },
  { k: 'openingQty', label: 'Opening qty', type: 'number', def: 0 },
  { k: 'reorder', label: 'Reorder level', type: 'number', def: 0 }
];

screen('stockitems', {
  title: 'Items & Spares',
  render: crudScreen({
    title: 'Items & Spares',
    coll: 'items',
    fields: itemFields,
    wide: true,
    defaults: function () {
      return {
        category: 'spare', uom: 'NOS', gstRate: '18', saleRate: 0, purchaseRate: 0,
        openingQty: 0, reorder: 0, makeId: defaultMakeId()
      };
    },
    search: function (r) { return [r.name, r.code, r.partNo, r.brand, r.model, r.hsn].join(' '); },
    searchLabel: 'Search item, part no., code, brand…',
    row: function (r) {
      return '<div class="rc-title">' + esc(r.name) + (r.serialTracked ? ' ' + badge('SERIAL', 'blue') : '') + '</div><div class="rc-sub">' +
        (r.partNo ? 'Part ' + esc(r.partNo) + ' · ' : '') +
        esc((r.brand || '') + (r.model ? ' ' + r.model : '')) + ' · ' + esc((r.category || '').toUpperCase()) +
        ' · HSN ' + esc(r.hsn || '-') + ' · GST ' + esc(r.gstRate) + '%' +
        (r.uom ? ' · ' + esc(r.uom) : '') + '</div>';
    },
    rowRight: function (r) {
      var q = stockQty(r.id);
      return inr(r.saleRate) + '<small>' + (r.category === 'service' ? 'service' : 'stock: ' + fmtQty(q)) + '</small>';
    },
    onOpen: function (el) {
      var catSel = el.querySelector('[name="category"]');
      var makeSel = el.querySelector('[name="makeId"]');
      var modelSel = el.querySelector('[name="modelId"]');
      function rebuildMakes(keep) {
        var opts = makeOptions(itemMakeCategory(catSel.value));
        makeSel.innerHTML = '<option value="">— select make —</option>' + opts.map(function (o) {
          return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
        }).join('');
        if (keep && opts.some(function (o) { return o.v === keep; })) makeSel.value = keep;
      }
      function rebuildModels() {
        var opts = modelOptions(makeSel.value || '', itemMakeCategory(catSel.value));
        modelSel.innerHTML = '<option value="">— select model —</option>' + opts.map(function (o) {
          return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
        }).join('');
      }
      if (catSel && makeSel) {
        catSel.onchange = function () { _itemCat = catSel.value; rebuildMakes(''); rebuildModels(); };
        makeSel.onchange = function () { _itemMake = makeSel.value; rebuildModels(); };
      }
    },
    exportCols: [
      { k: 'name', label: 'Item' }, { k: 'partNo', label: 'Part no.' }, { k: 'category', label: 'Category' },
      { k: 'hsn', label: 'HSN' }, { k: 'gstRate', label: 'GST %' }, { k: 'saleRate', label: 'Sale rate' },
      { k: 'stock', label: 'Stock' }
    ],
    exportRow: function (r) {
      return { name: r.name, partNo: r.partNo || '', category: r.category, hsn: r.hsn || '', gstRate: num(r.gstRate), saleRate: num(r.saleRate), stock: stockQty(r.id) };
    },
    after: function (rec, isNew) {
      if (rec.makeId && !rec.brand) { rec.brand = makeName(rec.makeId); upsert('items', rec); }
      if (rec.modelId && !rec.model) { rec.model = modelName(rec.modelId); upsert('items', rec); }
      if (!isNew) return;
      if (num(rec.openingQty) > 0 && rec.category !== 'tractor' && rec.category !== 'service') {
        S.moves.push({
          id: uid('mv'), date: today(), itemId: rec.id, branchId: (S.branches[0] || {}).id,
          qty: num(rec.openingQty), rate: num(rec.purchaseRate), type: 'opening', refNo: 'OPENING', note: 'Opening stock'
        });
        save();
      }
    },
    sort: function (rows) { return sortBy(rows, 'name'); }
  })
});

/* ================= BRANCHES ================= */
screen('branches', {
  title: 'Branches',
  render: crudScreen({
    title: 'Branches',
    coll: 'branches',
    fields: [
      { k: 'name', label: 'Branch name', required: true },
      { k: 'code', label: 'Code', required: true },
      { k: 'gstin', label: 'GSTIN' },
      { k: 'stateCode', label: 'State', type: 'select', options: function () { return STATES; }, required: true },
      { k: 'phone', label: 'Phone', type: 'tel' },
      { k: 'manager', label: 'Branch manager' },
      { k: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
      { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Branch is operational' }
    ],
    wide: true,
    defaults: { stateCode: org().stateCode, active: true },
    search: function (r) { return [r.name, r.code, r.gstin].join(' '); },
    row: function (r) {
      return '<div class="rc-title">' + esc(r.name) + ' ' + (r.active === false ? badge('inactive', 'grey') : '') + '</div>' +
        '<div class="rc-sub">' + esc(r.code) + ' · ' + esc(stateName(r.stateCode)) + (r.gstin ? ' · ' + esc(r.gstin) : '') + '</div>';
    },
    rowRight: function (r) {
      var units = S.units.filter(function (u) { return u.branchId === r.id && u.status === 'in_stock'; }).length;
      return units + '<small>in stock</small>';
    }
  })
});

/* ================= DEPARTMENTS ================= */
screen('departments', {
  title: 'Departments',
  render: crudScreen({
    title: 'Departments',
    coll: 'departments',
    fields: [
      { k: 'name', label: 'Department name', required: true, span: 2 },
      { k: 'head', label: 'Head / in-charge' },
      { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions }
    ],
    defaults: { branchId: (S.branches[0] || {}).id },
    search: function (r) { return [r.name, r.head].join(' '); },
    row: function (r) {
      var n = S.employees.filter(function (e) { return e.deptId === r.id; }).length;
      return '<div class="rc-title">' + esc(r.name) + '</div><div class="rc-sub">' +
        (r.head ? 'Head: ' + esc(r.head) + ' · ' : '') + n + ' employee(s)</div>';
    },
    rowRight: function (r) { return ''; }
  })
});

/* ================= EMPLOYEES ================= */
var EMP_TYPES = [['sales', 'Sales executive'], ['mechanic', 'Mechanic'], ['office', 'Office / Accounts'], ['driver', 'Driver'], ['manager', 'Manager']];
screen('employees', {
  title: 'Employees',
  render: function (view, params) {
    var tab = params.tab || 'all';
    var base = crudScreen({
      title: 'Employees',
      coll: 'employees',
      wide: true,
      fields: [
        { k: 'name', label: 'Full name', required: true, span: 2 },
        { k: 'code', label: 'Employee code' },
        { k: 'empType', label: 'Role type', type: 'select', options: EMP_TYPES, def: 'sales', required: true },
        { k: 'deptId', label: 'Department', type: 'select', options: deptOptions },
        { k: 'designation', label: 'Designation' },
        { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true },
        { k: 'phone', label: 'Mobile', type: 'tel' },
        { k: 'phone2', label: 'Alternate phone', type: 'tel' },
        { k: 'aadhaar', label: 'Aadhaar no.', inputmode: 'numeric' },
        { k: 'pan', label: 'PAN' },
        { k: 'bloodGroup', label: 'Blood group', type: 'select', options: [['A+', 'A+'], ['A-', 'A-'], ['B+', 'B+'], ['B-', 'B-'], ['O+', 'O+'], ['O-', 'O-'], ['AB+', 'AB+'], ['AB-', 'AB-']] },
        { k: 'emergencyName', label: 'Emergency contact name' },
        { k: 'emergencyPhone', label: 'Emergency phone', type: 'tel' },
        { k: 'defaultMakeId', label: 'Default make for the dealership', type: 'select', options: function () { return makeOptions(); }, help: 'Models of this make are picked by default in invoices, quotations and agreements' },
        { k: 'bankName', label: 'Bank name' },
        { k: 'bankAccount', label: 'Account number' },
        { k: 'bankIfsc', label: 'IFSC' },
        { k: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
        { k: 'joinDate', label: 'Date of joining', type: 'date', def: today() },
        { k: 'salary', label: 'Monthly salary', type: 'number', def: 0 },
        { k: 'incentiveAmount', label: 'Incentive per sale', type: 'number', step: '0.01', def: 0 },
        { k: 'target', label: 'Monthly target', type: 'number', def: 0 },
        { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Currently employed' }
      ],
      defaults: { empType: 'sales', branchId: (S.branches[0] || {}).id, joinDate: today(), active: true, salary: 0 },
      filter: function (r) { return tab === 'all' ? true : r.empType === tab; },
      search: function (r) { return [r.name, r.code, r.phone, r.designation].join(' '); },
      row: function (r) {
        return '<div class="rc-title">' + esc(r.name) + ' ' + badge(r.empType || '', 'blue') + '</div>' +
          '<div class="rc-sub">' + esc(r.designation || '') + ' · ' + esc((dept(r.deptId) || {}).name || '') +
          ' · ' + esc(r.phone || '') + (r.bloodGroup ? ' · ' + esc(r.bloodGroup) : '') +
          (r.bankAccount ? ' · A/c ' + esc(String(r.bankAccount).slice(-4)) : '') + '</div>';
      },
      rowRight: function (r) { return inr(r.salary) + '<small>per month</small>'; },
      sort: function (rows) { return sortBy(rows, 'name'); },
      exportCols: [
        { k: 'name', label: 'Name' }, { k: 'code', label: 'Code' }, { k: 'type', label: 'Type' },
        { k: 'designation', label: 'Designation' }, { k: 'phone', label: 'Mobile' }, { k: 'aadhaar', label: 'Aadhaar' },
        { k: 'pan', label: 'PAN' }, { k: 'blood', label: 'Blood group' }, { k: 'bank', label: 'Bank A/c' },
        { k: 'salary', label: 'Salary' }
      ],
      exportRow: function (r) {
        return {
          name: r.name, code: r.code || '', type: r.empType, designation: r.designation || '', phone: r.phone || '',
          aadhaar: r.aadhaar || '', pan: r.pan || '', blood: r.bloodGroup || '', bank: r.bankAccount || '', salary: num(r.salary)
        };
      }
    });
    base.renderWith = function (v, q) { Router.go('employees', { tab: tab, q: q }); };
    base(view, params);
    var head = qs('.pagehead', view);
    if (head) head.insertAdjacentHTML('afterend', '<div class="tabs">' +
      [['all', 'All'], ['sales', 'Sales team'], ['mechanic', 'Mechanics'], ['office', 'Office'], ['driver', 'Drivers']].map(function (t) {
        return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>');
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('employees', { tab: b.getAttribute('data-tab') }); }; });
  }
});

/* ================= USERS & PERMISSIONS ================= */
screen('users', {
  title: 'Users & Permissions',
  render: function (view) {
    if (!isAdmin()) { view.innerHTML = '<div class="pad"><div class="empty">Only administrators can manage users.</div></div>'; return; }
    var h = pageHead('Users & Permissions', [{ label: 'New user', icon: 'plus', cls: 'primary', onClick: function () { openUser(null); } }],
      'Control who can open which module');
    h += '<div class="card tight">';
    if (!S.users.length) h += '<div class="empty small">No users</div>';
    else h += S.users.map(function (u) {
      var id = 'u' + u.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { openUser(u); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(u.name) +
        (u.active === false ? ' ' + badge('disabled', 'red') : '') + '</div>' +
        '<div class="rc-sub">' + esc(u.username) + ' · ' + esc(u.role) + ' · ' + esc(branchName(u.branchId)) + '</div></div>' +
        '<div class="rc-right"><small>' + ((u.role === 'owner' || u.role === 'admin') ? 'full access' : (u.perms || []).length + ' modules') + '</small></div></div>';
    }).join('');
    h += '</div><div class="card"><h3>Role guide</h3><div class="tiny muted">' +
      '<b>Owner / Admin</b> — everything, including users and settings.<br>' +
      '<b>Manager</b> — modules you tick, can approve.<br>' +
      '<b>Staff</b> — ticked modules only, no deletions of documents.</div></div>';
    view.innerHTML = h;

    function openUser(u) {
      var isNew = !u;
      var rec = u || { role: 'staff', perms: ['sales'], branchId: (S.branches[0] || {}).id, active: true };
      var body = formHtml([
        { k: 'name', label: 'Full name', required: true, span: 2 },
        { k: 'username', label: 'Username', required: true },
        { k: 'phone', label: 'Mobile', type: 'tel' },
        { k: 'role', label: 'Role', type: 'select', required: true, options: [['owner', 'Owner'], ['admin', 'Administrator'], ['manager', 'Manager'], ['staff', 'Staff']] },
        { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions },
        { k: 'deptId', label: 'Department', type: 'select', options: deptOptions },
        { k: 'password', label: isNew ? 'Password' : 'New password (optional)', type: 'password', span: 2 }
      ], rec) +
        '<div class="section-label">Module permissions</div><div class="formgrid">' +
        permList().map(function (p) {
          var on = (rec.perms || []).indexOf(p[0]) > -1;
          return '<label class="fld"><span>' + esc(p[1]) + '</span><div class="switchrow">' +
            '<input type="checkbox" name="perm_' + p[0] + '"' + (on ? ' checked' : '') + '><span>' + (on ? 'allowed' : 'blocked') + '</span></div></label>';
        }).join('') + '</div>' +
        '<label class="fld" style="margin-top:12px"><span>Account status</span><div class="switchrow">' +
        '<input type="checkbox" name="active"' + (rec.active !== false ? ' checked' : '') + '><span>Login enabled</span></div></label>';
      var m = modal({
        title: isNew ? 'New user' : 'Edit user',
        wide: true, body: body,
        footer: (isNew ? '' : '<button class="btn danger" data-del>' + icon('trash') + '</button>') +
          '<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button>'
      });
      qs('[data-cancel]', m.el).onclick = m.close;
      if (!isNew) qs('[data-del]', m.el).onclick = function () {
        if (u.id === S.session.userId) { toast('You cannot delete your own login', 'err'); return; }
        confirmDlg('Delete user ' + u.name + '?', function () { m.close(); removeRec('users', u.id); Router.render(); }, 'Delete');
      };
      qs('[data-save]', m.el).onclick = function () {
        var v = readForm(m.el, [{ k: 'name' }, { k: 'username' }, { k: 'phone' }, { k: 'role' }, { k: 'branchId' }, { k: 'deptId' }, { k: 'password' }]);
        if (!v.name || !v.username) { toast('Name and username required', 'err'); return; }
        var clash = S.users.find(function (x) { return x.username === v.username.toLowerCase() && (!u || x.id !== u.id); });
        if (clash) { toast('That username is already taken', 'err'); return; }
        var perms = permList().map(function (p) { return p[0]; }).filter(function (k) {
          var e = m.el.querySelector('[name="perm_' + k + '"]'); return e && e.checked;
        });
        var activeEl = m.el.querySelector('[name="active"]');
        var out = Object.assign({}, u || {}, {
          name: v.name, username: v.username.toLowerCase(), phone: v.phone, role: v.role,
          branchId: v.branchId, deptId: v.deptId, perms: perms, active: activeEl ? activeEl.checked : true
        });
        if (isNew) {
          if ((v.password || '').length < 4) { toast('Password must be at least 4 characters', 'err'); return; }
          out.id = uid('usr'); out.pass = hashPw(v.password); out.createdAt = today();
        } else if (v.password) {
          if (v.password.length < 4) { toast('Password too short', 'err'); return; }
          out.pass = hashPw(v.password);
        }
        upsert('users', out); m.close(); toast('User saved'); Router.render();
      };
    }
  }
});

/* ================= ORGANISATION ================= */
screen('organisation', {
  title: 'Organisation',
  render: function (view) {
    var o = org();
    view.innerHTML = pageHead('Organisation', [{ label: 'Save', cls: 'primary', onClick: saveOrg }], 'Legal identity used on invoices and GST returns') +
      '<div class="card">' + formHtml([
        { k: 'name', label: 'Trade name', required: true, span: 2 },
        { k: 'legalName', label: 'Legal name', span: 2 },
        { k: 'gstin', label: 'GSTIN' },
        { k: 'pan', label: 'PAN' },
        { k: 'stateCode', label: 'State', type: 'select', options: function () { return STATES; }, required: true },
        { k: 'phone', label: 'Phone', type: 'tel' },
        { k: 'email', label: 'Email', type: 'email' },
        { k: 'website', label: 'Website' },
        { k: 'address', label: 'Registered address', type: 'textarea', span: 2, rows: 3 },
        { k: 'defaultMakeId', label: 'Default make for the dealership', type: 'select', options: function () { return makeOptions(); }, help: 'Models of this make are picked by default in invoices, quotations and agreements' },
        { k: 'bankName', label: 'Bank name' },
        { k: 'bankAccount', label: 'Account number' },
        { k: 'bankIfsc', label: 'IFSC' },
        { k: 'bankBranch', label: 'Bank branch' },
        { k: 'terms', label: 'Invoice terms', type: 'textarea', span: 2, rows: 2 }
      ], o) + '</div>';
    function saveOrg() {
      var v = readForm(document.getElementById('view'), [
        { k: 'name' }, { k: 'legalName' }, { k: 'gstin' }, { k: 'pan' }, { k: 'stateCode' }, { k: 'phone' },
        { k: 'email' }, { k: 'website' }, { k: 'address' }, { k: 'defaultMakeId' }, { k: 'bankName' }, { k: 'bankAccount' },
        { k: 'bankIfsc' }, { k: 'bankBranch' }, { k: 'terms' }
      ]);
      if (!v.name) { toast('Trade name is required', 'err'); return; }
      S.meta.org = Object.assign({}, o, v, { gstin: (v.gstin || '').toUpperCase(), pan: (v.pan || '').toUpperCase() });
      save(true); Shell.refreshDrawer(); toast('Organisation updated'); Router.render();
    }
  }
});

/* ================= SETTINGS ================= */
screen('settings', {
  title: 'App Settings',
  render: function (view) {
    var st = settings();
    view.innerHTML = pageHead('App Settings', [{ label: 'Save', cls: 'primary', onClick: doSave }], 'Numbering, defaults and data tools') +
      '<div class="card"><h3>Document numbering</h3>' + formHtml([
        { k: 'invoicePrefix', label: 'Invoice' }, { k: 'quotePrefix', label: 'Quotation' },
        { k: 'purchasePrefix', label: 'Purchase bill' }, { k: 'jobPrefix', label: 'Job card' },
        { k: 'cnPrefix', label: 'Credit note' }, { k: 'dnPrefix', label: 'Debit note' },
        { k: 'payPrefix', label: 'Receipt' }, { k: 'finPrefix', label: 'Financer invoice' }
      ], st) + '<div class="note">Numbers are generated as PREFIX/FY/0001 and reset each financial year.</div></div>' +
      '<div class="card"><h3>Defaults</h3>' + formHtml([
        { k: 'defaultGst', label: 'Default GST %', type: 'number' },
        { k: 'lowStock', label: 'Low stock alert at', type: 'number' }
      ], st) + '</div>' +
      '<div class="card"><h3>Opening balances</h3>' +
      '<label class="fld"><span>Cash in hand at start</span><input type="number" id="cashOpen" value="' + num(st.cashOpening || 0) + '"></label>' +
      '<div class="note">Used as the opening line of the cashbook. Party-wise opening balances are set on each party.</div></div>' +
      '<div class="card"><h3>Backup</h3><p class="tiny muted">Take a backup after entering data — it restores everything, including users and permissions.</p>' +
      '<button class="btn block" id="bGoBackup" style="margin-top:10px">Backup / export data</button></div>';
    function doSave() {
      var v = readForm(document.getElementById('view'), [
        { k: 'invoicePrefix' }, { k: 'quotePrefix' }, { k: 'purchasePrefix' }, { k: 'jobPrefix' },
        { k: 'cnPrefix' }, { k: 'dnPrefix' }, { k: 'payPrefix' }, { k: 'finPrefix' },
        { k: 'defaultGst', type: 'number' }, { k: 'lowStock', type: 'number' }
      ]);
      S.meta.settings = Object.assign({}, st, v);
      var co = document.getElementById('cashOpen');
      if (co) S.meta.settings.cashOpening = num(co.value);
      save(true); toast('Settings saved');
    }
    document.getElementById('bGoBackup').onclick = function () {
      var data = JSON.stringify(S);
      var name = 'tractor-erp-backup-' + today() + '.json';
      if (window.AppBridge && window.AppBridge.saveFile) window.AppBridge.saveFile(name, data);
      else {
        var blob = new Blob([data], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
      }
      toast('Backup saved');
    };
  }
});

/* ================= BROKER MASTER ================= */
screen('brokers', {
  title: 'Broker Master',
  render: function (view, params) {
    var q = params.q || '';
    var list = brokerList().filter(function (b) {
      if (!q) return true;
      return (b.name + ' ' + (b.phone || '') + ' ' + (b.area || '')).toLowerCase().indexOf(q.toLowerCase()) > -1;
    });
    var month = thisMonth();
    var monthInvs = S.invoices.filter(function (i) { return i.docType !== 'financer' && String(i.date).slice(0, 7) === month; });
    var commissionDue = 0;
    brokerList().forEach(function (b) {
      monthInvs.filter(function (i) { return i.brokerId === b.id; }).forEach(function (i) {
        commissionDue += num(i.brokerCommission) || num(b.commissionAmount);
      });
    });

    var h = pageHead('Broker Master', [{ label: 'Add broker', icon: 'plus', cls: 'primary', onClick: function () { open(null); } }],
      list.length + ' brokers · ' + inr(commissionDue) + ' commission this month');
    h += '<div class="searchbar"><input id="q" placeholder="Search broker name, phone, area…" value="' + esc(q) + '"></div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No brokers yet. Add the commission agents who bring you buyers.</div>';
    else h += sortBy(list, 'name').map(function (b) {
      var invs = S.invoices.filter(function (i) { return i.brokerId === b.id && i.docType !== 'financer'; });
      var business = sum(invs, 'taxable');
      var comm = sum(invs, function (i) { return num(i.brokerCommission) || num(b.commissionAmount); });
      var id = 'bk' + b.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { open(b); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(b.name) + '</div>' +
        '<div class="rc-sub">' + esc(b.phone || '') + (b.area ? ' · ' + esc(b.area) : '') + ' · ' + inr(b.commissionAmount) + ' per deal · ' +
        invs.length + ' deals</div></div>' +
        '<div class="rc-right">' + inr(comm) + '<small>on ' + inr(business) + '</small></div></div>';
    }).join('');
    h += '</div>';
    h += '<div class="card"><h3>How broker commission works</h3><div class="tiny muted">Pick the broker on an invoice; commission is calculated at their default rate, or override it on the invoice. Payments to a broker are recorded under Payments Out, so the ledger and cashbook stay correct.</div></div>';
    view.innerHTML = h;

    var inp = document.getElementById('q');
    inp.oninput = function () { clearTimeout(inp._t); inp._t = setTimeout(function () { Router.go('brokers', { q: inp.value }); }, 300); };

    function open(b) {
      editEntity({
        title: b ? 'Edit broker' : 'New broker',
        wide: true, rec: b,
        defaults: { type: 'broker', commissionAmount: 0, stateCode: org().stateCode, branchId: (S.branches[0] || {}).id, openingBal: 0 },
        fields: [
          { k: 'name', label: 'Broker name', required: true, span: 2 },
          { k: 'phone', label: 'Phone', type: 'tel' },
          { k: 'area', label: 'Area / villages covered' },
          { k: 'commissionAmount', label: 'Commission per deal', type: 'number', step: '0.01', def: 0 },
          { k: 'gstin', label: 'GSTIN (if registered)' },
          { k: 'pan', label: 'PAN' },
          { k: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
          { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions },
          { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Currently working with us' }
        ],
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v, { type: 'broker' });
          if (!old) rec.id = uid('par');
          upsert('parties', rec); toast('Broker saved'); Router.render();
        },
        onDelete: function (rec) {
          var used = S.invoices.some(function (i) { return i.brokerId === rec.id; });
          if (used) { toast('Broker is used on invoices — deactivate instead', 'err'); return; }
          removeRec('parties', rec.id); toast('Deleted'); Router.render();
        }
      });
    }
  }
});

/* ================= GST SLAB MASTER ================= */
screen('gstslabs', {
  title: 'GST Slabs',
  render: function (view) {
    var slabs = sortBy(gstSlabs(), 'rate');
    var h = pageHead('GST Slabs Master', [{ label: 'Add slab', icon: 'plus', cls: 'primary', onClick: function () { open(null); } }],
      'These rates appear in every item, invoice and note');
    h += '<div class="card tight">';
    h += slabs.map(function (sl) {
      var used = S.items.filter(function (i) { return num(i.gstRate) === num(sl.rate); }).length;
      var id = 'gs' + sl.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { open(sl); };
      }, 0);
      var desc = slabDesc(sl);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + num(sl.rate) + '% ' +
        (sl.active === false ? badge('off', 'grey') : '') + '</div>' +
        '<div class="rc-sub">' + esc(desc || 'No description') + ' · ' + used + ' item(s)</div></div>' +
        '<div class="rc-right">' + (sl.active === false ? '' : badge('active', 'green')) + '</div></div>';
    }).join('');
    h += '</div>';
    h += '<div class="card"><h3>How slabs are used</h3><div class="tiny muted">' +
      'Every GST dropdown in the app reads this list — items, invoice lines, credit and debit notes. Change a rate or add a slab here and it is available everywhere immediately. Slabs marked inactive stay on old documents but cannot be picked for new entries.</div>' +
      '<div class="note">Tractors (HSN 8701) are normally 12%. Some implements moved to 5%. Confirm your rates with your CA before filing.</div></div>';
    view.innerHTML = h;

    function open(sl) {
      editEntity({
        title: sl ? 'Edit GST slab' : 'New GST slab',
        wide: true, rec: sl,
        defaults: { rate: 18, active: true },
        fields: [
          { k: 'rate', label: 'Rate %', type: 'number', step: '0.01', required: true },
          { k: 'label', label: 'Description', span: 2, placeholder: 'e.g. Tractors (HSN 8701)', help: 'The rate is shown automatically — just describe what it applies to' },
          { k: 'active', label: 'Available for selection', type: 'checkbox', def: true, help: 'Show this slab in dropdowns' }
        ],
        validate: function (v, old) {
          var dup = gstSlabs().find(function (x) { return num(x.rate) === num(v.rate) && (!old || x.id !== old.id); });
          return dup ? 'That rate already exists' : null;
        },
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v, { rate: num(v.rate) });
          if (!old) rec.id = uid('gsl');
          upsert('gstSlabs', rec); toast('GST slab saved'); Router.render();
        },
        onDelete: function (rec) {
          var used = S.items.some(function (i) { return num(i.gstRate) === num(rec.rate); });
          if (used) { toast('Slab is used by items — deactivate it instead', 'err'); return; }
          removeRec('gstSlabs', rec.id); toast('Deleted'); Router.render();
        }
      });
    }
  }
});

/* ================= UNIT MASTER (UOM) ================= */
screen('uom', {
  title: 'Unit Master',
  render: function (view) {
    var list = sortBy(uomList(), 'name');
    var cols = [
      { k: 'name', label: 'Unit' }, { k: 'label', label: 'Description' },
      { k: 'decimals', label: 'Decimals' }, { k: 'used', label: 'Items using it' },
      { k: 'active', label: 'Active' }
    ];
    var exportRows = list.map(function (u) {
      return {
        name: u.name, label: u.label || '', decimals: num(u.decimals),
        used: S.items.filter(function (i) { return i.uom === u.name; }).length,
        active: u.active === false ? 'No' : 'Yes'
      };
    });

    var h = pageHead('Unit Master', [
      Export.action('Unit Master', function () { return cols; }, function () { return exportRows; }),
      { label: 'Add unit', icon: 'plus', cls: 'primary', onClick: function () { open(null); } }
    ], list.length + ' units of measure');
    h += '<div class="card tight">';
    h += list.map(function (u) {
      var used = S.items.filter(function (i) { return i.uom === u.name; }).length;
      var id = 'um' + u.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { open(u); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(u.name) +
        ' ' + (u.active === false ? badge('inactive', 'grey') : '') + '</div>' +
        '<div class="rc-sub">' + esc(u.label || '') + ' · ' + (num(u.decimals) ? num(u.decimals) + ' decimals' : 'whole numbers') +
        ' · ' + used + ' item(s)</div></div>' +
        '<div class="rc-right">' + esc(u.name) + '</div></div>';
    }).join('');
    h += '</div>';
    h += '<div class="card"><h3>How units are used</h3><div class="tiny muted">' +
      'Every UOM dropdown in the item master reads this list. Set "decimals" to 2 for litres, kilograms or metres so quantities keep paise-level accuracy, ' +
      'or 0 for pieces, sets and numbers. A unit already used by an item cannot be deleted — deactivate it instead so old items keep their unit.</div></div>';
    view.innerHTML = h;

    function open(u) {
      editEntity({
        title: u ? 'Edit unit' : 'New unit',
        wide: true, rec: u,
        defaults: { decimals: 0, active: true },
        fields: [
          { k: 'name', label: 'Unit code', required: true, placeholder: 'e.g. BAG', help: 'Short code shown on documents' },
          { k: 'label', label: 'Description', placeholder: 'e.g. Bags' },
          { k: 'decimals', label: 'Decimals', type: 'select', options: [['0', '0 — whole numbers'], ['2', '2 — litres / kg / metres']], def: '0' },
          { k: 'active', label: 'Available for selection', type: 'checkbox', def: true, help: 'Show this unit in dropdowns' }
        ],
        validate: function (v, old) {
          var dup = uomList().find(function (x) {
            return String(x.name).toUpperCase() === String(v.name).toUpperCase() && (!old || x.id !== old.id);
          });
          return dup ? 'That unit code already exists' : null;
        },
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v);
          rec.name = String(v.name).toUpperCase().trim();
          rec.decimals = num(v.decimals);
          if (!old) rec.id = uid('uom');
          upsert('uoms', rec);
          toast('Unit saved');
          Router.render();
        },
        onDelete: function (rec) {
          if (S.items.some(function (i) { return i.uom === rec.name; })) {
            toast('Unit is used by items — deactivate it instead', 'err');
            return;
          }
          removeRec('uoms', rec.id); toast('Deleted'); Router.render();
        }
      });
    }
  }
});
