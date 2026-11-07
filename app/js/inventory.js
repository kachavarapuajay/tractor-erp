/* ============================================================
   inventory.js — tractor stock (chassis/engine), item stock,
   stock ledger, branch transfers
   ============================================================ */

function tractorItems() { return S.items.filter(function (i) { return i.category === 'tractor'; }); }

screen('stock', {
  title: 'Tractor Stock',
  render: function (view, params) {
    var tab = params.tab || 'units';
    var q = params.q || '';
    var branchF = params.branch || '';
    var unitCols = [
      { k: 'kind', label: 'Type' }, { k: 'ident', label: 'Chassis / serial' }, { k: 'engine', label: 'Engine' },
      { k: 'item', label: 'Item' }, { k: 'branch', label: 'Branch' }, { k: 'status', label: 'Status' },
      { k: 'cost', label: 'Cost' }, { k: 'year', label: 'Year' }
    ];
    var unitRows = S.units.map(function (u) {
      return {
        kind: u.unitKind === 'implement' ? 'Implement' : 'Tractor', ident: u.chassisNo || u.serialNo || '',
        engine: u.engineNo || '', item: itemName(u.itemId), branch: branchName(u.branchId),
        status: u.status || '', cost: num(u.cost), year: u.mfgYear || ''
      };
    });
    var h = pageHead('Inventory', [
      Export.action('Stock Units', function () { return unitCols; }, function () { return unitRows; }),
      { label: 'Add unit', icon: 'plus', cls: 'primary', onClick: function () { unitForm(); } }],
      'Chassis & engine number tracking');

    if (tab === 'units') {
      var units = S.units.filter(function (u) {
        if (u.unitKind === 'implement') return false;
        if (branchF && u.branchId !== branchF) return false;
        if (!q) return true;
        return [u.chassisNo, u.engineNo, u.model, u.colour].join(' ').toLowerCase().indexOf(q.toLowerCase()) > -1;
      });
      var inStock = units.filter(function (u) { return u.status === 'in_stock'; });
      var value = sum(inStock, 'cost');
      h += '<div class="stats">' +
        statCard('In stock', String(inStock.length), 'units available', 'green') +
        statCard('Stock value', inr(value), 'at cost', 'blue') +
        statCard('Sold', String(units.filter(function (u) { return u.status === 'sold'; }).length), 'all time') +
        statCard('Reserved', String(units.filter(function (u) { return u.status === 'reserved'; }).length), 'booked units', 'amber') +
        '</div>';
      h += '<div class="tabs">' + [['units', 'Tractors'], ['implements', 'Implements'], ['items', 'Spares & qty'], ['ledger', 'Ledger']].map(function (t) {
        return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      h += '<div class="searchbar"><input id="q" placeholder="Search chassis no., engine no., model…" value="' + esc(q) + '">' +
        '<select id="bf" style="border:1px solid #d6dee6;border-radius:12px;padding:10px;background:#fff">' +
        '<option value="">All branches</option>' + S.branches.map(function (b) {
          return '<option value="' + b.id + '"' + (branchF === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>';
        }).join('') + '</select></div>';
      h += '<div class="card tight">';
      if (!units.length) h += '<div class="empty small">No tractor units found. Use <b>Add unit</b> or receive a purchase bill.</div>';
      else h += sortBy(units, 'chassisNo').map(function (u) {
        var id = 'un' + u.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { unitDetail(u.id); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(u.chassisNo) +
          ' ' + badge(u.status || 'in_stock', statusTone(u.status)) +
          (u.unitType === 'used' ? ' ' + badge('USED', 'amber') : '') + '</div>' +
          '<div class="rc-sub mono">Eng: ' + esc(u.engineNo) + '</div>' +
          '<div class="rc-sub">' + esc(itemName(u.itemId)) + (u.model ? ' · ' + esc(u.model) : '') +
          (u.colour ? ' · ' + esc(u.colour) : '') + ' · ' + esc(branchName(u.branchId)) + '</div></div>' +
          '<div class="rc-right">' + inr(u.cost) + '<small>' + (u.mfgYear || '') + '</small></div></div>';
      }).join('');
      h += '</div>';
    } else if (tab === 'implements') {
      var impls = S.units.filter(function (u) {
        if (u.unitKind !== 'implement') return false;
        if (branchF && u.branchId !== branchF) return false;
        if (!q) return true;
        return [u.serialNo, u.model, u.colour].join(' ').toLowerCase().indexOf(q.toLowerCase()) > -1;
      });
      var implIn = impls.filter(function (u) { return u.status === 'in_stock'; });
      h += '<div class="stats">' + statCard('In stock', String(implIn.length), 'serialised units', 'green') +
        statCard('Stock value', inr(sum(implIn, 'cost')), 'at cost', 'blue') +
        statCard('Sold', String(impls.filter(function (u) { return u.status === 'sold'; }).length), 'all time') + '</div>';
      h += '<div class="tabs">' + [['units', 'Tractors'], ['implements', 'Implements'], ['items', 'Spares & qty'], ['ledger', 'Ledger']].map(function (t) {
        return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      h += '<div class="searchbar"><input id="q" placeholder="Search serial no., model…" value="' + esc(q) + '"></div>';
      h += '<div class="card tight">';
      if (!impls.length) h += '<div class="empty small">No serialised implements in stock. Mark an item as serial tracked, then receive it through a purchase bill or Add unit.</div>';
      else h += sortBy(impls, 'serialNo').map(function (u) {
        var id = 'im' + u.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { unitDetail(u.id); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(u.serialNo || '(no serial)') +
          ' ' + badge(u.status || 'in_stock', statusTone(u.status)) + '</div>' +
          '<div class="rc-sub">' + esc(itemName(u.itemId)) + (u.model ? ' · ' + esc(u.model) : '') +
          (u.colour ? ' · ' + esc(u.colour) : '') + ' · ' + esc(branchName(u.branchId)) + '</div></div>' +
          '<div class="rc-right">' + inr(u.cost) + '<small>' + (u.mfgYear || '') + '</small></div></div>';
      }).join('');
      h += '</div>';
    } else if (tab === 'items') {
      var items = S.items.filter(function (i) { return i.category !== 'tractor' && i.category !== 'service'; });
      var rows = items.map(function (i) {
        return { i: i, qty: stockQty(i.id, branchF || undefined), val: r2(stockQty(i.id, branchF || undefined) * num(i.purchaseRate || i.saleRate)) };
      }).filter(function (r) { return r.qty !== 0 || !q; });
      h += '<div class="tabs">' + [['units', 'Tractors'], ['implements', 'Implements'], ['items', 'Spares & qty'], ['ledger', 'Ledger']].map(function (t) {
        return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      h += '<div class="searchbar"><input id="q" placeholder="Search item…" value="' + esc(q) + '"></div>';
      h += '<div class="card tight"><div class="pad" style="padding:10px 14px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'name', label: 'Item', render: function (r) { return '<b>' + esc(r.i.name) + '</b><div class="tiny muted">' + esc(r.i.category) + '</div>'; } },
          { k: 'qty', label: 'Qty', cls: 'num', render: function (r) { return '<span class="' + (r.qty <= num(r.i.reorder) ? 'red' : '') + '">' + fmtQty(r.qty) + '</span>'; } },
          { k: 'val', label: 'Value', cls: 'num', render: function (r) { return fmt(r.val, 0); } }
        ],
        rows: rows.filter(function (r) { return !q || r.i.name.toLowerCase().indexOf(q.toLowerCase()) > -1; })
      }) + '</div></div>';
      h += '<div class="card"><h3>Low stock</h3>' + (function () {
        var low = items.filter(function (i) { return stockQty(i.id) <= num(i.reorder); });
        if (!low.length) return '<div class="tiny muted">Everything is above the reorder level.</div>';
        return low.slice(0, 10).map(function (i) {
          return '<div class="kv"><span>' + esc(i.name) + '</span><span class="red">' + fmtQty(stockQty(i.id)) + ' left</span></div>';
        }).join('');
      })() + '</div>';
    } else {
      var moves = S.moves.filter(function (m) { return !q || itemName(m.itemId).toLowerCase().indexOf(q.toLowerCase()) > -1; });
      moves = sortBy(moves, 'date', 'desc').slice(0, 300);
      h += '<div class="tabs">' + [['units', 'Tractors'], ['implements', 'Implements'], ['items', 'Spares & qty'], ['ledger', 'Ledger']].map(function (t) {
        return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      h += '<div class="searchbar"><input id="q" placeholder="Search item in ledger…" value="' + esc(q) + '"></div>';
      h += '<div class="card tight"><div class="pad" style="padding:8px 6px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'date', label: 'Date', render: function (m) { return dmy(m.date); } },
          { k: 'item', label: 'Item', render: function (m) { return esc(itemName(m.itemId)) + '<div class="tiny muted">' + esc(m.type) + ' ' + esc(m.refNo || '') + '</div>'; } },
          { k: 'qty', label: 'Qty', cls: 'num', render: function (m) { return '<span class="' + (num(m.qty) > 0 ? 'green' : 'red') + '">' + (num(m.qty) > 0 ? '+' : '') + fmtQty(m.qty) + '</span>'; } },
          { k: 'branch', label: 'Branch', cls: 'tiny', render: function (m) { return esc(branchName(m.branchId)); } }
        ],
        rows: moves
      }) + '</div></div>';
    }

    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('stock', { tab: b.getAttribute('data-tab') }); }; });
    var inp = document.getElementById('q');
    if (inp) inp.oninput = function () {
      clearTimeout(inp._t);
      inp._t = setTimeout(function () { Router.go('stock', { tab: tab, q: inp.value, branch: branchF }); }, 320);
    };
    var bf = document.getElementById('bf');
    if (bf) bf.onchange = function () { Router.go('stock', { tab: tab, q: q, branch: bf.value }); };
  }
});

/* ---------- unit detail ---------- */
function unitDetail(id) {
  var u = unitOf(id);
  var jobs = S.jobcards.filter(function (j) { return j.unitId === id; });
  var fuels = S.fuel.filter(function (f) { return f.unitId === id; });
  var logs = S.logbook.filter(function (l) { return l.unitId === id; });
  var inv = u.saleInvoiceId ? findOne('invoices', u.saleInvoiceId) : null;
  var head = u.unitKind === 'implement' ? (u.serialNo || '(no serial)') : (u.chassisNo || '');
  var body = '<div class="between"><div><div class="mono strong" style="font-size:16px">' + esc(head) + '</div>' +
    (u.engineNo ? '<div class="small mono">Engine: ' + esc(u.engineNo) + '</div>' : '') +
    (u.serialNo && u.unitKind !== 'implement' ? '<div class="small mono">Serial: ' + esc(u.serialNo) + '</div>' : '') +
    '</div><div>' + badge(u.status || '', statusTone(u.status)) + (u.unitType === 'used' ? ' ' + badge('USED', 'amber') : '') + '</div></div><hr>' +
    '<div class="kv"><span>Item / model</span><span>' + esc(itemName(u.itemId)) + ' ' + esc(u.model || '') + '</span></div>' +
    '<div class="kv"><span>Colour / year</span><span>' + esc(u.colour || '—') + ' · ' + esc(u.mfgYear || '—') + '</span></div>' +
    (u.hours ? '<div class="kv"><span>Hour meter</span><span>' + fmtQty(u.hours) + ' h</span></div>' : '') +
    (u.condition ? '<div class="kv"><span>Condition</span><span>' + esc(u.condition) + '</span></div>' : '') +
    (u.exchangeId ? '<div class="kv"><span>Source</span><span>Trade-in ' + esc((findOne('exchanges', u.exchangeId) || {}).no || '') + '</span></div>' : '') +
    '<div class="kv"><span>Branch</span><span>' + esc(branchName(u.branchId)) + '</span></div>' +
    '<div class="kv"><span>Cost</span><span>' + inr(u.cost) + '</span></div>' +
    (u.purchaseNo ? '<div class="kv"><span>Purchase bill</span><span>' + esc(u.purchaseNo) + ' · ' + dmy(u.purchaseDate) + '</span></div>' : '') +
    (inv ? '<div class="kv"><span>Sold on</span><span>' + esc(inv.no) + ' · ' + dmy(inv.date) + '</span></div>' +
      '<div class="kv"><span>Customer</span><span>' + esc(partyName(inv.partyId)) + '</span></div>' : '') +
    '<div class="kv"><span>Pre-delivery inspection</span><span>' +
      (function () {
        var pd = pdiFor(u.id);
        return pd ? (pd.status || 'pending') + ' · ' + dmy(pd.date) : 'not done';
      })() + '</span></div>' +
    '<div class="section-label">Service history</div>' +
    (jobs.length ? jobs.map(function (j) {
      return '<div class="kv"><span>' + esc(j.no) + ' · ' + dmy(j.date) + '</span><span>' + esc(j.status) + ' · ' + inr(j.total) + '</span></div>';
    }).join('') : '<div class="tiny muted">No job cards yet.</div>') +
    '<div class="section-label">Fuel & trips</div>' +
    '<div class="kv"><span>Fuel entries</span><span>' + fuels.length + ' · ' + fmtQty(sum(fuels, 'litres')) + ' L</span></div>' +
    '<div class="kv"><span>Logbook trips</span><span>' + logs.length + '</span></div>';

  var pdi = pdiFor(u.id);
  var m = modal({
    title: 'Tractor unit',
    wide: true, body: body,
    footer: '<button class="btn ghost" data-pdi>' + icon('check') + (pdi ? 'PDI' : 'PDI') + '</button>' +
      '<button class="btn ghost" data-transfer>' + icon('swap') + '</button>' +
      '<button class="btn ghost" data-edit>' + icon('edit') + '</button>' +
      (u.status === 'in_stock' ? '<button class="btn primary" data-sell>Sell</button>' : '')
  });
  qs('[data-pdi]', m.el).onclick = function () {
    m.close();
    if (pdi) pdiDetail(pdi.id); else pdiForm(null, u.id);
  };
  qs('[data-edit]', m.el).onclick = function () { m.close(); unitForm(u); };
  var tr = qs('[data-transfer]', m.el);
  if (tr) tr.onclick = function () { m.close(); transferForm(u.id); };
  var sl = qs('[data-sell]', m.el);
  if (sl) sl.onclick = function () {
    m.close();
    openDocEditor('invoice', null, {
      branchId: u.branchId,
      lines: [{ itemId: u.itemId, desc: itemName(u.itemId) + ' ' + (u.model || ''), hsn: item(u.itemId).hsn, qty: 1, rate: item(u.itemId).saleRate, discPct: 0, gstRate: item(u.itemId).gstRate, unitId: u.id }]
    });
  };
}

/* ---------- add / edit unit ---------- */
function serialisableItems() {
  return S.items.filter(function (i) { return i.category === 'tractor' || i.serialTracked; });
}

function unitForm(u) {
  var isNew = !u;
  var fields = [
    { k: 'itemId', label: 'Model / item', type: 'select', required: true, span: 2, options: function () {
        return serialisableItems().map(function (i) { return { v: i.id, l: itemLabel(i) }; });
      } },
    { k: 'unitType', label: 'Condition', type: 'select', options: [['new', 'New'], ['used', 'Used / exchanged']], def: 'new' },
    { k: 'mfgYear', label: 'MFG year', type: 'number', def: thisYear() },
    { k: 'chassisNo', label: 'Chassis number', span: 2 },
    { k: 'engineNo', label: 'Engine number', span: 2 },
    { k: 'serialNo', label: 'Serial number', span: 2, help: 'For implements & accessories' },
    { k: 'colour', label: 'Colour' },
    { k: 'hours', label: 'Hour meter', type: 'number' },
    { k: 'cost', label: 'Cost / landed price', type: 'number', step: '0.01' },
    { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true },
    { k: 'status', label: 'Status', type: 'select', options: [['in_stock', 'In stock'], ['reserved', 'Reserved / booked'], ['sold', 'Sold'], ['transit', 'In transit']], def: 'in_stock' },
    { k: 'purchaseDate', label: 'Inward date', type: 'date', def: today() }
  ];
  editEntity({
    title: isNew ? 'Add stock unit' : 'Edit stock unit',
    wide: true, rec: u,
    defaults: { branchId: (S.branches[0] || {}).id, status: 'in_stock', purchaseDate: today(), mfgYear: thisYear(), cost: 0, unitType: 'new' },
    fields: fields,
    validate: function (v, old) {
      var it = item(v.itemId);
      if (!it.id) return 'Choose the model first';
      if (it.category === 'tractor') {
        if (!v.chassisNo) return 'Chassis number is required for a tractor';
        if (!v.engineNo) return 'Engine number is required for a tractor';
        var dup = S.units.find(function (x) {
          return x.chassisNo && x.chassisNo.toUpperCase() === String(v.chassisNo).toUpperCase() && (!old || x.id !== old.id);
        });
        if (dup) return 'Chassis number already exists in stock';
      } else {
        if (!v.serialNo) return 'Serial number is required for a serial tracked item';
        var dup2 = S.units.find(function (x) {
          return x.serialNo && x.serialNo.toUpperCase() === String(v.serialNo).toUpperCase() && (!old || x.id !== old.id);
        });
        if (dup2) return 'Serial number already exists in stock';
      }
      return null;
    },
    onSave: function (v, old) {
      var it = item(v.itemId);
      var rec = Object.assign({}, old || {}, v);
      rec.unitKind = it.category === 'tractor' ? 'tractor' : 'implement';
      rec.chassisNo = String(v.chassisNo || '').toUpperCase();
      rec.engineNo = String(v.engineNo || '').toUpperCase();
      rec.serialNo = String(v.serialNo || '').toUpperCase();
      rec.model = it.model || '';
      if (!old) { rec.id = uid('unt'); rec.purchaseNo = rec.purchaseNo || 'MANUAL'; }
      upsert('units', rec);
      toast('Unit saved'); Router.render();
    },
    onDelete: function (rec) {
      if (rec.status === 'sold') { toast('Sold units cannot be deleted', 'err'); return; }
      removeRec('units', rec.id); toast('Unit removed'); Router.render();
    }
  });
}

/* ---------- transfers ---------- */
screen('transfers', {
  title: 'Stock Transfer',
  render: function (view) {
    var list = sortBy(S.transfers, 'date', 'desc');
    var h = pageHead('Stock Transfer', [{ label: 'New transfer', icon: 'plus', cls: 'primary', onClick: function () { transferForm(); } }],
      'Move stock between branches');
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No transfers recorded.</div>';
    else h += list.map(function (t) {
      var id = 'tr' + t.id;
      setTimeout(function () {
        var e = document.getElementById(id);
        if (e) e.onclick = function () {
          confirmDlg('Delete transfer ' + t.no + '? Stock movements will be reversed.', function () {
            removeRec('transfers', t.id);
            S.moves = S.moves.filter(function (mv) { return mv.refId !== t.id; });
            if (t.unitId) { var u = unitOf(t.unitId); if (u.id) { u.branchId = t.fromBranchId; } }
            save(true); Router.render();
          }, 'Delete');
        };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(t.no) + ' · ' + dmy(t.date) + '</div>' +
        '<div class="rc-sub">' + esc(branchName(t.fromBranchId)) + ' → ' + esc(branchName(t.toBranchId)) + ' · ' +
        (t.unitId ? 'chassis ' + esc(unitOf(t.unitId).chassisNo) : fmtQty(t.qty) + ' × ' + esc(itemName(t.itemId))) + '</div></div>' +
        '<div class="rc-right">' + (t.unitId ? '1 unit' : fmtQty(t.qty)) + '<small>moved</small></div></div>';
    }).join('');
    view.innerHTML = h + '</div>';
  }
});

function transferForm(unitId) {
  var fields = [
    { k: 'fromBranchId', label: 'From branch', type: 'select', options: branchOptions, required: true, def: (S.branches[0] || {}).id },
    { k: 'toBranchId', label: 'To branch', type: 'select', options: branchOptions, required: true },
    { k: 'date', label: 'Date', type: 'date', required: true, def: today() },
    { k: 'mode', label: 'Send as', type: 'select', options: [['unit', 'Tractor unit (chassis)'], ['qty', 'Item quantity']], def: unitId ? 'unit' : 'qty' },
    { k: 'unitId', label: 'Unit', type: 'select', span: 2, options: function () { return availableUnits().map(function (u) { return { v: u.id, l: u.chassisNo + ' · ' + (u.model || '') + ' · ' + branchName(u.branchId) }; }); } },
    { k: 'itemId', label: 'Item', type: 'select', span: 2, options: function () { return itemOptions(function (i) { return i.category !== 'tractor' && i.category !== 'service'; }); } },
    { k: 'qty', label: 'Quantity', type: 'number', def: 1 },
    { k: 'note', label: 'Remarks', type: 'textarea', span: 2, rows: 2 }
  ];
  var rec = unitId ? { unitId: unitId, mode: 'unit', date: today(), fromBranchId: (unitOf(unitId).branchId || '') } : { mode: 'qty', date: today(), qty: 1 };
  editEntity({
    title: 'Stock transfer',
    wide: true, rec: rec, fields: fields,
    onSave: function (v) {
      if (v.fromBranchId === v.toBranchId) { toast('From and to branch must differ', 'err'); return; }
      var t = {
        id: uid('trf'), no: nextNo('trf', 'TRF'), date: v.date, fromBranchId: v.fromBranchId,
        toBranchId: v.toBranchId, note: v.note, mode: v.mode
      };
      if (v.mode === 'unit') {
        if (!v.unitId) { toast('Select a unit', 'err'); return; }
        t.unitId = v.unitId;
        var u = unitOf(v.unitId);
        u.branchId = v.toBranchId;
        S.moves.push({ id: uid('mv'), date: v.date, itemId: u.itemId, branchId: v.fromBranchId, qty: -1, rate: u.cost, type: 'transfer', refId: t.id, refNo: t.no, note: 'To ' + branchName(v.toBranchId) });
        S.moves.push({ id: uid('mv'), date: v.date, itemId: u.itemId, branchId: v.toBranchId, qty: 1, rate: u.cost, type: 'transfer', refId: t.id, refNo: t.no, note: 'From ' + branchName(v.fromBranchId) });
      } else {
        if (!v.itemId || !num(v.qty)) { toast('Item and quantity required', 'err'); return; }
        t.itemId = v.itemId; t.qty = num(v.qty);
        S.moves.push({ id: uid('mv'), date: v.date, itemId: v.itemId, branchId: v.fromBranchId, qty: -num(v.qty), rate: 0, type: 'transfer', refId: t.id, refNo: t.no, note: 'To ' + branchName(v.toBranchId) });
        S.moves.push({ id: uid('mv'), date: v.date, itemId: v.itemId, branchId: v.toBranchId, qty: num(v.qty), rate: 0, type: 'transfer', refId: t.id, refNo: t.no, note: 'From ' + branchName(v.fromBranchId) });
      }
      upsert('transfers', t); save(true);
      toast('Stock transferred'); Router.render();
    }
  });
}
