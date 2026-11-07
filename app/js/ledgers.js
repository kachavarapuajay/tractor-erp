/* ============================================================
   ledgers.js — bank book, TA ledger, incentive ledger,
   commission ledger (tractor / implements), transport ledger
   ============================================================ */

/* ================= BANK BOOK ================= */
screen('bankbook', {
  title: 'Bank Book',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var rng = monthRange(month);
    var accId = params.acc || (S.bankAccounts[0] || {}).id || 'all';
    var rows = bankEntries(accId, rng.from, rng.to);
    var acc = bankAccount(accId);
    var opening = num(acc.openingBal) + sum(bankEntries(accId, '0000-01-01', addDays(rng.from, -1)), 'inAmt')
      - sum(bankEntries(accId, '0000-01-01', addDays(rng.from, -1)), 'outAmt');
    var run = opening;
    var data = rows.map(function (r) {
      run = run + r.inAmt - r.outAmt;
      return Object.assign({}, r, { balance: r2(run) });
    });
    var tin = sum(rows, 'inAmt'), tout = sum(rows, 'outAmt');

    var cols = [
      { k: 'date', label: 'Date' }, { k: 'particulars', label: 'Particulars' },
      { k: 'ref', label: 'Reference' }, { k: 'inAmt', label: 'Deposit' },
      { k: 'outAmt', label: 'Withdrawal' }, { k: 'balance', label: 'Balance' }
    ];
    var exportRows = data.map(function (r) {
      return { date: dmy(r.date), particulars: r.particulars, ref: r.ref, inAmt: r.inAmt, outAmt: r.outAmt, balance: r.balance };
    });

    var h = pageHead('Bank Book', [Export.action('Bank Book', function () { return cols; }, function () { return exportRows; })],
      (acc.name || 'All bank accounts') + ' · ' + month);
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '">' +
      '<select id="accSel" style="border:1px solid #d6dee6;border-radius:12px;padding:10px;background:#fff;max-width:46%">' +
      '<option value="all"' + (accId === 'all' ? ' selected' : '') + '>All bank accounts</option>' +
      S.bankAccounts.map(function (b) {
        return '<option value="' + b.id + '"' + (accId === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>';
      }).join('') + '</select></div>';

    h += '<div class="stats">' + statCard('Opening', inr(opening), 'as on ' + dmy(rng.from), 'blue') +
      statCard('Deposits', inr(tin), 'money in', 'green') +
      statCard('Withdrawals', inr(tout), 'money out', 'red') +
      statCard('Closing', inr(run), 'book balance', 'amber') + '</div>';

    if (!S.bankAccounts.length) {
      h += '<div class="card"><div class="note">No bank accounts yet. Add them under <b>Bank Accounts</b> in Setup so receipts and payments land in the right book.</div></div>';
    }
    h += '<div class="card tight"><div class="pad" style="padding:8px 4px 0">' + table({
      cls: 'compact',
      cols: [
        { k: 'date', label: 'Date', render: function (r) { return dmy(r.date); } },
        { k: 'particulars', label: 'Particulars', render: function (r) { return esc(r.particulars) + '<div class="tiny muted">' + esc(r.mode || '') + (r.ref ? ' · ' + esc(r.ref) : '') + '</div>'; } },
        { k: 'in', label: 'In', cls: 'num green', render: function (r) { return r.inAmt ? fmt(r.inAmt) : ''; } },
        { k: 'out', label: 'Out', cls: 'num red', render: function (r) { return r.outAmt ? fmt(r.outAmt) : ''; } },
        { k: 'bal', label: 'Balance', cls: 'num', render: function (r) { return fmt(r.balance); } }
      ],
      rows: data, empty: 'No bank movements this month.'
    }) + '</div></div>';
    view.innerHTML = h;
    document.getElementById('mSel').onchange = function () { Router.go('bankbook', { month: this.value, acc: accId }); };
    document.getElementById('accSel').onchange = function () { Router.go('bankbook', { month: month, acc: this.value }); };
  }
});

/* ================= TADA LEDGER ================= */
screen('taledger', {
  title: 'TADA Ledger',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var empId = params.emp || '';
    var list = S.tada.filter(function (t) {
      return String(t.date).slice(0, 7) === month && (!empId || t.empId === empId);
    });
    list = sortBy(list, 'date');
    var cols = [
      { k: 'date', label: 'Date' }, { k: 'emp', label: 'Employee' }, { k: 'from', label: 'From' },
      { k: 'to', label: 'To' }, { k: 'km', label: 'KM' }, { k: 'da', label: 'DA' },
      { k: 'lodging', label: 'Lodging' }, { k: 'other', label: 'Other' }, { k: 'total', label: 'Total' },
      { k: 'status', label: 'Status' }
    ];
    var exportRows = list.map(function (t) {
      return { date: dmy(t.date), emp: empName(t.empId), from: t.from || '', to: t.to || '', km: num(t.km), da: num(t.da), lodging: num(t.lodging), other: num(t.other), total: num(t.total), status: t.status || 'pending' };
    });
    var approved = sum(list.filter(function (t) { return t.status === 'approved'; }), 'total');
    var pending = sum(list.filter(function (t) { return t.status !== 'approved'; }), 'total');

    var h = pageHead('TADA Ledger', [Export.action('TADA Ledger', function () { return cols; }, function () { return exportRows; })],
      month + ' · ' + inr(approved + pending) + ' claimed');
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '">' +
      '<select id="empSel" style="border:1px solid #d6dee6;border-radius:12px;padding:10px;background:#fff;max-width:46%">' +
      '<option value="">All employees</option>' +
      S.employees.map(function (e) { return '<option value="' + e.id + '"' + (empId === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') +
      '</select></div>';
    h += '<div class="stats">' + statCard('Approved', inr(approved), 'ready for payroll', 'green') +
      statCard('Pending', inr(pending), 'awaiting approval', 'amber') +
      statCard('Claims', String(list.length), 'this month') + '</div>';
    h += '<div class="card tight"><div class="pad" style="padding:8px 4px 0">' + table({
      cls: 'compact',
      cols: [
        { k: 'date', label: 'Date', render: function (t) { return dmy(t.date); } },
        { k: 'emp', label: 'Employee', render: function (t) { return esc(empName(t.empId)) + '<div class="tiny muted">' + esc(t.from || '') + ' → ' + esc(t.to || '') + '</div>'; } },
        { k: 'km', label: 'KM', cls: 'num', render: function (t) { return fmtQty(t.km || 0); } },
        { k: 'total', label: 'Amount', cls: 'num', render: function (t) { return fmt(t.total); } },
        { k: 'status', label: '', render: function (t) { return badge(t.status || 'pending', statusTone(t.status)); } }
      ],
      rows: list, empty: 'No travel claims in this month.'
    }) + '</div></div>';
    h += '<div class="card"><h3>Employee summary</h3>' + (function () {
      var byEmp = groupBy(list, 'empId');
      var keys = Object.keys(byEmp);
      if (!keys.length) return '<div class="tiny muted">Nothing to summarise.</div>';
      return keys.map(function (k) {
        var recs = byEmp[k];
        return '<div class="kv"><span>' + esc(empName(k)) + '</span><span>' + inr(sum(recs, 'total')) +
          ' · ' + fmtQty(sum(recs, 'km')) + ' km</span></div>';
      }).join('');
    })() + '</div>';
    view.innerHTML = h;
    document.getElementById('mSel').onchange = function () { Router.go('taledger', { month: this.value, emp: empId }); };
    document.getElementById('empSel').onchange = function () { Router.go('taledger', { month: month, emp: this.value }); };
  }
});

/* ================= INCENTIVE LEDGER ================= */
screen('incentives', {
  title: 'Incentive Ledger',
  render: function (view, params) {
    var from = params.from || monthRange(thisMonth()).from;
    var to = params.to || monthRange(thisMonth()).to;
    var emps = S.employees.filter(function (e) { return e.empType === 'sales' || num(e.incentiveAmount); });
    var rows = [];
    emps.forEach(function (e) {
      var invs = S.invoices.filter(function (i) {
        return i.docType !== 'financer' && i.salesEmpId === e.id && inRange(i.date, from, to);
      });
      var perSale = num(e.incentiveAmount);
      invs.forEach(function (i) {
        rows.push({
          date: i.date, empId: e.id, emp: e.name, no: i.no, customer: partyName(i.partyId),
          saleType: i.saleType || 'sales', taxable: num(i.taxable),
          incentive: perSale
        });
      });
    });
    rows = sortBy(rows, 'date', 'desc');
    var total = sum(rows, 'incentive');
    var cols = [
      { k: 'date', label: 'Date' }, { k: 'emp', label: 'Sales executive' }, { k: 'no', label: 'Invoice' },
      { k: 'customer', label: 'Customer' }, { k: 'saleType', label: 'Type' }, { k: 'taxable', label: 'Taxable' },
      { k: 'pct', label: 'Rate %' }, { k: 'incentive', label: 'Incentive' }
    ];
    var exportRows = rows.map(function (r) {
      return { date: dmy(r.date), emp: r.emp, no: r.no, customer: r.customer, saleType: r.saleType, taxable: r.taxable, incentive: r.incentive };
    });

    var h = pageHead('Incentive Ledger', [Export.action('Incentive Ledger', function () { return cols; }, function () { return exportRows; })],
      dmy(from) + ' to ' + dmy(to) + ' · ' + inr(total) + ' earned');
    h += '<div class="searchbar"><input id="fSel" type="date" value="' + esc(from) + '">' +
      '<input id="tSel" type="date" value="' + esc(to) + '"></div>';
    h += '<div class="stats">' + statCard('Incentive earned', inr(total), rows.length + ' invoices', 'green') +
      statCard('Sales covered', inr(sum(rows, 'taxable')), 'taxable value', 'blue') + '</div>';
    h += '<div class="card tight"><div class="pad" style="padding:8px 4px 0">' + table({
      cls: 'compact',
      cols: [
        { k: 'date', label: 'Date', render: function (r) { return dmy(r.date); } },
        { k: 'emp', label: 'Executive', render: function (r) { return esc(r.emp) + '<div class="tiny muted">' + esc(r.no) + ' · ' + esc(r.customer) + '</div>'; } },
        { k: 'taxable', label: 'Sale', cls: 'num', render: function (r) { return fmt(r.taxable); } },
        { k: 'incentive', label: 'Incentive', cls: 'num', render: function (r) { return '<b>' + fmt(r.incentive) + '</b><div class="tiny muted">per sale</div>'; } }
      ],
      rows: rows, empty: 'No incentive earned in this period.'
    }) + '</div></div>';
    h += '<div class="card"><h3>Executive summary</h3>' + (function () {
      var byEmp = groupBy(rows, 'empId');
      var keys = Object.keys(byEmp);
      if (!keys.length) return '<div class="tiny muted">Nothing to summarise.</div>';
      return keys.map(function (k) {
        var recs = byEmp[k];
        return '<div class="kv"><span>' + esc(empName(k)) + '</span><span>' + inr(sum(recs, 'incentive')) +
          ' <span class="tiny muted">on ' + inr(sum(recs, 'taxable')) + '</span></span></div>';
      }).join('');
    })() + '</div>';
    h += '<div class="note" style="margin:0 14px">Incentive is a fixed amount per sale, taken from the employee master. Change it there and the ledger recalculates; payroll picks up the same figure.</div>';
    view.innerHTML = h;
    document.getElementById('fSel').onchange = function () { Router.go('incentives', { from: this.value, to: to }); };
    document.getElementById('tSel').onchange = function () { Router.go('incentives', { from: from, to: this.value }); };
  }
});

/* ================= COMMISSION LEDGER ================= */
screen('commission', {
  title: 'Commission Ledger',
  render: function (view, params) {
    var from = params.from || fyRange(fyOf(today())).from;
    var to = params.to || fyRange(fyOf(today())).to;
    var rows = [];
    S.invoices.forEach(function (i) {
      if (i.docType === 'financer' || !i.brokerId || !inRange(i.date, from, to)) return;
      var broker = S.parties.find(function (p) { return p.id === i.brokerId; }) || {};
      var dealAmount = num(i.brokerCommission) || num(broker.commissionAmount);
      var lineTotal = sum(i.lines || [], lineAmount) || num(i.taxable);
      (i.lines || []).forEach(function (l) {
        var it = item(l.itemId);
        var cat = it.category === 'tractor' ? 'Tractor' : (it.category === 'implement' || it.category === 'accessory') ? 'Implements' : 'Spares / service';
        var amt = lineAmount(l);
        var share = lineTotal ? amt / lineTotal : 1;
        rows.push({
          date: i.date, brokerId: i.brokerId, broker: broker.name || '', no: i.no,
          customer: partyName(i.partyId), category: cat, taxable: amt, commission: r2(dealAmount * share)
        });
      });
    });
    rows = sortBy(rows, 'date', 'desc');
    var tractor = sum(rows.filter(function (r) { return r.category === 'Tractor'; }), 'commission');
    var impl = sum(rows.filter(function (r) { return r.category === 'Implements'; }), 'commission');
    var other = sum(rows.filter(function (r) { return r.category === 'Spares / service'; }), 'commission');
    var cols = [
      { k: 'date', label: 'Date' }, { k: 'broker', label: 'Broker' }, { k: 'no', label: 'Invoice' },
      { k: 'customer', label: 'Customer' }, { k: 'category', label: 'Category' },
      { k: 'taxable', label: 'Taxable' }, { k: 'commission', label: 'Commission' }
    ];
    var exportRows = rows.map(function (r) {
      return { date: dmy(r.date), broker: r.broker, no: r.no, customer: r.customer, category: r.category, taxable: r.taxable, commission: r.commission };
    });

    var h = pageHead('Commission Ledger', [Export.action('Commission Ledger', function () { return cols; }, function () { return exportRows; })],
      dmy(from) + ' to ' + dmy(to) + ' · ' + inr(tractor + impl + other) + ' payable');
    h += '<div class="searchbar"><input id="fSel" type="date" value="' + esc(from) + '">' +
      '<input id="tSel" type="date" value="' + esc(to) + '"></div>';
    h += '<div class="stats">' + statCard('Tractor commission', inr(tractor), 'on tractor sales', 'blue') +
      statCard('Implements', inr(impl), 'on implements & accessories', 'amber') +
      statCard('Spares / service', inr(other), 'other lines') +
      statCard('Total', inr(tractor + impl + other), 'payable to brokers', 'red') + '</div>';
    h += '<div class="card tight"><div class="pad" style="padding:8px 4px 0">' + table({
      cls: 'compact',
      cols: [
        { k: 'date', label: 'Date', render: function (r) { return dmy(r.date); } },
        { k: 'broker', label: 'Broker', render: function (r) { return esc(r.broker) + '<div class="tiny muted">' + esc(r.no) + ' · ' + esc(r.customer) + '</div>'; } },
        { k: 'category', label: 'On', render: function (r) { return badge(r.category, r.category === 'Tractor' ? 'blue' : r.category === 'Implements' ? 'amber' : 'grey'); } },
        { k: 'taxable', label: 'Value', cls: 'num', render: function (r) { return fmt(r.taxable); } },
        { k: 'commission', label: 'Commission', cls: 'num', render: function (r) { return fmt(r.commission); } }
      ],
      rows: rows, empty: 'No broker commission in this period. Add a broker on an invoice to start the ledger.'
    }) + '</div></div>';
    h += '<div class="card"><h3>Broker-wise</h3>' + (function () {
      var byB = groupBy(rows, 'brokerId');
      var keys = Object.keys(byB);
      if (!keys.length) return '<div class="tiny muted">Nothing to summarise.</div>';
      return keys.map(function (k) {
        var recs = byB[k];
        return '<div class="kv"><span>' + esc(partyName(k)) + '</span><span>' + inr(sum(recs, 'commission')) + '</span></div>';
      }).join('');
    })() + '</div>';
    view.innerHTML = h;
    document.getElementById('fSel').onchange = function () { Router.go('commission', { from: this.value, to: to }); };
    document.getElementById('tSel').onchange = function () { Router.go('commission', { from: from, to: this.value }); };
  }
});

/* ================= TRANSPORT LEDGER ================= */
screen('transportledger', {
  title: 'Transport Ledger',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var rng = monthRange(month);
    var list = sortBy(S.transports.filter(function (t) { return inRange(t.date, rng.from, rng.to); }), 'date', 'desc');
    var freight = sum(list, 'freight');
    var paid = sum(list.filter(function (t) { return t.paid; }), 'freight');
    var cols = [
      { k: 'date', label: 'Date' }, { k: 'transporter', label: 'Transporter' }, { k: 'lrNo', label: 'LR no.' },
      { k: 'vehicleNo', label: 'Vehicle' }, { k: 'route', label: 'Route' }, { k: 'freight', label: 'Freight' },
      { k: 'paid', label: 'Paid' }
    ];
    var exportRows = list.map(function (t) {
      return { date: dmy(t.date), transporter: transporterName(t.transporterId), lrNo: t.lrNo || '', vehicleNo: t.vehicleNo || '', route: (t.from || '') + ' - ' + (t.to || ''), freight: num(t.freight), paid: t.paid ? 'Yes' : 'No' };
    });

    var h = pageHead('Transport Ledger', [
      Export.action('Transport Ledger', function () { return cols; }, function () { return exportRows; }),
      { label: 'New entry', icon: 'plus', cls: 'primary', onClick: function () { transportForm(); } }
    ], month + ' · ' + inr(freight) + ' freight · ' + inr(freight - paid) + ' unpaid');
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '"></div>';
    h += '<div class="stats">' + statCard('Freight', inr(freight), list.length + ' trips') +
      statCard('Paid', inr(paid), 'settled', 'green') +
      statCard('Unpaid', inr(freight - paid), 'payable', 'red') + '</div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No transport entries this month. Record LR, vehicle and freight for each delivery.</div>';
    else h += list.map(function (t) {
      var id = 'tl' + t.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { transportForm(t); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(transporterName(t.transporterId)) +
        ' ' + badge(t.paid ? 'PAID' : 'UNPAID', t.paid ? 'green' : 'amber') + '</div>' +
        '<div class="rc-sub">' + dmy(t.date) + ' · LR ' + esc(t.lrNo || '-') + ' · ' + esc(t.vehicleNo || '') +
        ' · ' + esc(t.from || '') + ' → ' + esc(t.to || '') + '</div></div>' +
        '<div class="rc-right">' + inr(t.freight) + '<small>' + esc(t.refNo || '') + '</small></div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;
    document.getElementById('mSel').onchange = function () { Router.go('transportledger', { month: this.value }); };
  }
});

function transportForm(t) {
  editEntity({
    title: t ? 'Edit transport entry' : 'New transport entry',
    wide: true, rec: t,
    defaults: { date: today(), paid: false, freight: 0, gst: 0 },
    fields: [
      { k: 'date', label: 'Date', type: 'date', required: true },
      { k: 'transporterId', label: 'Transporter', type: 'select', required: true, options: transporterOptions },
      { k: 'vehicleNo', label: 'Vehicle no.' },
      { k: 'lrNo', label: 'LR / docket no.' },
      { k: 'from', label: 'From' },
      { k: 'to', label: 'To' },
      { k: 'freight', label: 'Freight amount', type: 'number', step: '0.01', required: true },
      { k: 'gst', label: 'GST on freight', type: 'number', step: '0.01' },
      { k: 'refNo', label: 'Invoice / bill ref.' },
      { k: 'paid', label: 'Freight paid', type: 'checkbox', help: 'Mark when settled' },
      { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, def: (S.branches[0] || {}).id },
      { k: 'notes', label: 'Remarks', type: 'textarea', span: 2, rows: 2 }
    ],
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) rec.id = uid('trp');
      upsert('transports', rec);
      if (v.paid && !(old && old.paid)) {
        upsert('expenses', {
          id: uid('exp'), date: v.date, head: 'transport', particulars: 'Freight — ' + transporterName(v.transporterId) + ' LR ' + (v.lrNo || ''),
          amount: num(v.freight) + num(v.gst), gst: num(v.gst), mode: 'cash', branchId: v.branchId || (S.branches[0] || {}).id
        });
      }
      toast('Transport entry saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('transports', rec.id); Router.render(); }
  });
}

/* ================= TRADE ADVANCE / FINANCE LEDGER ================= */
screen('advances', {
  title: 'Trade Advance',
  render: function (view, params) {
    var tab = params.tab || 'entries';
    var list = sortBy(S.tradeAdvances, 'date', 'desc');
    var paid = sum(list.filter(function (a) { return a.direction === 'paid'; }), 'principal');
    var recd = sum(list.filter(function (a) { return a.direction === 'received'; }), 'principal');
    var interest = sum(list, function (a) { return advanceInterest(a); });
    var balance = sum(list, function (a) { return advanceBalance(a); });

    var cols = [
      { k: 'no', label: 'Advance no.' }, { k: 'date', label: 'Date' }, { k: 'party', label: 'Party' },
      { k: 'direction', label: 'Type' }, { k: 'principal', label: 'Principal' },
      { k: 'rate', label: 'Rate %' }, { k: 'start', label: 'Start' }, { k: 'close', label: 'Close' },
      { k: 'ifta', label: 'IFTA days' }, { k: 'days', label: 'Chargeable days' },
      { k: 'interest', label: 'Interest' }, { k: 'balance', label: 'Balance' }
    ];
    var exportRows = list.map(function (a) {
      return {
        no: a.no, date: dmy(a.date), party: partyName(a.partyId), direction: a.direction === 'paid' ? 'Advance paid' : 'Advance received',
        principal: num(a.principal), rate: num(a.interestRate), start: dmy(a.startDate), close: dmy(a.closeDate),
        ifta: num(a.iftaDays), days: advanceChargeableDays(a), interest: advanceInterest(a), balance: advanceBalance(a)
      };
    });

    var h = pageHead('Trade Advance', [
      Export.action('Trade Advances', function () { return cols; }, function () { return exportRows; }),
      { label: 'New advance', icon: 'plus', cls: 'primary', onClick: function () { advanceForm(); } }
    ], 'Finance advances with interest, start / close dates and IFTA days');
    h += '<div class="tabs">' + [['entries', 'Advances'], ['ledger', 'Party ledger']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    h += '<div class="stats">' +
      statCard('Advance paid', inr(paid), 'to suppliers / financers', 'blue') +
      statCard('Advance received', inr(recd), 'from customers', 'green') +
      statCard('Interest accrued', inr(interest), 'to date', 'amber') +
      statCard('Balance', inr(balance), 'principal + interest − repaid', 'red') +
      '</div>';

    if (tab === 'entries') {
      h += '<div class="card tight">';
      if (!list.length) h += '<div class="empty small">No trade advances yet. Record an advance with its interest rate, start date and interest-free days.</div>';
      else h += list.map(function (a) {
        var id = 'ad' + a.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { advanceDetail(a.id); };
        }, 0);
        var bal = advanceBalance(a);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(a.no) + ' · ' + esc(partyName(a.partyId)) +
          ' ' + badge(a.direction === 'paid' ? 'PAID OUT' : 'RECEIVED', a.direction === 'paid' ? 'blue' : 'green') +
          (a.closed ? ' ' + badge('closed', 'grey') : '') + '</div>' +
          '<div class="rc-sub">' + dmy(a.startDate) + (a.closeDate ? ' → ' + dmy(a.closeDate) : ' → open') +
          ' · ' + num(a.interestRate) + '% · IFTA ' + num(a.iftaDays) + 'd · ' +
          advanceChargeableDays(a) + ' chargeable days</div>' +
          '<div class="rc-sub">Interest ' + inr(advanceInterest(a)) + ' · repaid ' + inr(advanceRepaid(a)) + '</div></div>' +
          '<div class="rc-right">' + inr(bal) + '<small>principal ' + inr(a.principal) + '</small></div></div>';
      }).join('');
      h += '</div>';
    } else {
      var byParty = groupBy(list, 'partyId');
      var keys = Object.keys(byParty);
      h += '<div class="card tight">';
      if (!keys.length) h += '<div class="empty small">Nothing to summarise yet.</div>';
      else h += keys.map(function (k) {
        var recs = byParty[k];
        var pr = sum(recs, 'principal');
        var it = sum(recs, function (a) { return advanceInterest(a); });
        var rp = sum(recs, function (a) { return advanceRepaid(a); });
        return '<div class="rowcard"><div class="rc-main"><div class="rc-title">' + esc(partyName(k)) + '</div>' +
          '<div class="rc-sub">' + recs.length + ' advance(s) · principal ' + inr(pr) + ' · interest ' + inr(it) + ' · repaid ' + inr(rp) + '</div></div>' +
          '<div class="rc-right">' + inr(pr + it - rp) + '<small>balance</small></div></div>';
      }).join('');
      h += '</div>';
      h += '<div class="card"><h3>How interest is worked out</h3><div class="tiny muted">' +
        'Interest = principal × rate ÷ 100 × chargeable days ÷ 365.<br>' +
        'Chargeable days = days from the start date (or today, whichever is earlier if closed) minus the IFTA days. ' +
        'IFTA (interest free trade advance) days let you give an interest-free window before interest starts.</div></div>';
    }
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('advances', { tab: b.getAttribute('data-tab') }); }; });
  }
});

function advanceForm(a) {
  var isNew = !a;
  editEntity({
    title: isNew ? 'New trade advance' : 'Edit trade advance',
    wide: true, rec: a,
    defaults: { date: today(), startDate: today(), direction: 'paid', interestRate: 9, iftaDays: 0, principal: 0 },
    fields: [
      { k: 'date', label: 'Entry date', type: 'date', required: true },
      { k: 'direction', label: 'Type', type: 'select', options: [['paid', 'Advance paid out'], ['received', 'Advance received']], required: true },
      { k: 'partyId', label: 'Party', type: 'select', required: true, span: 2, options: function () {
          return S.parties.map(function (p) { return { v: p.id, l: p.name + ' · ' + p.type }; });
        } },
      { k: 'principal', label: 'Advance amount', type: 'number', step: '0.01', required: true },
      { k: 'interestRate', label: 'Interest rate % p.a.', type: 'number', step: '0.01' },
      { k: 'startDate', label: 'Start date', type: 'date', required: true },
      { k: 'closeDate', label: 'Close date', type: 'date', help: 'Leave blank while running' },
      { k: 'iftaDays', label: 'IFTA days (interest free)', type: 'number', def: 0 },
      { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, def: (S.branches[0] || {}).id },
      { k: 'notes', label: 'Remarks', type: 'textarea', span: 2, rows: 2 }
    ],
    validate: function (v, old) {
      if (!num(v.principal)) return 'Enter the advance amount';
      if (v.closeDate && v.closeDate < v.startDate) return 'Close date cannot be before the start date';
      return null;
    },
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) {
        rec.id = uid('adv');
        rec.no = nextNo('adv', settings().advPrefix || 'ADV');
        rec.repayments = [];
      }
      rec.closed = !!(rec.closeDate && rec.closeDate <= today());
      upsert('tradeAdvances', rec);
      toast(old ? 'Advance updated' : 'Advance recorded');
      Router.render();
    },
    onDelete: function (rec) { removeRec('tradeAdvances', rec.id); toast('Advance deleted'); Router.render(); }
  });
}

function advanceDetail(id) {
  var a = findOne('tradeAdvances', id);
  if (!a) return;
  var interest = advanceInterest(a), repaid = advanceRepaid(a), bal = advanceBalance(a);
  var reps = a.repayments || [];
  var body = '<div class="kv"><span>Party</span><span>' + esc(partyName(a.partyId)) + '</span></div>' +
    '<div class="kv"><span>Type</span><span>' + (a.direction === 'paid' ? 'Advance paid out' : 'Advance received') + '</span></div>' +
    '<div class="kv"><span>Principal</span><span>' + inr(a.principal) + '</span></div>' +
    '<div class="kv"><span>Interest rate</span><span>' + num(a.interestRate) + '% p.a.</span></div>' +
    '<div class="kv"><span>Start date</span><span>' + dmy(a.startDate) + '</span></div>' +
    '<div class="kv"><span>Close date</span><span>' + (a.closeDate ? dmy(a.closeDate) : 'running') + '</span></div>' +
    '<div class="kv"><span>Days elapsed</span><span>' + advanceDays(a) + '</span></div>' +
    '<div class="kv"><span>IFTA days</span><span>' + num(a.iftaDays) + '</span></div>' +
    '<div class="kv"><span>Chargeable days</span><span>' + advanceChargeableDays(a) + '</span></div>' +
    '<div class="kv"><span>Interest accrued</span><span>' + inr(interest) + '</span></div>' +
    '<div class="kv"><span>Repaid</span><span>' + inr(repaid) + '</span></div>' +
    '<div class="grand"><span>Balance</span><span>' + inr(bal) + '</span></div>' +
    '<div class="section-label">Repayments</div>';
  if (!reps.length) body += '<div class="tiny muted">No repayments recorded.</div>';
  else body += reps.map(function (r) {
    return '<div class="kv"><span>' + dmy(r.date) + ' · ' + esc(r.mode || '') + (r.note ? ' · ' + esc(r.note) : '') + '</span><span>' + inr(r.amount) + '</span></div>';
  }).join('');
  if (a.notes) body += '<div class="note">' + esc(a.notes) + '</div>';

  var m = modal({
    title: a.no + ' · ' + partyName(a.partyId),
    wide: true, body: body,
    footer: '<button class="btn ghost" data-print>' + icon('print') + '</button>' +
      '<button class="btn ghost" data-repay>Repayment</button>' +
      '<button class="btn ghost" data-edit>Edit</button>' +
      '<button class="btn primary" data-close>Done</button>'
  });
  qs('[data-print]', m.el).onclick = function () { m.close(); printDoc('advance', a.id); };
  qs('[data-close]', m.el).onclick = m.close;
  qs('[data-edit]', m.el).onclick = function () { m.close(); advanceForm(a); };
  qs('[data-repay]', m.el).onclick = function () {
    m.close();
    Form({
      title: 'Repayment against ' + a.no,
      fields: [
        { k: 'date', label: 'Date', type: 'date', required: true, def: today() },
        { k: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
        { k: 'mode', label: 'Mode', type: 'select', options: [['cash', 'Cash'], ['bank', 'Bank'], ['upi', 'UPI'], ['cheque', 'Cheque']], def: 'bank' },
        { k: 'note', label: 'Note', span: 2 }
      ],
      onSave: function (v) {
        a.repayments = a.repayments || [];
        a.repayments.push({ id: uid('rep'), date: v.date, amount: num(v.amount), mode: v.mode, note: v.note });
        if (num(v.amount) >= advanceBalance(a) - 0.5) { a.closed = true; a.closeDate = a.closeDate || v.date; }
        upsert('tradeAdvances', a);
        toast('Repayment recorded');
        Router.render();
      }
    });
  };
}
