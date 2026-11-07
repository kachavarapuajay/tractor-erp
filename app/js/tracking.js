/* ============================================================
   tracking.js — RTA registration, HSRP plates, warranty and
   sale agreements
   ============================================================ */

/* ================= RTA & HSRP TRACKING ================= */
var RTA_STATUS = [['pending', 'Documents pending'], ['submitted', 'Submitted at RTO'], ['number', 'Number allotted'], ['rc', 'RC received'], ['closed', 'Closed']];
var HSRP_STATUS = [['pending', 'Order pending'], ['ordered', 'Ordered'], ['received', 'Received from vendor'], ['fitted', 'Fitted on vehicle'], ['closed', 'Closed']];

screen('registration', {
  title: 'RTA & HSRP Tracking',
  render: function (view, params) {
    var tab = params.tab || 'rta';
    var rta = sortBy(S.rta, 'date', 'desc');
    var hsrp = sortBy(S.hsrp, 'date', 'desc');
    var pendingRta = rta.filter(function (r) { return r.status !== 'rc' && r.status !== 'closed'; }).length;
    var pendingHsrp = hsrp.filter(function (r) { return r.status !== 'fitted' && r.status !== 'closed'; }).length;

    var h = pageHead('RTA & HSRP Tracking', [{ label: tab === 'rta' ? 'New RTA file' : 'New HSRP order', icon: 'plus', cls: 'primary', onClick: function () { tab === 'rta' ? rtaForm() : hsrpForm(); } }],
      pendingRta + ' registration(s) open · ' + pendingHsrp + ' plate(s) pending');
    h += '<div class="tabs">' + [['rta', 'RTA / registration'], ['hsrp', 'HSRP plates']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    if (tab === 'rta') {
      h += '<div class="card tight">';
      if (!rta.length) h += '<div class="empty small">No registration files yet. Track each vehicle from documents to RC.</div>';
      else h += rta.map(function (r) {
        var id = 'rt' + r.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { rtaForm(r); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(r.regNo || r.applicationNo || 'New file') +
          ' ' + badge(r.status || 'pending', r.status === 'rc' || r.status === 'closed' ? 'green' : 'amber') + '</div>' +
          '<div class="rc-sub">' + esc(partyName(r.customerId)) + ' · ' + esc(r.rtoOffice || '') +
          ' · applied ' + dmy(r.appliedDate) + '</div></div>' +
          '<div class="rc-right">' + inr(r.charges) + '<small>' + esc(r.unitChassis || '') + '</small></div></div>';
      }).join('');
      h += '</div>';
    } else {
      h += '<div class="card tight">';
      if (!hsrp.length) h += '<div class="empty small">No HSRP orders yet. Track the plate from order to fitting.</div>';
      else h += hsrp.map(function (r) {
        var id = 'hs' + r.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { hsrpForm(r); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(r.orderNo || 'HSRP order') +
          ' ' + badge(r.status || 'pending', r.status === 'fitted' || r.status === 'closed' ? 'green' : 'amber') + '</div>' +
          '<div class="rc-sub">' + esc(partyName(r.customerId)) + ' · ' + esc(r.vendor || '') +
          ' · ordered ' + dmy(r.appliedDate) + '</div></div>' +
          '<div class="rc-right">' + inr(r.cost) + '<small>' + esc(r.unitChassis || '') + '</small></div></div>';
      }).join('');
      h += '</div>';
    }
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('registration', { tab: b.getAttribute('data-tab') }); }; });
  }
});

function unitPickFields(extra) {
  return [
    { k: 'invoiceId', label: 'Against invoice', type: 'select', span: 2, options: function () {
        return S.invoices.filter(function (i) { return i.docType !== 'financer'; })
          .map(function (i) { return { v: i.id, l: i.no + ' · ' + partyName(i.partyId) }; });
      } },
    { k: 'customerId', label: 'Customer', type: 'select', required: true, options: function () { return partyOptions(['customer']); } },
    { k: 'unitId', label: 'Tractor unit', type: 'select', span: 2, options: function () {
        return S.units.map(function (u) { return { v: u.id, l: unitLabel(u) }; });
      } }
  ].concat(extra || []);
}

function rtaForm(r) {
  editEntity({
    title: r ? 'Edit RTA file' : 'New RTA registration',
    wide: true, rec: r,
    defaults: { date: today(), appliedDate: today(), status: 'pending', charges: 0 },
    fields: unitPickFields([
      { k: 'applicationNo', label: 'Application / file no.' },
      { k: 'rtoOffice', label: 'RTO office' },
      { k: 'regNo', label: 'Registration number' },
      { k: 'appliedDate', label: 'Applied on', type: 'date' },
      { k: 'status', label: 'Status', type: 'select', options: RTA_STATUS },
      { k: 'charges', label: 'RTO charges', type: 'number', step: '0.01' },
      { k: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 }
    ]),
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) rec.id = uid('rta');
      if (rec.unitId) {
        var u = unitOf(rec.unitId);
        rec.unitChassis = u.chassisNo || u.serialNo || '';
        if (rec.regNo && u.id) { u.regNo = rec.regNo; }
      }
      upsert('rta', rec); toast('RTA file saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('rta', rec.id); Router.render(); }
  });
}

function hsrpForm(r) {
  editEntity({
    title: r ? 'Edit HSRP order' : 'New HSRP order',
    wide: true, rec: r,
    defaults: { date: today(), appliedDate: today(), status: 'pending', cost: 0 },
    fields: unitPickFields([
      { k: 'orderNo', label: 'Order / booking no.' },
      { k: 'vendor', label: 'Vendor' },
      { k: 'appliedDate', label: 'Ordered on', type: 'date' },
      { k: 'receivedDate', label: 'Received on', type: 'date' },
      { k: 'fittedDate', label: 'Fitted on', type: 'date' },
      { k: 'status', label: 'Status', type: 'select', options: HSRP_STATUS },
      { k: 'cost', label: 'Cost', type: 'number', step: '0.01' },
      { k: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 }
    ]),
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) rec.id = uid('hsr');
      if (rec.unitId) {
        var u = unitOf(rec.unitId);
        rec.unitChassis = u.chassisNo || u.serialNo || '';
      }
      upsert('hsrp', rec); toast('HSRP order saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('hsrp', rec.id); Router.render(); }
  });
}

/* ================= WARRANTY ================= */
screen('warranty', {
  title: 'Warranty',
  render: function (view) {
    var list = sortBy(S.warranties, 'startDate', 'desc');
    var active = list.filter(function (w) { return w.status !== 'closed' && (!w.endDate || w.endDate >= today()); });
    var claims = 0;
    list.forEach(function (w) { claims += (w.claims || []).length; });

    var h = pageHead('Warranty Handling', [{ label: 'New warranty', icon: 'plus', cls: 'primary', onClick: function () { warrantyForm(); } }],
      active.length + ' active · ' + claims + ' claim(s)');
    h += '<div class="stats">' + statCard('Active', String(active.length), 'in warranty') +
      statCard('Claims', String(claims), 'all time', 'amber') +
      statCard('Expiring in 30d', String(list.filter(function (w) {
        return w.endDate && w.endDate >= today() && daysBetween(today(), w.endDate) <= 30;
      }).length), 'follow up', 'red') + '</div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No warranty records. Register one when a tractor or implement is sold.</div>';
    else h += list.map(function (w) {
      var id = 'wr' + w.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { warrantyDetail(w.id); };
      }, 0);
      var live = !w.endDate || w.endDate >= today();
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(w.customerId)) +
        ' ' + badge(live ? 'IN WARRANTY' : 'EXPIRED', live ? 'green' : 'grey') +
        ((w.claims || []).length ? ' ' + badge((w.claims || []).length + ' CLAIM', 'amber') : '') + '</div>' +
        '<div class="rc-sub">' + esc(w.provider || '') + ' · ' + esc(w.type || 'standard') +
        ' · ' + dmy(w.startDate) + ' to ' + dmy(w.endDate) + '</div></div>' +
        '<div class="rc-right">' + esc(w.unitChassis || '') + '</div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;
  }
});

function warrantyForm(w) {
  editEntity({
    title: w ? 'Edit warranty' : 'New warranty',
    wide: true, rec: w,
    defaults: { startDate: today(), endDate: addDays(today(), 365), type: 'standard', status: 'active' },
    fields: unitPickFields([
      { k: 'type', label: 'Type', type: 'select', options: [['standard', 'Standard'], ['extended', 'Extended'], ['implement', 'Implement'], ['engine', 'Engine only']] },
      { k: 'provider', label: 'Provided by' },
      { k: 'startDate', label: 'Start date', type: 'date', required: true },
      { k: 'endDate', label: 'End date', type: 'date', required: true },
      { k: 'hoursLimit', label: 'Hour limit', type: 'number' },
      { k: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['closed', 'Closed'], ['void', 'Void']] },
      { k: 'notes', label: 'Terms', type: 'textarea', span: 2, rows: 2 }
    ]),
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) { rec.id = uid('war'); rec.claims = []; }
      if (rec.unitId) { var u = unitOf(rec.unitId); rec.unitChassis = u.chassisNo || u.serialNo || ''; }
      upsert('warranties', rec); toast('Warranty saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('warranties', rec.id); Router.render(); }
  });
}

function warrantyDetail(id) {
  var w = findOne('warranties', id);
  if (!w) return;
  var claims = w.claims || [];
  var body = '<div class="kv"><span>Customer</span><span>' + esc(partyName(w.customerId)) + '</span></div>' +
    '<div class="kv"><span>Unit</span><span class="mono">' + esc(w.unitChassis || '—') + '</span></div>' +
    '<div class="kv"><span>Period</span><span>' + dmy(w.startDate) + ' → ' + dmy(w.endDate) + '</span></div>' +
    '<div class="kv"><span>Provider</span><span>' + esc(w.provider || '—') + '</span></div>' +
    '<div class="section-label">Claims</div>';
  if (!claims.length) body += '<div class="tiny muted">No claims raised.</div>';
  else body += claims.map(function (c, i) {
    return '<div class="kv"><span>' + dmy(c.date) + ' · ' + esc(c.complaint) + '</span>' +
      '<span>' + esc(c.status || '') + ' · ' + inr(c.cost) + '</span></div>';
  }).join('');
  var m = modal({
    title: 'Warranty · ' + (w.unitChassis || ''),
    wide: true, body: body,
    footer: '<button class="btn ghost" data-print>' + icon('print') + '</button>' +
      '<button class="btn ghost" data-claim>' + icon('plus') + 'Claim</button>' +
      '<button class="btn ghost" data-edit>Edit</button>' +
      '<button class="btn primary" data-close>Done</button>'
  });
  qs('[data-print]', m.el).onclick = function () { m.close(); printDoc('warranty', w.id); };
  qs('[data-close]', m.el).onclick = m.close;
  qs('[data-edit]', m.el).onclick = function () { m.close(); warrantyForm(w); };
  qs('[data-claim]', m.el).onclick = function () {
    m.close();
    Form({
      title: 'New warranty claim',
      fields: [
        { k: 'date', label: 'Claim date', type: 'date', required: true, def: today() },
        { k: 'complaint', label: 'Complaint', required: true, span: 2 },
        { k: 'action', label: 'Action taken', type: 'textarea', span: 2, rows: 2 },
        { k: 'cost', label: 'Cost claimed', type: 'number', step: '0.01', def: 0 },
        { k: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['approved', 'Approved by company'], ['rejected', 'Rejected'], ['settled', 'Settled']], def: 'open' }
      ],
      onSave: function (v) {
        w.claims = w.claims || [];
        w.claims.push(Object.assign({ id: uid('clm') }, v));
        upsert('warranties', w); toast('Claim added'); Router.render();
      }
    });
  };
}

/* ================= SALE AGREEMENT ================= */
screen('agreements', {
  title: 'Sale Agreements',
  render: function (view) {
    var list = sortBy(S.agreements, 'date', 'desc');
    var cols = [
      { k: 'no', label: 'Agreement' }, { k: 'date', label: 'Date' }, { k: 'customer', label: 'Customer' },
      { k: 'unit', label: 'Unit' }, { k: 'price', label: 'Price' }, { k: 'advance', label: 'Advance' },
      { k: 'balance', label: 'Balance' }, { k: 'status', label: 'Status' }
    ];
    var exportRows = list.map(function (a) {
      return { no: a.no, date: dmy(a.date), customer: partyName(a.customerId), unit: a.unitChassis || '', price: num(a.price), advance: num(a.advance), balance: num(a.balance), status: a.status || 'draft' };
    });
    var h = pageHead('Sale Agreements', [
      Export.action('Sale Agreements', function () { return cols; }, function () { return exportRows; }),
      { label: 'New agreement', icon: 'plus', cls: 'primary', onClick: function () { agreementForm(); } }
    ], list.length + ' agreements');
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No agreements yet. Prepare one from a quotation or straight from the customer.</div>';
    else h += list.map(function (a) {
      var id = 'ag' + a.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { openAgreement(a.id); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(a.no) + ' · ' + esc(partyName(a.customerId)) +
        ' ' + badge(a.status || 'draft', a.status === 'signed' ? 'green' : 'grey') + '</div>' +
        '<div class="rc-sub">' + dmy(a.date) + ' · ' + esc(a.unitChassis || '') + ' · balance ' + inr(a.balance) + '</div></div>' +
        '<div class="rc-right">' + inr(a.price) + '</div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;
  }
});

function agreementForm(a, preset) {
  var rec = a || preset || null;
  var modelFilter = (rec && rec.modelId) || (preset && preset.modelId) || '';
  var makeFilter = (rec && rec.makeId) || '';
  var fields = [
    { k: 'invoiceId', label: 'Against invoice', type: 'select', span: 2, options: function () {
        return S.invoices.filter(function (i) { return i.docType !== 'financer'; })
          .map(function (i) { return { v: i.id, l: i.no + ' · ' + partyName(i.partyId) }; });
      } },
    { k: 'customerId', label: 'Customer', type: 'select', required: true, options: function () { return partyOptions(['customer']); } },
    { k: 'makeId', label: 'Make', type: 'select', placeholder: 'All makes', options: function () {
        return makeOptions().map(function (o) { return [o.v, o.l]; });
      } },
    { k: 'modelId', label: 'Model', type: 'select', placeholder: 'All models', options: function () {
        return modelOptions(makeFilter).map(function (o) { return [o.v, o.l]; });
      } },
    { k: 'unitId', label: 'Tractor unit', type: 'select', span: 2, options: function () { return unitsForModel(modelFilter); } }
  ].concat([
      { k: 'price', label: 'Sale price', type: 'number', step: '0.01', required: true },
      { k: 'advance', label: 'Advance received', type: 'number', step: '0.01' },
      { k: 'financeAmount', label: 'Financed amount', type: 'number', step: '0.01' },
      { k: 'deliveryDate', label: 'Delivery date', type: 'date' },
      { k: 'status', label: 'Status', type: 'select', options: [['draft', 'Draft'], ['signed', 'Signed'], ['cancelled', 'Cancelled']] },
      { k: 'witness1', label: 'Witness 1' },
      { k: 'witness2', label: 'Witness 2' },
      { k: 'terms', label: 'Terms & conditions', type: 'textarea', span: 2, rows: 3,
        def: '1. The buyer has inspected the tractor and accepts its condition.\n2. Balance payment to be made before delivery.\n3. Insurance and registration charges are payable by the buyer.\n4. Warranty as per manufacturer terms.' }
  ]);

  var m = editEntity({
    title: a ? 'Edit agreement' : 'New sale agreement',
    wide: true, isNew: !a, rec: a || null, preset: a ? null : preset,
    defaults: { date: today(), status: 'draft', price: 0, advance: 0, financeAmount: 0, modelId: modelFilter },
    fields: fields,
    onSave: function (v, old) {
      var out = Object.assign({}, old || {}, v);
      out.balance = r2(num(v.price) - num(v.advance) - num(v.financeAmount));
      if (!old) { out.id = uid('agr'); out.no = nextNo('agr', settings().agrPrefix || 'AGR'); }
      if (out.unitId) { var u = unitOf(out.unitId); out.unitChassis = u.chassisNo || u.serialNo || ''; }
      if (out.unitId) {
        var un = unitOf(out.unitId);
        var it = item(un.itemId);
        if (it.modelId) out.modelId = it.modelId;
        out.unitChassis = un.chassisNo || un.serialNo || '';
      }
      upsert('agreements', out); toast('Agreement saved'); Router.render();
    },
    onDelete: function (rec2) { removeRec('agreements', rec2.id); Router.render(); }
  });

  var makeSel2 = qs('[name="makeId"]', m.el);
  var modelSel = qs('[name="modelId"]', m.el);
  var unitSel = qs('[name="unitId"]', m.el);
  if (modelSel && unitSel) {
    if (makeSel2) {
      makeSel2.onchange = function () {
        makeFilter = makeSel2.value;
        modelFilter = '';
        var mopts = modelOptions(makeFilter);
        modelSel.innerHTML = '<option value="">All models</option>' + mopts.map(function (o) {
          return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
        }).join('');
        var uopts = unitsForModel('');
        unitSel.innerHTML = '<option value="">— select unit —</option>' + uopts.map(function (o) {
          return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
        }).join('');
      };
    }
    modelSel.onchange = function () {
      modelFilter = modelSel.value;
      var opts = unitsForModel(modelFilter);
      unitSel.innerHTML = '<option value="">— select unit —</option>' + opts.map(function (o) {
        return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
      }).join('');
    };
    unitSel.onchange = function () {
      var un = unitOf(unitSel.value);
      if (!un.id) return;
      var it = item(un.itemId);
      if (!it.modelId) return;
      var exists = Array.prototype.some.call(modelSel.options, function (o) { return o.value === it.modelId; });
      if (!exists) {
        var mk = makeName(it.makeId);
        modelSel.insertAdjacentHTML('beforeend', '<option value="' + it.modelId + '">' +
          esc(modelName(it.modelId) + (mk ? ' · ' + mk : '')) + '</option>');
      }
      modelSel.value = it.modelId;
      modelFilter = it.modelId;
    };
  }
}

function agreementHtml(a) {
  var o = org(), c = party(a.customerId), u = unitOf(a.unitId);
  var rows = [
    ['Customer', c.name || ''],
    ['Address', (c.address || '') + (c.city ? ', ' + c.city : '')],
    ['Phone', c.phone || ''],
    ['Aadhaar', c.aadhaar || '—'],
    ['PAN', c.pan || '—'],
    ['Vehicle', (u.chassisNo || u.serialNo || '') + (u.engineNo ? ' · Engine ' + u.engineNo : '')],
    ['Model', itemName(u.itemId) + (u.model ? ' ' + u.model : '')],
    ['Sale price', inr(a.price)],
    ['Advance received', inr(a.advance)],
    ['Financed amount', inr(a.financeAmount)],
    ['Balance payable', inr(a.balance)]
  ];
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + xmlEsc(a.no) + '</title><style>' +
    'body{font-family:Georgia,serif;font-size:12px;padding:22px;line-height:1.5}h1{font-size:16px;text-align:center;margin:0 0 4px}' +
    'h2{font-size:12px;text-align:center;font-weight:normal;margin:0 0 16px}table{width:100%;border-collapse:collapse;margin:8px 0}' +
    'td{border:1px solid #bbb;padding:5px 7px;vertical-align:top}td.k{background:#f2f2f2;width:32%;font-weight:bold}' +
    '.sig{display:flex;justify-content:space-between;margin-top:40px}.terms{white-space:pre-line;font-size:11px}' +
    '</style></head><body><h1>' + xmlEsc(o.name || '') + '</h1>' +
    '<h2>SALE AGREEMENT · ' + xmlEsc(a.no) + ' · ' + dmy(a.date) + '</h2>' +
    '<table>' + rows.map(function (r) { return '<tr><td class="k">' + xmlEsc(r[0]) + '</td><td>' + xmlEsc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
    '<p class="terms"><b>Terms &amp; conditions</b><br>' + xmlEsc(a.terms || '') + '</p>' +
    '<div class="sig"><div>Witness 1<br><br>' + xmlEsc(a.witness1 || '') + '</div>' +
    '<div>Witness 2<br><br>' + xmlEsc(a.witness2 || '') + '</div>' +
    '<div>Buyer<br><br>' + xmlEsc(c.name || '') + '</div>' +
    '<div>For ' + xmlEsc(o.name || '') + '<br><br>Authorised signatory</div></div></body></html>';
}

function openAgreement(id) {
  var a = findOne('agreements', id);
  if (!a) return;
  var m = modal({
    title: 'Agreement · ' + a.no,
    wide: true,
    body: '<div class="doc">' + agreementHtml(a).split('<body>')[1].split('</body>')[0] + '</div>',
    footer: '<button class="btn ghost" data-print>' + icon('print') + 'Print / PDF</button>' +
      '<button class="btn ghost" data-edit>Edit</button>' +
      '<button class="btn primary" data-inv>Create invoice</button>'
  });
  qs('[data-print]', m.el).onclick = function () { m.close(); printDoc('agreement', a.id); };
  qs('[data-edit]', m.el).onclick = function () { m.close(); agreementForm(a); };
  qs('[data-inv]', m.el).onclick = function () {
    m.close();
    var u = unitOf(a.unitId);
    openDocEditor('invoice', null, {
      partyId: a.customerId, branchId: (S.branches[0] || {}).id,
      notes: 'Against sale agreement ' + a.no,
      lines: u.id ? [{
        itemId: u.itemId, desc: itemName(u.itemId), hsn: item(u.itemId).hsn,
        qty: 1, rate: num(a.price), discPct: 0, gstRate: item(u.itemId).gstRate, unitId: u.id
      }] : []
    });
  };
}
