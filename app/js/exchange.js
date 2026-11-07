/* ============================================================
   exchange.js — old tractor exchange (trade-in) against a sale
   ============================================================ */

screen('exchanges', {
  title: 'Tractor Exchange',
  render: function (view, params) {
    var list = sortBy(S.exchanges, 'date', 'desc');
    var totalVal = sum(list, 'value');
    var h = pageHead('Tractor Exchange', [{ label: 'New exchange', icon: 'plus', cls: 'primary', onClick: function () { exchangeForm(); } }],
      list.length + ' trade-ins · ' + inr(totalVal) + ' taken in');

    h += '<div class="stats">' +
      statCard('Trade-ins', String(list.length), 'old tractors taken') +
      statCard('Value taken in', inr(totalVal), 'at valuation', 'blue') +
      statCard('Adjusted on sales', inr(sum(list.filter(function (x) { return x.invoiceId; }), 'value')), 'against invoices', 'green') +
      statCard('Paid to customer', inr(sum(list.filter(function (x) { return !x.invoiceId || x.settle === 'pay'; }), 'value')), 'cash settlement', 'amber') +
      '</div>';

    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No trade-ins yet. Exchange an old tractor against a new sale and it enters stock automatically.</div>';
    else h += list.map(function (x) {
      var id = 'ex' + x.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { exchangeDetail(x.id); };
      }, 0);
      var inv = x.invoiceId ? findOne('invoices', x.invoiceId) : null;
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(x.no) + ' · ' + esc(partyName(x.customerId)) + '</div>' +
        '<div class="rc-sub">' + esc(x.oldModel || itemName(x.itemId)) + ' · ' + esc(x.chassisNo || '') + ' · ' + dmy(x.date) + '</div>' +
        '<div class="rc-sub">' + (inv ? 'Against ' + esc(inv.no) : 'Standalone purchase') + ' · ' + esc(x.settle === 'pay' ? 'paid to customer' : 'adjusted') + '</div></div>' +
        '<div class="rc-right">' + inr(x.value) + '<small>' + esc(branchName(x.branchId)) + '</small></div></div>';
    }).join('');
    h += '</div>';

    h += '<div class="card"><h3>How exchange is treated</h3><div class="tiny muted">' +
      'The old tractor comes into stock at its valuation and is tracked with its own chassis and engine number, so you can resell it like any other unit. ' +
      'When it is set against a new invoice, the invoice outstanding falls by the exchange value — no GST is charged on the trade-in and it does not count as sales revenue in the P&L.</div></div>';
    view.innerHTML = h;
  }
});

function exchangeForm(x) {
  var isNew = !x;
  var fields = [
    { k: 'date', label: 'Exchange date', type: 'date', required: true, def: today() },
    { k: 'customerId', label: 'Customer', type: 'select', required: true, options: function () { return partyOptions(['customer']); } },
    { k: 'itemId', label: 'Old tractor model', type: 'select', options: function () {
        return S.items.filter(function (i) { return i.category === 'tractor'; }).map(function (i) { return { v: i.id, l: i.name }; });
      } },
    { k: 'oldModel', label: 'Make / model (as seen)', placeholder: 'e.g. Mahindra 265 DI 2016' },
    { k: 'chassisNo', label: 'Old chassis no.', required: true },
    { k: 'engineNo', label: 'Old engine no.', required: true },
    { k: 'mfgYear', label: 'Year of manufacture', type: 'number' },
    { k: 'hours', label: 'Hour meter', type: 'number' },
    { k: 'condition', label: 'Condition', type: 'select', options: [['good', 'Good'], ['average', 'Average'], ['poor', 'Needs work']], def: 'average' },
    { k: 'value', label: 'Exchange valuation', type: 'number', step: '0.01', required: true },
    { k: 'invoiceId', label: 'Adjust against invoice', type: 'select', span: 2, options: function () {
        return S.invoices.filter(function (i) { return i.docType !== 'financer' && invoiceOutstanding(i) > 0.5; })
          .map(function (i) { return { v: i.id, l: i.no + ' · ' + partyName(i.partyId) + ' · open ' + inr(invoiceOutstanding(i)) }; });
      } },
    { k: 'settle', label: 'Settlement', type: 'select', options: [['adjust', 'Adjust against invoice'], ['pay', 'Pay the customer']], def: 'adjust' },
    { k: 'branchId', label: 'Branch', type: 'select', options: branchOptions, required: true, def: (S.branches[0] || {}).id },
    { k: 'brokerId', label: 'Broker (if any)', type: 'select', options: function () { return brokerList().map(function (b) { return { v: b.id, l: b.name }; }); } },
    { k: 'remarks', label: 'Remarks / valuation notes', type: 'textarea', span: 2, rows: 2 }
  ];
  editEntity({
    title: isNew ? 'New tractor exchange' : 'Edit exchange',
    wide: true, rec: x, fields: fields,
    defaults: { date: today(), settle: 'adjust', condition: 'average', branchId: (S.branches[0] || {}).id },
    validate: function (v, old) {
      if (!num(v.value)) return 'Enter the exchange valuation';
      if (v.settle !== 'pay' && v.invoiceId) {
        var inv = findOne('invoices', v.invoiceId);
        if (inv) {
          var open = invoiceOutstanding(inv) + (old && old.invoiceId === v.invoiceId ? num(old.value) : 0);
          if (num(v.value) > open + 0.5) {
            return 'Exchange value ' + inr(v.value) + ' is more than the invoice balance ' + inr(open) +
              '. Reduce the valuation or set settlement to "Pay the customer".';
          }
        }
      }
      var dup = S.units.find(function (u) {
        return u.chassisNo && String(u.chassisNo).toUpperCase() === String(v.chassisNo).toUpperCase();
      });
      if (dup && (!old || old.chassisNo !== v.chassisNo)) return 'This chassis number is already in stock';
      return null;
    },
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      rec.value = num(v.value);
      rec.chassisNo = String(v.chassisNo || '').toUpperCase();
      rec.engineNo = String(v.engineNo || '').toUpperCase();
      if (rec.settle === 'pay') rec.invoiceId = '';
      if (rec.settle !== 'pay' && !rec.invoiceId) rec.settle = 'adjust';
      if (!old) rec.id = uid('exc');
      if (!rec.no) rec.no = nextNo('exc', settings().exchPrefix || 'EXC');
      upsert('exchanges', rec);

      // the old tractor enters stock as a used unit
      var unit = S.units.find(function (u) { return u.exchangeId === rec.id; });
      if (!unit) {
        unit = {
          id: uid('unt'), unitKind: 'tractor', unitType: 'used', itemId: rec.itemId || '',
          chassisNo: rec.chassisNo, engineNo: rec.engineNo, model: rec.oldModel || itemName(rec.itemId),
          colour: '', mfgYear: rec.mfgYear, hours: num(rec.hours), condition: rec.condition,
          cost: rec.value, branchId: rec.branchId, status: 'in_stock',
          source: 'exchange', exchangeId: rec.id, purchaseDate: rec.date, purchaseNo: rec.no
        };
        S.units.push(unit);
      } else {
        unit.chassisNo = rec.chassisNo; unit.engineNo = rec.engineNo; unit.cost = rec.value;
        unit.branchId = rec.branchId; unit.mfgYear = rec.mfgYear; unit.hours = num(rec.hours);
        unit.condition = rec.condition; unit.model = rec.oldModel || itemName(rec.itemId);
      }
      save(true);
      toast(old ? 'Exchange updated' : 'Exchange recorded — old tractor added to stock');
      Router.render();
    },
    onDelete: function (rec) {
      var unit = S.units.find(function (u) { return u.exchangeId === rec.id; });
      if (unit && unit.status === 'sold') { toast('The traded-in tractor is already sold — cannot delete', 'err'); return; }
      confirmDlg('Delete this exchange and remove the traded-in tractor from stock?', function () {
        if (unit) removeRec('units', unit.id);
        removeRec('exchanges', rec.id);
        toast('Exchange deleted'); Router.render();
      }, 'Delete');
    }
  });
}

function exchangeDetail(id) {
  var x = findOne('exchanges', id);
  if (!x) return;
  var unit = S.units.find(function (u) { return u.exchangeId === x.id; });
  var inv = x.invoiceId ? findOne('invoices', x.invoiceId) : null;
  var m = modal({
    title: x.no,
    wide: true,
    body: '<div class="kv"><span>Date</span><span>' + dmy(x.date) + '</span></div>' +
      '<div class="kv"><span>Customer</span><span>' + esc(partyName(x.customerId)) + '</span></div>' +
      '<div class="kv"><span>Old tractor</span><span>' + esc(x.oldModel || itemName(x.itemId)) + '</span></div>' +
      '<div class="kv"><span>Chassis</span><span class="mono">' + esc(x.chassisNo) + '</span></div>' +
      '<div class="kv"><span>Engine</span><span class="mono">' + esc(x.engineNo) + '</span></div>' +
      '<div class="kv"><span>Year / hours</span><span>' + esc(x.mfgYear || '—') + ' · ' + fmtQty(x.hours || 0) + ' h</span></div>' +
      '<div class="kv"><span>Condition</span><span>' + esc(x.condition || '') + '</span></div>' +
      '<div class="kv"><span>Valuation</span><span>' + inr(x.value) + '</span></div>' +
      '<div class="kv"><span>Adjusted against</span><span>' + (inv ? esc(inv.no) + ' · ' + inr(inv.total) : '—') + '</span></div>' +
      '<div class="kv"><span>Stock status</span><span>' + (unit ? badge(unit.status, statusTone(unit.status)) : 'removed') + '</span></div>' +
      (x.remarks ? '<div class="note">' + esc(x.remarks) + '</div>' : ''),
    footer: (unit ? '<button class="btn ghost" data-unit>Stock</button>' : '') +
      '<button class="btn ghost" data-print>' + icon('print') + 'PDF</button>' +
      '<button class="btn primary" data-edit>Edit</button>'
  });
  qs('[data-edit]', m.el).onclick = function () { m.close(); exchangeForm(x); };
  qs('[data-print]', m.el).onclick = function () { m.close(); printDoc('exchange', x.id); };
  var ub = qs('[data-unit]', m.el);
  if (ub) ub.onclick = function () { m.close(); unitDetail(unit.id); };
}
