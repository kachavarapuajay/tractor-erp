/* ============================================================
   reports.js — dashboard, P&L, GST returns, cashbook, registers
   ============================================================ */

function monthRange(month) {
  var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  var last = new Date(y, m, 0).getDate();
  return { from: month + '-01', to: month + '-' + pad(last) };
}
function exportCsv(name, rows) {
  var csv = rows.map(function (r) {
    return r.map(function (c) {
      var s = String(c === undefined || c === null ? '' : c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\n');
  if (window.AppBridge && window.AppBridge.saveFile) window.AppBridge.saveFile(name, csv);
  else {
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }
  toast('Exported ' + name);
}
function monthList(n) {
  var out = [], d = new Date();
  for (var i = n - 1; i >= 0; i--) {
    var dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(dt.getFullYear() + '-' + pad(dt.getMonth() + 1));
  }
  return out;
}

/* ================= DASHBOARD ================= */
screen('dashboard', {
  title: 'Dashboard',
  render: function (view) {
    var m = thisMonth();
    var rng = monthRange(m);
    var invs = S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, rng.from, rng.to); });
    var sales = sum(invs, 'total');
    var collected = sum(S.payments.filter(function (p) { return p.type === 'in' && inRange(p.date, rng.from, rng.to); }), 'amount');
    var outstanding = sum(salesInvoices(), function (i) { return invoiceOutstanding(i); });
    var payable = sum(S.purchases, function (p) { return purchaseOutstanding(p); });
    var inStock = availableUnits();
    var openJobs = S.jobcards.filter(function (j) { return j.status === 'open' || j.status === 'in_progress'; });
    var expMonth = sum(S.expenses.filter(function (e) { return inRange(e.date, rng.from, rng.to); }), 'amount');
    var trend = monthList(6).map(function (mm) {
      var r = monthRange(mm);
      return { l: monthName(mm.slice(5)).slice(0, 3), v: sum(S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, r.from, r.to); }), 'total') };
    });

    var h = '<div class="pagehead"><div><h1>Namaste, ' + esc((me().name || '').split(' ')[0]) + '</h1>' +
      '<div class="sub">' + esc(org().name || '') + ' · FY ' + fyOf(today()) + ' · ' + dmy(today()) + '</div></div></div>';
    // ---- getting started guide (shown until the basics are in place) ----
    var gs = [
      { done: S.items.length > 0, label: 'Add your tractor models, implements and spares', btn: 'Add items', go: function () { Router.go('stockitems'); } },
      { done: S.parties.length > 0, label: 'Add customers, suppliers and financers', btn: 'Add party', go: function () { Router.go('parties'); } },
      { done: S.units.length > 0 || S.purchases.length > 0, label: 'Bring tractor stock in with chassis & engine numbers', btn: 'Add stock', go: function () { unitForm(); } },
      { done: S.employees.length > 0, label: 'Set up your team — sales, mechanics, accounts', btn: 'Add staff', go: function () { Router.go('employees'); } },
      { done: S.invoices.length > 0, label: 'Raise your first tax invoice', btn: 'Invoice', go: function () { openDocEditor('invoice'); } }
    ];
    var gsDone = gs.filter(function (g) { return g.done; }).length;
    if (gsDone < gs.length) {
      h += '<div class="card"><h3>Getting started <span class="more">' + gsDone + ' of ' + gs.length + ' done</span></h3>' +
        '<div class="btrack" style="margin-bottom:10px"><div class="bfill" style="width:' + Math.round(gsDone / gs.length * 100) + '%"></div></div>' +
        gs.map(function (g, i) {
          return '<div class="between" style="padding:7px 0;border-bottom:1px solid #f1f4f7">' +
            '<div class="flex" style="gap:8px"><span style="font-size:15px">' + (g.done ? '✅' : '⬜') + '</span>' +
            '<span class="' + (g.done ? 'muted' : '') + '" style="font-size:13px">' + esc(g.label) + '</span></div>' +
            (g.done ? '' : '<button class="btn sm primary" data-gs="' + i + '">' + esc(g.btn) + '</button>') + '</div>';
        }).join('') + '</div>';
    }

    h += '<div class="stats">' +
      statCard('Sales this month', inr(sales), invs.length + ' invoices', 'green') +
      statCard('Collected', inr(collected), 'receipts in month', 'blue') +
      statCard('Receivable', inr(outstanding), 'from customers', 'amber') +
      statCard('Payable', inr(payable), 'to suppliers', 'red') +
      '</div>';
    h += '<div class="card"><h3>Sales trend</h3>' + lineChart(trend) + '</div>';

    h += '<div class="card"><h3>Quick actions</h3><div class="three">' +
      [['invoice', 'New invoice', 'cart', function () { openDocEditor('invoice'); }],
       ['quote', 'Quotation', 'doc', function () { openDocEditor('quotation'); }],
       ['job', 'Job card', 'wrench', function () { openDocEditor('jobcard'); }],
       ['pay', 'Payment', 'rupee', function () { payForm('in'); }],
       ['exp', 'Expense', 'wallet', function () { expenseForm(); }],
       ['unit', 'Add stock', 'tractor', function () { unitForm(); }],
       ['exch', 'Exchange', 'swap', function () { exchangeForm(); }],
       ['ins', 'Insurance', 'shield', function () { policyForm(); }]].map(function (q, i) {
        return '<button class="btn" data-q="' + i + '" style="flex-direction:column;height:74px;justify-content:center;gap:4px">' +
          icon(q[2]) + '<span style="font-size:11.5px">' + q[1] + '</span></button>';
      }).join('') + '</div></div>';

    h += '<div class="stats">' +
      statCard('Tractor stock', String(inStock.length), inr(sum(inStock, 'cost')) + ' at cost') +
      statCard('Open job cards', String(openJobs.length), 'in workshop', 'amber') +
      statCard('Expenses (month)', inr(expMonth), 'all heads', 'red') +
      statCard('Stock items low', String(S.items.filter(function (i) { return i.category !== 'tractor' && i.category !== 'service' && stockQty(i.id) <= num(i.reorder); }).length), 'below reorder', 'amber') +
      '</div>';

    var recent = sortBy(salesInvoices(), 'date', 'desc').slice(0, 5);
    h += '<div class="card tight"><h3 style="padding:12px 14px 0">Recent invoices <span class="more" id="allInv">View all</span></h3>';
    if (!recent.length) h += '<div class="empty small">No invoices yet</div>';
    else h += recent.map(function (i) {
      var id = 'd' + i.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { openDocView('invoice', i.id); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(i.partyId)) + '</div>' +
        '<div class="rc-sub">' + esc(i.no) + ' · ' + dmy(i.date) + '</div></div>' +
        '<div class="rc-right">' + inr(i.total) + '<small>' + docStatusBadge(docStatus(i)) + '</small></div></div>';
    }).join('');
    h += '</div>';

    var renewals = sortBy(S.policies.filter(function (p) { return policyDueStatus(p) === 'due' || policyDueStatus(p) === 'expired'; }), 'dueDate').slice(0, 5);
    if (renewals.length) {
      h += '<div class="card"><h3>Insurance renewals <span class="more" id="allPol">Open insurance</span></h3>' + renewals.map(function (p) {
        var st = policyDueStatus(p);
        return '<div class="kv"><span>' + esc(p.policyNo) + ' · ' + esc(partyName(p.customerId)) + '</span>' +
          '<span class="' + (st === 'expired' ? 'red' : 'amber') + '">' + (st === 'expired' ? 'expired' : 'due ' + dmy(p.dueDate)) + '</span></div>';
      }).join('') + '</div>';
    }

    var follow = sortBy(S.leads.filter(function (l) { return l.nextFollowUp && l.status !== 'won' && l.status !== 'lost'; }), 'nextFollowUp').slice(0, 5);
    if (follow.length) {
      h += '<div class="card"><h3>Follow-ups due</h3>' + follow.map(function (l) {
        return '<div class="kv"><span>' + esc(l.name) + ' · ' + esc(l.phone || '') + '</span><span class="' + (l.nextFollowUp <= today() ? 'red' : '') + '">' + dmy(l.nextFollowUp) + '</span></div>';
      }).join('') + '</div>';
    }
    view.innerHTML = h;
    qsa('[data-gs]', view).forEach(function (b) {
      b.onclick = function () { gs[Number(b.getAttribute('data-gs'))].go(); };
    });
    qsa('[data-q]', view).forEach(function (b) {
      b.onclick = [function () { openDocEditor('invoice'); }, function () { openDocEditor('quotation'); },
        function () { openDocEditor('jobcard'); }, function () { payForm('in'); },
        function () { expenseForm(); }, function () { unitForm(); },
        function () { exchangeForm(); }, function () { policyForm(); }][Number(b.getAttribute('data-q'))];
    });
    var ai = document.getElementById('allInv');
    if (ai) ai.onclick = function () { Router.go('invoices'); };
    var ap = document.getElementById('allPol');
    if (ap) ap.onclick = function () { Router.go('insurance'); };
  }
});

/* ================= CASHBOOK ================= */
screen('cashbook', {
  title: 'Cashbook',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var rng = monthRange(month);
    var branchF = params.branch || '';
    var entries = [];
    S.payments.forEach(function (p) {
      if (!inRange(p.date, rng.from, rng.to)) return;
      if (branchF && p.branchId !== branchF) return;
      entries.push({ date: p.date, particulars: (p.type === 'in' ? 'Received from ' : 'Paid to ') + partyName(p.partyId) + (p.refDocNo ? ' vs ' + p.refDocNo : ''), mode: p.mode, inAmt: p.type === 'in' ? num(p.amount) : 0, outAmt: p.type === 'out' ? num(p.amount) : 0 });
    });
    S.expenses.forEach(function (e) {
      if (!inRange(e.date, rng.from, rng.to)) return;
      if (branchF && e.branchId !== branchF) return;
      entries.push({ date: e.date, particulars: 'Expense: ' + (e.particulars || e.head), mode: e.mode, inAmt: 0, outAmt: num(e.amount) });
    });
    S.petty.forEach(function (p) {
      if (!inRange(p.date, rng.from, rng.to)) return;
      if (branchF && p.branchId !== branchF) return;
      entries.push({ date: p.date, particulars: 'Petty: ' + (p.particulars || p.head), mode: 'cash', inAmt: p.type === 'receipt' ? num(p.amount) : 0, outAmt: p.type === 'payment' ? num(p.amount) : 0 });
    });
    S.marginReceipts.forEach(function (m) {
      if (!inRange(m.date, rng.from, rng.to)) return;
      if (branchF && m.branchId !== branchF) return;
      entries.push({ date: m.date, particulars: 'Margin money from ' + partyName(m.partyId) + (m.no ? ' (' + m.no + ')' : ''), mode: m.mode || 'bank', inAmt: num(m.amount), outAmt: 0 });
    });
    entries = sortBy(entries, 'date');
    var run = num(settings().cashOpening || 0);
    var rows = entries.map(function (e) {
      run = run + e.inAmt - e.outAmt;
      return Object.assign({}, e, { balance: r2(run) });
    });
    var tin = sum(entries, 'inAmt'), tout = sum(entries, 'outAmt');

    var h = pageHead('Cashbook', [{ label: 'Export', icon: 'download', onClick: function () {
      exportCsv('cashbook-' + month + '.csv', [['Date', 'Particulars', 'Mode', 'In', 'Out', 'Balance']].concat(rows.map(function (r) {
        return [dmy(r.date), r.particulars, r.mode, r.inAmt, r.outAmt, r.balance];
      })));
    } }], month + ' · in ' + inr(tin) + ' · out ' + inr(tout));
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '">' +
      '<select id="bf" style="border:1px solid #d6dee6;border-radius:12px;padding:10px;background:#fff">' +
      '<option value="">All branches</option>' + S.branches.map(function (b) {
        return '<option value="' + b.id + '"' + (branchF === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="stats">' + statCard('Opening', inr(S.meta.cashOpening || 0), 'cash in hand', 'blue') +
      statCard('Receipts', inr(tin), 'money in', 'green') +
      statCard('Payments', inr(tout), 'money out', 'red') +
      statCard('Closing', inr(num(settings().cashOpening || 0) + tin - tout), 'balance', 'amber') + '</div>';
    h += '<div class="card tight"><div class="pad" style="padding:8px 4px 0">' + table({
      cls: 'compact',
      cols: [
        { k: 'date', label: 'Date', render: function (r) { return dmy(r.date); } },
        { k: 'particulars', label: 'Particulars', render: function (r) { return esc(r.particulars) + '<div class="tiny muted">' + esc(r.mode || '') + '</div>'; } },
        { k: 'in', label: 'In', cls: 'num green', render: function (r) { return r.inAmt ? fmt(r.inAmt) : ''; } },
        { k: 'out', label: 'Out', cls: 'num red', render: function (r) { return r.outAmt ? fmt(r.outAmt) : ''; } },
        { k: 'bal', label: 'Bal', cls: 'num', render: function (r) { return fmt(r.balance); } }
      ],
      rows: rows, empty: 'No cash movements this month.'
    }) + '</div></div>';
    view.innerHTML = h;
    document.getElementById('mSel').onchange = function () { Router.go('cashbook', { month: this.value, branch: branchF }); };
    document.getElementById('bf').onchange = function () { Router.go('cashbook', { month: month, branch: this.value }); };
  }
});

/* ================= REPORTS HUB ================= */
function exportReportTab(tab, month, rng) {
  if (tab === 'pl') {
    var invs = S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, rng.from, rng.to); });
    var rows = invs.map(function (i) {
      return { date: dmy(i.date), no: i.no, customer: partyName(i.partyId), taxable: num(i.taxable), tax: num(i.cgst) + num(i.sgst) + num(i.igst), total: num(i.total) };
    });
    Export.menu('Sales for P&L ' + month, [
      { k: 'date', label: 'Date' }, { k: 'no', label: 'Invoice' }, { k: 'customer', label: 'Customer' },
      { k: 'taxable', label: 'Taxable' }, { k: 'tax', label: 'GST' }, { k: 'total', label: 'Total' }
    ], rows, { label: function (r) { return r.no + ' · ' + r.customer; } });
  } else if (tab === 'gst1' || tab === 'gst2' || tab === 'gst3') {
    var src = (tab === 'gst2') ? S.purchases : S.invoices;
    var list = src.filter(function (x) {
      return inRange(x.date, rng.from, rng.to) && (tab === 'gst2' || x.docType !== 'financer');
    });
    var out = list.map(function (x) {
      return {
        date: dmy(x.date), no: x.no, party: partyName(x.partyId), gstin: party(x.partyId).gstin || '',
        taxable: num(x.taxable), cgst: num(x.cgst), sgst: num(x.sgst), igst: num(x.igst),
        total: num(x.total), rcm: x.rcm ? 'Y' : 'N'
      };
    });
    Export.menu(tab.toUpperCase() + ' ' + month, [
      { k: 'date', label: 'Date' }, { k: 'no', label: 'Document' }, { k: 'party', label: 'Party' },
      { k: 'gstin', label: 'GSTIN' }, { k: 'taxable', label: 'Taxable' }, { k: 'cgst', label: 'CGST' },
      { k: 'sgst', label: 'SGST' }, { k: 'igst', label: 'IGST' }, { k: 'total', label: 'Total' }, { k: 'rcm', label: 'RCM' }
    ], out, { label: function (r) { return r.no + ' · ' + r.party; } });
  } else if (tab === 'out') {
    var recv = salesInvoices().filter(function (i) { return invoiceOutstanding(i) > 0.5; });
    Export.menu('Outstanding', [
      { k: 'no', label: 'Invoice' }, { k: 'date', label: 'Date' }, { k: 'customer', label: 'Customer' },
      { k: 'total', label: 'Invoice value' }, { k: 'balance', label: 'Outstanding' }, { k: 'age', label: 'Age (days)' }
    ], recv.map(function (i) {
      return { no: i.no, date: dmy(i.date), customer: partyName(i.partyId), total: num(i.total), balance: invoiceOutstanding(i), age: daysBetween(i.date, today()) };
    }), { label: function (r) { return r.no + ' · ' + r.customer; } });
  } else {
    var units = S.units.filter(function (u) { return u.status === 'in_stock'; });
    Export.menu('Stock', [
      { k: 'kind', label: 'Type' }, { k: 'ident', label: 'Chassis / serial' }, { k: 'item', label: 'Item' },
      { k: 'branch', label: 'Branch' }, { k: 'cost', label: 'Cost' }
    ], units.map(function (u) {
      return { kind: u.unitKind === 'implement' ? 'Implement' : 'Tractor', ident: u.chassisNo || u.serialNo || '', item: itemName(u.itemId), branch: branchName(u.branchId), cost: num(u.cost) };
    }), { label: function (r) { return r.ident + ' · ' + r.item; } });
  }
}

screen('reports', {
  title: 'Reports & GST',
  render: function (view, params) {
    var tab = params.tab || 'pl';
    var month = params.month || thisMonth();
    var rng = monthRange(month);
    var h = pageHead('Reports & GST', [{
      label: 'Export', icon: 'download',
      onClick: function () { exportReportTab(tab, month, rng); }
    }], 'Financial statements and GST returns');
    h += '<div class="tabs">' + [['pl', 'P&L'], ['gst1', 'GSTR-1'], ['gst2', 'GSTR-2'], ['gst3', 'GSTR-3B'], ['gst9', 'GSTR-9'], ['out', 'Outstanding'], ['stock', 'Stock'], ['reg', 'Registers']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '"></div>';

    if (tab === 'pl') {
      var invs = S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, rng.from, rng.to); });
      var revenue = sum(invs, 'taxable');
      var serviceRev = sum(invs.filter(function (i) { return i.saleType === 'service'; }), 'taxable');
      var cogs = 0;
      invs.forEach(function (i) {
        (i.lines || []).forEach(function (l) {
          var it = item(l.itemId);
          if (l.unitId) cogs += num(unitOf(l.unitId).cost) || num(it.purchaseRate) * num(l.qty);
          else cogs += num(it.purchaseRate) * num(l.qty);
        });
      });
      cogs = r2(cogs);
      var gross = r2(revenue - cogs);
      var exps = S.expenses.filter(function (e) { return inRange(e.date, rng.from, rng.to); });
      var expTotal = sum(exps, 'amount');
      var byHead = groupBy(exps, 'head');
      var net = r2(gross - expTotal);
      h += '<div class="stats">' + statCard('Revenue', inr(revenue), invs.length + ' invoices', 'green') +
        statCard('Cost of sales', inr(cogs), 'at purchase cost', 'amber') +
        statCard('Gross profit', inr(gross), revenue ? pct(gross / revenue * 100) + ' margin' : '—', 'blue') +
        statCard('Net profit', inr(net), net >= 0 ? 'profit' : 'loss', net >= 0 ? 'green' : 'red') + '</div>';
      h += '<div class="card"><h3>Profit &amp; Loss · ' + monthName(month.slice(5)) + ' ' + month.slice(0, 4) + '</h3>' +
        '<div class="kv"><span>Sales (taxable value)</span><span>' + inr(revenue) + '</span></div>' +
        '<div class="kv"><span>— of which service &amp; labour</span><span>' + inr(serviceRev) + '</span></div>' +
        '<div class="kv"><span>Less: cost of goods sold</span><span>− ' + inr(cogs) + '</span></div>' +
        '<div class="kv"><span><b>Gross profit</b></span><span><b>' + inr(gross) + '</b></span></div>' +
        Object.keys(byHead).sort().map(function (k) {
          var nm = (EXPENSE_HEADS.find(function (x) { return x[0] === k; }) || [k, k])[1];
          return '<div class="kv"><span>Less: ' + esc(nm) + '</span><span>− ' + inr(sum(byHead[k], 'amount')) + '</span></div>';
        }).join('') +
        '<div class="kv"><span>Total expenses</span><span>− ' + inr(expTotal) + '</span></div>' +
        (function () {
          var comm = sum(invs, function (i) { return num(i.brokerCommission); });
          return comm ? '<div class="kv muted"><span>Broker commission (accrued, shown in expenses when paid)</span><span>' + inr(comm) + '</span></div>' : '';
        })() +
        '<div class="grand"><span>' + (net >= 0 ? 'Net profit' : 'Net loss') + '</span><span>' + inr(Math.abs(net)) + '</span></div></div>';
      h += '<div class="card"><h3>Monthly trend</h3>' + barChart(monthList(6).map(function (mm) {
        var r = monthRange(mm);
        var rv = sum(S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, r.from, r.to); }), 'taxable');
        var ex = sum(S.expenses.filter(function (e) { return inRange(e.date, r.from, r.to); }), 'amount');
        return { l: monthName(mm.slice(5)).slice(0, 3), v: rv - ex, tone: rv - ex >= 0 ? '' : 'red' };
      })) + '</div>';
    }

    if (tab === 'gst1') {
      var gi = S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, rng.from, rng.to); });
      var b2b = gi.filter(function (i) { return !!party(i.partyId).gstin; });
      var b2c = gi.filter(function (i) { return !party(i.partyId).gstin; });
      var tot = { taxable: sum(gi, 'taxable'), cgst: sum(gi, 'cgst'), sgst: sum(gi, 'sgst'), igst: sum(gi, 'igst') };
      h += '<div class="stats">' + statCard('Taxable value', inr(tot.taxable), gi.length + ' invoices') +
        statCard('CGST', inr(tot.cgst), 'central', 'blue') + statCard('SGST', inr(tot.sgst), 'state', 'blue') +
        statCard('IGST', inr(tot.igst), 'inter-state', 'amber') + '</div>';
      h += '<div class="card"><h3>GSTR-1 · Outward supplies</h3><div class="tiny muted">Month: ' + month + ' · GSTIN ' + esc(org().gstin || '—') + '</div></div>';
      h += '<div class="card tight"><h3 style="padding:12px 14px 0">4A · B2B supplies (registered)</h3><div class="pad" style="padding:6px 4px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'gstin', label: 'GSTIN', render: function (i) { return '<span class="mono tiny">' + esc(party(i.partyId).gstin) + '</span><div class="tiny muted">' + esc(partyName(i.partyId)) + '</div>'; } },
          { k: 'no', label: 'Invoice', render: function (i) { return esc(i.no) + '<div class="tiny muted">' + dmy(i.date) + '</div>'; } },
          { k: 'taxable', label: 'Taxable', cls: 'num', render: function (i) { return fmt(i.taxable); } },
          { k: 'tax', label: 'Tax', cls: 'num', render: function (i) { return fmt(num(i.cgst) + num(i.sgst) + num(i.igst)); } },
          { k: 'rcm', label: 'RCM', render: function (i) { return i.rcm ? badge('Y', 'amber') : 'N'; } }
        ],
        rows: b2b,
        empty: 'No B2B invoices this month'
      }) + '</div></div>';
      var rates = {};
      gi.forEach(function (i) {
        (i.lines || []).forEach(function (l) {
          var k = l.gstRate;
          rates[k] = rates[k] || { taxable: 0, cgst: 0, sgst: 0, igst: 0, count: 0 };
          var amt = lineAmount(l);
          rates[k].taxable += amt; rates[k].count++;
          if (isInterState(party(i.partyId))) rates[k].igst += amt * num(l.gstRate) / 100;
          else { rates[k].cgst += amt * num(l.gstRate) / 200; rates[k].sgst += amt * num(l.gstRate) / 200; }
        });
      });
      h += '<div class="card tight"><h3 style="padding:12px 14px 0">Rate-wise summary (B2B + B2C)</h3><div class="pad" style="padding:6px 4px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'r', label: 'Rate', render: function (x) { return x.r + '%'; } },
          { k: 'taxable', label: 'Taxable', cls: 'num', render: function (x) { return fmt(x.taxable); } },
          { k: 'cgst', label: 'CGST', cls: 'num', render: function (x) { return fmt(x.cgst); } },
          { k: 'sgst', label: 'SGST', cls: 'num', render: function (x) { return fmt(x.sgst); } },
          { k: 'igst', label: 'IGST', cls: 'num', render: function (x) { return fmt(x.igst); } }
        ],
        rows: Object.keys(rates).map(function (k) { return Object.assign({ r: k }, rates[k]); })
      }) + '</div></div>';
      var hsn = {};
      gi.forEach(function (i) {
        (i.lines || []).forEach(function (l) {
          var k = (l.hsn || '0000') + '|' + l.gstRate;
          hsn[k] = hsn[k] || { hsn: l.hsn || '—', rate: l.gstRate, qty: 0, taxable: 0, tax: 0 };
          hsn[k].qty += num(l.qty); hsn[k].taxable += lineAmount(l);
          hsn[k].tax += lineAmount(l) * num(l.gstRate) / 100;
        });
      });
      h += '<div class="card tight"><h3 style="padding:12px 14px 0">12 · HSN summary</h3><div class="pad" style="padding:6px 4px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'hsn', label: 'HSN' },
          { k: 'rate', label: 'Rate', render: function (x) { return x.rate + '%'; } },
          { k: 'qty', label: 'Qty', cls: 'num', render: function (x) { return fmtQty(x.qty); } },
          { k: 'taxable', label: 'Taxable', cls: 'num', render: function (x) { return fmt(x.taxable); } },
          { k: 'tax', label: 'Tax', cls: 'num', render: function (x) { return fmt(x.tax); } }
        ],
        rows: Object.keys(hsn).map(function (k) { return hsn[k]; })
      }) + '</div></div>';
      h += '<div class="card"><h3>B2C summary</h3><div class="kv"><span>Invoices</span><span>' + b2c.length + '</span></div>' +
        '<div class="kv"><span>Taxable</span><span>' + inr(sum(b2c, 'taxable')) + '</span></div>' +
        '<div class="kv"><span>Tax</span><span>' + inr(sum(b2c, function (i) { return num(i.cgst) + num(i.sgst) + num(i.igst); })) + '</span></div>' +
        '<button class="btn block" id="expG1" style="margin-top:10px">Export GSTR-1 CSV</button></div>';
    }

    if (tab === 'gst2') {
      var gp = S.purchases.filter(function (p) { return inRange(p.date, rng.from, rng.to); });
      h += '<div class="stats">' + statCard('Purchases', inr(sum(gp, 'taxable')), gp.length + ' bills') +
        statCard('ITC available', inr(sum(gp, function (p) { return num(p.cgst) + num(p.sgst) + num(p.igst); })), 'input credit', 'green') + '</div>';
      h += '<div class="card tight"><h3 style="padding:12px 14px 0">GSTR-2 · Inward supplies (ITC register)</h3><div class="pad" style="padding:6px 4px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'party', label: 'Supplier', render: function (p) { return esc(partyName(p.partyId)) + '<div class="tiny muted mono">' + esc(party(p.partyId).gstin || 'unregistered') + '</div>'; } },
          { k: 'no', label: 'Bill', render: function (p) { return esc(p.no) + '<div class="tiny muted">' + dmy(p.date) + '</div>'; } },
          { k: 'taxable', label: 'Taxable', cls: 'num', render: function (p) { return fmt(p.taxable); } },
          { k: 'tax', label: 'ITC', cls: 'num', render: function (p) { return fmt(num(p.cgst) + num(p.sgst) + num(p.igst)); } },
          { k: 'rcm', label: 'RCM', render: function (p) { return p.rcm ? badge('Y', 'amber') : 'N'; } }
        ],
        rows: gp, empty: 'No purchase bills this month'
      }) + '</div></div>';
    }

    if (tab === 'gst3') {
      var outw = S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, rng.from, rng.to); });
      var inw = S.purchases.filter(function (p) { return inRange(p.date, rng.from, rng.to); });
      var rcmIn = inw.filter(function (p) { return p.rcm; });
      var rcmTax = sum(rcmIn, function (p) { return num(p.cgst) + num(p.sgst) + num(p.igst); });
      var oTax = sum(outw, function (i) { return num(i.cgst) + num(i.sgst) + num(i.igst); });
      var iTax = sum(inw, function (p) { return num(p.cgst) + num(p.sgst) + num(p.igst); });
      var cOut = sum(outw, 'cgst'), sOut = sum(outw, 'sgst'), iOut = sum(outw, 'igst');
      var cIn = sum(inw, 'cgst'), sIn = sum(inw, 'sgst'), iIn = sum(inw, 'igst');
      h += '<div class="stats">' + statCard('Output tax', inr(oTax), 'on outward supplies', 'amber') +
        statCard('Input tax credit', inr(iTax), 'on purchases', 'green') +
        statCard('Net payable', inr(Math.max(0, oTax - iTax)), 'cash + credit', 'red') + '</div>';
      h += '<div class="card"><h3>GSTR-3B summary · ' + month + '</h3>' +
        '<div class="section-label">3.1 Outward taxable supplies</div>' +
        '<div class="kv"><span>Taxable value</span><span>' + inr(sum(outw, 'taxable')) + '</span></div>' +
        '<div class="kv"><span>CGST</span><span>' + inr(cOut) + '</span></div>' +
        '<div class="kv"><span>SGST</span><span>' + inr(sOut) + '</span></div>' +
        '<div class="kv"><span>IGST</span><span>' + inr(iOut) + '</span></div>' +
        '<div class="section-label">3.1(d) Inward supplies liable to reverse charge</div>' +
        '<div class="kv"><span>Taxable value</span><span>' + inr(sum(rcmIn, 'taxable')) + '</span></div>' +
        '<div class="kv"><span>Tax payable under RCM</span><span>' + inr(rcmTax) + '</span></div>' +
        '<div class="section-label">4. Eligible ITC</div>' +
        '<div class="kv"><span>CGST</span><span>' + inr(cIn) + '</span></div>' +
        '<div class="kv"><span>SGST</span><span>' + inr(sIn) + '</span></div>' +
        '<div class="kv"><span>IGST</span><span>' + inr(iIn) + '</span></div>' +
        '<div class="section-label">5. Tax payable</div>' +
        '<div class="kv"><span>CGST</span><span>' + inr(Math.max(0, cOut - cIn)) + '</span></div>' +
        '<div class="kv"><span>SGST</span><span>' + inr(Math.max(0, sOut - sIn)) + '</span></div>' +
        '<div class="kv"><span>IGST</span><span>' + inr(Math.max(0, iOut - iIn)) + '</span></div>' +
        '<div class="grand"><span>Net tax payable</span><span>' + inr(Math.max(0, oTax - iTax) + rcmTax) + '</span></div>' +
        (rcmTax ? '<div class="note">Includes ' + inr(rcmTax) + ' payable under reverse charge on ' + rcmIn.length + ' purchase bill(s).</div>' : '') +
        '</div>';
    }

    if (tab === 'gst9') {
      var fy = params.fy || fyOf(today());
      var fr = fyRange(fy);
      var yi = S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, fr.from, fr.to); });
      var yp = S.purchases.filter(function (p) { return inRange(p.date, fr.from, fr.to); });
      var yoTax = sum(yi, function (i) { return num(i.cgst) + num(i.sgst) + num(i.igst); });
      var yiTax = sum(yp, function (p) { return num(p.cgst) + num(p.sgst) + num(p.igst); });
      h += '<div class="card"><h3>GSTR-9 · Annual return FY ' + esc(fy) + '</h3>' +
        '<div class="tiny muted">' + dmy(fr.from) + ' to ' + dmy(fr.to) + '</div></div>';
      h += '<div class="card"><div class="section-label">4. Details of advances, inward &amp; outward supplies</div>' +
        '<div class="kv"><span>4A Outward taxable supplies</span><span>' + inr(sum(yi, 'taxable')) + '</span></div>' +
        '<div class="kv"><span>— Central tax</span><span>' + inr(sum(yi, 'cgst')) + '</span></div>' +
        '<div class="kv"><span>— State tax</span><span>' + inr(sum(yi, 'sgst')) + '</span></div>' +
        '<div class="kv"><span>— Integrated tax</span><span>' + inr(sum(yi, 'igst')) + '</span></div>' +
        '<div class="kv"><span>5 ITC on inward supplies</span><span>' + inr(yiTax) + '</span></div>' +
        '<div class="kv"><span>6 Net tax payable</span><span>' + inr(Math.max(0, yoTax - yiTax)) + '</span></div>' +
        '<div class="kv"><span>9 Tax paid</span><span>' + inr(Math.max(0, yoTax - yiTax)) + '</span></div>' +
        '<div class="section-label">Turnover reconciliation</div>' +
        '<div class="kv"><span>Invoices issued</span><span>' + yi.length + '</span></div>' +
        '<div class="kv"><span>Purchase bills</span><span>' + yp.length + '</span></div>' +
        '<div class="kv"><span>Credit notes</span><span>' + S.notes.filter(function (n) { return n.type === 'credit' && inRange(n.date, fr.from, fr.to); }).length + '</span></div>' +
        '<div class="kv"><span>Debit notes</span><span>' + S.notes.filter(function (n) { return n.type === 'debit' && inRange(n.date, fr.from, fr.to); }).length + '</span></div>' +
        '<div class="note">GSTR-9 is filed annually. Values above are computed from your books for the selected financial year.</div></div>';
      h += '<div class="card"><h3>Financial year</h3><div class="chipset">' + ['2024-25', '2025-26', '2026-27'].map(function (y) {
        return '<button class="chip" data-fy="' + y + '" style="' + (fy === y ? 'background:#0f5132;color:#fff' : '') + '">' + y + '</button>';
      }).join('') + '</div></div>';
    }

    if (tab === 'out') {
      var recv = salesInvoices().filter(function (i) { return invoiceOutstanding(i) > 0.5; });
      var pay = S.purchases.filter(function (p) { return purchaseOutstanding(p) > 0.5; });
      var buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
      recv.forEach(function (i) {
        var age = daysBetween(i.date, today());
        if (age <= 30) buckets['0-30'] += invoiceOutstanding(i);
        else if (age <= 60) buckets['31-60'] += invoiceOutstanding(i);
        else if (age <= 90) buckets['61-90'] += invoiceOutstanding(i);
        else buckets['90+'] += invoiceOutstanding(i);
      });
      h += '<div class="stats">' + statCard('Receivable', inr(sum(recv, function (i) { return invoiceOutstanding(i); })), recv.length + ' invoices', 'amber') +
        statCard('Payable', inr(sum(pay, function (p) { return purchaseOutstanding(p); })), pay.length + ' bills', 'red') + '</div>';
      h += '<div class="card"><h3>Ageing (receivables)</h3>' + barChart(Object.keys(buckets).map(function (k) {
        return { l: k + ' days', v: buckets[k], tone: k === '90+' ? 'red' : 'blue' };
      })) + '</div>';
      h += '<div class="card tight"><h3 style="padding:12px 14px 0">Customer outstanding</h3>' + sortBy(recv, 'date').map(function (i) {
        return '<div class="rowcard"><div class="rc-main"><div class="rc-title">' + esc(partyName(i.partyId)) + '</div>' +
          '<div class="rc-sub">' + esc(i.no) + ' · ' + dmy(i.date) + ' · ' + daysBetween(i.date, today()) + ' days</div></div>' +
          '<div class="rc-right red">' + inr(invoiceOutstanding(i)) + '</div></div>';
      }).join('') + '</div>';
      h += '<div class="card tight"><h3 style="padding:12px 14px 0">Supplier payable</h3>' + sortBy(pay, 'date').map(function (p) {
        return '<div class="rowcard"><div class="rc-main"><div class="rc-title">' + esc(partyName(p.partyId)) + '</div>' +
          '<div class="rc-sub">' + esc(p.no) + ' · ' + dmy(p.date) + '</div></div>' +
          '<div class="rc-right amber">' + inr(purchaseOutstanding(p)) + '</div></div>';
      }).join('') + '</div>';
    }

    if (tab === 'stock') {
      var units = S.units.filter(function (u) { return u.status === 'in_stock'; });
      var byModel = groupBy(units, 'itemId');
      var itemStock = S.items.filter(function (i) { return i.category !== 'tractor' && i.category !== 'service'; })
        .map(function (i) { return { i: i, qty: stockQty(i.id), val: r2(stockQty(i.id) * num(i.purchaseRate || i.saleRate)) }; })
        .filter(function (r) { return r.qty !== 0; });
      h += '<div class="stats">' + statCard('Tractor units', String(units.length), inr(sum(units, 'cost')), 'green') +
        statCard('Spares & implements', inr(sum(itemStock, 'val')), itemStock.length + ' items', 'blue') +
        statCard('Total stock value', inr(sum(units, 'cost') + sum(itemStock, 'val')), 'at cost', 'amber') + '</div>';
      h += '<div class="card"><h3>Model-wise tractors</h3>' + barChart(Object.keys(byModel).map(function (k) {
        return { l: itemName(k), v: byModel[k].length };
      }), { fmt: function (v) { return v + ' units'; } }) + '</div>';
      h += '<div class="card tight"><div class="pad" style="padding:6px 4px 0">' + table({
        cls: 'compact',
        cols: [
          { k: 'name', label: 'Item', render: function (r) { return esc(r.i.name); } },
          { k: 'qty', label: 'Qty', cls: 'num', render: function (r) { return fmtQty(r.qty); } },
          { k: 'rate', label: 'Cost', cls: 'num', render: function (r) { return fmt(r.i.purchaseRate); } },
          { k: 'val', label: 'Value', cls: 'num', render: function (r) { return fmt(r.val); } }
        ],
        rows: itemStock
      }) + '</div></div>';
    }

    if (tab === 'reg') {
      h += '<div class="card"><h3>Registers</h3>' +
        '<button class="btn block" data-reg="sales">Sales register (month)</button><div style="height:8px"></div>' +
        '<button class="btn block" data-reg="purchase">Purchase register (month)</button><div style="height:8px"></div>' +
        '<button class="btn block" data-reg="payment">Payment register (month)</button><div style="height:8px"></div>' +
        '<button class="btn block" data-reg="party">Party ledger balances</button><div style="height:8px"></div>' +
        '<button class="btn block" data-reg="employee">Employee master</button></div>';
      h += '<div class="card"><h3>All parties · balances</h3>' + table({
        cls: 'compact',
        cols: [
          { k: 'name', label: 'Party', render: function (p) { return esc(p.name) + '<div class="tiny muted">' + esc(p.type) + '</div>'; } },
          { k: 'bal', label: 'Balance', cls: 'num', render: function (p) {
            var b = partyBalance(p.id);
            return '<span class="' + (b >= 0 ? '' : 'green') + '">' + fmt(Math.abs(b)) + '</span><div class="tiny muted">' + (b >= 0 ? 'Dr' : 'Cr') + '</div>';
          } }
        ],
        rows: S.parties
      }) + '</div>';
    }

    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('reports', { tab: b.getAttribute('data-tab'), month: month }); }; });
    var ms = document.getElementById('mSel');
    if (ms) ms.onchange = function () { Router.go('reports', { tab: tab, month: this.value }); };
    qsa('[data-fy]', view).forEach(function (b) { b.onclick = function () { Router.go('reports', { tab: 'gst9', fy: b.getAttribute('data-fy') }); }; });
    var g1 = document.getElementById('expG1');
    if (g1) g1.onclick = function () {
      var gi2 = S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, rng.from, rng.to); });
      exportCsv('GSTR1-' + month + '.csv', [['GSTIN/UIN', 'Receiver', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Place of Supply', 'Taxable Value', 'CGST', 'SGST', 'IGST']]
        .concat(gi2.map(function (i) {
          return [party(i.partyId).gstin || 'URP', partyName(i.partyId), i.no, dmy(i.date), i.total,
            stateCodeOfParty(party(i.partyId)), i.taxable, i.cgst, i.sgst, i.igst];
        })));
    };
    qsa('[data-reg]', view).forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute('data-reg');
        if (t === 'sales') exportCsv('sales-register-' + month + '.csv', [['Date', 'Invoice', 'Customer', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']]
          .concat(S.invoices.filter(function (i) { return i.docType !== 'financer' && inRange(i.date, rng.from, rng.to); }).map(function (i) {
            return [dmy(i.date), i.no, partyName(i.partyId), party(i.partyId).gstin || '', i.taxable, i.cgst, i.sgst, i.igst, i.total];
          })));
        if (t === 'purchase') exportCsv('purchase-register-' + month + '.csv', [['Date', 'Bill', 'Supplier', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']]
          .concat(S.purchases.filter(function (p) { return inRange(p.date, rng.from, rng.to); }).map(function (p) {
            return [dmy(p.date), p.no, partyName(p.partyId), party(p.partyId).gstin || '', p.taxable, p.cgst, p.sgst, p.igst, p.total];
          })));
        if (t === 'payment') exportCsv('payments-' + month + '.csv', [['Date', 'Type', 'Party', 'Mode', 'Amount', 'Reference']]
          .concat(S.payments.filter(function (p) { return inRange(p.date, rng.from, rng.to); }).map(function (p) {
            return [dmy(p.date), p.type, partyName(p.partyId), p.mode, p.amount, p.refDocNo || p.refNo || ''];
          })));
        if (t === 'party') exportCsv('party-balances.csv', [['Party', 'Type', 'GSTIN', 'Phone', 'Balance', 'Dr/Cr']]
          .concat(S.parties.map(function (p) { var b = partyBalance(p.id); return [p.name, p.type, p.gstin || '', p.phone || '', Math.abs(b), b >= 0 ? 'Dr' : 'Cr']; })));
        if (t === 'employee') exportCsv('employees.csv', [['Name', 'Code', 'Type', 'Department', 'Designation', 'Phone', 'Salary', 'Joined']]
          .concat(S.employees.map(function (e) { return [e.name, e.code || '', e.empType, (dept(e.deptId) || {}).name || '', e.designation || '', e.phone || '', e.salary, e.joinDate]; })));
      };
    });
  }
});
