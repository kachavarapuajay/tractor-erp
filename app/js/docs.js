/* ============================================================
   docs.js — document editor & viewer (invoice, quotation,
   purchase bill, job card, financer invoice)
   ============================================================ */

function empOptions(type) {
  return S.employees.filter(function (e) {
    return e.active !== false && (!type || e.empType === type);
  }).map(function (e) { return { v: e.id, l: e.name }; });
}
function partyOptions(types) {
  return S.parties.filter(function (p) { return types.indexOf(p.type) > -1; })
    .map(function (p) { return { v: p.id, l: p.name + (p.gstin ? ' (' + p.gstin + ')' : '') }; });
}
function shortCat(cat) {
  var c = (ITEM_CATS.find(function (x) { return x[0] === cat; }) || [cat, cat])[1];
  return String(c).replace(/\s*\(.*?\)/, '').trim();
}

/* one line carrying everything: name · category · make · model · GST */
function itemLabel(i) {
  if (!i || !i.id) return '';
  var cat = shortCat(i.category);
  var mk = makeName(i.makeId) || i.brand || '';
  var md = modelName(i.modelId) || i.model || '';
  var parts = [];
  [cat, mk, md].forEach(function (v) {
    if (!v) return;
    if (String(v).toLowerCase() === String(i.name).toLowerCase()) return; // don't repeat the name
    if (parts.some(function (p) { return p.toLowerCase() === String(v).toLowerCase(); })) return;
    parts.push(v);
  });
  var tail = [];
  if (i.partNo) tail.push(i.partNo);
  if (i.gstRate !== undefined && i.gstRate !== '') tail.push(i.gstRate + '%');
  return i.name + (parts.length ? ' · ' + parts.join(' · ') : '') + (tail.length ? ' · ' + tail.join(' · ') : '');
}

function itemOptions(filterFn) {
  return S.items.filter(function (i) { return !filterFn || filterFn(i); })
    .map(function (i) { return { v: i.id, l: itemLabel(i) }; });
}
/* items matching the chosen category / make / model (empty = everything) */
function itemsMatching(cat, makeId, modelId) {
  return S.items.filter(function (i) {
    if (cat && i.category !== cat) return false;
    if (makeId && i.makeId !== makeId) return false;
    if (modelId && i.modelId !== modelId) return false;
    return true;
  });
}
function itemOptionsFor(cat, makeId, modelId) {
  return itemsMatching(cat, makeId, modelId).map(function (i) { return { v: i.id, l: itemLabel(i) }; });
}

/* items of one make (empty make = everything) */
function itemOptionsForMake(makeId) {
  return itemOptions(function (i) { return !makeId || i.makeId === makeId; });
}

var DOCS = {
  invoice: {
    coll: 'invoices', kind: 'invoice', title: 'Tax Invoice', prefixKey: 'invoicePrefix', defPrefix: 'INV', listScreen: 'invoices',
    partyTypes: ['customer'], partyLabel: 'Customer', tax: true, stock: 'out',
    docTypes: [['sales', 'Tractor / vehicle sale'], ['implements', 'Implements & accessories'], ['spares', 'Spares & parts'], ['service', 'Service / labour']],
    header: [
      { k: 'saleType', label: 'Sale type', type: 'select', options: [['sales', 'Tractor / vehicle'], ['implements', 'Implements & accessories'], ['spares', 'Spares'], ['service', 'Service']], def: 'sales', required: true },
      { k: 'salesEmpId', label: 'Sales executive', type: 'select', options: function () { return empOptions('sales'); } },
      { k: 'brokerId', label: 'Broker', type: 'select', options: function () { return brokerList().map(function (b) { return { v: b.id, l: b.name + ' · ' + inr(b.commissionAmount) }; }); } },
      { k: 'brokerCommission', label: 'Broker commission (amount)', type: 'number', step: '0.01', help: 'Leave 0 to use the broker default amount' },
      { k: 'financerId', label: 'Financer (hypothecation)', type: 'select', options: function () { return partyOptions(['financer']); } },
      { k: 'marginMoney', label: 'Margin money', type: 'number', step: '0.01', def: 0 },
      { k: 'vehicleNo', label: 'Vehicle / temporary reg. no.' },
      { k: 'transporterId', label: 'Transporter', type: 'select', options: function () { return transporterOptions(); } },
      { k: 'transport', label: 'LR / docket no.' },
      { k: 'ewayBill', label: 'E-way bill no.' },
      { k: 'rcm', label: 'Reverse charge', type: 'checkbox', help: 'Tax payable by the recipient (RCM)' },
      { k: 'dueDate', label: 'Due date', type: 'date' },
      { k: 'notes', label: 'Remarks on invoice', type: 'textarea', span: 2, rows: 2 }
    ]
  },
  quotation: {
    coll: 'quotations', kind: 'quotation', title: 'Quotation', prefixKey: 'quotePrefix', defPrefix: 'QT', listScreen: 'quotations',
    partyTypes: ['customer'], partyLabel: 'Customer', tax: true, stock: null,
    docTypes: [['sales', 'Tractor / vehicle'], ['implements', 'Implements & accessories'], ['spares', 'Spares'], ['service', 'Service']],
    hypothecation: true,
    header: [
      { k: 'saleType', label: 'Quote for', type: 'select', options: [['sales', 'Tractor only'], ['combo', 'Tractor + implement combo'], ['implements', 'Implements & accessories'], ['spares', 'Spares'], ['service', 'Service']], def: 'sales', required: true },
      { k: 'salesEmpId', label: 'Sales executive', type: 'select', options: function () { return empOptions('sales'); } },
      { k: 'validTill', label: 'Valid till', type: 'date', def: addDays(today(), 15) },
      { k: 'status', label: 'Status', type: 'select', options: [['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['rejected', 'Rejected']], def: 'draft' },
      { k: 'financerId', label: 'Financer', type: 'select', options: function () { return partyOptions(['financer']); } },
      { k: 'loanAmount', label: 'Loan amount', type: 'number', step: '0.01', def: 0 },
      { k: 'marginMoney', label: 'Margin money (down payment)', type: 'number', step: '0.01', def: 0 },
      { k: 'tenure', label: 'Tenure (months)', type: 'number', def: 0 },
      { k: 'interestRate', label: 'Interest % p.a.', type: 'number', step: '0.01', def: 0 },
      { k: 'notes', label: 'Terms & remarks', type: 'textarea', span: 2, rows: 2 }
    ]
  },
  purchase: {
    coll: 'purchases', kind: 'purchase', title: 'Purchase Bill', prefixKey: 'purchasePrefix', defPrefix: 'PB', listScreen: 'purchases',
    partyTypes: ['supplier'], partyLabel: 'Supplier', tax: true, stock: 'in',
    header: [
      { k: 'billNo', label: 'Supplier bill no.', required: true },
      { k: 'billDate', label: 'Supplier bill date', type: 'date', def: today() },
      { k: 'purchaseType', label: 'Purchase type', type: 'select', options: [['tractor', 'Tractor units'], ['implements', 'Implements & accessories'], ['spares', 'Spares'], ['other', 'Other']], def: 'tractor', required: true },
      { k: 'dueDate', label: 'Payment due', type: 'date' },
      { k: 'transporterId', label: 'Transporter', type: 'select', options: function () { return transporterOptions(); } },
      { k: 'transport', label: 'LR / docket no.' },
      { k: 'rcm', label: 'Reverse charge (RCM)', type: 'checkbox', help: 'GST payable by us, not the supplier' },
      { k: 'notes', label: 'Remarks', type: 'textarea', span: 2, rows: 2 }
    ]
  },
  jobcard: {
    coll: 'jobcards', kind: 'jobcard', title: 'Job Card', prefixKey: 'jobPrefix', defPrefix: 'JC', listScreen: 'jobcards',
    partyTypes: ['customer'], partyLabel: 'Customer', tax: true, stock: 'out', isJob: true,
    header: [
      { k: 'unitId', label: 'Tractor in stock', type: 'select', options: function () { return S.units.map(function (u) { return { v: u.id, l: u.chassisNo + ' · ' + (u.model || '') + ' (' + (u.status) + ')' }; }); } },
      { k: 'chassisNo', label: 'Chassis no.' },
      { k: 'engineNo', label: 'Engine no.' },
      { k: 'regNo', label: 'Registration no.' },
      { k: 'mechanicId', label: 'Mechanic', type: 'select', options: function () { return empOptions('mechanic'); } },
      { k: 'hourMeter', label: 'Hour meter / KM', type: 'number' },
      { k: 'complaint', label: 'Customer complaint', type: 'textarea', span: 2, rows: 2, required: true },
      { k: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']], def: 'open' }
    ]
  },
  margin: {
    coll: 'marginReceipts', kind: 'margin', title: 'Margin Money Receipt', prefixKey: 'marginPrefix', defPrefix: 'MMR',
    listScreen: 'fininvoices', partyTypes: ['customer'], partyLabel: 'Customer', tax: false, stock: null, noGst: true, noLines: true,
    header: [
      { k: 'amount', label: 'Margin money received', type: 'number', step: '0.01', def: 0, required: true },
      { k: 'mode', label: 'Received by', type: 'select', options: [['cash', 'Cash'], ['bank', 'Bank / NEFT'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['dd', 'Demand draft']], def: 'bank' },
      { k: 'financerId', label: 'Financer', type: 'select', options: function () { return partyOptions(['financer']); } },
      { k: 'invoiceId', label: 'Against invoice', type: 'select', options: function () {
          return S.invoices.filter(function (i) { return i.docType !== 'financer' && invoiceOutstanding(i) > 0.5; })
            .map(function (i) { return { v: i.id, l: i.no + ' · ' + partyName(i.partyId) + ' · open ' + inr(invoiceOutstanding(i)) }; });
        } },
      { k: 'refNo', label: 'UTR / cheque no.' },
      { k: 'bankAccountId', label: 'Bank account', type: 'select', options: bankAccountOptions },
      { k: 'loanAccountNo', label: 'Loan account no.' },
      { k: 'notes', label: 'Remarks', type: 'textarea', span: 2, rows: 2 }
    ]
  },
  financer: {
    coll: 'invoices', kind: 'financer', title: 'Financer Invoice', printTitle: 'Tax Invoice',
    prefixKey: 'finPrefix', defPrefix: 'FIN', listScreen: 'fininvoices',
    partyTypes: ['customer'], partyLabel: 'Customer', tax: true, stock: null, noGst: true,
    hypothecation: true, excluded: true,
    header: []
  }
};

/* The financer invoice mirrors a sale invoice exactly — same header fields and
   same printed layout — with the borrower and loan details added on top. */
DOCS.financer.header = DOCS.invoice.header.concat([
  { k: 'loanAccountNo', label: 'Loan account no.' },
  { k: 'sanctionNo', label: 'Sanction / file no.' }
]);

function newDoc(kind) {
  var cfg = DOCS[kind];
  var st = settings();
  var d = {
    id: uid(cfg.coll.slice(0, 3)), kind: kind, no: '', date: today(),
    branchId: (S.branches[0] || {}).id, lines: [], status: kind === 'quotation' ? 'draft' : (cfg.isJob ? 'open' : 'unpaid'),
    createdAt: today(), createdBy: S.session.userId
  };
  (cfg.header || []).forEach(function (f) { if (f.def !== undefined) d[f.k] = typeof f.def === 'function' ? f.def() : f.def; });
  if (cfg.docTypes && cfg.docTypes.length && !d.saleType) d.saleType = cfg.docTypes[0][0];
  if (kind === 'invoice' || kind === 'financer') { d.saleType = 'sales'; d.dueDate = addDays(today(), 15); }
  if (kind === 'purchase') { d.dueDate = addDays(today(), 15); }
  return d;
}

/* ---------------- line editor ---------------- */
function needsSerial(it) {
  return !!it && (it.category === 'tractor' || it.serialTracked === true);
}
function serialUnitsFor(itemId, branchId, keepId) {
  var list = S.units.filter(function (u) {
    return u.status === 'in_stock' && u.itemId === itemId && (!branchId || u.branchId === branchId);
  }).map(function (u) { return { v: u.id, l: unitLabel(u) }; });
  if (keepId && !list.some(function (x) { return x.v === keepId; })) {
    var cu = unitOf(keepId);
    if (cu.id) list.unshift({ v: cu.id, l: unitLabel(cu) + '  (already on this document)' });
  }
  return list;
}

function lineModal(cfg, line, onSave, doc) {
  var isNew = !line;
  var l = line || {
    itemId: '', desc: '', hsn: '', qty: 1, rate: 0, discPct: 0,
    gstRate: settings().defaultGst || 12, unitId: ''
  };
  var fCat = '', fMake = '', fModel = '';
  if (line && line.itemId) {
    var li = item(line.itemId);
    fCat = li.category || '';
    fMake = li.makeId || '';
    fModel = li.modelId || '';
  } else {
    var dmk = defaultMakeId();
    if (dmk && S.items.some(function (i) { return i.makeId === dmk; })) fMake = dmk;
  }
  var body = formHtml([
    { k: 'catFilter', label: 'Category', type: 'select', placeholder: 'All categories', options: function () {
        return ITEM_CATS.map(function (c) { return [c[0], c[1]]; });
      } },
    { k: 'makeFilter', label: 'Make', type: 'select', placeholder: 'All makes', options: function () {
        return makeOptions(fCat).map(function (o) { return [o.v, o.l]; });
      } },
    { k: 'modelFilter', label: 'Model', type: 'select', placeholder: 'All models', options: function () {
        return modelOptions(fMake, fCat).map(function (o) { return [o.v, o.l]; });
      } },
    { k: 'itemId', label: 'Item', type: 'select', options: function () { return itemOptionsFor(fCat, fMake, fModel); }, required: true, span: 2 },
    { k: 'desc', label: 'Description on document', span: 2 },
    { k: 'chassisNo', label: 'Chassis / serial no.' },
    { k: 'engineNo', label: 'Engine no.' },
    { k: 'hsn', label: 'HSN / SAC' },
    { k: 'gstRate', label: 'GST %', type: 'select', options: function () { return gstOptions(); } },
    { k: 'qty', label: 'Quantity', type: 'number', step: '0.01', required: true },
    { k: 'rate', label: 'Rate', type: 'number', step: '0.01', required: true },
    { k: 'discPct', label: 'Discount %', type: 'number', step: '0.01' },
    { k: 'unitId', label: 'Unit / serial no.', type: 'select', span: 2, options: function () {
        return serialUnitsFor(l.itemId, doc.branchId, l.unitId);
      } }
  ], Object.assign({}, l, { catFilter: fCat, makeFilter: fMake, modelFilter: fModel }));
  var m = modal({
    title: isNew ? 'Add line item' : 'Edit line item',
    wide: true, body: body,
    footer: '<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Save line</button>'
  });

  var itemSel = qs('[name="itemId"]', m.el);
  var catSel = qs('[name="catFilter"]', m.el);
  var makeSel = qs('[name="makeFilter"]', m.el);
  var modelSel = qs('[name="modelFilter"]', m.el);

  function fillSelect(el, opts, placeholder) {
    el.innerHTML = '<option value="">' + esc(placeholder) + '</option>' + opts.map(function (o) {
      return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
    }).join('');
  }
  function refreshCascade(keepItem) {
    fillSelect(makeSel, makeOptions(fCat).map(function (o) { return { v: o.v, l: o.l }; }), 'All makes');
    makeSel.value = fMake;
    if (makeSel.value !== fMake) { fMake = ''; makeSel.value = ''; }
    fillSelect(modelSel, modelOptions(fMake, fCat), 'All models');
    modelSel.value = fModel;
    if (modelSel.value !== fModel) { fModel = ''; modelSel.value = ''; }
    var opts = itemOptionsFor(fCat, fMake, fModel);
    if (!opts.length) {
      itemSel.innerHTML = '<option value="">No items — widen the filters</option>';
    } else {
      fillSelect(itemSel, opts, '— select item —');
      if (keepItem) itemSel.value = keepItem;
    }
    refreshUnitField('');
  }
  catSel.onchange = function () { fCat = catSel.value; fMake = ''; fModel = ''; refreshCascade(''); };
  makeSel.onchange = function () { fMake = makeSel.value; fModel = ''; refreshCascade(''); };
  modelSel.onchange = function () { fModel = modelSel.value; refreshCascade(''); };
  var unitFld = qs('[name="unitId"]', m.el).parentElement;
  var unitSel = qs('[name="unitId"]', m.el);
  var qtyEl = qs('[name="qty"]', m.el);

  function refreshUnitField(keep) {
    var it = item(itemSel.value);
    var show = needsSerial(it) && cfg.kind !== 'purchase';
    unitFld.style.display = show ? '' : 'none';
    unitFld.querySelector('span').textContent = (it.category === 'tractor' ? 'Chassis / unit' : 'Serial number') + (show ? ' *' : '');
    if (!show) { unitSel.innerHTML = ''; return; }
    var opts = serialUnitsFor(itemSel.value, doc.branchId, keep);
    unitSel.innerHTML = '<option value="">— select —</option>' + opts.map(function (o) {
      return '<option value="' + o.v + '">' + esc(o.l) + '</option>';
    }).join('');
    if (keep) unitSel.value = keep;
  }

  function fillFromUnit() {
    var u = unitOf(unitSel.value);
    if (!u.id) return;
    var ch = m.el.querySelector('[name="chassisNo"]');
    var en = m.el.querySelector('[name="engineNo"]');
    if (ch && !ch.value) ch.value = u.chassisNo || u.serialNo || '';
    if (en && !en.value) en.value = u.engineNo || '';
  }
  unitSel.onchange = fillFromUnit;

  itemSel.onchange = function () {
    var it = item(itemSel.value);
    var set = function (k, v) {
      var e = qs('[name="' + k + '"]', m.el);
      if (e) e.value = v;
    };
    set('desc', it.name || '');
    set('hsn', it.hsn || '');
    set('gstRate', String(it.gstRate || 0));
    set('rate', cfg.kind === 'purchase' ? (it.purchaseRate || 0) : (it.saleRate || 0));
    var single = needsSerial(it) && cfg.kind !== 'purchase';
    if (single) qtyEl.value = '1';
    qtyEl.readOnly = single;
    refreshUnitField('');
  };
  refreshCascade(l.itemId || '');
  if (l.itemId) itemSel.value = l.itemId;
  refreshUnitField(l.unitId);
  if (l.unitId) fillFromUnit();

  qs('[data-cancel]', m.el).onclick = m.close;
  qs('[data-save]', m.el).onclick = function () {
    var v = readForm(m.el, [
      { k: 'itemId' }, { k: 'desc' }, { k: 'chassisNo' }, { k: 'engineNo' },
      { k: 'hsn' }, { k: 'gstRate', type: 'number' }, { k: 'qty', type: 'number' },
      { k: 'rate', type: 'number' }, { k: 'discPct', type: 'number' }, { k: 'unitId' }
    ]);
    if (!v.itemId) { toast('Choose an item', 'err'); return; }
    var it = item(v.itemId);
    if (needsSerial(it) && cfg.kind !== 'purchase' && cfg.kind !== 'quotation' && cfg.kind !== 'financer' && !v.unitId) {
      toast(it.category === 'tractor' ? 'Select the chassis being sold' : 'Select the serial number being sold', 'err');
      return;
    }
    if (needsSerial(it) && cfg.kind === 'purchase' && num(v.qty) !== Math.round(num(v.qty))) {
      toast('Serial tracked items must be purchased in whole units', 'err');
      return;
    }
    delete v.makeFilter; delete v.catFilter; delete v.modelFilter;
    v.desc = v.desc || it.name;
    v.qty = (needsSerial(it) && cfg.kind !== 'purchase') ? 1 : (num(v.qty) || 1);
    v.rate = num(v.rate);
    v.gstRate = num(v.gstRate);
    v.discPct = num(v.discPct);
    if (!v.unitId) delete v.unitId;
    m.close();
    onSave(v, isNew);
  };
}

/* ---------------- document editor ---------------- */
function openDocEditor(kind, docId, preset) {
  var cfg = DOCS[kind];
  var doc = docId ? JSON.parse(JSON.stringify(findOne(cfg.coll, docId))) : newDoc(kind);
  if (preset) Object.assign(doc, preset);
  if (!doc.lines) doc.lines = [];
  var isNew = !docId;
  var interState = false;

  var m = modal({ title: (isNew ? 'New ' : 'Edit ') + (cfg.printTitle || cfg.title), wide: true, body: '<div class="docbody"></div>', footer: '<div class="docfoot flex" style="width:100%"></div>' });
  var bodyEl = qs('.docbody', m.el);
  var footEl = qs('.docfoot', m.el);

  function p() { return party(doc.partyId); }
  function totals() {
    interState = isInterState(p());
    if (cfg.noLines) {
      var amt = r2(num(doc.amount));
      return { taxable: amt, cgst: 0, sgst: 0, igst: 0, roundOff: 0, total: amt, tax: 0 };
    }
    if (cfg.kind === 'financer' && (!doc.lines || !doc.lines.length)) {
      var t = r2(num(doc.loanAmount) + num(doc.marginMoney));
      return { taxable: r2(num(doc.loanAmount)), cgst: 0, sgst: 0, igst: 0, roundOff: 0, total: t, tax: 0, margin: num(doc.marginMoney) };
    }
    return computeTotals(doc.lines, interState);
  }

  function headerFields() {
    var f = [{ k: 'partyId', label: cfg.partyLabel, type: 'select', options: function () { return partyOptions(cfg.partyTypes); }, required: true, span: 2 },
      { k: 'date', label: 'Date', type: 'date', required: true },
      { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true }];
    return f.concat(cfg.header || []);
  }

  function syncHeader() {
    qsa('[name]', bodyEl).forEach(function (e) {
      var k = e.getAttribute('name');
      doc[k] = e.type === 'checkbox' ? e.checked : (e.type === 'number' ? num(e.value) : e.value);
    });
  }

  function render() {
    var t = totals();
    var h = formHtml(headerFields(), doc);
    if (cfg.hypothecation) {
      h += '<div class="section-label">Hypothecation / finance details</div><div class="tiny muted">Shown on the quotation so the customer sees the full funding picture.</div>';
    }
    if (cfg.noLines) {
      h += '<div class="note">This document is not a tax invoice — no GST is charged on it and it does not appear in GSTR-1 or the P&L. It is recorded as money received against the sale.</div>';
    }
    if (cfg.excluded) {
      h += '<div class="note">Financer invoice — GST is calculated and printed exactly like a tax invoice, but the document is <b>excluded from GSTR-1, GSTR-3B and the P&amp;L</b>. The sale itself is already reported through the customer invoice.</div>';
    }
    if (!cfg.noLines) {
    h += '<div class="section-label">' + (cfg.isJob ? 'Labour & parts' : 'Line items') + '</div>';
    h += '<div class="card tight" style="margin:0">';
    if (!doc.lines.length) h += '<div class="empty small">No items yet</div>';
    else h += doc.lines.map(function (l, i) {
      var u = l.unitId ? unitOf(l.unitId) : null;
      return '<div class="lineitem"><div><div class="li-title">' + esc(l.desc || itemName(l.itemId)) + '</div>' +
        '<div class="li-sub">' + fmtQty(l.qty) + ' × ' + inr(l.rate) + (l.discPct ? ' − ' + l.discPct + '%' : '') +
        ' · GST ' + l.gstRate + '%' + (u && u.chassisNo ? ' · <span class="mono">' + esc(u.chassisNo) + '</span>' : '') + '</div></div>' +
        '<div class="li-amt">' + inr(lineAmount(l)) +
        '<div style="margin-top:4px"><button class="btn sm" data-ed="' + i + '">' + icon('edit') + '</button> ' +
        '<button class="btn sm danger" data-rm="' + i + '">' + icon('trash') + '</button></div></div></div>';
    }).join('');
    h += '</div><button class="addline js-addline">+ Add ' + (cfg.isJob ? 'labour / part' : 'item') + '</button>';
    }

    h += '<div class="card" style="margin:14px 0 0;box-shadow:none;border:1px solid var(--line)">';
    if (cfg.noLines) {
      h += '<div class="kv"><span>Amount received</span><span>' + inr(doc.amount) + '</span></div>' +
        '<div class="kv"><span>GST</span><span class="green">Not applicable</span></div>' +
        '<div class="kv"><span>Against invoice</span><span>' + (doc.invoiceId ? esc((findOne('invoices', doc.invoiceId) || {}).no || '') : '—') + '</span></div>' +
        '<div class="grand"><span>Total</span><span>' + inr(t.total) + '</span></div>';
    } else if (cfg.kind === 'financer' && !doc.lines.length) {
      h += '<div class="kv"><span>Loan / finance amount</span><span>' + inr(doc.loanAmount) + '</span></div>' +
        '<div class="kv"><span>Margin money (customer)</span><span>' + inr(doc.marginMoney) + '</span></div>' +
        '<div class="grand"><span>Total</span><span>' + inr(t.total) + '</span></div>' +
        '<div class="note">Add line items to print this as a full tax invoice with GST.</div>';
    } else {
      h += '<div class="kv"><span>Taxable value</span><span>' + inr(t.taxable) + '</span></div>';
      if (interState) h += '<div class="kv"><span>IGST</span><span>' + inr(t.igst) + '</span></div>';
      else h += '<div class="kv"><span>CGST</span><span>' + inr(t.cgst) + '</span></div><div class="kv"><span>SGST</span><span>' + inr(t.sgst) + '</span></div>';
      h += '<div class="kv"><span>Round off</span><span>' + inr(t.roundOff) + '</span></div>' +
        '<div class="grand"><span>Invoice value</span><span>' + inr(t.total) + '</span></div>' +
        '<div class="tiny muted" style="margin-top:6px">' + (interState ? 'Inter-state supply (IGST)' : 'Intra-state supply (CGST + SGST)') + '</div>';
    }
    h += '</div>';
    bodyEl.innerHTML = h;

    qsa('[data-rm]', bodyEl).forEach(function (b) {
      b.onclick = function () { doc.lines.splice(Number(b.getAttribute('data-rm')), 1); render(); };
    });
    qsa('[data-ed]', bodyEl).forEach(function (b) {
      b.onclick = function () {
        var i = Number(b.getAttribute('data-ed'));
        lineModal(cfg, doc.lines[i], function (v) { doc.lines[i] = v; render(); }, doc);
      };
    });
    var al = qs('.js-addline', bodyEl);
    if (al) al.onclick = function () { lineModal(cfg, null, function (v) { doc.lines.push(v); render(); }, doc); };

    // capture header edits live
    qsa('[name]', bodyEl).forEach(function (e) {
      var k = e.getAttribute('name');
      var sync = function () {
        doc[k] = e.type === 'checkbox' ? e.checked : (e.type === 'number' ? num(e.value) : e.value);
      };
      e.oninput = sync;
      e.onchange = function () { sync(); if (k === 'partyId' || k === 'branchId') render(); };
    });

    footEl.innerHTML = '<button class="btn ghost js-dcancel">Cancel</button>' +
      '<button class="btn primary js-dsave" style="flex:1;justify-content:center">Save ' + cfg.title + '</button>';
    qs('.js-dcancel', footEl).onclick = m.close;
    qs('.js-dsave', footEl).onclick = function () { saveDoc(); };
  }

  function saveDoc() {
    syncHeader();
    if (!doc.partyId) { toast('Select the ' + cfg.partyLabel.toLowerCase(), 'err'); return; }
    if (!doc.lines.length && cfg.kind !== 'financer' && !cfg.isJob && !cfg.noLines) { toast('Add at least one line item', 'err'); return; }
    if (cfg.noLines && !num(doc.amount)) { toast('Enter the amount', 'err'); return; }
    var st = settings();
    if (!doc.no) doc.no = nextNo(cfg.kind, st[cfg.prefixKey] || cfg.defPrefix);
    if (cfg.kind === 'invoice') doc.docType = 'sales';
    if (cfg.kind === 'financer') doc.docType = 'financer';
    if (cfg.kind === 'margin') doc.docType = 'margin';
    var t = totals();
    if (cfg.kind === 'invoice' && doc.brokerId && !num(doc.brokerCommission)) {
      var br = S.parties.find(function (x) { return x.id === doc.brokerId; });
      if (br && num(br.commissionAmount)) doc.brokerCommission = num(br.commissionAmount);
    }
    Object.assign(doc, { taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, roundOff: t.roundOff, total: t.total });
    if (cfg.isJob) doc.total = t.total;
    upsert(cfg.coll, doc);
    if (cfg.stock === 'out' && cfg.kind === 'invoice') syncInvoiceStock(doc);
    if (cfg.stock === 'in') syncPurchaseStock(doc);
    if (cfg.kind === 'jobcard') syncJobStock(doc);
    m.close();
    toast(cfg.title + ' saved');
    Router.go(cfg.listScreen || cfg.coll);
    if (cfg.kind === 'purchase') askUnits(doc);
  }

  render();
  return m;
}

/* ---------------- stock posting ---------------- */
function syncInvoiceStock(doc) {
  S.units.forEach(function (u) {
    if (u.saleInvoiceId === doc.id) {
      u.status = 'in_stock'; u.saleInvoiceId = null; u.saleDate = null; u.customerId = null;
    }
  });
  S.moves = S.moves.filter(function (mv) { return mv.refId !== doc.id; });
  doc.lines.forEach(function (l) {
    var it = item(l.itemId);
    if (l.unitId) {
      var u = S.units.find(function (x) { return x.id === l.unitId; });
      if (u) {
        u.status = 'sold'; u.saleInvoiceId = doc.id; u.saleDate = doc.date;
        u.customerId = doc.partyId; u.salePrice = num(l.rate);
      }
    } else if (it.category !== 'service') {
      S.moves.push({
        id: uid('mv'), date: doc.date, itemId: l.itemId, branchId: doc.branchId,
        qty: -num(l.qty), rate: num(l.rate), type: 'sale', refId: doc.id, refNo: doc.no, note: partyName(doc.partyId)
      });
    }
  });
  save();
}

function syncPurchaseStock(doc) {
  S.moves = S.moves.filter(function (mv) { return mv.refId !== doc.id; });
  doc.lines.forEach(function (l) {
    var it = item(l.itemId);
    if (it.category === 'tractor' || it.serialTracked) return; // units handled separately
    if (it.category === 'service') return;
    S.moves.push({
      id: uid('mv'), date: doc.date, itemId: l.itemId, branchId: doc.branchId,
      qty: num(l.qty), rate: num(l.rate), type: 'purchase', refId: doc.id, refNo: doc.no, note: partyName(doc.partyId)
    });
  });
  save();
}

function syncJobStock(job) {
  S.moves = S.moves.filter(function (mv) { return mv.refId !== job.id; });
  (job.lines || []).forEach(function (l) {
    var it = item(l.itemId);
    if (it.category === 'service' || !l.itemId) return;
    if (it.category === 'tractor') return;
    S.moves.push({
      id: uid('mv'), date: job.date, itemId: l.itemId, branchId: job.branchId,
      qty: -num(l.qty), rate: num(l.rate), type: 'jobcard', refId: job.id, refNo: job.no, note: 'Job card ' + job.no
    });
  });
  save();
}

/* capture chassis/engine (tractors) or serial numbers (implements) purchased */
function askUnits(pb) {
  var need = [];
  (pb.lines || []).forEach(function (l) {
    var it = item(l.itemId);
    if (!(it.category === 'tractor' || it.serialTracked)) return;
    var n = Math.max(1, Math.round(num(l.qty)));
    for (var i = 0; i < n; i++) need.push({ itemId: l.itemId, rate: num(l.rate), kind: it.category === 'tractor' ? 'tractor' : 'serial' });
  });
  if (!need.length) return;
  var existing = S.units.filter(function (u) { return u.purchaseId === pb.id; }).length;
  if (existing >= need.length) return;
  var todo = need.slice(existing);
  var rows = '';
  todo.forEach(function (n, i) {
    var it = item(n.itemId);
    rows += '<div class="section-label">' + esc(it.name) + ' — unit ' + (i + 1) + ' of ' + todo.length + '</div><div class="formgrid">';
    if (n.kind === 'tractor') {
      rows += '<label class="fld"><span>Chassis no. <b>*</b></span><input name="ch' + i + '"></label>' +
        '<label class="fld"><span>Engine no. <b>*</b></span><input name="en' + i + '"></label>' +
        '<label class="fld"><span>Colour</span><input name="cl' + i + '"></label>' +
        '<label class="fld"><span>MFG year</span><input name="yr' + i + '" type="number" value="' + thisYear() + '"></label>';
    } else {
      rows += '<label class="fld span2"><span>Serial no. <b>*</b></span><input name="sn' + i + '"></label>' +
        '<label class="fld"><span>Colour / size</span><input name="cl' + i + '"></label>' +
        '<label class="fld"><span>MFG year</span><input name="yr' + i + '" type="number" value="' + thisYear() + '"></label>';
    }
    rows += '<label class="fld"><span>Cost</span><input name="cs' + i + '" type="number" value="' + n.rate + '"></label></div>';
  });
  var m = modal({
    title: 'Chassis / serial numbers',
    wide: true,
    body: '<div class="note">Each serialised item is tracked individually. Enter the details for every unit received against ' + esc(pb.no) + '.</div>' + rows,
    footer: '<button class="btn ghost" data-skip>Later</button><button class="btn primary" data-save>Save units</button>'
  });
  qs('[data-skip]', m.el).onclick = m.close;
  qs('[data-save]', m.el).onclick = function () {
    var bad = null;
    todo.forEach(function (n, i) {
      var main = n.kind === 'tractor'
        ? (qs('[name="ch' + i + '"]', m.el).value || '').trim()
        : (qs('[name="sn' + i + '"]', m.el).value || '').trim();
      if (!main) bad = n.kind === 'tractor' ? 'Chassis number is mandatory' : 'Serial number is mandatory';
      if (n.kind === 'tractor' && !(qs('[name="en' + i + '"]', m.el).value || '').trim()) bad = 'Engine number is mandatory';
    });
    if (bad) { toast(bad, 'err'); return; }
    todo.forEach(function (n, i) {
      var g = function (nm) { var e = qs('[name="' + nm + i + '"]', m.el); return e ? (e.value || '').trim() : ''; };
      var it = item(n.itemId);
      var unit = {
        id: uid('unt'), itemId: n.itemId, branchId: pb.branchId,
        unitKind: n.kind === 'tractor' ? 'tractor' : 'implement',
        unitType: 'new',
        chassisNo: n.kind === 'tractor' ? g('ch').toUpperCase() : '',
        serialNo: n.kind === 'serial' ? g('sn').toUpperCase() : '',
        engineNo: n.kind === 'tractor' ? g('en').toUpperCase() : '',
        model: it.model || '', colour: g('cl'), mfgYear: g('yr'),
        cost: num(g('cs')), purchaseId: pb.id, purchaseNo: pb.no, purchaseDate: pb.date,
        status: 'in_stock', supplierId: pb.partyId
      };
      if (n.kind === 'serial') unit.chassisNo = '';
      S.units.push(unit);
    });
    save(true); m.close();
    toast(todo.length + ' unit(s) added to stock');
    Router.render();
  };
}

/* ---------------- document viewer ---------------- */
function openDocView(kind, id) {
  var cfg = DOCS[kind];
  var d = findOne(cfg.coll, id);
  if (!d) { toast('Document not found', 'err'); return; }
  var pt = party(d.partyId);
  var inter = isInterState(pt);
  var o = org();
  var st = (d.kind === 'financer' && (!d.lines || !d.lines.length)) ? null : computeTotals(d.lines, inter);
  var title = cfg.printTitle || cfg.title;

  var h = '<div class="doc">' +
    '<div class="between"><div><h2>' + esc(o.name || '') + '</h2>' +
    '<div class="small">' + esc(o.address || '') + '</div>' +
    '<div class="small">GSTIN: ' + esc(o.gstin || '—') + ' · ' + esc(stateName(o.stateCode)) + '</div></div>' +
    '<div class="right"><div class="pill">' + esc(title.toUpperCase()) + '</div>' +
    '<div class="strong" style="margin-top:6px">' + esc(d.no) + '</div><div class="small">' + dmy(d.date) + '</div></div></div>' +
    '<hr><div class="two"><div><div class="small">BILL TO</div><div class="strong">' + esc(pt.name || '—') + '</div>' +
    '<div class="small">' + esc(pt.address || '') + '</div>' +
    '<div class="small">' + (pt.gstin ? 'GSTIN: ' + esc(pt.gstin) : 'Unregistered / B2C') + '</div>' +
    '<div class="small">' + esc(stateName(stateCodeOfParty(pt))) + '</div></div>' +
    '<div class="right small">' +
    (d.salesEmpId ? 'Sales: ' + esc(empName(d.salesEmpId)) + '<br>' : '') +
    (d.mechanicId ? 'Mechanic: ' + esc(empName(d.mechanicId)) + '<br>' : '') +
    (d.vehicleNo ? 'Vehicle: ' + esc(d.vehicleNo) + '<br>' : '') +
    (d.chassisNo ? 'Chassis: ' + esc(d.chassisNo) + '<br>' : '') +
    (d.engineNo ? 'Engine: ' + esc(d.engineNo) + '<br>' : '') +
    (d.billNo ? 'Supplier bill: ' + esc(d.billNo) + '<br>' : '') +
    (d.financerId ? 'Financer: ' + esc(partyName(d.financerId)) + '<br>' : '') +
    (d.transporterId ? 'Transporter: ' + esc(transporterName(d.transporterId)) + '<br>' : '') +
    (d.transport ? 'LR no.: ' + esc(d.transport) + '<br>' : '') +
    (d.rcm ? '<b>Reverse charge: Yes</b><br>' : '') +
    'Branch: ' + esc(branchName(d.branchId)) + '</div></div>';

  if (d.complaint) h += '<div class="note" style="margin-top:10px"><b>Complaint:</b> ' + esc(d.complaint) + '</div>';

  h += '<hr>';
  if (d.kind === 'margin') {
    h += '<div class="kv"><span>Margin money received</span><span>' + inr(d.amount) + '</span></div>' +
      '<div class="kv"><span>Received by</span><span>' + esc((d.mode || '').toUpperCase()) + '</span></div>' +
      '<div class="kv"><span>Financer</span><span>' + esc(d.financerId ? partyName(d.financerId) : '—') + '</span></div>' +
      '<div class="kv"><span>Against invoice</span><span>' + (d.invoiceId ? esc((findOne('invoices', d.invoiceId) || {}).no || '') : '—') + '</span></div>' +
      '<div class="kv"><span>Loan account</span><span>' + esc(d.loanAccountNo || '—') + '</span></div>' +
      '<div class="kv"><span>GST</span><span>Not applicable</span></div>' +
      '<div class="grand"><span>Total</span><span>' + inr(d.amount) + '</span></div>' +
      '<div class="note">Margin money receipt — a financing document. No GST is charged and it is excluded from the P&amp;L; it only reduces the outstanding on the linked invoice.</div>';
  } else {
    h += table({
      cls: 'compact',
      cols: [
        { k: 'desc', label: 'Description', render: function (l) {
            var u = l.unitId ? unitOf(l.unitId) : null;
            var ch = l.chassisNo || (u && (u.chassisNo || u.serialNo)) || '';
            var en = l.engineNo || (u && u.engineNo) || '';
            return esc(l.desc || itemName(l.itemId)) +
              (ch ? '<div class="small mono">Chassis/Serial: ' + esc(ch) + '</div>' : '') +
              (en ? '<div class="small mono">Engine: ' + esc(en) + '</div>' : '');
          } },
        { k: 'hsn', label: 'HSN', cls: 'tiny' },
        { k: 'qty', label: 'Qty', cls: 'num', render: function (l) { return fmtQty(l.qty); } },
        { k: 'rate', label: 'Rate', cls: 'num', render: function (l) { return fmt(l.rate); } },
        { k: 'gst', label: 'GST%', cls: 'num', render: function (l) { return l.gstRate + '%'; } },
        { k: 'amt', label: 'Amount', cls: 'num', render: function (l) { return fmt(lineAmount(l)); } }
      ],
      rows: d.lines
    });
    h += '<div style="margin-top:12px">' +
      '<div class="kv"><span>Taxable value</span><span>' + inr(st.taxable) + '</span></div>' +
      (inter ? '<div class="kv"><span>IGST</span><span>' + inr(st.igst) + '</span></div>'
        : '<div class="kv"><span>CGST</span><span>' + inr(st.cgst) + '</span></div><div class="kv"><span>SGST</span><span>' + inr(st.sgst) + '</span></div>') +
      '<div class="kv"><span>Round off</span><span>' + inr(st.roundOff) + '</span></div>' +
      '<div class="grand"><span>Total</span><span>' + inr(st.total) + '</span></div></div>' +
      '<div class="small" style="margin-top:8px">Amount in words: <b>' + esc(numToWords(st.total)) + '</b></div>';

    if (d.kind === 'financer') {
      h += '<div class="section-label">Hypothecation</div>' +
        '<div class="kv"><span>Financer</span><span>' + esc(d.financerId ? partyName(d.financerId) : (d.customerId ? partyName(d.customerId) : '—')) + '</span></div>' +
        '<div class="kv"><span>Loan amount</span><span>' + inr(d.loanAmount) + '</span></div>' +
        '<div class="kv"><span>Margin money</span><span>' + inr(d.marginMoney) + '</span></div>' +
        '<div class="kv"><span>Loan account</span><span>' + esc(d.loanAccountNo || '—') + '</span></div>' +
        '<div class="kv"><span>Vehicle / chassis</span><span>' + esc(d.vehicleNo || '—') + '</span></div>' +
        '<div class="note">GST is calculated on this invoice, but it is <b>not reported in GSTR-1 / 3B and not taken to the P&amp;L</b> — the sale is already reported through the customer invoice.</div>';
    }

    var mmAmt = marginTotal(d.id), exAmt = exchangeTotal(d.id);
    if (mmAmt || exAmt) {
      h += '<div class="section-label">Adjustments (not part of GST)</div>';
      if (mmAmt) h += '<div class="kv"><span>Margin money received</span><span>− ' + inr(mmAmt) + '</span></div>';
      if (exAmt) h += '<div class="kv"><span>Exchange value adjusted</span><span>− ' + inr(exAmt) + '</span></div>';
      var bal = invoiceOutstanding(d);
      h += '<div class="kv"><span><b>' + (bal < 0 ? 'Credit to customer' : 'Balance payable') + '</b></span><span><b>' +
        inr(Math.abs(bal)) + '</b></span></div>';
    }
    if (d.brokerId) {
      h += '<div class="kv"><span>Broker</span><span>' + esc(partyName(d.brokerId)) +
        (num(d.brokerCommission) ? ' · commission ' + inr(d.brokerCommission) : '') + '</span></div>';
    }
  }
  if (d.notes) h += '<div class="note">' + esc(d.notes) + '</div>';
  if (o.terms) h += '<div class="small" style="margin-top:10px">' + esc(o.terms) + '</div>';
  h += '<hr><div class="small">For ' + esc(o.name || '') + '<div style="margin-top:26px">Authorised signatory</div></div></div>';

  var m = modal({
    title: title + ' · ' + d.no,
    wide: true,
    body: h,
    footer: '<button class="btn ghost" data-pdf>' + icon('print') + 'PDF</button>' +
      '<button class="btn ghost" data-share>' + icon('share') + 'Share</button>' +
      (kind === 'quotation' ? '<button class="btn blue" data-conv>To invoice</button>' : '') +
      (kind === 'jobcard' ? '<button class="btn blue" data-conv>To invoice</button>' : '') +
      (kind === 'purchase' ? '<button class="btn ghost" data-units>Units</button>' : '') +
      '<button class="btn primary" data-edit>' + icon('edit') + 'Edit</button>' +
      '<button class="btn danger" data-del>' + icon('trash') + '</button>'
  });
  qs('[data-del]', m.el).onclick = function () {
    confirmDlg('Delete ' + d.no + '? Stock and ledger entries it created will be reversed.', function () {
      m.close();
      deleteDoc(kind, id);
    }, 'Delete');
  };
  var ub = qs('[data-units]', m.el);
  if (ub) ub.onclick = function () { m.close(); askUnits(d); };
  qs('[data-edit]', m.el).onclick = function () { m.close(); openDocEditor(kind, id); };
  var conv = qs('[data-conv]', m.el);
  if (conv) conv.onclick = function () {
    m.close();
    if (kind === 'quotation') quoteToInvoice(id); else invoiceFromJob(id);
  };
  var pdfBtn = qs('[data-pdf]', m.el);
  if (pdfBtn) pdfBtn.onclick = function () { m.close(); previewDoc(kind, id); };
  qs('[data-share]', m.el).onclick = function () {
    var txt = shareText(kind, id);
    if (window.AppBridge && window.AppBridge.shareText) window.AppBridge.shareText(title + ' ' + d.no, txt);
    else if (navigator.share) navigator.share({ title: title, text: txt });
    else { navigator.clipboard.writeText(txt); toast('Copied to clipboard'); }
  };
}

function deleteDoc(kind, id) {
  var cfg = DOCS[kind];
  var d = findOne(cfg.coll, id);
  if (!d) return;
  if (kind === 'invoice' || kind === 'financer') {
    S.units.forEach(function (u) {
      if (u.saleInvoiceId === d.id) { u.status = 'in_stock'; u.saleInvoiceId = null; u.saleDate = null; u.customerId = null; }
    });
  }
  if (kind === 'purchase') {
    S.units = S.units.filter(function (u) { return u.purchaseId !== d.id; });
  }
  S.moves = S.moves.filter(function (mv) { return mv.refId !== d.id; });
  S.payments.forEach(function (p) { if (p.refId === d.id) { p.refId = ''; delete p.refDocNo; } });
  S.notes.forEach(function (n) { if (n.refId === d.id) { n.refId = ''; } });
  removeRec(cfg.coll, d.id);
  save(true);
  toast('Deleted ' + d.no);
  Router.go(cfg.listScreen || cfg.coll);
}

function shareText(kind, id) {
  var d = findOne(DOCS[kind].coll, id);
  var pt = party(d.partyId);
  var o = org();
  var t = (d.kind === 'financer' && (!d.lines || !d.lines.length))
    ? { total: num(d.loanAmount) + num(d.marginMoney), taxable: num(d.loanAmount), cgst: 0, sgst: 0, igst: 0 }
    : (d.kind === 'margin' ? { total: num(d.amount), taxable: num(d.amount), cgst: 0, sgst: 0, igst: 0 } : computeTotals(d.lines, isInterState(pt)));
  var s = '*' + o.name + '*\n' + DOCS[kind].title + ' ' + d.no + ' · ' + dmy(d.date) + '\n' +
    'To: ' + (pt.name || '') + '\n\n';
  if (d.kind === 'margin') {
    return s + 'Margin money received: ' + inr(d.amount) + '\nBy: ' + (d.mode || '') +
      '\nAgainst invoice: ' + (d.invoiceId ? ((findOne('invoices', d.invoiceId) || {}).no || '') : '—') +
      '\nNo GST applicable.';
  }
  (d.lines || []).forEach(function (l) {
    var u = l.unitId ? unitOf(l.unitId) : null;
    var ch = l.chassisNo || (u && (u.chassisNo || u.serialNo)) || '';
    var en = l.engineNo || (u && u.engineNo) || '';
    s += '• ' + (l.desc || itemName(l.itemId)) + ' — ' + fmtQty(l.qty) + ' × ' + fmt(l.rate) + ' = ' + fmt(lineAmount(l)) + '\n';
    if (ch) s += '   Chassis/Serial: ' + ch + '\n';
    if (en) s += '   Engine: ' + en + '\n';
  });
  s += '\nTaxable: ' + inr(t.taxable) + '\nGST: ' + inr(num(t.cgst) + num(t.sgst) + num(t.igst)) + '\n*Total: ' + inr(t.total) + '*';
  if (d.financerId) s += '\nFinancer: ' + partyName(d.financerId) + '\nMargin money: ' + inr(d.marginMoney);
  return s;
}

function printable(kind, id) {
  var d = findOne(DOCS[kind].coll, id);
  var pt = party(d.partyId), o = org();
  var inter = isInterState(pt);
  var t = (d.kind === 'financer' && (!d.lines || !d.lines.length))
    ? { total: num(d.loanAmount) + num(d.marginMoney), taxable: num(d.loanAmount), cgst: 0, sgst: 0, igst: 0 }
    : (d.kind === 'margin' ? { total: num(d.amount), taxable: num(d.amount), cgst: 0, sgst: 0, igst: 0 } : computeTotals(d.lines, inter));
  var rows = (d.lines || []).map(function (l) {
    var u = l.unitId ? unitOf(l.unitId) : null;
    var ch = l.chassisNo || (u && (u.chassisNo || u.serialNo)) || '';
    var en = l.engineNo || (u && u.engineNo) || '';
    var ids = (ch ? '<br><small>Chassis / Serial: ' + esc(ch) + '</small>' : '') +
      (en ? '<br><small>Engine: ' + esc(en) + '</small>' : '');
    return '<tr><td>' + esc(l.desc || itemName(l.itemId)) + ids +
      '</td><td>' + esc(l.hsn || '') + '</td><td style="text-align:right">' + fmtQty(l.qty) + '</td><td style="text-align:right">' + fmt(l.rate) +
      '</td><td style="text-align:right">' + l.gstRate + '%</td><td style="text-align:right">' + fmt(lineAmount(l)) + '</td></tr>';
  }).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(d.no) + '</title><style>' +
    'body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:18px}' +
    'table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}' +
    'th{background:#f2f2f2;font-size:11px}h1{font-size:16px;margin:0}.r{text-align:right}' +
    '.box{border:1px solid #ddd;padding:8px;margin-top:10px}.tot{width:280px;margin-left:auto;margin-top:10px}' +
    '</style></head><body><table style="border:0"><tr><td style="border:0"><h1>' + esc(o.name || '') + '</h1>' +
    esc(o.address || '') + '<br>GSTIN: ' + esc(o.gstin || '') + '</td>' +
    '<td style="border:0;text-align:right"><b>' + esc((DOCS[kind].printTitle || DOCS[kind].title).toUpperCase()) + '</b><br>' + esc(d.no) + '<br>' + dmy(d.date) + '</td></tr></table>' +
    '<div class="box"><b>Bill to:</b> ' + esc(pt.name || '') + '<br>' + esc(pt.address || '') + '<br>' +
    (pt.gstin ? 'GSTIN: ' + esc(pt.gstin) : 'Unregistered') + ' · ' + esc(stateName(stateCodeOfParty(pt))) + '</div>' +
    ((d.transporterId || d.transport || d.ewayBill || d.vehicleNo || d.rcm)
      ? '<div class="box"><b>Transport:</b> ' +
        [d.transporterId ? esc(transporterName(d.transporterId)) : '',
         d.transport ? 'LR ' + esc(d.transport) : '',
         d.vehicleNo ? 'Vehicle ' + esc(d.vehicleNo) : '',
         d.ewayBill ? 'E-way ' + esc(d.ewayBill) : '',
         d.rcm ? 'Reverse charge: Yes' : ''].filter(Boolean).join(' · ') + '</div>'
      : '') +
    (d.kind === 'margin'
      ? '<div class="box">Margin money received: ' + fmt(d.amount) + '<br>By: ' + esc(d.mode || '') + '<br><b>No GST applicable</b></div>'
      : (d.lines && d.lines.length)
      ? '<table><thead><tr><th>Description</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : '<div class="box">Loan amount: ' + fmt(d.loanAmount) + ' · Margin money: ' + fmt(d.marginMoney) + '</div>') +
    '<div class="tot"><table>' +
    '<tr><td>Taxable</td><td class="r">' + fmt(t.taxable) + '</td></tr>' +
    (inter ? '<tr><td>IGST</td><td class="r">' + fmt(t.igst) + '</td></tr>'
      : '<tr><td>CGST</td><td class="r">' + fmt(t.cgst) + '</td></tr><tr><td>SGST</td><td class="r">' + fmt(t.sgst) + '</td></tr>') +
    '<tr><td><b>Total</b></td><td class="r"><b>' + fmt(t.total) + '</b></td></tr></table></div>' +
    (d.kind === 'financer' ? '<div class="box"><b>Hypothecation:</b> ' +
      esc(d.financerId ? partyName(d.financerId) : (d.customerId ? partyName(d.customerId) : '')) +
      (d.loanAccountNo ? ' · Loan A/c ' + esc(d.loanAccountNo) : '') +
      (d.vehicleNo ? ' · Chassis ' + esc(d.vehicleNo) : '') +
      '<br><small>GST shown for information. This document is not reported in GSTR-1 / 3B and does not affect the P&amp;L.</small></div>' : '') +
    '<p><b>Amount in words:</b> ' + esc(numToWords(t.total)) + '</p>' +
    '<p style="margin-top:30px">For ' + esc(o.name || '') + '<br><br><br>Authorised signatory</p></body></html>';
}
