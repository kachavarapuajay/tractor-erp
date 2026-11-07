/* ============================================================
   hr.js — attendance, salary, TADA, fuel book, logbook, petty cash
   ============================================================ */

/* ================= ATTENDANCE ================= */
screen('attendance', {
  title: 'Attendance',
  render: function (view, params) {
    var date = params.date || today();
    var emps = S.employees.filter(function (e) { return e.active !== false; });
    function rec(empId) { return S.attendance.find(function (a) { return a.empId === empId && a.date === date; }); }
    var month = date.slice(0, 7);
    var monthRecs = S.attendance.filter(function (a) { return String(a.date).slice(0, 7) === month; });

    var h = pageHead('Attendance', [], dmy(date) + ' · ' + emps.length + ' employees');
    h += '<div class="searchbar"><input id="dSel" type="date" value="' + esc(date) + '">' +
      '<button class="btn" id="markAll">All present</button></div>';
    h += '<div class="card tight">';
    if (!emps.length) h += '<div class="empty small">Add employees first.</div>';
    else h += emps.map(function (e) {
      var r = rec(e.id);
      var st = r ? r.status : '';
      return '<div class="rowcard"><div class="rc-main"><div class="rc-title">' + esc(e.name) + '</div>' +
        '<div class="rc-sub">' + esc(e.designation || '') + ' · ' + esc((e.empType || '').toUpperCase()) + '</div></div>' +
        '<div class="rc-right"><div class="chipset">' +
        [['P', 'P'], ['A', 'A'], ['H', 'H'], ['L', 'L']].map(function (s) {
          var bg = st === s[0] ? (s[0] === 'P' ? '#1b8a4b' : s[0] === 'A' ? '#c62828' : s[0] === 'H' ? '#b26a00' : '#1565c0') : '';
          return '<button class="chip" data-emp="' + e.id + '" data-st="' + s[0] + '" style="' +
            (bg ? 'background:' + bg + ';color:#fff' : '') + '">' + s[1] + '</button>';
        }).join('') + '</div></div></div>';
    }).join('');
    h += '</div>';
    h += '<div class="card"><h3>This month</h3>' + barChart([
      { l: 'Present', v: monthRecs.filter(function (a) { return a.status === 'P'; }).length, tone: '' },
      { l: 'Absent', v: monthRecs.filter(function (a) { return a.status === 'A'; }).length, tone: 'red' },
      { l: 'Half day', v: monthRecs.filter(function (a) { return a.status === 'H'; }).length, tone: 'amber' },
      { l: 'Leave', v: monthRecs.filter(function (a) { return a.status === 'L'; }).length, tone: 'blue' }
    ], { fmt: function (v) { return String(v) + ' days'; } }) + '</div>';
    view.innerHTML = h;

    qsa('[data-emp]', view).forEach(function (b) {
      b.onclick = function () {
        var empId = b.getAttribute('data-emp'), st = b.getAttribute('data-st');
        var r = rec(empId);
        if (r) { r.status = st; }
        else S.attendance.push({ id: uid('att'), empId: empId, date: date, status: st, inTime: '09:30', outTime: '18:30' });
        save(); Router.render();
      };
    });
    document.getElementById('dSel').onchange = function () { Router.go('attendance', { date: this.value }); };
    document.getElementById('markAll').onclick = function () {
      emps.forEach(function (e) {
        if (!rec(e.id)) S.attendance.push({ id: uid('att'), empId: e.id, date: date, status: 'P', inTime: '09:30', outTime: '18:30' });
      });
      save(true); toast('All marked present'); Router.render();
    };
  }
});

/* ================= SALARY ================= */
screen('salary', {
  title: 'Salary',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var rows = S.salaries.filter(function (s) { return s.month === month; });
    var emps = S.employees.filter(function (e) { return e.active !== false; });
    var total = sum(rows, 'net');

    var h = pageHead('Salary', [{ label: 'Generate sheet', icon: 'plus', cls: 'primary', onClick: generate }],
      monthName(month.slice(5)) + ' ' + month.slice(0, 4) + ' · ' + inr(total) + ' net');
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '"></div>';
    h += '<div class="card tight">';
    if (!rows.length) h += '<div class="empty small">No salary sheet for this month. Tap <b>Generate sheet</b>.</div>';
    else h += rows.map(function (s) {
      var id = 'sl' + s.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { salaryEdit(s); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(empName(s.empId)) + ' ' +
        badge(s.paidOn ? 'PAID' : 'PENDING', s.paidOn ? 'green' : 'amber') + '</div>' +
        '<div class="rc-sub">Basic ' + inr(s.basic) + ' + inc ' + inr(s.incentive) + ' + TADA ' + inr(s.tada) +
        ' − ded ' + inr(s.deduction) + '</div></div>' +
        '<div class="rc-right">' + inr(s.net) + '<small>' + (s.paidOn ? dmy(s.paidOn) : 'unpaid') + '</small></div></div>';
    }).join('');
    h += '</div>';
    h += '<div class="card"><div class="kv"><span>Gross</span><span>' + inr(sum(rows, 'gross')) + '</span></div>' +
      '<div class="kv"><span>Deductions</span><span>' + inr(sum(rows, 'deduction')) + '</span></div>' +
      '<div class="kv"><span>Net payable</span><span>' + inr(total) + '</span></div>' +
      '<div class="kv"><span>Paid</span><span class="green">' + inr(sum(rows.filter(function (r) { return r.paidOn; }), 'net')) + '</span></div></div>';
    view.innerHTML = h;
    document.getElementById('mSel').onchange = function () { Router.go('salary', { month: this.value }); };

    function generate() {
      if (!emps.length) { toast('No employees to pay', 'err'); return; }
      confirmDlg('Generate salary sheet for ' + month + '? Existing entries for the month are replaced.', function () {
        S.salaries = S.salaries.filter(function (s) { return s.month !== month; });
        emps.forEach(function (e) {
          var salesCount = S.invoices.filter(function (i) {
            return i.docType !== 'financer' && i.salesEmpId === e.id && String(i.date).slice(0, 7) === month;
          }).length;
          var incentive = r2(salesCount * num(e.incentiveAmount));
          var tada = sum(S.tada.filter(function (t) { return t.empId === e.id && String(t.date).slice(0, 7) === month && t.status === 'approved'; }), 'total');
          var att = S.attendance.filter(function (a) { return a.empId === e.id && String(a.date).slice(0, 7) === month; });
          var absent = att.filter(function (a) { return a.status === 'A'; }).length;
          var half = att.filter(function (a) { return a.status === 'H'; }).length;
          var perDay = r2(num(e.salary) / 30);
          var lop = r2(perDay * (absent + half * 0.5));
          var gross = r2(num(e.salary) + incentive + tada);
          S.salaries.push({
            id: uid('sal'), empId: e.id, month: month, basic: num(e.salary), incentive: incentive,
            tada: tada, lop: lop, deduction: lop, gross: gross, net: r2(gross - lop),
            absentDays: absent, halfDays: half, paidOn: '', mode: 'bank'
          });
        });
        save(true); toast('Salary sheet generated'); Router.render();
      }, 'Generate');
    }

    function salaryEdit(s) {
      var fields = [
        { k: 'basic', label: 'Basic', type: 'number', step: '0.01' },
        { k: 'incentive', label: 'Incentive', type: 'number', step: '0.01' },
        { k: 'tada', label: 'TADA reimbursement', type: 'number', step: '0.01' },
        { k: 'deduction', label: 'Deductions / LOP', type: 'number', step: '0.01' },
        { k: 'paidOn', label: 'Paid on', type: 'date' },
        { k: 'mode', label: 'Paid by', type: 'select', options: [['bank', 'Bank'], ['cash', 'Cash'], ['upi', 'UPI']] }
      ];
      var m = modal({
        title: 'Salary · ' + empName(s.empId), wide: true,
        body: formHtml(fields, s) + '<div class="js-calc note"></div>',
        footer: '<button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button>'
      });
      function calc() {
        var v = readForm(m.el, fields);
        var net = r2(num(v.basic) + num(v.incentive) + num(v.tada) - num(v.deduction));
        qs('.js-calc', m.el).innerHTML = 'Net payable: <b>' + inr(net) + '</b>';
      }
      qsa('[name]', m.el).forEach(function (e) { e.onchange = calc; });
      calc();
      qs('[data-cancel]', m.el).onclick = m.close;
      qs('[data-save]', m.el).onclick = function () {
        var v = readForm(m.el, fields);
        var net = r2(num(v.basic) + num(v.incentive) + num(v.tada) - num(v.deduction));
        Object.assign(s, v, { gross: r2(num(v.basic) + num(v.incentive) + num(v.tada)), net: net });
        upsert('salaries', s);
        if (v.paidOn) {
          upsert('expenses', {
            id: uid('exp'), date: v.paidOn, head: 'salary', particulars: 'Salary ' + month + ' — ' + empName(s.empId),
            amount: net, gst: 0, mode: v.mode || 'bank', branchId: (S.branches[0] || {}).id, empId: s.empId
          });
        }
        m.close(); toast('Salary updated'); Router.render();
      };
    }
  }
});

/* ================= TADA ================= */
screen('tada', {
  title: 'TADA / Travel',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var list = sortBy(S.tada.filter(function (t) { return String(t.date).slice(0, 7) === month; }), 'date', 'desc');
    var h = pageHead('TADA / Travel Claims', [{ label: 'New claim', icon: 'plus', cls: 'primary', onClick: function () { tadaForm(); } }],
      month + ' · ' + inr(sum(list, 'total')) + ' claimed');
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '"></div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No travel claims this month.</div>';
    else h += list.map(function (t) {
      var id = 'td' + t.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { tadaForm(t); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(empName(t.empId)) +
        ' ' + badge(t.status || 'pending', statusTone(t.status)) + '</div>' +
        '<div class="rc-sub">' + dmy(t.date) + ' · ' + esc(t.from || '') + ' → ' + esc(t.to || '') +
        (t.km ? ' · ' + fmtQty(t.km) + ' km' : '') + '</div></div>' +
        '<div class="rc-right">' + inr(t.total) + '<small>' + esc(t.mode || '') + '</small></div></div>';
    }).join('');
    h += '</div><div class="card"><div class="kv"><span>Total claimed</span><span>' + inr(sum(list, 'total')) + '</span></div>' +
      '<div class="kv"><span>Approved</span><span class="green">' + inr(sum(list.filter(function (t) { return t.status === 'approved'; }), 'total')) + '</span></div>' +
      '<div class="kv"><span>Pending</span><span class="amber">' + inr(sum(list.filter(function (t) { return t.status !== 'approved'; }), 'total')) + '</span></div></div>';
    view.innerHTML = h;
    document.getElementById('mSel').onchange = function () { Router.go('tada', { month: this.value }); };
  }
});

function tadaForm(t) {
  var fields = [
    { k: 'empId', label: 'Employee', type: 'select', required: true, span: 2, options: function () { return empOptions(); } },
    { k: 'date', label: 'Date', type: 'date', required: true },
    { k: 'mode', label: 'Mode', type: 'select', options: [['bike', 'Two-wheeler'], ['car', 'Car'], ['bus', 'Bus / train'], ['auto', 'Auto']], def: 'bike' },
    { k: 'from', label: 'From', required: true },
    { k: 'to', label: 'To', required: true },
    { k: 'km', label: 'Distance (km)', type: 'number' },
    { k: 'ratePerKm', label: 'Rate / km', type: 'number', step: '0.01', def: 4 },
    { k: 'da', label: 'DA / food', type: 'number', step: '0.01' },
    { k: 'lodging', label: 'Lodging', type: 'number', step: '0.01' },
    { k: 'other', label: 'Other (toll, parking)', type: 'number', step: '0.01' },
    { k: 'status', label: 'Status', type: 'select', options: [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']], def: 'pending' },
    { k: 'purpose', label: 'Purpose / remarks', type: 'textarea', span: 2, rows: 2 }
  ];
  editEntity({
    title: t ? 'Edit travel claim' : 'New travel claim',
    wide: true, rec: t, fields: fields,
    defaults: { date: today(), mode: 'bike', ratePerKm: 4, status: 'pending', da: 0, lodging: 0, other: 0 },
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      rec.total = r2(num(v.km) * num(v.ratePerKm) + num(v.da) + num(v.lodging) + num(v.other));
      if (!old) rec.id = uid('tad');
      upsert('tada', rec); toast('Claim saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('tada', rec.id); Router.render(); }
  });
}

/* ================= FUEL BOOK ================= */
screen('fuel', {
  title: 'Fuel Book',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var list = sortBy(S.fuel.filter(function (f) { return String(f.date).slice(0, 7) === month; }), 'date', 'desc');
    var litres = sum(list, 'litres'), amount = sum(list, 'amount');
    var h = pageHead('Fuel Book', [{ label: 'Add entry', icon: 'plus', cls: 'primary', onClick: function () { fuelForm(); } }],
      month + ' · ' + fmtQty(litres) + ' L · ' + inr(amount));
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '"></div>';
    h += '<div class="stats">' + statCard('Litres', fmtQty(litres), 'this month') +
      statCard('Spend', inr(amount), 'avg ' + inr(litres ? amount / litres : 0) + '/L', 'blue') + '</div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No fuel entries this month.</div>';
    else h += list.map(function (f) {
      var id = 'fl' + f.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { fuelForm(f); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(f.vehicleNo || (f.unitId ? unitOf(f.unitId).chassisNo : '—')) + '</div>' +
        '<div class="rc-sub">' + dmy(f.date) + ' · ' + fmtQty(f.litres) + ' L @ ' + inr(f.rate) +
        (f.odometer ? ' · ' + fmt(f.odometer, 0) + ' km' : '') + (f.empId ? ' · ' + esc(empName(f.empId)) : '') + '</div></div>' +
        '<div class="rc-right">' + inr(f.amount) + '<small>' + esc(f.station || '') + '</small></div></div>';
    }).join('');
    view.innerHTML = h + '</div>';
    document.getElementById('mSel').onchange = function () { Router.go('fuel', { month: this.value }); };
  }
});

function fuelForm(f) {
  var fields = [
    { k: 'date', label: 'Date', type: 'date', required: true },
    { k: 'vehicleNo', label: 'Vehicle / tractor no.', required: true },
    { k: 'unitId', label: 'Linked stock unit', type: 'select', span: 2, options: function () { return S.units.map(function (u) { return { v: u.id, l: u.chassisNo + ' · ' + (u.model || '') }; }); } },
    { k: 'litres', label: 'Litres', type: 'number', step: '0.01', required: true },
    { k: 'rate', label: 'Rate / litre', type: 'number', step: '0.01', required: true },
    { k: 'odometer', label: 'Odometer / hour meter', type: 'number' },
    { k: 'station', label: 'Fuel station' },
    { k: 'empId', label: 'Driver / staff', type: 'select', options: function () { return empOptions(); } },
    { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true },
    { k: 'mode', label: 'Paid by', type: 'select', options: [['cash', 'Cash'], ['credit', 'Credit'], ['petty', 'Petty cash']], def: 'cash' }
  ];
  editEntity({
    title: f ? 'Edit fuel entry' : 'Fuel entry',
    wide: true, rec: f, fields: fields,
    defaults: { date: today(), branchId: (S.branches[0] || {}).id, mode: 'cash', litres: 0, rate: 0 },
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      rec.amount = r2(num(v.litres) * num(v.rate));
      if (!old) rec.id = uid('ful');
      upsert('fuel', rec);
      if (v.mode === 'petty') {
        upsert('petty', {
          id: uid('pet'), date: v.date, branchId: v.branchId, type: 'payment',
          particulars: 'Fuel ' + v.litres + ' L ' + (v.vehicleNo || ''), head: 'fuel', amount: rec.amount, empId: v.empId
        });
      }
      toast('Fuel entry saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('fuel', rec.id); Router.render(); }
  });
}

/* ================= LOGBOOK ================= */
screen('logbook', {
  title: 'Vehicle Logbook',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var list = sortBy(S.logbook.filter(function (l) { return String(l.date).slice(0, 7) === month; }), 'date', 'desc');
    var km = sum(list, 'distance');
    var h = pageHead('Vehicle Logbook', [{ label: 'Add trip', icon: 'plus', cls: 'primary', onClick: function () { logForm(); } }],
      month + ' · ' + list.length + ' trips · ' + fmt(km, 0) + ' km');
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '"></div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No trips logged this month.</div>';
    else h += list.map(function (l) {
      var id = 'lg' + l.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { logForm(l); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(l.from) + ' → ' + esc(l.to) + '</div>' +
        '<div class="rc-sub">' + dmy(l.date) + ' · ' + esc(l.vehicleNo || '') + (l.driver ? ' · ' + esc(l.driver) : '') +
        (l.purpose ? ' · ' + esc(l.purpose) : '') + '</div></div>' +
        '<div class="rc-right">' + fmt(l.distance || 0, 0) + ' km<small>' + fmt(l.startKm || 0, 0) + '–' + fmt(l.endKm || 0, 0) + '</small></div></div>';
    }).join('');
    view.innerHTML = h + '</div>';
    document.getElementById('mSel').onchange = function () { Router.go('logbook', { month: this.value }); };
  }
});

function logForm(l) {
  var fields = [
    { k: 'date', label: 'Date', type: 'date', required: true },
    { k: 'vehicleNo', label: 'Vehicle no.', required: true },
    { k: 'unitId', label: 'Linked stock unit', type: 'select', span: 2, options: function () { return S.units.map(function (u) { return { v: u.id, l: u.chassisNo + ' · ' + (u.model || '') }; }); } },
    { k: 'driver', label: 'Driver' },
    { k: 'empId', label: 'Staff', type: 'select', options: function () { return empOptions(); } },
    { k: 'from', label: 'From', required: true },
    { k: 'to', label: 'To', required: true },
    { k: 'startKm', label: 'Start km', type: 'number' },
    { k: 'endKm', label: 'End km', type: 'number' },
    { k: 'purpose', label: 'Purpose', span: 2 },
    { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true }
  ];
  editEntity({
    title: l ? 'Edit trip' : 'New trip',
    wide: true, rec: l, fields: fields,
    defaults: { date: today(), branchId: (S.branches[0] || {}).id },
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      rec.distance = Math.max(0, r2(num(v.endKm) - num(v.startKm)));
      if (!old) rec.id = uid('log');
      upsert('logbook', rec); toast('Trip saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('logbook', rec.id); Router.render(); }
  });
}

/* ================= PETTY CASH ================= */
screen('petty', {
  title: 'Petty Cash',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var list = sortBy(S.petty.filter(function (p) { return String(p.date).slice(0, 7) === month; }), 'date');
    var rec = sum(list.filter(function (p) { return p.type === 'receipt'; }), 'amount');
    var pay = sum(list.filter(function (p) { return p.type === 'payment'; }), 'amount');
    var opening = num(S.meta.pettyOpening || 0);
    var h = pageHead('Petty Cash Ledger', [{ label: 'Add entry', icon: 'plus', cls: 'primary', onClick: function () { pettyForm(); } }],
      month + ' · balance ' + inr(opening + rec - pay));
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '">' +
      '<button class="btn" id="setOpen">Opening</button></div>';
    h += '<div class="stats">' + statCard('Received', inr(rec), 'top-ups', 'green') +
      statCard('Spent', inr(pay), 'expenses', 'red') +
      statCard('Balance', inr(opening + rec - pay), 'petty cash in hand', 'blue') + '</div>';
    var run = opening;
    var rows = list.map(function (p) {
      run += p.type === 'receipt' ? num(p.amount) : -num(p.amount);
      return Object.assign({}, p, { balance: r2(run) });
    });
    h += '<div class="card tight"><div class="pad" style="padding:8px 6px 0">' + table({
      cls: 'compact',
      cols: [
        { k: 'date', label: 'Date', render: function (p) { return dmy(p.date); } },
        { k: 'particulars', label: 'Particulars', render: function (p) { return esc(p.particulars || p.head) + '<div class="tiny muted">' + esc(p.head || '') + '</div>'; } },
        { k: 'in', label: 'In', cls: 'num green', render: function (p) { return p.type === 'receipt' ? fmt(p.amount) : ''; } },
        { k: 'out', label: 'Out', cls: 'num red', render: function (p) { return p.type === 'payment' ? fmt(p.amount) : ''; } },
        { k: 'bal', label: 'Balance', cls: 'num', render: function (p) { return fmt(p.balance); } }
      ],
      rows: rows,
      empty: 'No petty cash entries this month.'
    }) + '</div></div>';
    view.innerHTML = h;
    document.getElementById('mSel').onchange = function () { Router.go('petty', { month: this.value }); };
    document.getElementById('setOpen').onclick = function () {
      promptDlg('Petty cash opening balance', 'Opening balance', opening, function (v) {
        S.meta.pettyOpening = num(v); save(true); Router.render();
      }, 'number');
    };
  }
});

function pettyForm(p) {
  editEntity({
    title: p ? 'Edit petty cash entry' : 'Petty cash entry',
    wide: true, rec: p,
    defaults: { date: today(), type: 'payment', branchId: (S.branches[0] || {}).id },
    fields: [
      { k: 'date', label: 'Date', type: 'date', required: true },
      { k: 'type', label: 'Type', type: 'select', options: [['payment', 'Payment (out)'], ['receipt', 'Receipt (in)']], required: true },
      { k: 'particulars', label: 'Particulars', required: true, span: 2 },
      { k: 'head', label: 'Head', type: 'select', options: EXPENSE_HEADS },
      { k: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
      { k: 'empId', label: 'Paid to / by', type: 'select', options: function () { return empOptions(); } },
      { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true }
    ],
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) rec.id = uid('pet');
      upsert('petty', rec); toast('Entry saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('petty', rec.id); Router.render(); }
  });
}
