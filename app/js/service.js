/* ============================================================
   service.js — job cards & mechanic workload
   ============================================================ */

screen('jobcards', {
  title: 'Job Cards',
  render: function (view, params) {
    var tab = params.tab || 'open';
    var list = S.jobcards.filter(function (j) {
      if (tab === 'all') return true;
      if (tab === 'open') return j.status === 'open' || j.status === 'in_progress';
      return j.status === tab;
    });
    list = sortBy(list, 'date', 'desc');
    var openJobs = S.jobcards.filter(function (j) { return j.status === 'open' || j.status === 'in_progress'; });
    var h = pageHead('Job Cards', [{ label: 'New job card', icon: 'plus', cls: 'primary', onClick: function () { openDocEditor('jobcard'); } }],
      openJobs.length + ' open · ' + S.jobcards.length + ' total');
    h += '<div class="tabs">' + [['open', 'Open'], ['completed', 'Completed'], ['delivered', 'Delivered'], ['all', 'All']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No job cards in this list.</div>';
    else h += list.map(function (j) {
      var id = 'jc' + j.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { jobActions(j.id); };
      }, 0);
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(j.no) + ' · ' + esc(partyName(j.partyId)) +
        ' ' + badge((j.status || '').replace('_', ' '), statusTone(j.status)) + '</div>' +
        '<div class="rc-sub">' + esc(j.chassisNo || (j.unitId ? unitOf(j.unitId).chassisNo : '—')) +
        ' · ' + dmy(j.date) + (j.mechanicId ? ' · ' + esc(empName(j.mechanicId)) : ' · unassigned') + '</div>' +
        '<div class="rc-sub">' + esc((j.complaint || '').slice(0, 60)) + '</div></div>' +
        '<div class="rc-right">' + inr(j.total) + '<small>' + (j.lines || []).length + ' items</small></div></div>';
    }).join('');
    h += '</div>';

    // mechanic workload
    var mechs = S.employees.filter(function (e) { return e.empType === 'mechanic' && e.active !== false; });
    if (mechs.length) {
      h += '<div class="card"><h3>Mechanic workload</h3>' + mechs.map(function (m) {
        var n = S.jobcards.filter(function (j) { return j.mechanicId === m.id && (j.status === 'open' || j.status === 'in_progress'); }).length;
        return '<div class="kv"><span>' + esc(m.name) + '</span><span>' + n + ' open job(s)</span></div>';
      }).join('') + '</div>';
    }
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('jobcards', { tab: b.getAttribute('data-tab') }); }; });
  }
});

function jobActions(id) {
  var j = findOne('jobcards', id);
  if (!j) return;
  var m = modal({
    title: j.no,
    body: '<div class="kv"><span>Customer</span><span>' + esc(partyName(j.partyId)) + '</span></div>' +
      '<div class="kv"><span>Chassis</span><span class="mono">' + esc(j.chassisNo || '—') + '</span></div>' +
      '<div class="kv"><span>Complaint</span><span>' + esc(j.complaint || '—') + '</span></div>' +
      '<div class="kv"><span>Mechanic</span><span>' + esc(empName(j.mechanicId) || 'unassigned') + '</span></div>' +
      '<div class="kv"><span>Total</span><span>' + inr(j.total) + '</span></div>' +
      '<div class="section-label">Update status</div><div class="chipset">' +
      [['open', 'Open'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']].map(function (s) {
        return '<button class="chip" data-st="' + s[0] + '" style="' + (j.status === s[0] ? 'background:#0f5132;color:#fff' : '') + '">' + s[1] + '</button>';
      }).join('') + '</div>',
    footer: '<button class="btn ghost" data-view>View</button><button class="btn ghost" data-edit>Edit</button>' +
      '<button class="btn primary" data-inv>Make invoice</button>'
  });
  qsa('[data-st]', m.el).forEach(function (b) {
    b.onclick = function () {
      j.status = b.getAttribute('data-st'); upsert('jobcards', j);
      toast('Status: ' + j.status.replace('_', ' ')); m.close(); Router.render();
    };
  });
  qs('[data-view]', m.el).onclick = function () { m.close(); openDocView('jobcard', id); };
  qs('[data-edit]', m.el).onclick = function () { m.close(); openDocEditor('jobcard', id); };
  qs('[data-inv]', m.el).onclick = function () { m.close(); invoiceFromJob(id); };
}

function invoiceFromJob(id) {
  var j = findOne('jobcards', id);
  if (!j) return;
  openDocEditor('invoice', null, {
    partyId: j.partyId,
    branchId: j.branchId,
    saleType: 'service',
    vehicleNo: j.regNo || j.chassisNo || '',
    salesEmpId: '',
    notes: 'Against job card ' + j.no,
    lines: (j.lines || []).map(function (l) {
      var o = Object.assign({}, l); delete o.unitId; return o;
    })
  });
}

function quoteToInvoice(id) {
  var q = findOne('quotations', id);
  if (!q) return;
  openDocEditor('invoice', null, {
    partyId: q.partyId, branchId: q.branchId, saleType: q.saleType, salesEmpId: q.salesEmpId,
    financerId: q.financerId, marginMoney: q.marginMoney,
    notes: 'Converted from quotation ' + q.no,
    lines: (q.lines || []).map(function (l) { return Object.assign({}, l); })
  });
  q.status = 'accepted'; upsert('quotations', q);
}
