/* ============================================================
   pdi.js — pre-delivery inspection sheet
   ============================================================ */

var PDI_YESNO = [['yes', 'Yes'], ['no', 'No']];
var PDI_OIL = [['ok', 'OK'], ['topped', 'Topped up'], ['low', 'Low — attend']];

/* the checks that carry a remark */
var PDI_CHECK_FIELDS = [
  ['hydraulics', 'Hydraulics'],
  ['engine', 'Engine'],
  ['gearbox', 'Gearbox'],
  ['clutchBrakes', 'Clutch / Brakes'],
  ['electricals', 'Electricals'],
  ['clusterAssy', 'Cluster assembly']
];

/* the fitments that are present or not */
var PDI_FIT_FIELDS = [
  ['toolKit', 'Tool kit'],
  ['serviceBook', 'Service book'],
  ['hitch', 'Hitch'],
  ['drawbar', 'Drawbar'],
  ['toplink', 'Toplink'],
  ['frontBed', 'Front bed / bumper']
];

function pdiYesNo(v) { return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '—'; }

function pdiFields() {
  var f = [
    { type: 'section', label: 'Identification' },
    { k: 'unitId', label: 'Tractor in stock (optional)', type: 'select', span: 2, options: function () {
        return S.units.filter(function (u) { return u.unitKind !== 'implement'; })
          .map(function (u) { return { v: u.id, l: (u.chassisNo || '') + ' · ' + (u.model || itemName(u.itemId)) }; });
      }, help: 'Pick a unit to fill model, chassis, engine and hours' },
    { k: 'date', label: 'Date', type: 'date', required: true },
    { k: 'mechanicId', label: 'Mechanic (PDI by)', type: 'select', options: function () { return empOptions('mechanic'); } },
    { k: 'model', label: 'Model' },
    { k: 'chassisNo', label: 'Chassis number' },
    { k: 'engineNo', label: 'Engine number' },
    { k: 'hours', label: 'Hrs', type: 'number' },

    { type: 'section', label: 'Tyres' },
    { k: 'tyresMake', label: 'Tyres — make', span: 2 },
    { k: 'tyreFL', label: 'FL — number' },
    { k: 'tyreFR', label: 'FR — number' },
    { k: 'tyreRL', label: 'RL — number' },
    { k: 'tyreRR', label: 'RR — number' },

    { type: 'section', label: 'Components' },
    { k: 'boschFipNo', label: 'Bosch FIP' },
    { k: 'starterMotor', label: 'Starter motor' },
    { k: 'alternator', label: 'Alternator' },
    { k: 'batteryMake', label: 'Battery — make' },
    { k: 'batteryNo', label: 'Battery — number' }
  ];

  f.push({ type: 'section', label: 'Checks' });
  PDI_CHECK_FIELDS.forEach(function (c) {
    f.push({ k: c[0], label: c[1], type: 'select', options: PDI_YESNO, def: 'yes' });
    f.push({ k: c[0] + 'Remark', label: c[1] + ' — remark' });
  });

  f.push({ type: 'section', label: 'Oil & fluids' });
  f.push({ k: 'oilLevels', label: 'Oil levels', type: 'select', options: PDI_OIL, def: 'ok' });
  f.push({ k: 'oilLevelsRemark', label: 'Oil — remark' });

  f.push({ type: 'section', label: 'Fitments' });
  PDI_FIT_FIELDS.forEach(function (c) {
    f.push({ k: c[0], label: c[1], type: 'select', options: PDI_YESNO, def: 'yes' });
  });

  f.push({ type: 'section', label: 'Sign off' });
  f.push({ k: 'status', label: 'Result', type: 'select', options: [['pending', 'Pending'], ['passed', 'Passed'], ['failed', 'Failed']], def: 'pending' });
  f.push({ k: 'remarks', label: 'Overall remarks', type: 'textarea', span: 2, rows: 2 });
  return f;
}

screen('pdi', {
  title: 'PDI',
  render: function (view, params) {
    var tab = params.tab || 'all';
    var list = S.pdis.filter(function (p) {
      if (tab === 'pending') return p.status === 'pending';
      if (tab === 'passed') return p.status === 'passed';
      if (tab === 'failed') return p.status === 'failed';
      return true;
    });
    list = sortBy(list, 'date', 'desc');
    var pending = S.pdis.filter(function (p) { return p.status === 'pending'; }).length;
    var passed = S.pdis.filter(function (p) { return p.status === 'passed'; }).length;
    var failed = S.pdis.filter(function (p) { return p.status === 'failed'; }).length;

    var cols = [
      { k: 'no', label: 'PDI no.' }, { k: 'date', label: 'Date' }, { k: 'mechanic', label: 'Mechanic' },
      { k: 'model', label: 'Model' }, { k: 'chassis', label: 'Chassis' }, { k: 'engine', label: 'Engine' },
      { k: 'hrs', label: 'Hrs' }, { k: 'tyres', label: 'Tyres' },
      { k: 'fl', label: 'FL' }, { k: 'fr', label: 'FR' }, { k: 'rl', label: 'RL' }, { k: 'rr', label: 'RR' },
      { k: 'fip', label: 'Bosch FIP' }, { k: 'starter', label: 'Starter motor' }, { k: 'alternator', label: 'Alternator' },
      { k: 'battery', label: 'Battery' }, { k: 'hydraulics', label: 'Hydraulics' }, { k: 'engineChk', label: 'Engine check' },
      { k: 'gearbox', label: 'Gearbox' }, { k: 'oil', label: 'Oil levels' }, { k: 'clutch', label: 'Clutch / brakes' },
      { k: 'electricals', label: 'Electricals' }, { k: 'cluster', label: 'Cluster assy' },
      { k: 'toolkit', label: 'Tool kit' }, { k: 'servicebook', label: 'Service book' },
      { k: 'hitch', label: 'Hitch' }, { k: 'drawbar', label: 'Drawbar' }, { k: 'toplink', label: 'Toplink' },
      { k: 'frontbed', label: 'Front bed / bumper' }, { k: 'status', label: 'Result' }
    ];
    var exportRows = list.map(function (p) {
      return {
        no: p.no, date: dmy(p.date), mechanic: empName(p.mechanicId), model: p.model || itemName(p.itemId),
        chassis: p.chassisNo || '', engine: p.engineNo || '', hrs: num(p.hours),
        tyres: p.tyresMake || '', fl: p.tyreFL || '', fr: p.tyreFR || '', rl: p.tyreRL || '', rr: p.tyreRR || '',
        fip: p.boschFipNo || '', starter: p.starterMotor || '', alternator: p.alternator || '',
        battery: [p.batteryMake, p.batteryNo].filter(Boolean).join(' / '),
        hydraulics: pdiYesNo(p.hydraulics), engineChk: pdiYesNo(p.engine), gearbox: pdiYesNo(p.gearbox),
        oil: p.oilLevels || '', clutch: pdiYesNo(p.clutchBrakes), electricals: pdiYesNo(p.electricals),
        cluster: pdiYesNo(p.clusterAssy),
        toolkit: pdiYesNo(p.toolKit), servicebook: pdiYesNo(p.serviceBook), hitch: pdiYesNo(p.hitch),
        drawbar: pdiYesNo(p.drawbar), toplink: pdiYesNo(p.toplink), frontbed: pdiYesNo(p.frontBed),
        status: p.status || ''
      };
    });

    var h = pageHead('Pre-Delivery Inspection', [
      Export.action('PDI Register', function () { return cols; }, function () { return exportRows; }),
      { label: 'New PDI', icon: 'plus', cls: 'primary', onClick: function () { pdiForm(); } }
    ], list.length + ' sheets · ' + pending + ' pending · ' + passed + ' passed · ' + failed + ' failed');

    h += '<div class="tabs">' + [['all', 'All'], ['pending', 'Pending'], ['passed', 'Passed'], ['failed', 'Failed']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    h += '<div class="card tight">';
    if (!list.length) h += '<div class="empty small">No inspection sheets yet. Run a PDI on every tractor before delivery.</div>';
    else h += list.map(function (p) {
      var id = 'pd' + p.id;
      setTimeout(function () {
        var e = document.getElementById(id); if (e) e.onclick = function () { pdiDetail(p.id); };
      }, 0);
      var fails = PDI_CHECK_FIELDS.filter(function (c) { return p[c[0]] === 'no'; }).length +
        PDI_FIT_FIELDS.filter(function (c) { return p[c[0]] === 'no'; }).length;
      return '<div class="rowcard" id="' + id + '"><div class="rc-main"><div class="rc-title">' + esc(p.chassisNo || p.no) +
        ' ' + badge((p.status || 'pending').toUpperCase(), p.status === 'passed' ? 'green' : p.status === 'failed' ? 'red' : 'amber') +
        (fails ? ' ' + badge(fails + ' NOT OK', 'red') : '') + '</div>' +
        '<div class="rc-sub">' + esc(p.model || itemName(p.itemId)) + ' · ' + dmy(p.date) +
        (p.mechanicId ? ' · ' + esc(empName(p.mechanicId)) : '') +
        (p.hours ? ' · ' + fmtQty(p.hours) + ' h' : '') + '</div>' +
        '<div class="rc-sub">' + (p.tyresMake ? esc(p.tyresMake) + ' · ' : '') +
        [p.tyreFL, p.tyreFR, p.tyreRL, p.tyreRR].filter(Boolean).map(esc).join(' / ') + '</div></div>' +
        '<div class="rc-right"><small>' + esc(p.no) + '</small></div></div>';
    }).join('');
    h += '</div>';
    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('pdi', { tab: b.getAttribute('data-tab') }); }; });
  }
});

function pdiForm(p, presetUnitId) {
  var isNew = !p;
  var rec = p || {};
  if (!p && presetUnitId) {
    var u = unitOf(presetUnitId);
    rec = {
      unitId: presetUnitId, model: u.model || itemName(u.itemId),
      chassisNo: u.chassisNo, engineNo: u.engineNo, hours: u.hours || ''
    };
  }
  editEntity({
    title: isNew ? 'New pre-delivery inspection' : 'Edit PDI',
    wide: true, isNew: isNew, rec: isNew ? null : rec, preset: isNew ? rec : null,
    defaults: {
      date: today(), status: 'pending', oilLevels: 'ok',
      hydraulics: 'yes', engine: 'yes', gearbox: 'yes', clutchBrakes: 'yes',
      electricals: 'yes', clusterAssy: 'yes',
      toolKit: 'yes', serviceBook: 'yes', hitch: 'yes', drawbar: 'yes', toplink: 'yes', frontBed: 'yes'
    },
    fields: pdiFields(),
    onOpen: function (el) {
      var us = el.querySelector('[name="unitId"]');
      if (!us) return;
      us.onchange = function () {
        var u = unitOf(us.value);
        if (!u.id) return;
        var setV = function (n, v) { var e = el.querySelector('[name="' + n + '"]'); if (e) e.value = v; };
        setV('model', u.model || itemName(u.itemId));
        setV('chassisNo', u.chassisNo || '');
        setV('engineNo', u.engineNo || '');
        if (u.hours) setV('hours', u.hours);
      };
    },
    validate: function (v) {
      if (!v.chassisNo) return 'Chassis number is required';
      return null;
    },
    onSave: function (v, old) {
      var out = Object.assign({}, old || {}, v);
      if (!old) { out.id = uid('pdi'); out.no = nextNo('pdi', 'PDI'); }
      upsert('pdis', out);
      toast(old ? 'PDI updated' : 'PDI recorded');
      Router.render();
    },
    onDelete: function (rec2) { removeRec('pdis', rec2.id); toast('PDI deleted'); Router.render(); }
  });
}

function pdiDetail(id) {
  var p = findOne('pdis', id);
  if (!p) return;
  var row = function (k, v) { return '<div class="kv"><span>' + esc(k) + '</span><span>' + (v || '—') + '</span></div>'; };
  var check = function (label, key) {
    var val = p[key];
    var rem = p[key + 'Remark'];
    return '<div class="kv"><span>' + esc(label) + (rem ? '<div class="tiny muted">' + esc(rem) + '</div>' : '') + '</span>' +
      '<span class="' + (val === 'no' ? 'red' : val === 'yes' ? 'green' : '') + '">' + pdiYesNo(val) + '</span></div>';
  };
  var fit = function (label, key) {
    return '<div class="kv"><span>' + esc(label) + '</span><span class="' + (p[key] === 'no' ? 'red' : 'green') + '">' + pdiYesNo(p[key]) + '</span></div>';
  };

  var body =
    '<div class="between"><div><div class="strong">' + esc(p.no) + '</div><div class="small muted">' + dmy(p.date) + '</div></div>' +
    badge((p.status || 'pending').toUpperCase(), p.status === 'passed' ? 'green' : p.status === 'failed' ? 'red' : 'amber') + '</div><hr>' +
    row('Mechanic', esc(empName(p.mechanicId))) +
    row('Model', esc(p.model || itemName(p.itemId))) +
    row('Chassis', '<span class="mono">' + esc(p.chassisNo || '') + '</span>') +
    row('Engine', '<span class="mono">' + esc(p.engineNo || '') + '</span>') +
    row('Hrs', p.hours ? fmtQty(p.hours) : '') +
    '<div class="section-label">Tyres</div>' +
    row('Make', esc(p.tyresMake || '')) +
    row('FL', esc(p.tyreFL || '')) + row('FR', esc(p.tyreFR || '')) +
    row('RL', esc(p.tyreRL || '')) + row('RR', esc(p.tyreRR || '')) +
    '<div class="section-label">Components</div>' +
    row('Bosch FIP', esc(p.boschFipNo || '')) +
    row('Starter motor', esc(p.starterMotor || '')) +
    row('Alternator', esc(p.alternator || '')) +
    row('Battery', esc([p.batteryMake, p.batteryNo].filter(Boolean).join(' / '))) +
    '<div class="section-label">Checks</div>' +
    PDI_CHECK_FIELDS.map(function (c) { return check(c[1], c[0]); }).join('') +
    row('Oil levels', esc(p.oilLevels || '') + (p.oilLevelsRemark ? ' · ' + esc(p.oilLevelsRemark) : '')) +
    '<div class="section-label">Fitments</div>' +
    PDI_FIT_FIELDS.map(function (c) { return fit(c[1], c[0]); }).join('') +
    (p.remarks ? '<div class="note">' + esc(p.remarks) + '</div>' : '');

  var m = modal({
    title: 'PDI · ' + (p.chassisNo || p.no),
    wide: true, body: body,
    footer: '<button class="btn ghost" data-print>' + icon('print') + 'PDF</button>' +
      '<button class="btn ghost" data-edit>Edit</button>' +
      '<button class="btn primary" data-close>Done</button>'
  });
  qs('[data-close]', m.el).onclick = m.close;
  qs('[data-edit]', m.el).onclick = function () { m.close(); pdiForm(p); };
  qs('[data-print]', m.el).onclick = function () { m.close(); printDoc('pdi', p.id); };
}
