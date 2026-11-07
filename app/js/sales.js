/* ============================================================
   sales.js — invoices, quotations, financer invoices,
   payments in/out, credit & debit notes, sales team & leads
   ============================================================ */

function docStatus(inv) {
  var out = invoiceOutstanding(inv);
  if (out <= 0.5) return 'paid';
  if (out < num(inv.total)) return 'partial';
  return 'unpaid';
}
function docStatusBadge(st) {
  var m = { paid: ['PAID', 'green'], partial: ['PART PAID', 'amber'], unpaid: ['UNPAID', 'red'] };
  var x = m[st] || ['OPEN', 'grey'];
  return badge(x[0], x[1]);
}

/* ================= INVOICES ================= */
screen('invoices', {
  title: 'Sales Invoices',
  render: function (view, params) {
    var tab = params.tab || 'all';
    var q = params.q || '';
    var list = salesInvoices().filter(function (i) {
      if (tab === 'unpaid') return invoiceOutstanding(i) > 0.5;
      if (tab === 'paid') return invoiceOutstanding(i) <= 0.5;
      if (tab === 'b2b') return !!party(i.partyId).gstin;
      return true;
    });
    if (q) list = list.filter(function (i) { return (i.no + ' ' + partyName(i.partyId)).toLowerCase().indexOf(q.toLowerCase()) > -1; });
    list = sortBy(list, 'date', 'desc');
    var total = sum(list, 'total');
    var outstanding = sum(list, function (i) { return invoiceOutstanding(i); });

    var expCols = [
      { k: 'date', label: 'Date' }, { k: 'no', label: 'Invoice' }, { k: 'customer', label: 'Customer' },
      { k: 'gstin', label: 'GSTIN' }, { k: 'taxable', label: 'Taxable' }, { k: 'gst', label: 'GST' },
      { k: 'total', label: 'Total' }, { k: 'balance', label: 'Outstanding' }, { k: 'rcm', label: 'RCM' }
    ];
    var expRows = list.map(function (i) {
      return {
        date: dmy(i.date), no: i.no, customer: partyName(i.partyId), gstin: party(i.partyId).gstin || '',
        taxable: num(i.taxable), gst: num(i.cgst) + num(i.sgst) + num(i.igst), total: num(i.total),
        balance: invoiceOutstanding(i), rcm: i.rcm ? 'Y' : 'N'
      };
    });
    var h = pageHead('Sales Invoices', [
      Export.action('Sales Invoices', function () { return expCols; }, function () { return expRows; }),
      { label: 'New invoice', icon: 'plus', cls: 'primary', onClick: function () { openDocEditor('invoice'); } }],
      list.length + ' invoices · ' + inr(total) + ' · ' + inr(outstanding) + ' outstanding');
    h += '<div class="tabs">' + [['all', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid'], ['b2b', 'B2B']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="searchbar"><input id="q" placeholder="Search invoice no. or customer…" value="' + esc(q) + '"></div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No invoices yet. Tap <b>New invoice</b> to bill your first tractor.</div>';
    else h += list.map(function (i) {
      var id = 'iv' + i.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { openDocView('invoice', i.id); };
      }, 0);
      var st = docStatus(i);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(i.partyId)) + '</div>' +
        '<div class="rc-sub">' + esc(i.no) + ' · ' + dmy(i.date) + ' · ' + esc((i.saleType || 'sales')) +
        (i.salesEmpId ? ' · ' + esc(empName(i.salesEmpId)) : '') + '</div></div>' +
        '<div class="rc-right">' + inr(i.total) + '<small>' + docStatusBadge(st) + '</small></div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('invoices', { tab: b.getAttribute('data-tab') }); }; });
    var inp = document.getElementById('q');
    inp.oninput = function () { clearTimeout(inp._t); inp._t = setTimeout(function () { Router.go('invoices', { tab: tab, q: inp.value }); }, 300); };
  }
});

/* ================= FINANCER INVOICES & MARGIN MONEY ================= */
screen('fininvoices', {
  title: 'Financer & Margin Money',
  render: function (view, params) {
    var tab = params.tab || 'fin';
    var fins = sortBy(financerInvoices(), 'date', 'desc');
    var margins = sortBy(S.marginReceipts, 'date', 'desc');
    var loanTotal = sum(fins, 'loanAmount');
    var marginTotalAll = sum(fins, 'marginMoney');
    var received = sum(margins, 'amount');

    var h = pageHead('Financer & Margin Money',
      tab === 'fin'
        ? [{ label: 'New', icon: 'plus', cls: 'primary', onClick: function () { openDocEditor('financer'); } }]
        : [{ label: 'New receipt', icon: 'plus', cls: 'primary', onClick: function () { openDocEditor('margin'); } }],
      'Excluded from GST and P&L');
    h += '<div class="tabs">' + [['fin', 'Financer invoices'], ['margin', 'Margin receipts'], ['sum', 'Summary']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    h += '<div class="card"><div class="tiny muted">This module handles the financing side of a sale. A <b>financer invoice</b> is a full tax invoice — customer, items, hypothecation, GST and total — raised on the bank or NBFC for the financed portion. It is <b>excluded from GSTR-1, GSTR-3B and the P&amp;L</b> because the sale is already reported on the customer invoice. <b>Margin receipts</b> record the customer\u2019s own down payment and are money-in only.</div></div>';

    if (tab === 'fin') {
      h += '<div class="stats">' + statCard('Invoiced', inr(sum(fins, 'total')), fins.length + ' invoices', 'blue') +
        statCard('Loan amount', inr(loanTotal), 'financed portion') +
        statCard('GST on these', inr(sum(fins, function (i) { return num(i.cgst) + num(i.sgst) + num(i.igst); })), 'not reported', 'amber') +
        statCard('Margin money', inr(marginTotalAll), 'customer share', 'green') + '</div>';
      h += '<div class="card tight">';
      if (!fins.length) h += '<div class="empty small">No financer invoices yet. Raise one when a bank or NBFC funds the tractor.</div>';
      else h += fins.map(function (i) {
        var id = 'fi' + i.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { openDocView('financer', i.id); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(i.partyId)) + '</div>' +
          '<div class="rc-sub">' + esc(i.no) + ' · ' + dmy(i.date) +
          (i.financerId ? ' · ' + esc(partyName(i.financerId)) : (i.customerId ? ' · ' + esc(partyName(i.customerId)) : '')) +
          ((i.lines || []).length ? ' · ' + i.lines.length + ' item(s)' : '') + '</div></div>' +
          '<div class="rc-right">' + inr(num(i.total) || (num(i.loanAmount) + num(i.marginMoney))) +
          '<small>' + (num(i.cgst) || num(i.sgst) || num(i.igst) ? 'incl. GST' : 'loan + margin') + '</small></div></div>';
      }).join('');
      h += '</div>';
    } else if (tab === 'margin') {
      h += '<div class="stats">' + statCard('Received', inr(received), margins.length + ' receipts', 'green') +
        statCard('Margin on invoices', inr(marginTotalAll), 'expected', 'amber') + '</div>';
      h += '<div class="card tight">';
      if (!margins.length) h += '<div class="empty small">No margin money receipts yet.</div>';
      else h += margins.map(function (m) {
        var id = 'mm' + m.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { openDocView('margin', m.id); };
        }, 0);
        var inv = m.invoiceId ? findOne('invoices', m.invoiceId) : null;
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(m.partyId)) + '</div>' +
          '<div class="rc-sub">' + esc(m.no) + ' · ' + dmy(m.date) + ' · ' + esc((m.mode || '').toUpperCase()) +
          (inv ? ' · vs ' + esc(inv.no) : '') + '</div></div>' +
          '<div class="rc-right green">' + inr(m.amount) + '<small>no GST</small></div></div>';
      }).join('');
      h += '</div>';
    } else {
      var rows = fins.map(function (i) {
        var mm = sum(S.marginReceipts.filter(function (m) { return m.invoiceId && i.customerId && findOne('invoices', m.invoiceId) && (findOne('invoices', m.invoiceId) || {}).customerId === i.customerId; }), 'amount');
        return { no: i.no, date: i.date, fin: partyName(i.partyId), cust: partyName(i.customerId), loan: num(i.loanAmount), margin: num(i.marginMoney), recd: mm };
      });
      h += '<div class="card tight"><h3 style="padding:12px 14px 0">Finance summary</h3><div class="pad" style="padding:6px 4px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'no', label: 'Doc', render: function (r) { return esc(r.no) + '<div class="tiny muted">' + dmy(r.date) + '</div>'; } },
          { k: 'cust', label: 'Customer', render: function (r) { return esc(r.cust); } },
          { k: 'loan', label: 'Loan', cls: 'num', render: function (r) { return fmt(r.loan); } },
          { k: 'margin', label: 'Margin', cls: 'num', render: function (r) { return fmt(r.margin); } }
        ],
        rows: rows,
        empty: 'Nothing to summarise yet'
      }) + '</div></div>';
      h += '<div class="card"><div class="kv"><span>Loan value financed</span><span>' + inr(loanTotal) + '</span></div>' +
        '<div class="kv"><span>Margin money on invoices</span><span>' + inr(marginTotalAll) + '</span></div>' +
        '<div class="kv"><span>Margin money received</span><span class="green">' + inr(received) + '</span></div>' +
        '<div class="kv"><span>GST charged</span><span>Nil</span></div></div>';
    }
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('fininvoices', { tab: b.getAttribute('data-tab') }); }; });
  }
});

/* ================= QUOTATIONS ================= */
screen('quotations', {
  title: 'Quotations',
  render: function (view) {
    var list = sortBy(S.quotations, 'date', 'desc');
    var h = pageHead('Quotations', [{ label: 'New quote', icon: 'plus', cls: 'primary', onClick: function () { openDocEditor('quotation'); } }],
      'Including hypothecation & finance workings');
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No quotations yet.</div>';
    else h += list.map(function (q) {
      var id = 'qt' + q.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { openDocView('quotation', q.id); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(q.partyId)) + ' ' + badge(q.status || 'draft', statusTone(q.status)) + '</div>' +
        '<div class="rc-sub">' + esc(q.no) + ' · ' + dmy(q.date) + ' · valid till ' + dmy(q.validTill) +
        (q.financerId ? ' · ' + esc(partyName(q.financerId)) : '') + '</div></div>' +
        '<div class="rc-right">' + inr(q.total) + '<small>' + (q.marginMoney ? 'margin ' + inr(q.marginMoney) : '') + '</small></div></div>';
    }).join('');
    view.innerHTML = h + '</div>';
  }
});

/* ================= PAYMENTS ================= */
screen('payments', {
  title: 'Payments In / Out',
  render: function (view, params) {
    var tab = params.tab || 'all';
    var list = S.payments.filter(function (p) { return tab === 'all' || p.type === tab; });
    list = sortBy(list, 'date', 'desc');
    var tin = sum(S.payments.filter(function (p) { return p.type === 'in'; }), 'amount');
    var tout = sum(S.payments.filter(function (p) { return p.type === 'out'; }), 'amount');

    var payCols = [
      { k: 'date', label: 'Date' }, { k: 'no', label: 'Receipt' }, { k: 'type', label: 'Type' },
      { k: 'party', label: 'Party' }, { k: 'mode', label: 'Mode' }, { k: 'amount', label: 'Amount' },
      { k: 'ref', label: 'Reference' }
    ];
    var payRows = list.map(function (p) {
      return { date: dmy(p.date), no: p.no || '', type: p.type === 'in' ? 'Received' : 'Paid', party: partyName(p.partyId), mode: p.mode || '', amount: num(p.amount), ref: p.refDocNo || p.refNo || '' };
    });
    var h = pageHead('Payments In / Out', [
      Export.action('Payments', function () { return payCols; }, function () { return payRows; }),
      { label: 'Money in', icon: 'arrowDown', cls: 'primary', onClick: function () { payForm('in'); } },
      { label: 'Money out', icon: 'arrowUp', onClick: function () { payForm('out'); } }
    ], 'Received ' + inr(tin) + ' · Paid ' + inr(tout) + ' · Net ' + inr(tin - tout));
    h += '<div class="tabs">' + [['all', 'All'], ['in', 'Received'], ['out', 'Paid']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No payments recorded.</div>';
    else h += list.map(function (p) {
      var id = 'py' + p.id;
      setTimeout(function () {
        var e = document.getElementById(id);
        if (e) e.onclick = function () { openPaymentView(p.id); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(p.partyId)) + '</div>' +
        '<div class="rc-sub">' + esc(p.no || '') + ' · ' + dmy(p.date) + ' · ' + esc((p.mode || '').toUpperCase()) +
        (p.refNo ? ' · ' + esc(p.refNo) : '') + '</div></div>' +
        '<div class="rc-right ' + (p.type === 'in' ? 'green' : 'red') + '">' + (p.type === 'in' ? '+' : '−') + inr(p.amount) +
        '<small>' + esc(branchName(p.branchId)) + '</small></div></div>';
    }).join('');
    view.innerHTML = h + '</div>';
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('payments', { tab: b.getAttribute('data-tab') }); }; });
  }
});

function payForm(type) {
  var partyTypes = type === 'in' ? ['customer', 'financer'] : ['supplier', 'transporter'];
  var fields = [
    { k: 'partyId', label: type === 'in' ? 'Received from' : 'Paid to', type: 'select', required: true, span: 2, options: function () { return partyOptions(partyTypes); } },
    { k: 'date', label: 'Date', type: 'date', required: true, def: today() },
    { k: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
    { k: 'mode', label: 'Mode', type: 'select', options: [['cash', 'Cash'], ['bank', 'Bank transfer / NEFT'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['card', 'Card']], def: 'cash', required: true },
    { k: 'refNo', label: 'Cheque / UTR / reference' },
    { k: 'bankAccountId', label: 'Bank account', type: 'select', options: bankAccountOptions, help: 'For bank / UPI / cheque' },
    { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true, def: (S.branches[0] || {}).id },
    { k: 'note', label: 'Narration', type: 'textarea', span: 2, rows: 2 }
  ];
  var m = modal({
    title: type === 'in' ? 'Money in (receipt)' : 'Money out (payment)',
    wide: true,
    body: formHtml(fields) + '<div class="js-opendocs"></div>',
    footer: '<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button>'
  });
  var psel = qs('[name="partyId"]', m.el);
  function refreshDocs() {
    var pid = psel.value;
    var docs = type === 'in'
      ? S.invoices.filter(function (i) { return i.partyId === pid && invoiceOutstanding(i) > 0.5; })
      : S.purchases.filter(function (p) { return p.partyId === pid && purchaseOutstanding(p) > 0.5; });
    var box = qs('.js-opendocs', m.el);
    if (!docs.length) { box.innerHTML = '<div class="note">No open documents for this party — the payment will be treated as an on-account entry.</div>'; return; }
    box.innerHTML = '<div class="section-label">Adjust against</div>' + docs.map(function (d, i) {
      var open = type === 'in' ? invoiceOutstanding(d) : purchaseOutstanding(d);
      return '<label class="rowcard" style="padding:8px 0"><div class="rc-main"><div class="rc-title">' + esc(d.no) + ' · ' + dmy(d.date) + '</div>' +
        '<div class="rc-sub">Open: ' + inr(open) + '</div></div>' +
        '<div class="rc-right"><input type="radio" name="ref" value="' + d.id + '" ' + (i === 0 ? 'checked' : '') + ' style="width:20px;height:20px"></div></label>';
    }).join('');
    var amt = qs('[name="amount"]', m.el);
    if (docs[0] && !num(amt.value)) amt.value = (type === 'in' ? invoiceOutstanding(docs[0]) : purchaseOutstanding(docs[0]));
  }
  psel.onchange = refreshDocs;
  refreshDocs();
  qs('[data-cancel]', m.el).onclick = m.close;
  qs('[data-save]', m.el).onclick = function () {
    var v = readForm(m.el, fields);
    if (!v.partyId) { toast('Select a party', 'err'); return; }
    if (!num(v.amount)) { toast('Enter the amount', 'err'); return; }
    var rd = m.el.querySelector('input[name="ref"]:checked');
    var rec = {
      id: uid('pay'), no: nextNo('pay', settings().payPrefix), type: type, partyId: v.partyId,
      date: v.date, amount: num(v.amount), mode: v.mode, refNo: v.refNo, branchId: v.branchId,
      bankAccountId: v.bankAccountId || '', note: v.note, refId: rd ? rd.value : '', createdAt: today()
    };
    var doc = rd ? (type === 'in' ? findOne('invoices', rd.value) : findOne('purchases', rd.value)) : null;
    if (doc) rec.refDocNo = doc.no;
    upsert('payments', rec); m.close(); toast('Payment saved'); Router.render();
  };
}

/* ================= CREDIT / DEBIT NOTES ================= */
screen('notes', {
  title: 'Credit / Debit Notes',
  render: function (view, params) {
    var tab = params.tab || 'all';
    var list = S.notes.filter(function (n) { return tab === 'all' || n.type === tab; });
    list = sortBy(list, 'date', 'desc');
    var h = pageHead('Credit / Debit Notes', [
      { label: 'Credit note', icon: 'plus', cls: 'primary', onClick: function () { noteForm('credit'); } },
      { label: 'Debit note', icon: 'plus', onClick: function () { noteForm('debit'); } }
    ], 'Sales return & purchase return adjustments');
    h += '<div class="tabs">' + [['all', 'All'], ['credit', 'Credit (issued)'], ['debit', 'Debit (received)']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div><div class="card tight">';
    if (!list.length) h += '<div class="empty small">No credit or debit notes yet.</div>';
    else h += list.map(function (n) {
      var id = 'nt' + n.id;
      setTimeout(function () {
        var e = document.getElementById(id);
        if (e) e.onclick = function () { openNoteView(n.id); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(n.partyId)) + ' ' +
        badge(n.type === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE', n.type === 'credit' ? 'blue' : 'amber') + '</div>' +
        '<div class="rc-sub">' + esc(n.no) + ' · ' + dmy(n.date) + ' · ' + esc(n.reason || '') + (n.refDocNo ? ' · vs ' + esc(n.refDocNo) : '') + '</div></div>' +
        '<div class="rc-right">' + inr(n.total) + '<small>incl. GST ' + inr(n.tax) + '</small></div></div>';
    }).join('');
    view.innerHTML = h + '</div>';
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('notes', { tab: b.getAttribute('data-tab') }); }; });
  }
});

function noteForm(type) {
  var fields = [
    { k: 'partyId', label: type === 'credit' ? 'Customer' : 'Supplier', type: 'select', required: true, span: 2, options: function () { return partyOptions(type === 'credit' ? ['customer'] : ['supplier']); } },
    { k: 'date', label: 'Date', type: 'date', required: true, def: today() },
    { k: 'amount', label: 'Amount (incl. GST)', type: 'number', step: '0.01', required: true },
    { k: 'gstRate', label: 'GST %', type: 'select', options: function () { return gstOptions(); }, def: '12' },
    { k: 'reason', label: 'Reason / particulars', type: 'textarea', span: 2, rows: 2, required: true },
    { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true, def: (S.branches[0] || {}).id }
  ];
  var m = modal({
    title: type === 'credit' ? 'Credit note' : 'Debit note',
    wide: true,
    body: formHtml(fields) + '<div class="js-refbox"></div>',
    footer: '<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Save note</button>'
  });
  var ps = qs('[name="partyId"]', m.el);
  ps.onchange = function () {
    var docs = type === 'credit'
      ? S.invoices.filter(function (i) { return i.partyId === ps.value; })
      : S.purchases.filter(function (p) { return p.partyId === ps.value; });
    var box = qs('.js-refbox', m.el);
    box.innerHTML = '<div class="section-label">Against document (optional)</div>' +
      '<label class="fld"><span>Document</span><select name="refId"><option value="">— none —</option>' +
      docs.map(function (d) { return '<option value="' + d.id + '">' + esc(d.no) + ' · ' + dmy(d.date) + ' · ' + inr(d.total) + '</option>'; }).join('') +
      '</select></label>';
  };
  ps.onchange();
  qs('[data-cancel]', m.el).onclick = m.close;
  qs('[data-save]', m.el).onclick = function () {
    var v = readForm(m.el, fields.concat([{ k: 'refId' }]));
    if (!v.partyId || !num(v.amount)) { toast('Party and amount are required', 'err'); return; }
    var gst = num(v.gstRate);
    var taxable = r2(num(v.amount) / (1 + gst / 100));
    var tax = r2(num(v.amount) - taxable);
    var rec = {
      id: uid('not'), no: nextNo(type === 'credit' ? 'cn' : 'dn', type === 'credit' ? settings().cnPrefix : settings().dnPrefix),
      type: type, partyId: v.partyId, date: v.date, reason: v.reason, branchId: v.branchId,
      gstRate: gst, taxable: taxable, tax: tax, total: r2(num(v.amount)), refId: v.refId || ''
    };
    if (v.refId) {
      var d = findOne(type === 'credit' ? 'invoices' : 'purchases', v.refId);
      if (d) rec.refDocNo = d.no;
    }
    upsert('notes', rec); m.close(); toast('Note saved'); Router.render();
  };
}

/* ================= SALES TEAM & LEADS ================= */
function periodRange(kind) {
  var t = today();
  var d = new Date(t + 'T00:00:00');
  if (kind === 'day') return { from: t, to: t, label: 'Today' };
  if (kind === 'week') {
    var day = d.getDay() === 0 ? 6 : d.getDay() - 1;
    var start = new Date(d); start.setDate(d.getDate() - day);
    var end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: isoOf(start), to: isoOf(end), label: 'This week' };
  }
  if (kind === 'year') return { from: thisYear() + '-01-01', to: thisYear() + '-12-31', label: 'This year' };
  return Object.assign({ label: 'This month' }, monthRange(thisMonth()));
}
function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

screen('leads', {
  title: 'Sales Team & Leads',
  render: function (view, params) {
    var tab = params.tab || 'dash';
    var period = params.period || 'month';
    var empF = params.emp || '';
    var rng = periodRange(period);
    var all = S.leads.filter(function (l) { return !empF || l.salesEmpId === empF; });
    var inPeriod = all.filter(function (l) { return inRange(l.date || today(), rng.from, rng.to); });
    var won = inPeriod.filter(function (l) { return l.status === 'won'; });
    var lost = inPeriod.filter(function (l) { return l.status === 'lost'; });
    var open = inPeriod.filter(function (l) { return l.status !== 'won' && l.status !== 'lost'; });

    var h = pageHead('Sales Team & Leads', [{ label: 'New lead', icon: 'plus', cls: 'primary', onClick: function () { leadForm(); } }],
      rng.label + ' · ' + inPeriod.length + ' leads · ' + won.length + ' won');
    h += '<div class="tabs">' + [['dash', 'Dashboard'], ['leads', 'Leads'], ['team', 'Productivity']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="searchbar"><select id="empF" style="border:1px solid #d6dee6;border-radius:12px;padding:10px;background:#fff;width:100%">' +
      '<option value="">All employees</option>' +
      S.employees.filter(function (e) { return e.empType === 'sales' || S.leads.some(function (l) { return l.salesEmpId === e.id; }); })
        .map(function (e) {
          return '<option value="' + e.id + '"' + (empF === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>';
        }).join('') +
      '</select></div>';

    if (tab === 'dash') {
      h += '<div class="tabs">' + [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']].map(function (t) {
        return '<button class="tab ' + (period === t[0] ? 'on' : '') + '" data-period="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';

      var conv = inPeriod.length ? Math.round(won.length / inPeriod.length * 100) : 0;
      h += '<div class="stats">' +
        statCard('Leads', String(inPeriod.length), (empF ? empName(empF) : rng.label.toLowerCase()), 'blue') +
        statCard('Won', String(won.length), conv + '% conversion', 'green') +
        statCard('Open', String(open.length), 'in pipeline', 'amber') +
        statCard('Lost', String(lost.length), 'dropped', 'red') + '</div>';

      // DSP-wise (dealer sales person)
      var byDsp = groupBy(inPeriod, function (l) { return l.salesEmpId || 'unassigned'; });
      var dspRows = Object.keys(byDsp).map(function (k) {
        var recs = byDsp[k];
        var w = recs.filter(function (l) { return l.status === 'won'; }).length;
        var salesVal = sum(S.invoices.filter(function (i) {
          return i.salesEmpId === k && i.docType !== 'financer' && inRange(i.date, rng.from, rng.to);
        }), 'taxable');
        return {
          dsp: k === 'unassigned' ? 'Unassigned' : empName(k),
          leads: recs.length, won: w, lost: recs.filter(function (l) { return l.status === 'lost'; }).length,
          conv: recs.length ? Math.round(w / recs.length * 100) : 0,
          sales: salesVal,
          productivity: recs.length ? Math.round(salesVal / recs.length) : 0
        };
      }).sort(function (a, b) { return b.leads - a.leads; });

      h += '<div class="card tight"><h3 style="padding:12px 14px 0">DSP-wise performance</h3><div class="pad" style="padding:6px 4px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'dsp', label: 'Sales person', render: function (r) { return esc(r.dsp); } },
          { k: 'leads', label: 'Leads', cls: 'num', render: function (r) { return String(r.leads); } },
          { k: 'won', label: 'Won', cls: 'num', render: function (r) { return '<span class="green">' + r.won + '</span>'; } },
          { k: 'conv', label: 'Conv.', cls: 'num', render: function (r) { return r.conv + '%'; } },
          { k: 'sales', label: 'Sales', cls: 'num', render: function (r) { return fmt(r.sales, 0); } }
        ],
        rows: dspRows,
        empty: 'No leads in this period'
      }) + '</div></div>';

      // trend
      var trend = [];
      if (period === 'year') {
        for (var m = 1; m <= 12; m++) {
          var mm = thisYear() + '-' + pad(m);
          trend.push({ l: monthName(m).slice(0, 3), v: all.filter(function (l) { return String(l.date).slice(0, 7) === mm; }).length });
        }
      } else {
        var days = Math.min(14, Math.max(7, daysBetween(rng.from, rng.to) + 1));
        for (var i = days - 1; i >= 0; i--) {
          var dt = addDays(today(), -i);
          trend.push({ l: dt.slice(8), v: all.filter(function (l) { return l.date === dt; }).length });
        }
      }
      h += '<div class="card"><h3>Lead inflow</h3>' + barChart(trend, { fmt: function (v) { return String(v); } }) + '</div>';

      var bySource = groupBy(inPeriod, 'source');
      h += '<div class="card"><h3>Source mix</h3>' + barChart(Object.keys(bySource).map(function (k) {
        return { l: k, v: bySource[k].length, tone: 'blue' };
      }), { fmt: function (v) { return String(v); } }) + '</div>';

      var follow = sortBy(open.filter(function (l) { return l.nextFollowUp; }), 'nextFollowUp').slice(0, 6);
      if (follow.length) {
        h += '<div class="card"><h3>Follow-ups</h3>' + follow.map(function (l) {
          return '<div class="kv"><span>' + esc(l.name) + ' · ' + esc(l.phone || '') + '</span>' +
            '<span class="' + (l.nextFollowUp <= today() ? 'red' : '') + '">' + dmy(l.nextFollowUp) + '</span></div>';
        }).join('') + '</div>';
      }
    } else if (tab === 'leads') {
      var list = sortBy(all, 'date', 'desc');
      h += '<div class="searchbar"><input id="lq" placeholder="Search name, phone, village…" value="' + esc(params.q || '') + '"></div>';
      if (params.q) list = list.filter(function (l) {
        return (l.name + ' ' + (l.phone || '') + ' ' + (l.village || '')).toLowerCase().indexOf(String(params.q).toLowerCase()) > -1;
      });
      h += '<div class="card tight">';
      if (!list.length) h += '<div class="empty small">No leads captured yet.</div>';
      else h += list.map(function (l) {
        var id = 'ld' + l.id;
        setTimeout(function () {
          var e = document.getElementById(id);
          if (e) e.onclick = function () { leadForm(l); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(l.name) + ' ' + badge(l.status || 'new', statusTone(l.status)) + '</div>' +
          '<div class="rc-sub">' + esc(l.phone || '') + ' · ' + esc(l.source || '') + (l.village ? ' · ' + esc(l.village) : '') +
          (l.salesEmpId ? ' · ' + esc(empName(l.salesEmpId)) : '') + (l.nextFollowUp ? ' · next ' + dmy(l.nextFollowUp) : '') + '</div></div>' +
          '<div class="rc-right"><small>' + esc(l.model || '') + '</small></div></div>';
      }).join('');
      h += '</div>';
    } else {
      var team = S.employees.filter(function (e) { return e.empType === 'sales' && e.active !== false; });
      var month = thisMonth();
      h += '<div class="card tight">';
      if (!team.length) h += '<div class="empty small">Add sales executives under Employees.</div>';
      else h += team.map(function (e) {
        var sales = S.invoices.filter(function (i) {
          return i.salesEmpId === e.id && String(i.date).slice(0, 7) === month && i.docType !== 'financer';
        });
        var achieved = sum(sales, 'taxable');
        var target = num(e.target);
        var inc = r2(sales.length * num(e.incentiveAmount));
        var pctv = target ? Math.min(100, Math.round(achieved / target * 100)) : 0;
        var leadsN = S.leads.filter(function (l) { return l.salesEmpId === e.id; }).length;
        var wonN = S.leads.filter(function (l) { return l.salesEmpId === e.id && l.status === 'won'; }).length;
        return '<div class="rowcard"><div class="rc-main"><div class="rc-title">' + esc(e.name) + '</div>' +
          '<div class="rc-sub">' + sales.length + ' invoices · ' + leadsN + ' leads · ' + wonN + ' won · incentive ' + inr(inc) + '</div>' +
          '<div class="btrack" style="margin-top:6px"><div class="bfill" style="width:' + pctv + '%"></div></div></div>' +
          '<div class="rc-right">' + inr(achieved) + '<small>of ' + inr(target) + '</small></div></div>';
      }).join('');
      h += '</div>';
      h += '<div class="card"><h3>Pipeline</h3>' +
        barChart([['new', 'New'], ['contacted', 'Contacted'], ['negotiation', 'Negotiation'], ['won', 'Won'], ['lost', 'Lost']].map(function (s) {
          return { l: s[1], v: all.filter(function (l) { return (l.status || 'new') === s[0]; }).length, tone: s[0] === 'won' ? '' : 'blue' };
        }), { fmt: function (v) { return String(v); } }) + '</div>';
    }
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) {
      b.onclick = function () { Router.go('leads', { tab: b.getAttribute('data-tab'), period: period, emp: empF }); };
    });
    qsa('[data-period]', view).forEach(function (b) {
      b.onclick = function () { Router.go('leads', { tab: 'dash', period: b.getAttribute('data-period'), emp: empF }); };
    });
    var ef = document.getElementById('empF');
    if (ef) ef.onchange = function () { Router.go('leads', { tab: tab, period: period, emp: ef.value }); };
    var lq = document.getElementById('lq');
    if (lq) lq.oninput = function () { clearTimeout(lq._t); lq._t = setTimeout(function () { Router.go('leads', { tab: 'leads', q: lq.value, emp: empF }); }, 300); };
  }
});

function leadForm(l) {
  var isNew = !l;
  editEntity({
    title: isNew ? 'New lead' : 'Edit lead',
    wide: true,
    rec: l,
    defaults: { date: today(), status: 'new', salesEmpId: '', source: 'walk-in' },
    fields: [
      { k: 'name', label: 'Customer name', required: true, span: 2 },
      { k: 'phone', label: 'Phone', type: 'tel', required: true },
      { k: 'village', label: 'Village / city' },
      { k: 'model', label: 'Model interested in' },
      { k: 'source', label: 'Source', type: 'select', options: [['walk-in', 'Walk-in'], ['phone', 'Phone enquiry'], ['referral', 'Referral'], ['village-meet', 'Village meet'], ['digital', 'Digital / social']] },
      { k: 'salesEmpId', label: 'Assigned to', type: 'select', options: function () { return empOptions('sales'); } },
      { k: 'date', label: 'Enquiry date', type: 'date' },
      { k: 'status', label: 'Status', type: 'select', options: [['new', 'New'], ['contacted', 'Contacted'], ['negotiation', 'Negotiation'], ['won', 'Won'], ['lost', 'Lost']] },
      { k: 'nextFollowUp', label: 'Next follow-up', type: 'date' },
      { k: 'remarks', label: 'Remarks', type: 'textarea', span: 2, rows: 2 }
    ],
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) rec.id = uid('led');
      upsert('leads', rec); toast('Lead saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('leads', rec.id); Router.render(); }
  });
}


/* ---------------- note & payment viewers (print / PDF) ---------------- */
function openNoteView(id) {
  var n = findOne('notes', id);
  if (!n) return;
  var m = modal({
    title: n.no,
    body: '<div class="kv"><span>Type</span><span>' + (n.type === 'credit' ? 'Credit note' : 'Debit note') + '</span></div>' +
      '<div class="kv"><span>Party</span><span>' + esc(partyName(n.partyId)) + '</span></div>' +
      '<div class="kv"><span>Date</span><span>' + dmy(n.date) + '</span></div>' +
      (n.refDocNo ? '<div class="kv"><span>Against</span><span>' + esc(n.refDocNo) + '</span></div>' : '') +
      '<div class="kv"><span>Taxable</span><span>' + inr(n.taxable) + '</span></div>' +
      '<div class="kv"><span>GST</span><span>' + inr(n.tax) + '</span></div>' +
      '<div class="grand"><span>Total</span><span>' + inr(n.total) + '</span></div>' +
      (n.reason ? '<div class="note">' + esc(n.reason) + '</div>' : ''),
    footer: '<button class="btn danger" data-del>' + icon('trash') + '</button>' +
      '<button class="btn ghost" data-preview>View</button>' +
      '<button class="btn primary" data-print>' + icon('print') + 'PDF / Print</button>'
  });
  qs('[data-preview]', m.el).onclick = function () { m.close(); previewDoc(n.type === 'credit' ? 'creditnote' : 'debitnote', id); };
  qs('[data-print]', m.el).onclick = function () { m.close(); printDoc(n.type === 'credit' ? 'creditnote' : 'debitnote', id); };
  qs('[data-del]', m.el).onclick = function () {
    m.close();
    confirmDlg('Delete ' + n.no + '?', function () { removeRec('notes', n.id); Router.render(); }, 'Delete');
  };
}

function openPaymentView(id) {
  var p = findOne('payments', id);
  if (!p) return;
  var doc = p.refId ? (p.type === 'in' ? findOne('invoices', p.refId) : findOne('purchases', p.refId)) : null;
  var m = modal({
    title: p.no || (p.type === 'in' ? 'Receipt' : 'Payment'),
    body: '<div class="kv"><span>Type</span><span>' + (p.type === 'in' ? 'Received' : 'Paid') + '</span></div>' +
      '<div class="kv"><span>Party</span><span>' + esc(partyName(p.partyId)) + '</span></div>' +
      '<div class="kv"><span>Date</span><span>' + dmy(p.date) + '</span></div>' +
      '<div class="kv"><span>Mode</span><span>' + esc((p.mode || '').toUpperCase()) + (p.refNo ? ' · ' + esc(p.refNo) : '') + '</span></div>' +
      (doc ? '<div class="kv"><span>Against</span><span>' + esc(doc.no) + '</span></div>' : '') +
      (p.note ? '<div class="kv"><span>Narration</span><span>' + esc(p.note) + '</span></div>' : '') +
      '<div class="grand"><span>Amount</span><span>' + inr(p.amount) + '</span></div>' +
      '<div class="tiny muted" style="margin-top:6px">' + esc(numToWords(p.amount)) + '</div>',
    footer: '<button class="btn danger" data-del>' + icon('trash') + '</button>' +
      '<button class="btn ghost" data-preview>View</button>' +
      '<button class="btn primary" data-print>' + icon('print') + 'PDF / Print</button>'
  });
  qs('[data-preview]', m.el).onclick = function () { m.close(); previewDoc('payment', id); };
  qs('[data-print]', m.el).onclick = function () { m.close(); printDoc('payment', id); };
  qs('[data-del]', m.el).onclick = function () {
    m.close();
    confirmDlg('Delete this ' + (p.type === 'in' ? 'receipt' : 'payment') + ' of ' + inr(p.amount) + '?', function () {
      removeRec('payments', p.id); toast('Deleted'); Router.render();
    }, 'Delete');
  };
}
