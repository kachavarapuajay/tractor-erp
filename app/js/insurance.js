/* ============================================================
   insurance.js — insurance companies/agents master and
   policy register with due-date tracking
   ============================================================ */

function insurerOptions() {
  return S.insurers.filter(function (i) { return i.active !== false; })
    .map(function (i) { return { v: i.id, l: i.name + (i.type === 'agent' ? ' (agent)' : '') }; });
}
function insurerName(id) {
  var i = S.insurers.find(function (x) { return x.id === id; });
  return i ? i.name : '—';
}

screen('insurance', {
  title: 'Insurance',
  render: function (view, params) {
    var tab = params.tab || 'policies';
    var policies = sortBy(S.policies, 'dueDate');
    var due = policies.filter(function (p) { return policyDueStatus(p) === 'due'; });
    var expired = policies.filter(function (p) { return policyDueStatus(p) === 'expired'; });
    var premium = sum(policies, 'premium');

    var h = pageHead('Insurance', [{ label: tab === 'policies' ? 'New policy' : 'New insurer', icon: 'plus', cls: 'primary', onClick: function () { tab === 'policies' ? policyForm() : insurerForm(); } }],
      policies.length + ' policies · ' + due.length + ' due soon · ' + expired.length + ' expired');
    h += '<div class="tabs">' + [['policies', 'Policies'], ['insurers', 'Companies & agents']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    if (tab === 'policies') {
      h += '<div class="stats">' + statCard('Policies', String(policies.length), 'in register') +
        statCard('Premium', inr(premium), 'total booked', 'blue') +
        statCard('Due in 30 days', String(due.length), 'renew now', 'amber') +
        statCard('Expired', String(expired.length), 'no cover', 'red') + '</div>';
      h += '<div class="card tight">';
      if (!policies.length) h += '<div class="empty small">No policies yet. Add tractor and implement insurance to track renewals.</div>';
      else h += policies.map(function (p) {
        var st = policyDueStatus(p);
        var tone = st === 'expired' ? 'red' : st === 'due' ? 'amber' : 'green';
        var txt = st === 'expired' ? 'EXPIRED' : st === 'due' ? 'DUE ' + daysBetween(today(), p.dueDate) + 'd' : 'ACTIVE';
        var id = 'pol' + p.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { policyForm(p); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(p.policyNo || 'No policy no.') +
          ' ' + badge(txt, tone) + '</div>' +
          '<div class="rc-sub">' + esc(partyName(p.customerId)) + ' · ' + esc(p.vehicleNo || (p.unitId ? unitOf(p.unitId).chassisNo : '—')) +
          ' · ' + esc(insurerName(p.insurerId)) + '</div>' +
          '<div class="rc-sub">' + esc(p.policyType || '') + ' · due ' + dmy(p.dueDate) + '</div></div>' +
          '<div class="rc-right">' + inr(p.premium) + '<small>IDV ' + inr(p.sumInsured) + '</small></div></div>';
      }).join('');
      h += '</div>';
    } else {
      h += '<div class="card tight">';
      if (!S.insurers.length) h += '<div class="empty small">Add the insurance companies and agents you deal with.</div>';
      else h += S.insurers.map(function (i) {
        var count = S.policies.filter(function (p) { return p.insurerId === i.id; }).length;
        var id = 'ins' + i.id;
        setTimeout(function () {
          var e = document.getElementById(id); if (e) e.onclick = function () { insurerForm(i); };
        }, 0);
        return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(i.name) + ' ' +
          badge(i.type === 'agent' ? 'AGENT' : 'COMPANY', i.type === 'agent' ? 'blue' : 'grey') + '</div>' +
          '<div class="rc-sub">' + esc(i.phone || '') + (i.email ? ' · ' + esc(i.email) : '') + ' · ' + count + ' policies</div></div>' +
          '<div class="rc-right">' + (i.active === false ? badge('inactive', 'red') : '') + '</div></div>';
      }).join('');
      h += '</div>';
    }
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('insurance', { tab: b.getAttribute('data-tab') }); }; });
  }
});

function policyForm(p) {
  var isNew = !p;
  var fields = [
    { k: 'policyNo', label: 'Policy number', required: true, span: 2 },
    { k: 'insurerId', label: 'Insurance company / agent', type: 'select', required: true, options: insurerOptions },
    { k: 'policyType', label: 'Policy type', type: 'select', options: [['comprehensive', 'Comprehensive'], ['third-party', 'Third party'], ['tractor', 'Tractor package'], ['implement', 'Implement'], ['other', 'Other']], def: 'comprehensive' },
    { k: 'customerId', label: 'Insured customer', type: 'select', required: true, options: function () { return partyOptions(['customer']); } },
    { k: 'unitId', label: 'Link to stock unit', type: 'select', options: function () { return S.units.map(function (u) { return { v: u.id, l: (u.chassisNo || u.serialNo) + ' · ' + (u.model || '') }; }); } },
    { k: 'vehicleNo', label: 'Vehicle / chassis / serial no.', span: 2 },
    { k: 'sumInsured', label: 'IDV / sum insured', type: 'number', step: '0.01' },
    { k: 'premium', label: 'Premium', type: 'number', step: '0.01' },
    { k: 'startDate', label: 'Policy start', type: 'date', def: today() },
    { k: 'dueDate', label: 'Renewal due date', type: 'date', required: true, def: addDays(today(), 365) },
    { k: 'agentName', label: 'Agent name' },
    { k: 'agentPhone', label: 'Agent phone', type: 'tel' },
    { k: 'remarks', label: 'Remarks', type: 'textarea', span: 2, rows: 2 }
  ];
  editEntity({
    title: isNew ? 'New insurance policy' : 'Edit policy',
    wide: true, rec: p, fields: fields,
    defaults: { startDate: today(), dueDate: addDays(today(), 365), policyType: 'comprehensive', premium: 0, sumInsured: 0 },
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) rec.id = uid('pol');
      if (rec.unitId && !rec.vehicleNo) {
        var u = unitOf(rec.unitId);
        rec.vehicleNo = u.chassisNo || u.serialNo || '';
      }
      upsert('policies', rec);
      toast(old ? 'Policy updated' : 'Policy added');
      Router.render();
    },
    onDelete: function (rec) { removeRec('policies', rec.id); toast('Policy deleted'); Router.render(); }
  });
}

function insurerForm(i) {
  editEntity({
    title: i ? 'Edit insurer' : 'New insurer / agent',
    wide: true, rec: i,
    defaults: { type: 'company', active: true },
    fields: [
      { k: 'name', label: 'Name', required: true, span: 2 },
      { k: 'type', label: 'Type', type: 'select', options: [['company', 'Insurance company'], ['agent', 'Agent / broker']], def: 'company' },
      { k: 'phone', label: 'Phone', type: 'tel' },
      { k: 'email', label: 'Email', type: 'email' },
      { k: 'address', label: 'Address', type: 'textarea', span: 2, rows: 2 },
      { k: 'active', label: 'Active', type: 'checkbox', def: true, help: 'Shown in policy dropdowns' }
    ],
    onSave: function (v, old) {
      var rec = Object.assign({}, old || {}, v);
      if (!old) rec.id = uid('ins');
      upsert('insurers', rec); toast('Saved'); Router.render();
    },
    onDelete: function (rec) {
      var used = S.policies.some(function (p) { return p.insurerId === rec.id; });
      if (used) { toast('Insurer has policies — deactivate instead', 'err'); return; }
      removeRec('insurers', rec.id); Router.render();
    }
  });
}


/* alias so Masters can open the insurer tab directly */
screen('insurers', {
  title: 'Insurance Companies',
  render: function (view) { Router.go('insurance', { tab: 'insurers' }); }
});
