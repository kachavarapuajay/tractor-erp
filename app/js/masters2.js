/* ============================================================
   masters2.js — make/model, locations, financer, transport,
   bank accounts
   ============================================================ */

/* ================= MAKE / MODEL MASTER ================= */
var MAKE_CATS = [['tractor', 'Tractors'], ['implement', 'Implements'], ['accessory', 'Accessories']];

screen('makes', {
  title: 'Make / Model Master',
  render: function (view, params) {
    var cat = params.cat || 'tractor';
    var catName = (MAKE_CATS.find(function (c) { return c[0] === cat; }) || ['', 'Tractors'])[1];
    var makes = sortBy(S.makes.filter(function (m) { return (m.category || 'tractor') === cat; }), 'name');
    var models = sortBy(S.models.filter(function (md) {
      var mk = S.makes.find(function (m) { return m.id === md.makeId; });
      return mk && (mk.category || 'tractor') === cat;
    }), 'name');

    var h = pageHead('Make / Model Master', [
      { label: 'Add make', icon: 'plus', onClick: function () { makeForm(); } },
      { label: 'Add model', icon: 'plus', cls: 'primary', onClick: function () { modelForm(); } }
    ], catName + ' · ' + makes.length + ' makes · ' + models.length + ' models');

    h += '<div class="tabs">' + MAKE_CATS.map(function (c) {
      return '<button class="tab ' + (cat === c[0] ? 'on' : '') + '" data-cat="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</div>';

    h += '<div class="card tight"><h3 style="padding:12px 14px 0">Makes — ' + esc(catName) + '</h3>';
    if (!makes.length) h += '<div class="empty small">No makes yet for ' + esc(catName.toLowerCase()) + '.</div>';
    else h += makes.map(function (mk) {
      var n = S.models.filter(function (x) { return x.makeId === mk.id; }).length;
      var id = 'mk' + mk.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { makeForm(mk); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(mk.name) +
        (mk.active === false ? ' ' + badge('inactive', 'grey') : '') + '</div>' +
        '<div class="rc-sub">' + n + ' model(s)</div></div><div class="rc-right">' + n + '</div></div>';
    }).join('');
    h += '</div>';

    h += '<div class="card tight"><h3 style="padding:12px 14px 0">Models — ' + esc(catName) + '</h3>';
    if (!models.length) h += '<div class="empty small">No models yet. Add models under each make.</div>';
    else h += models.map(function (md) {
      var used = S.items.filter(function (i) { return i.modelId === md.id; }).length;
      var id = 'md' + md.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { modelForm(md); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(md.name) + '</div>' +
        '<div class="rc-sub">' + esc(makeName(md.makeId)) + (md.hp ? ' · ' + md.hp + ' HP' : '') + ' · ' + used + ' item(s)</div></div>' +
        '<div class="rc-right">' + (md.active === false ? badge('off', 'grey') : '') + '</div></div>';
    }).join('');
    h += '</div>';

    h += '<div class="card"><h3>Separate masters per category</h3><div class="tiny muted">' +
      'Tractors, implements and accessories each keep their own makes and models, so a Mahindra tractor never appears in the implement picker. ' +
      'The item master shows only the makes that match the item category.</div></div>';
    view.innerHTML = h;

    qsa('[data-cat]', view).forEach(function (b) { b.onclick = function () { Router.go('makes', { cat: b.getAttribute('data-cat') }); }; });

    function makeForm(mk) {
      editEntity({
        title: mk ? 'Edit make' : 'New make — ' + catName,
        rec: mk,
        defaults: { category: cat, active: true },
        fields: [
          { k: 'name', label: 'Make / brand name', required: true, span: 2 },
          { k: 'category', label: 'Category', type: 'select', options: MAKE_CATS, required: true, def: cat },
          { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Show in dropdowns' }
        ],
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v);
          if (!old) rec.id = uid('mak');
          upsert('makes', rec); toast('Saved');
          Router.go('makes', { cat: rec.category || cat });
        },
        onDelete: function (rec) {
          if (S.models.some(function (m) { return m.makeId === rec.id; })) { toast('Delete its models first', 'err'); return; }
          removeRec('makes', rec.id); Router.render();
        }
      });
    }

    function modelForm(md) {
      editEntity({
        title: md ? 'Edit model' : 'New model — ' + catName,
        wide: true, rec: md,
        defaults: { active: true, category: cat },
        fields: [
          { k: 'makeId', label: 'Make', type: 'select', required: true, options: function () { return makeOptions(cat); } },
          { k: 'name', label: 'Model name', required: true },
          { k: 'hp', label: 'HP', type: 'number' },
          { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Show in dropdowns' }
        ],
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v);
          if (!old) rec.id = uid('mdl');
          upsert('models', rec); toast('Saved'); Router.render();
        },
        onDelete: function (rec) { removeRec('models', rec.id); Router.render(); }
      });
    }
  }
});

/* ================= LOCATION MASTERS ================= */
screen('locations', {
  title: 'Mandal / Village / State',
  render: function (view, params) {
    var tab = params.tab || 'villages';
    if (!S.districts) S.districts = [];
    var counts = S.villages.length + ' villages · ' + S.mandals.length + ' mandals · ' +
      S.districts.length + ' districts · ' + stateList().length + ' states';

    var h = pageHead('Location Masters', [{ label: 'Add', icon: 'plus', cls: 'primary', onClick: function () { add(); } }], counts);
    h += '<div class="tabs">' + [['villages', 'Villages'], ['mandals', 'Mandals'], ['districts', 'Districts'], ['states', 'States']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    if (tab === 'villages') {
      h += '<div class="card tight">';
      if (!S.villages.length) h += '<div class="empty small">Add the villages your customers come from — useful for leads and delivery.</div>';
      else h += sortBy(S.villages, 'name').map(function (v) {
        var cust = S.parties.filter(function (p) { return p.villageId === v.id; }).length;
        var md = S.mandals.find(function (x) { return x.id === v.mandalId; }) || {};
        var dist = districtName(md.districtId) || md.district || '';
        var id = 'vl' + v.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { edit('villages', v, villageFields()); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(v.name) + '</div>' +
          '<div class="rc-sub">' + [md.name, dist, v.pincode].filter(Boolean).map(esc).join(' · ') +
          ' · ' + cust + ' customer(s)</div></div><div class="rc-right"></div></div>';
      }).join('');
      h += '</div>';
    } else if (tab === 'mandals') {
      h += '<div class="card tight">';
      if (!S.mandals.length) h += '<div class="empty small">Add mandals / tehsils under a district.</div>';
      else h += sortBy(S.mandals, 'name').map(function (md) {
        var vills = S.villages.filter(function (v) { return v.mandalId === md.id; }).length;
        var dist = districtName(md.districtId) || md.district || '';
        var id = 'mn' + md.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { edit('mandals', md, mandalFields()); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(md.name) + '</div>' +
          '<div class="rc-sub">' + esc(dist || 'No district') + ' · ' + esc(stateName(md.stateCode) || '') +
          ' · ' + vills + ' village(s)</div></div><div class="rc-right"></div></div>';
      }).join('');
      h += '</div>';
    } else if (tab === 'districts') {
      h += '<div class="card tight">';
      if (!S.districts.length) h += '<div class="empty small">Add districts — each mandal belongs to one district.</div>';
      else h += sortBy(S.districts, 'name').map(function (d) {
        var mds = S.mandals.filter(function (m) { return m.districtId === d.id; });
        var vills = S.villages.filter(function (v) { return mds.some(function (m) { return m.id === v.mandalId; }); }).length;
        var id = 'ds' + d.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { edit('districts', d, districtFields()); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(d.name) +
          (d.active === false ? ' ' + badge('inactive', 'grey') : '') + '</div>' +
          '<div class="rc-sub">' + esc(stateName(d.stateCode) || '—') + ' · ' + mds.length + ' mandal(s) · ' +
          vills + ' village(s)</div></div><div class="rc-right"></div></div>';
      }).join('');
      h += '</div>';
      h += '<div class="card"><h3>Location hierarchy</h3><div class="tiny muted">State → District → Mandal → Village. ' +
        'Parties are tagged to a village and mandal, and every mandal now rolls up to its district for reports and delivery routing.</div></div>';
    } else {
      h += '<div class="card tight">';
      h += sortBy(stateList(), 'name').map(function (st) {
        var id = 'st' + st.code;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { edit('states', st, stateFields()); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(st.name) + '</div>' +
          '<div class="rc-sub">State code ' + esc(st.code) + ' · ' +
          S.districts.filter(function (d) { return d.stateCode === st.code; }).length + ' district(s)</div></div>' +
          '<div class="rc-right">' + (st.active === false ? badge('off', 'grey') : badge('active', 'green')) + '</div></div>';
      }).join('');
      h += '</div>';
    }
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('locations', { tab: b.getAttribute('data-tab') }); }; });

    function villageFields() {
      return [
        { k: 'name', label: 'Village name', required: true, span: 2 },
        { k: 'mandalId', label: 'Mandal', type: 'select', options: mandalOptions },
        { k: 'pincode', label: 'PIN code' }
      ];
    }
    function mandalFields() {
      return [
        { k: 'name', label: 'Mandal name', required: true, span: 2 },
        { k: 'districtId', label: 'District', type: 'select', required: true, options: function () { return districtOptions(); } },
        { k: 'stateCode', label: 'State', type: 'select', options: stateOptions }
      ];
    }
    function districtFields() {
      return [
        { k: 'name', label: 'District name', required: true, span: 2 },
        { k: 'stateCode', label: 'State', type: 'select', required: true, options: stateOptions },
        { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Available for selection' }
      ];
    }
    function stateFields() {
      return [
        { k: 'name', label: 'State name', required: true, span: 2 },
        { k: 'code', label: 'State code (GST)', required: true },
        { k: 'active', label: 'Active', type: 'checkbox', help: 'Available for selection' }
      ];
    }
    function add() {
      if (tab === 'villages') {
        if (!S.mandals.length) { toast('Add a mandal first', 'err'); return; }
        edit('villages', null, villageFields());
      } else if (tab === 'mandals') {
        if (!S.districts.length) { toast('Add a district first', 'err'); return; }
        edit('mandals', null, mandalFields());
      } else if (tab === 'districts') edit('districts', null, districtFields());
      else edit('states', null, stateFields());
    }
    function edit(collName, rec, fields) {
      editEntity({
        title: (rec ? 'Edit ' : 'New ') + (collName === 'villages' ? 'village' : collName === 'mandals' ? 'mandal'
          : collName === 'districts' ? 'district' : 'state'),
        rec: rec, fields: fields, wide: true,
        defaults: { stateCode: org().stateCode, active: true },
        onSave: function (v, old) {
          var out = Object.assign({}, old || {}, v);
          if (!old) out.id = uid(collName.slice(0, 3));
          if (collName === 'mandals' && out.districtId) {
            var d = S.districts.find(function (x) { return x.id === out.districtId; });
            if (d) { out.district = d.name; out.stateCode = d.stateCode || out.stateCode; }
          }
          upsert(collName, out); toast('Saved'); Router.render();
        },
        onDelete: function (r) {
          if (collName === 'districts' && S.mandals.some(function (m) { return m.districtId === r.id; })) {
            toast('District has mandals — move or delete them first', 'err'); return;
          }
          if (collName === 'mandals' && S.villages.some(function (v) { return v.mandalId === r.id; })) {
            toast('Mandal has villages — move or delete them first', 'err'); return;
          }
          removeRec(collName, r.id); toast('Deleted'); Router.render();
        }
      });
    }
  }
});

/* ================= FINANCER MASTER ================= */
screen('financers', {
  title: 'Financer Master',
  render: function (view) {
    var list = sortBy(S.parties.filter(function (p) { return p.type === 'financer'; }), 'name');
    var h = pageHead('Financer Master', [{ label: 'Add financer', icon: 'plus', cls: 'primary', onClick: function () { open(null); } }],
      list.length + ' banks / NBFCs');
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">Add the banks and NBFCs that finance your tractors.</div>';
    else h += list.map(function (f) {
      var deals = S.invoices.filter(function (i) { return i.financerId === f.id || (i.docType === 'financer' && i.partyId === f.id); });
      var val = sum(deals, 'total');
      var id = 'fn' + f.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { open(f); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(f.name) + '</div>' +
        '<div class="rc-sub">' + esc(f.contact || '') + (f.phone ? ' · ' + esc(f.phone) : '') +
        (num(f.interestRate) ? ' · ' + num(f.interestRate) + '% p.a.' : '') +
        (num(f.maxMargin) ? ' · up to ' + num(f.maxMargin) + '% margin' : '') + '</div></div>' +
        '<div class="rc-right">' + inr(val) + '<small>' + deals.length + ' deals</small></div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;

    function open(f) {
      editEntity({
        title: f ? 'Edit financer' : 'New financer',
        wide: true, rec: f,
        defaults: { type: 'financer', stateCode: org().stateCode, branchId: (S.branches[0] || {}).id, openingBal: 0 },
        fields: [
          { k: 'name', label: 'Bank / NBFC name', required: true, span: 2 },
          { k: 'contact', label: 'Relationship manager' },
          { k: 'phone', label: 'Phone', type: 'tel' },
          { k: 'email', label: 'Email', type: 'email' },
          { k: 'branchName', label: 'Bank branch' },
          { k: 'gstin', label: 'GSTIN' },
          { k: 'interestRate', label: 'Interest rate % p.a.', type: 'number', step: '0.01' },
          { k: 'maxMargin', label: 'Max margin money %', type: 'number', step: '0.01' },
          { k: 'maxTenure', label: 'Max tenure (months)', type: 'number' },
          { k: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
          { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Shown in dropdowns' }
        ],
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v, { type: 'financer' });
          if (!old) rec.id = uid('par');
          upsert('parties', rec); toast('Financer saved'); Router.render();
        },
        onDelete: function (rec) {
          var used = S.invoices.some(function (i) { return i.financerId === rec.id; });
          if (used) { toast('Financer is used on documents — deactivate instead', 'err'); return; }
          removeRec('parties', rec.id); Router.render();
        }
      });
    }
  }
});

/* ================= TRANSPORT MASTER ================= */
screen('transporters', {
  title: 'Transport Master',
  render: function (view) {
    var list = sortBy(S.transporters, 'name');
    var h = pageHead('Transport Master', [{ label: 'Add transporter', icon: 'plus', cls: 'primary', onClick: function () { open(null); } }],
      list.length + ' transporters · ledger under Accounts');
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">Add the transporters and vehicles you use for tractor delivery.</div>';
    else h += list.map(function (t) {
      var entries = S.transports.filter(function (x) { return x.transporterId === t.id; });
      var freight = sum(entries, 'freight');
      var id = 'tp' + t.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { open(t); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(t.name) + ' ' +
        (t.active === false ? badge('inactive', 'grey') : '') + '</div>' +
        '<div class="rc-sub">' + esc(t.phone || '') + (t.vehicleNo ? ' · ' + esc(t.vehicleNo) : '') +
        (t.gstin ? ' · ' + esc(t.gstin) : '') + ' · ' + entries.length + ' trips</div></div>' +
        '<div class="rc-right">' + inr(freight) + '<small>freight</small></div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;

    function open(t) {
      editEntity({
        title: t ? 'Edit transporter' : 'New transporter',
        wide: true, rec: t, defaults: { active: true, ratePerTrip: 0 },
        fields: [
          { k: 'name', label: 'Transporter name', required: true, span: 2 },
          { k: 'phone', label: 'Phone', type: 'tel' },
          { k: 'vehicleNo', label: 'Usual vehicle no.' },
          { k: 'gstin', label: 'GSTIN' },
          { k: 'ratePerTrip', label: 'Rate per trip', type: 'number', step: '0.01' },
          { k: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
          { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Shown in dropdowns' }
        ],
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v);
          if (!old) rec.id = uid('trn');
          upsert('transporters', rec); toast('Saved'); Router.render();
        },
        onDelete: function (rec) {
          if (S.transports.some(function (x) { return x.transporterId === rec.id; })) { toast('Transporter has ledger entries — deactivate instead', 'err'); return; }
          removeRec('transporters', rec.id); Router.render();
        }
      });
    }
  }
});

/* ================= BANK ACCOUNTS ================= */
screen('bankaccounts', {
  title: 'Bank Accounts',
  render: function (view) {
    var list = sortBy(S.bankAccounts, 'name');
    var h = pageHead('Bank Accounts', [{ label: 'Add account', icon: 'plus', cls: 'primary', onClick: function () { open(null); } }],
      'Opening balances feed the Bank Book');
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">Add your current and OD accounts — every bank receipt and payment is booked against one.</div>';
    else h += list.map(function (b) {
      var bal = bankBalance(b.id);
      var id = 'ba' + b.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { open(b); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(b.name) + '</div>' +
        '<div class="rc-sub">' + esc(b.bankName || '') + ' · A/c ' + esc(b.accountNo || '—') + ' · ' + esc(b.ifsc || '') + '</div></div>' +
        '<div class="rc-right">' + inr(bal) + '<small>' + esc(b.type || 'current') + '</small></div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;

    function open(b) {
      editEntity({
        title: b ? 'Edit bank account' : 'New bank account',
        wide: true, rec: b, defaults: { type: 'current', openingBal: 0 },
        fields: [
          { k: 'name', label: 'Display name', required: true, span: 2, placeholder: 'e.g. HDFC Current — HO' },
          { k: 'bankName', label: 'Bank' },
          { k: 'accountNo', label: 'Account number' },
          { k: 'ifsc', label: 'IFSC' },
          { k: 'branch', label: 'Branch' },
          { k: 'type', label: 'Type', type: 'select', options: [['current', 'Current'], ['savings', 'Savings'], ['od', 'Overdraft'], ['cc', 'Cash credit']] },
          { k: 'openingBal', label: 'Opening balance', type: 'number', step: '0.01' }
        ],
        onSave: function (v, old) {
          var rec = Object.assign({}, old || {}, v);
          if (!old) rec.id = uid('bnk');
          upsert('bankAccounts', rec); toast('Saved'); Router.render();
        },
        onDelete: function (rec) { removeRec('bankAccounts', rec.id); Router.render(); }
      });
    }
  }
});

/* balance of one bank account from every cash movement tagged to it */
function bankEntries(bankId, from, to) {
  var out = [];
  S.payments.forEach(function (p) {
    if (p.bankAccountId !== bankId && !(bankId === 'all' && p.mode !== 'cash' && p.mode !== 'petty')) return;
    if (from && !inRange(p.date, from, to)) return;
    out.push({
      date: p.date, particulars: (p.type === 'in' ? 'Received from ' : 'Paid to ') + partyName(p.partyId),
      ref: p.refDocNo || p.refNo || '', mode: p.mode,
      inAmt: p.type === 'in' ? num(p.amount) : 0, outAmt: p.type === 'out' ? num(p.amount) : 0
    });
  });
  S.expenses.forEach(function (e) {
    if (e.bankAccountId !== bankId && !(bankId === 'all' && e.mode && e.mode !== 'cash')) return;
    if (from && !inRange(e.date, from, to)) return;
    out.push({ date: e.date, particulars: 'Expense: ' + (e.particulars || e.head), ref: '', mode: e.mode, inAmt: 0, outAmt: num(e.amount) });
  });
  S.marginReceipts.forEach(function (m) {
    if (m.bankAccountId !== bankId && !(bankId === 'all' && m.mode && m.mode !== 'cash')) return;
    if (from && !inRange(m.date, from, to)) return;
    out.push({ date: m.date, particulars: 'Margin money — ' + partyName(m.partyId), ref: m.no, mode: m.mode, inAmt: num(m.amount), outAmt: 0 });
  });
  return sortBy(out, 'date');
}
function bankBalance(bankId) {
  var b = bankAccount(bankId);
  var opening = num(b.openingBal);
  var rows = bankEntries(bankId);
  return r2(opening + sum(rows, 'inAmt') - sum(rows, 'outAmt'));
}

/* ================= FINANCIAL YEAR CLOSING ================= */
screen('fyclose', {
  title: 'FY Closing',
  render: function (view, params) {
    var fy = params.fy || fyOf(today());
    var fr = fyRange(fy);
    var invs = S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, fr.from, fr.to); });
    var purs = S.purchases.filter(function (p) { return inRange(p.date, fr.from, fr.to); });
    var exps = S.expenses.filter(function (e) { return inRange(e.date, fr.from, fr.to); });
    var recv = sum(salesInvoices(), function (i) { return invoiceOutstanding(i); });
    var pay = sum(S.purchases, function (p) { return purchaseOutstanding(p); });
    var closings = (S.meta.fyClosings || []);

    var h = pageHead('Financial Year Closing', [], 'Close the books and start a fresh series');
    h += '<div class="searchbar"><select id="fySel" style="border:1px solid #d6dee6;border-radius:12px;padding:10px;background:#fff">' +
      ['2024-25', '2025-26', '2026-27', '2027-28'].map(function (y) {
        return '<option value="' + y + '"' + (fy === y ? ' selected' : '') + '>' + y + '</option>';
      }).join('') + '</select></div>';

    h += '<div class="stats">' + statCard('Sales', inr(sum(invs, 'taxable')), invs.length + ' invoices', 'green') +
      statCard('Purchases', inr(sum(purs, 'taxable')), purs.length + ' bills', 'blue') +
      statCard('Expenses', inr(sum(exps, 'amount')), 'booked', 'red') +
      statCard('Receivable', inr(recv), 'to carry forward', 'amber') + '</div>';

    h += '<div class="card"><h3>FY ' + esc(fy) + ' · ' + dmy(fr.from) + ' to ' + dmy(fr.to) + '</h3>' +
      '<div class="kv"><span>Invoices</span><span>' + invs.length + '</span></div>' +
      '<div class="kv"><span>Purchase bills</span><span>' + purs.length + '</span></div>' +
      '<div class="kv"><span>Receivable</span><span>' + inr(recv) + '</span></div>' +
      '<div class="kv"><span>Payable</span><span>' + inr(pay) + '</span></div>' +
      '<div class="kv"><span>Cash in hand</span><span>' + inr(num(settings().cashOpening || 0)) + '</span></div>' +
      '<div class="kv"><span>Bank balance</span><span>' + inr(sum(S.bankAccounts, function (b) { return bankBalance(b.id); })) + '</span></div></div>';

    h += '<div class="card"><h3>Closing actions</h3>' +
      '<button class="btn block" id="bCarry">Carry forward opening balances</button>' +
      '<div class="tiny muted" style="margin:6px 0 12px">Sets each party, cash and bank opening balance to its closing figure so the new year starts clean.</div>' +
      '<button class="btn block" id="bSeries">Start fresh document series</button>' +
      '<div class="tiny muted" style="margin:6px 0 12px">Resets invoice, quotation, purchase, job card and receipt numbers to 001 for this financial year.</div>' +
      '<button class="btn primary block" id="bClose">Close FY ' + esc(fy) + '</button></div>';

    h += '<div class="card"><h3>How numbering works</h3><div class="tiny muted">' +
      'Document numbers already include the financial year (INV/26/001). A new financial year starts its own series automatically on 1 April — ' +
      'the reset button is for firms that close early or restart mid-year.</div></div>';

    if (closings.length) {
      h += '<div class="card"><h3>Closure log</h3>' + closings.slice().reverse().map(function (c) {
        return '<div class="kv"><span>' + esc(c.fy) + ' · closed ' + dmy(c.on) + '</span><span>' + esc(c.by || '') + '</span></div>';
      }).join('') + '</div>';
    }
    view.innerHTML = h;

    document.getElementById('fySel').onchange = function () { Router.go('fyclose', { fy: this.value }); };

    document.getElementById('bCarry').onclick = function () {
      confirmDlg('Carry forward closing balances as the new opening balances?', function () {
        S.parties.forEach(function (p) {
          var b = partyBalance(p.id);
          p.openingBal = Math.abs(b);
          p.openingType = b >= 0 ? 'dr' : 'cr';
        });
        settings().cashOpening = num(settings().cashOpening || 0);
        S.bankAccounts.forEach(function (b) { b.openingBal = bankBalance(b.id); });
        save(true);
        toast('Opening balances carried forward');
        Router.render();
      }, 'Carry forward');
    };

    document.getElementById('bSeries').onclick = function () {
      confirmDlg('Reset all document numbers for FY ' + fy + ' to start from 001?', function () {
        Object.keys(S.counters).forEach(function (k) {
          if (k.indexOf(fy) > -1) delete S.counters[k];
        });
        save(true);
        toast('Series reset for FY ' + fy);
        Router.render();
      }, 'Reset series');
    };

    document.getElementById('bClose').onclick = function () {
      confirmDlg('Close FY ' + fy + '? This records the closure in the log. Nothing is deleted.', function () {
        S.meta.fyClosings = S.meta.fyClosings || [];
        S.meta.fyClosings.push({
          fy: fy, on: today(), by: (me().name || ''),
          sales: sum(invs, 'taxable'), purchases: sum(purs, 'taxable'),
          receivable: recv, payable: pay
        });
        save(true);
        toast('FY ' + fy + ' closed');
        Router.render();
      }, 'Close FY');
    };
  }
});

/* ================= MASTERS HUB ================= */
screen('masters', {
  title: 'Masters',
  render: function (view) {
    var sections = [
      ['Organisation', [
        ['organisation', 'Organisation', 'building', 'Legal identity, GSTIN, bank'],
        ['branches', 'Branches', 'branch', 'Head office and showrooms'],
        ['departments', 'Departments', 'layers', 'Sales, service, accounts'],
        ['users', 'Users & Permissions', 'shield', 'Logins and access']
      ]],
      ['People & Partners', [
        ['parties', 'Customers & Suppliers', 'people', 'KYC, village, credit'],
        ['employees', 'Employees', 'users', 'Aadhaar, PAN, bank, blood group'],
        ['brokers', 'Broker Master', 'coins', 'Commission per deal'],
        ['financers', 'Financer Master', 'building', 'Banks and NBFCs'],
        ['insurers', 'Insurance Companies', 'shield', 'Companies and agents']
      ]],
      ['Products & Stock', [
        ['stockitems', 'Items & Spares', 'box', 'Part no., HSN, serial tracking'],
        ['makes', 'Make / Model', 'tractor', 'Brands and models'],
        ['uom', 'Unit Master', 'box', 'NOS, LTR, KG and more']
      ]],
      ['Locations', [
        ['locations', 'State / District / Mandal / Village', 'layers', 'Full location tree']
      ]],
      ['Finance & Statutory', [
        ['gstslabs', 'GST Slabs', 'layers', 'Rates used everywhere'],
        ['bankaccounts', 'Bank Accounts', 'building', 'Feeds the bank book'],
        ['transporters', 'Transport Master', 'road', 'Vehicles and freight']
      ]]
    ];

    var h = pageHead('Masters', [], 'Every master in one place');
    sections.forEach(function (sec) {
      h += '<div class="card"><h3>' + esc(sec[0]) + '</h3><div class="three">' +
        sec[1].map(function (t) {
          return '<button class="btn" data-go="' + t[0] + '" style="flex-direction:column;height:82px;justify-content:center;gap:4px;padding:8px">' +
            icon(t[2]) + '<span style="font-size:11.5px;line-height:1.2;text-align:center">' + esc(t[1]) + '</span></button>';
        }).join('') + '</div></div>';
    });
    h += '<div class="card"><h3>Notes</h3><div class="tiny muted">' +
      'Masters feed every screen — items, invoices, reports and returns read from here. ' +
      'Anything used by a document cannot be deleted, only deactivated, so history stays intact.</div></div>';
    view.innerHTML = h;
    qsa('[data-go]', view).forEach(function (b) {
      b.onclick = function () { Router.go(b.getAttribute('data-go')); };
    });
  }
});
