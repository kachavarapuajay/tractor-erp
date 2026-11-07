/* ============================================================
   purchase.js — purchase bills and expenses
   ============================================================ */

screen('purchases', {
  title: 'Purchase Bills',
  render: function (view, params) {
    var tab = params.tab || 'all';
    var list = S.purchases.filter(function (p) {
      if (tab === 'unpaid') return purchaseOutstanding(p) > 0.5;
      if (tab === 'paid') return purchaseOutstanding(p) <= 0.5;
      return true;
    });
    list = sortBy(list, 'date', 'desc');
    var total = sum(list, 'total');
    var open = sum(list, function (p) { return purchaseOutstanding(p); });
    var expCols = [
      { k: 'date', label: 'Date' }, { k: 'no', label: 'Bill' }, { k: 'supplier', label: 'Supplier' },
      { k: 'gstin', label: 'GSTIN' }, { k: 'taxable', label: 'Taxable' }, { k: 'gst', label: 'GST' },
      { k: 'total', label: 'Total' }, { k: 'balance', label: 'Payable' }, { k: 'rcm', label: 'RCM' }
    ];
    var expRows = list.map(function (p) {
      return {
        date: dmy(p.date), no: p.no, supplier: partyName(p.partyId), gstin: party(p.partyId).gstin || '',
        taxable: num(p.taxable), gst: num(p.cgst) + num(p.sgst) + num(p.igst), total: num(p.total),
        balance: purchaseOutstanding(p), rcm: p.rcm ? 'Y' : 'N'
      };
    });
    var h = pageHead('Purchase Bills', [
      Export.action('Purchase Bills', function () { return expCols; }, function () { return expRows; }),
      { label: 'New bill', icon: 'plus', cls: 'primary', onClick: function () { openDocEditor('purchase'); } }],
      list.length + ' bills · ' + inr(total) + ' · ' + inr(open) + ' payable');
    h += '<div class="tabs">' + [['all', 'All'], ['unpaid', 'Payable'], ['paid', 'Settled']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div><div class="card tight">';
    if (!list.length) h += '<div class="empty small">No purchase bills yet. Add stock inward from a supplier bill.</div>';
    else h += list.map(function (p) {
      var id = 'pu' + p.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { openDocView('purchase', p.id); };
      }, 0);
      var out = purchaseOutstanding(p);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(partyName(p.partyId)) + '</div>' +
        '<div class="rc-sub">' + esc(p.no) + ' · bill ' + esc(p.billNo || '-') + ' · ' + dmy(p.date) + ' · ' + esc(p.purchaseType || '') + '</div></div>' +
        '<div class="rc-right">' + inr(p.total) + '<small>' + (out > 0.5 ? badge('PAYABLE ' + fmt(out, 0), 'amber') : badge('SETTLED', 'green')) + '</small></div></div>';
    }).join('');
    view.innerHTML = h + '</div>';
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('purchases', { tab: b.getAttribute('data-tab') }); }; });
  }
});

/* ================= EXPENSES ================= */
var EXPENSE_HEADS = [['rent', 'Rent'], ['salary', 'Salary & wages'], ['electricity', 'Electricity'], ['fuel', 'Fuel & travel'],
  ['repair', 'Repairs & maintenance'], ['transport', 'Freight & transport'], ['marketing', 'Marketing & promotion'],
  ['office', 'Office & stationery'], ['bank', 'Bank charges'], ['professional', 'Professional fees'],
  ['insurance', 'Insurance'], ['interest', 'Interest & finance cost'], ['misc', 'Miscellaneous']];

screen('expenses', {
  title: 'Expenses',
  render: function (view, params) {
    var month = params.month || thisMonth();
    var list = S.expenses.filter(function (e) { return String(e.date).slice(0, 7) === month; });
    list = sortBy(list, 'date', 'desc');
    var total = sum(list, 'amount');
    var gstPaid = sum(list, 'gst');
    var byHead = groupBy(list, 'head');

    var h = pageHead('Expenses', [{ label: 'Add', icon: 'plus', cls: 'primary', onClick: function () { expenseForm(); } }],
      monthName(month.slice(5)) + ' ' + month.slice(0, 4) + ' · ' + inr(total) + ' across ' + list.length + ' entries');
    h += '<div class="searchbar"><input id="mSel" type="month" value="' + esc(month) + '"></div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No expenses booked this month.</div>';
    else h += list.map(function (e) {
      var id = 'ex' + e.id;
      setTimeout(function () {
        var el2 = document.getElementById(id);
        if (el2) el2.onclick = function () { expenseForm(e); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(e.particulars || e.head) + '</div>' +
        '<div class="rc-sub">' + dmy(e.date) + ' · ' + esc(e.head) + (e.partyName ? ' · ' + esc(e.partyName) : '') +
        ' · ' + esc((e.mode || 'cash').toUpperCase()) + '</div></div>' +
        '<div class="rc-right">' + inr(e.amount) + '<small>' + esc(branchName(e.branchId)) + '</small></div></div>';
    }).join('');
    h += '</div>';
    h += '<div class="card"><h3>Head-wise</h3>' + barChart(Object.keys(byHead).map(function (k) {
      return { l: (EXPENSE_HEADS.find(function (x) { return x[0] === k; }) || [k, k])[1], v: sum(byHead[k], 'amount'), tone: 'amber' };
    }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8)) + '</div>';
    h += '<div class="card"><div class="kv"><span>Total expenses</span><span>' + inr(total) + '</span></div>' +
      '<div class="kv"><span>GST portion (ITC)</span><span>' + inr(gstPaid) + '</span></div></div>';
    view.innerHTML = h;
    document.getElementById('mSel').onchange = function () { Router.go('expenses', { month: this.value }); };
  }
});

function expenseForm(e) {
  editEntity({
    title: e ? 'Edit expense' : 'Add expense',
    wide: true, rec: e,
    defaults: { date: today(), head: 'misc', mode: 'cash', amount: 0, gst: 0, branchId: (S.branches[0] || {}).id },
    fields: [
      { k: 'date', label: 'Date', type: 'date', required: true },
      { k: 'head', label: 'Expense head', type: 'select', required: true, options: EXPENSE_HEADS },
      { k: 'particulars', label: 'Particulars', required: true, span: 2 },
      { k: 'partyName', label: 'Paid to' },
      { k: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
      { k: 'gst', label: 'GST included', type: 'number', step: '0.01' },
      { k: 'mode', label: 'Paid by', type: 'select', options: [['cash', 'Cash'], ['bank', 'Bank'], ['upi', 'UPI'], ['cheque', 'Cheque']] },
      { k: 'bankAccountId', label: 'Bank account', type: 'select', options: bankAccountOptions },
      { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true },
      { k: 'empId', label: 'Paid by (staff)', type: 'select', options: function () { return empOptions(); } }
    ],
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) rec.id = uid('exp');
      upsert('expenses', rec); toast('Expense saved'); Router.render();
    },
    onDelete: function (rec) { removeRec('expenses', rec.id); Router.render(); }
  });
}
