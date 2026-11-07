/* ============================================================
   TRACTOR ERP  —  core.js
   Storage, state, helpers, GST engine, numbering, seed data
   ============================================================ */
'use strict';

var DB_KEY = 'tractor_erp_v1';

/* ---- small polyfills for older WebViews ---- */
if (!String.prototype.padStart) {
  String.prototype.padStart = function (len, ch) {
    var s = String(this); ch = ch === undefined ? ' ' : String(ch);
    while (s.length < len) s = ch + s;
    return s;
  };
}
if (!Array.prototype.includes) {
  Array.prototype.includes = function (v) { return this.indexOf(v) > -1; };
}
if (!Array.prototype.find) {
  Array.prototype.find = function (fn) {
    for (var i = 0; i < this.length; i++) if (fn(this[i], i, this)) return this[i];
    return undefined;
  };
}
if (!Array.prototype.findIndex) {
  Array.prototype.findIndex = function (fn) {
    for (var i = 0; i < this.length; i++) if (fn(this[i], i, this)) return i;
    return -1;
  };
}

/* storage: native file store when running inside the Android app,
   localStorage otherwise (browser preview) */
var STORE = {
  get: function () {
    try {
      if (window.AppBridge && window.AppBridge.loadData) {
        var v = window.AppBridge.loadData();
        if (v) return v;
      }
    } catch (e) {}
    try { return localStorage.getItem(DB_KEY); } catch (e) { return null; }
  },
  set: function (val) {
    try {
      if (window.AppBridge && window.AppBridge.saveData) window.AppBridge.saveData(val);
    } catch (e) {}
    try { localStorage.setItem(DB_KEY, val); } catch (e) {}
  }
};
var S = null;

function blankState() {
  return {
    meta: { v: 1, setupDone: false, org: {}, createdAt: today() },
    counters: {},
    users: [], departments: [], employees: [], branches: [],
    parties: [], items: [], units: [], moves: [], transfers: [],
    quotations: [], invoices: [], purchases: [], payments: [], notes: [],
    expenses: [], jobcards: [], leads: [],
    insurers: [], policies: [], exchanges: [], marginReceipts: [], gstSlabs: defaultGstSlabs(),
    makes: [], models: [], uoms: defaultUoms(), mandals: [], districts: [], villages: [], states: defaultStates(),
    bankAccounts: [], transporters: [], transports: [],
    warranties: [], rta: [], hsrp: [], agreements: [],
    tradeAdvances: [], pdis: [],
    tombstones: {},
    attendance: [], salaries: [], tada: [], fuel: [], logbook: [], petty: [],
    session: { userId: null }
  };
}

function loadState() {
  if (S) return S;
  try {
    var raw = STORE.get();
    S = raw ? JSON.parse(raw) : blankState();
  } catch (e) { S = blankState(); }
  var b = blankState();
  Object.keys(b).forEach(function (k) { if (S[k] === undefined) S[k] = b[k]; });
  if (!S.meta) S.meta = b.meta;
  if (!S.session) S.session = b.session;
  return S;
}

var _saveTimer = null;
function save(now) {
  var write = function () {
    try { STORE.set(JSON.stringify(S)); }
    catch (e) { console.error('save failed', e); toast('Storage full — export a backup', 'err'); }
    if (window.Backup && Backup.maybe) { try { Backup.maybe(); } catch (e) {} }
    if (window.Sync && Sync.refreshOutbox) { try { Sync.refreshOutbox(); } catch (e) {} }
  };
  if (now) { write(); return; }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(write, 120);
}

/* ---------------- ids, dates, numbers ---------------- */
var _seq = 0;
function deviceId() {
  if (!S.meta.deviceId) {
    S.meta.deviceId = 'D' + Math.random().toString(36).slice(2, 7).toUpperCase();
    save();
  }
  return S.meta.deviceId;
}
function stampRec(rec) {
  rec._u = Date.now();
  rec._d = deviceId();
  return rec;
}

function uid(p) {
  _seq++;
  return (p || 'id') + Date.now().toString(36) + _seq.toString(36) + Math.random().toString(36).slice(2, 6);
}
function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function today() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function thisMonth() { return today().slice(0, 7); }
function thisYear() { return today().slice(0, 4); }
function dmy(iso) {
  if (!iso) return '';
  var p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : iso;
}
function monthName(m) {
  var n = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return n[Number(m) - 1] || m;
}
function addDays(iso, n) {
  var d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function fyOf(iso) {
  // Indian financial year label e.g. 2025-26
  var d = new Date((iso || today()) + 'T00:00:00');
  var y = d.getFullYear(), m = d.getMonth() + 1;
  var start = m >= 4 ? y : y - 1;
  return start + '-' + String((start + 1) % 100).padStart(2, '0');
}
function fyRange(fy) {
  var y = Number(String(fy).slice(0, 4));
  return { from: y + '-04-01', to: (y + 1) + '-03-31' };
}

function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function r2(v) { return Math.round((num(v) + Number.EPSILON) * 100) / 100; }
function fmt(v, dec) {
  var d = dec === undefined ? 2 : dec;
  var n = num(v);
  var neg = n < 0; n = Math.abs(n);
  var s = n.toFixed(d);
  var parts = s.split('.');
  var x = parts[0], out = '';
  if (x.length > 3) {
    var last3 = x.slice(-3), rest = x.slice(0, -3);
    out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  } else out = x;
  return (neg ? '-' : '') + out + (parts[1] ? '.' + parts[1] : '');
}
function inr(v) { return '\u20B9' + fmt(v); }
function fmtQty(v) {
  var n = num(v);
  return n % 1 === 0 ? String(n) : String(r2(n));
}
function pct(v) { return fmt(v, 1) + '%'; }

var ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
var TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}
function threeDigits(n) {
  var h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? twoDigits(r) : '');
}
function numToWords(amount) {
  var n = Math.floor(num(amount));
  var paise = Math.round((num(amount) - n) * 100);
  if (n === 0 && paise === 0) return 'Zero Rupees Only';
  var crore = Math.floor(n / 10000000); n %= 10000000;
  var lakh = Math.floor(n / 100000); n %= 100000;
  var thousand = Math.floor(n / 1000); n %= 1000;
  var words = '';
  if (crore) words += threeDigits(crore) + ' Crore ';
  if (lakh) words += threeDigits(lakh) + ' Lakh ';
  if (thousand) words += threeDigits(thousand) + ' Thousand ';
  if (n) words += threeDigits(n);
  words = words.trim();
  var out = (words || 'Zero') + ' Rupees';
  if (paise) out += ' and ' + twoDigits(paise) + ' Paise';
  return out + ' Only';
}

/* ---------------- lookups ---------------- */
function org() { return S.meta.org || {}; }
function branch(id) { return S.branches.find(function (b) { return b.id === id; }) || {}; }
function party(id) { return S.parties.find(function (p) { return p.id === id; }) || {}; }
function item(id) { return S.items.find(function (i) { return i.id === id; }) || {}; }
function employee(id) { return S.employees.find(function (e) { return e.id === id; }) || {}; }
function unitOf(id) { return S.units.find(function (u) { return u.id === id; }) || {}; }
function dept(id) { return S.departments.find(function (d) { return d.id === id; }) || {}; }
function userName(id) { var u = S.users.find(function (x) { return x.id === id; }); return u ? u.name : ''; }
function branchName(id) { var b = branch(id); return b.name || '—'; }
function partyName(id) { var p = party(id); return p.name || '—'; }
function itemName(id) { var i = item(id); return i.name || '—'; }
function empName(id) { var e = employee(id); return e.name || '—'; }
function me() { return S.users.find(function (u) { return u.id === S.session.userId; }) || {}; }
function isAdmin() { var u = me(); return u.role === 'admin' || u.role === 'owner'; }
function can(perm) {
  var u = me();
  if (!u.id) return false;
  if (u.role === 'admin' || u.role === 'owner') return true;
  return (u.perms || []).indexOf(perm) > -1;
}

/* ---------------- GST slab master ---------------- */
function defaultGstSlabs() {
  return [
    { id: 'gst0', rate: 0, label: 'Nil rated / exempt', active: true },
    { id: 'gst5', rate: 5, label: 'Implements & agri inputs', active: true },
    { id: 'gst12', rate: 12, label: 'Tractors (HSN 8701)', active: true },
    { id: 'gst18', rate: 18, label: 'Spares & service', active: true },
    { id: 'gst28', rate: 28, label: 'Luxury / other', active: true }
  ];
}
function gstSlabs() {
  if (!S.gstSlabs || !S.gstSlabs.length) S.gstSlabs = defaultGstSlabs();
  return S.gstSlabs;
}
function activeSlabs() {
  return sortBy(gstSlabs().filter(function (x) { return x.active !== false; }), 'rate');
}
/* description part of a slab label, with any leading "12%" stripped so the
   rate is never printed twice in a dropdown */
function slabDesc(sl) {
  if (!sl || !sl.label) return '';
  return String(sl.label)
    .replace(/^\s*\d+(?:\.\d+)?\s*%\s*(?:—|–|-|:)?\s*/, '')
    .trim();
}
function gstOptions() {
  return activeSlabs().map(function (x) {
    var desc = slabDesc(x);
    return [String(x.rate), num(x.rate) + '%' + (desc ? ' · ' + desc : '')];
  });
}
function slabLabel(rate) {
  var sl = gstSlabs().find(function (x) { return num(x.rate) === num(rate); });
  return sl ? sl.label : '';
}

/* ---------------- location & reference masters ---------------- */
function defaultStates() {
  return STATES.map(function (x) { return { code: x[0], name: x[1], active: true }; });
}
function stateList() {
  if (!S.states || !S.states.length) S.states = defaultStates();
  return S.states;
}
function stateOptions() {
  return stateList().filter(function (x) { return x.active !== false; })
    .map(function (x) { return [x.code, x.name]; });
}
/* ---------------- unit of measure master ---------------- */
function defaultUoms() {
  return [
    { id: 'uomnos', name: 'NOS', label: 'Numbers', decimals: 0, active: true },
    { id: 'uompcs', name: 'PCS', label: 'Pieces', decimals: 0, active: true },
    { id: 'uomset', name: 'SET', label: 'Set', decimals: 0, active: true },
    { id: 'uomltr', name: 'LTR', label: 'Litres', decimals: 2, active: true },
    { id: 'uomkg', name: 'KG', label: 'Kilograms', decimals: 2, active: true },
    { id: 'uomjob', name: 'JOB', label: 'Job / service', decimals: 0, active: true }
  ];
}
function uomList() {
  if (!S.uoms || !S.uoms.length) S.uoms = defaultUoms();
  return S.uoms;
}
function uomOptions() {
  return sortBy(uomList().filter(function (u) { return u.active !== false; }), 'name')
    .map(function (u) { return [u.name, u.name + (u.label ? ' · ' + u.label : '')]; });
}
function uomName(code) { return code || ''; }
function uomDecimals(code) {
  var u = uomList().find(function (x) { return x.name === code; });
  return u ? num(u.decimals) : 0;
}
function fmtUom(qty, uom) {
  return fmt(num(qty), uomDecimals(uom));
}

function makeName(id) { var m = S.makes.find(function (x) { return x.id === id; }); return m ? m.name : ''; }
function modelName(id) { var m = S.models.find(function (x) { return x.id === id; }); return m ? m.name : ''; }
function mandalName(id) { var m = S.mandals.find(function (x) { return x.id === id; }); return m ? m.name : ''; }
function districtName(id) {
  var d = (S.districts || []).find(function (x) { return x.id === id; });
  return d ? d.name : '';
}
function districtOfMandal(mandalId) {
  var m = S.mandals.find(function (x) { return x.id === mandalId; });
  if (!m) return '';
  return districtName(m.districtId) || m.district || '';
}
function districtList(stateCode) {
  if (!S.districts) S.districts = [];
  return sortBy(S.districts.filter(function (d) {
    return (!stateCode || !d.stateCode || d.stateCode === stateCode) && d.active !== false;
  }), 'name');
}
function districtOptions(stateCode) {
  return districtList(stateCode).map(function (d) { return { v: d.id, l: d.name }; });
}
/* turn the old free-text district on mandals into real district records */
function migrateLocations() {
  if (!S.districts) S.districts = [];
  var made = {};
  (S.mandals || []).forEach(function (m) {
    if (m.districtId) return;
    var name = String(m.district || '').trim();
    if (!name) return;
    var key = name.toLowerCase();
    var d = made[key];
    if (!d) {
      d = { id: uid('dis'), name: name, stateCode: m.stateCode || org().stateCode || '', active: true };
      made[key] = d;
      S.districts.push(d);
    }
    m.districtId = d.id;
  });
  if (Object.keys(made).length) save(true);
}
function villageName(id) { var m = S.villages.find(function (x) { return x.id === id; }); return m ? m.name : ''; }
function defaultMakeId() {
  var o = org() || {};
  if (o.defaultMakeId) return o.defaultMakeId;
  var st = (S.meta && S.meta.settings) || {};
  return st.defaultMakeId || '';
}
function defaultMakeName() { return makeName(defaultMakeId()); }
function makeCategory(makeId) {
  var m = (S.makes || []).find(function (x) { return x.id === makeId; });
  return m ? (m.category || 'tractor') : '';
}
function makeOptions(category) {
  return sortBy(S.makes.filter(function (x) {
    return x.active !== false && (!category || (x.category || 'tractor') === category);
  }), 'name').map(function (x) { return { v: x.id, l: x.name }; });
}
function modelOptions(makeId, category) {
  return sortBy(S.models.filter(function (x) {
    if (makeId) return x.makeId === makeId && x.active !== false;
    if (category) {
      var mk = S.makes.find(function (m) { return m.id === x.makeId; });
      if (!mk || (mk.category || 'tractor') !== category) return false;
    }
    return x.active !== false;
  }), 'name').map(function (x) { return { v: x.id, l: x.name }; });
}
/* category of an item: tractor / implement / accessory / spare / service */
function itemMakeCategory(cat) {
  if (cat === 'tractor') return 'tractor';
  if (cat === 'implement') return 'implement';
  if (cat === 'accessory') return 'accessory';
  return '';
}
function mandalOptions() { return sortBy(S.mandals, 'name').map(function (x) { return { v: x.id, l: x.name }; }); }
function villageOptions(mandalId) {
  return sortBy(S.villages.filter(function (x) { return !mandalId || x.mandalId === mandalId; }), 'name')
    .map(function (x) { return { v: x.id, l: x.name }; });
}
function bankAccountOptions() {
  return S.bankAccounts.map(function (b) { return { v: b.id, l: b.name + ' · ' + (b.accountNo || '') }; });
}
function bankAccount(id) { return S.bankAccounts.find(function (b) { return b.id === id; }) || {}; }
function transporterOptions() {
  return S.transporters.filter(function (t) { return t.active !== false; })
    .map(function (t) { return { v: t.id, l: t.name }; });
}
function transporterName(id) { var t = S.transporters.find(function (x) { return x.id === id; }); return t ? t.name : ''; }

/* ---------------- trade advance (finance) ---------------- */
function advanceDays(a, asOn) {
  var from = a.startDate || a.date;
  if (!from) return 0;
  var to = asOn || today();
  if (a.closeDate && a.closeDate < to) to = a.closeDate;
  return Math.max(0, daysBetween(from, to));
}
function advanceChargeableDays(a, asOn) {
  return Math.max(0, advanceDays(a, asOn) - num(a.iftaDays));
}
function advanceInterest(a, asOn) {
  var d = advanceChargeableDays(a, asOn);
  return r2(num(a.principal) * num(a.interestRate) / 100 * d / 365);
}
function advanceRepaid(a) { return r2(sum(a.repayments || [], 'amount')); }
function advanceBalance(a, asOn) {
  return r2(num(a.principal) + advanceInterest(a, asOn) - advanceRepaid(a));
}
function pdiFor(unitId) {
  return S.pdis.filter(function (p) { return p.unitId === unitId; })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0] || null;
}
function openAdvances() {
  return S.tradeAdvances.filter(function (a) { return !a.closed; });
}

/* ---------------- GST engine ---------------- */
var STATES = [
  ['01','Jammu & Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],
  ['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],
  ['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],['13','Nagaland'],['14','Manipur'],
  ['15','Mizoram'],['16','Tripura'],['17','Meghalaya'],['18','Assam'],['19','West Bengal'],
  ['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],['24','Gujarat'],
  ['26','Dadra & Nagar Haveli and Daman & Diu'],['27','Maharashtra'],['29','Karnataka'],['30','Goa'],
  ['31','Lakshadweep'],['32','Kerala'],['33','Tamil Nadu'],['34','Puducherry'],['35','Andaman & Nicobar'],
  ['36','Telangana'],['37','Andhra Pradesh'],['38','Ladakh'],['97','Other Territory']
];
function stateName(code) {
  var s = STATES.find(function (x) { return x[0] === String(code); });
  return s ? s[1] : '';
}
function stateCodeOfParty(p) {
  if (p && p.stateCode) return String(p.stateCode);
  if (p && p.gstin && p.gstin.length >= 2) return p.gstin.slice(0, 2);
  return String(org().stateCode || '');
}
function isInterState(p) {
  var a = String(org().stateCode || '');
  var b = stateCodeOfParty(p);
  return !!a && !!b && a !== b;
}
function taxRateOf(it, docDate) {
  if (it && it.gstRate !== undefined && it.gstRate !== '') return num(it.gstRate);
  return 18;
}

/* line-level maths: qty * rate - discount, then tax */
function lineAmount(l) {
  var gross = num(l.qty) * num(l.rate);
  var disc = gross * num(l.discPct) / 100;
  return r2(gross - disc);
}
function computeTotals(lines, interState, opts) {
  var taxable = 0, cgst = 0, sgst = 0, igst = 0, cess = 0;
  (lines || []).forEach(function (l) {
    var amt = lineAmount(l);
    var rate = num(l.gstRate);
    taxable += amt;
    if (rate > 0) {
      if (interState) igst += amt * rate / 100;
      else { cgst += amt * rate / 200; sgst += amt * rate / 200; }
    }
  });
  taxable = r2(taxable); cgst = r2(cgst); sgst = r2(sgst); igst = r2(igst);
  var before = r2(taxable + cgst + sgst + igst + cess);
  var roundOff = 0, grand = before;
  if (!opts || opts.round !== false) {
    grand = Math.round(before);
    roundOff = r2(grand - before);
  }
  return { taxable: taxable, cgst: cgst, sgst: sgst, igst: igst, cess: cess, roundOff: roundOff, total: r2(grand), tax: r2(cgst + sgst + igst + cess) };
}
function docTotals(doc) {
  var p = party(doc.partyId || doc.customerId);
  return computeTotals(doc.lines, isInterState(p));
}

/* ---------------- numbering ---------------- */
function fyShort() { return fyOf(today()).replace(/^\d\d/, ''); }
function nextNo(kind, prefix) {
  var key = kind + '_' + fyOf(today());
  S.counters[key] = (S.counters[key] || 0) + 1;
  return prefix + '/' + fyOf(today()).slice(2) + '/' + pad(S.counters[key]).replace(/^0(\d\d)/, '$1');
}
function peekNo(kind, prefix) {
  var key = kind + '_' + fyOf(today());
  return prefix + '/' + fyOf(today()).slice(2) + '/' + String((S.counters[key] || 0) + 1).padStart(3, '0');
}

/* ---------------- generic collection helpers ---------------- */
function coll(name) { return S[name] || (S[name] = []); }
function findOne(name, id) { return coll(name).find(function (r) { return r.id === id; }) || null; }
function upsert(name, rec) {
  var arr = coll(name);
  var i = arr.findIndex(function (r) { return r.id === rec.id; });
  stampRec(rec);
  if (i > -1) arr[i] = Object.assign({}, arr[i], rec);
  else { rec.id = rec.id || uid(name.slice(0, 3)); arr.push(rec); }
  if (S.tombstones && S.tombstones[name] && S.tombstones[name][rec.id]) delete S.tombstones[name][rec.id];
  save();
  return rec;
}
function removeRec(name, id) {
  var arr = coll(name);
  var i = arr.findIndex(function (r) { return r.id === id; });
  if (i > -1) arr.splice(i, 1);
  S.tombstones = S.tombstones || {};
  S.tombstones[name] = S.tombstones[name] || {};
  S.tombstones[name][id] = Date.now();
  save();
}
function sortBy(arr, key, dir) {
  return arr.slice().sort(function (a, b) {
    var x = a[key], y = b[key];
    if (x === undefined || x === null) x = '';
    if (y === undefined || y === null) y = '';
    if (typeof x === 'number' && typeof y === 'number') return dir === 'desc' ? y - x : x - y;
    return dir === 'desc' ? String(y).localeCompare(String(x)) : String(x).localeCompare(String(y));
  });
}
function sum(arr, fn) { return arr.reduce(function (a, r) { return a + num(typeof fn === 'function' ? fn(r) : r[fn]); }, 0); }
function groupBy(arr, fn) {
  var out = {};
  arr.forEach(function (r) {
    var k = typeof fn === 'function' ? fn(r) : r[fn];
    (out[k] = out[k] || []).push(r);
  });
  return out;
}
function inRange(iso, from, to) { return iso >= from && iso <= to; }

/* ---------------- derived business figures ---------------- */
function salesInvoices() { return S.invoices.filter(function (i) { return i.docType !== 'financer'; }); }
function financerInvoices() { return S.invoices.filter(function (i) { return i.docType === 'financer'; }); }
function invoiceOutstanding(inv) {
  var paid = sum(S.payments.filter(function (p) { return p.type === 'in' && p.refId === inv.id; }), 'amount');
  var cr = sum(S.notes.filter(function (n) { return n.type === 'credit' && n.refId === inv.id; }), 'total');
  var mm = sum(S.marginReceipts.filter(function (m) { return m.invoiceId === inv.id; }), 'amount');
  var ex = sum(S.exchanges.filter(function (x) { return x.invoiceId === inv.id; }), 'value');
  return r2(num(inv.total) - paid - cr - mm - ex);
}
function exchangeTotal(invId) {
  return r2(sum(S.exchanges.filter(function (x) { return x.invoiceId === invId; }), 'value'));
}
function marginTotal(invId) {
  return r2(sum(S.marginReceipts.filter(function (m) { return m.invoiceId === invId; }), 'amount'));
}
/* insurance helpers */
function policyDueStatus(p) {
  if (!p.dueDate) return 'none';
  var d = daysBetween(today(), p.dueDate);
  if (d < 0) return 'expired';
  if (d <= 30) return 'due';
  return 'ok';
}
function brokerList() {
  return S.parties.filter(function (p) { return p.type === 'broker'; });
}
function purchaseOutstanding(pb) {
  var paid = sum(S.payments.filter(function (p) { return p.type === 'out' && p.refId === pb.id; }), 'amount');
  var dr = sum(S.notes.filter(function (n) { return n.type === 'debit' && n.refId === pb.id; }), 'total');
  return r2(num(pb.total) - paid - dr);
}
function partyBalance(partyId) {
  var p = party(partyId);
  var bal = num(p.openingBal) * (p.openingType === 'cr' ? -1 : 1);
  S.invoices.forEach(function (i) { if (i.partyId === partyId) bal += num(i.total); });
  S.purchases.forEach(function (x) { if (x.partyId === partyId) bal -= num(x.total); });
  S.payments.forEach(function (x) { if (x.partyId === partyId) bal += x.type === 'in' ? -num(x.amount) : num(x.amount); });
  S.notes.forEach(function (x) {
    if (x.partyId !== partyId) return;
    bal += x.type === 'credit' ? -num(x.total) : num(x.total);
  });
  return r2(bal);
}
function stockQty(itemId, branchId) {
  return r2(sum(S.moves.filter(function (m) {
    return m.itemId === itemId && (!branchId || m.branchId === branchId);
  }), function (m) { return num(m.qty); }));
}
function unitsForModel(modelId, branchId) {
  return S.units.filter(function (u) {
    if (branchId && u.branchId !== branchId) return false;
    if (!modelId) return true;
    var it = item(u.itemId);
    return it.modelId === modelId;
  }).map(function (u) {
    return { v: u.id, l: unitLabel(u) + (u.status ? ' · ' + u.status : '') };
  });
}
function availableUnits(branchId) {
  return S.units.filter(function (u) {
    return u.status === 'in_stock' && (!branchId || u.branchId === branchId);
  });
}
function unitCost(u) { return num(u.cost); }
function unitLabel(u) {
  if (!u || !u.id) return '—';
  var main = u.chassisNo || u.serialNo || '';
  var extra = u.engineNo ? ' · Eng ' + u.engineNo : '';
  return main + extra + (u.model ? ' · ' + u.model : '') + (u.unitType === 'used' ? ' (used)' : '');
}

/* ---------------- settings / misc ---------------- */
function settings() {
  S.meta.settings = S.meta.settings || {
    invoicePrefix: 'INV', quotePrefix: 'QT', purchasePrefix: 'PB', jobPrefix: 'JC',
    cnPrefix: 'CN', dnPrefix: 'DN', payPrefix: 'RCPT', finPrefix: 'FIN',
    marginPrefix: 'MMR', exchPrefix: 'EXC', agrPrefix: 'AGR', rcmPrefix: 'RCM', advPrefix: 'ADV',
    syncHost: '', syncSecs: 5, syncAuto: true, cloudFolder: '', cloudSecs: 15, cloudAuto: true,
    serverUrl: '', serverToken: '', serverSince: 0, serverSecs: 10, serverAuto: true, serverUser: null,
    roundOff: true, defaultGst: 12, lowStock: 5
  };
  return S.meta.settings;
}
function permList() {
  return [
    ['sales', 'Sales & Invoicing'], ['purchase', 'Purchase & Expenses'],
    ['inventory', 'Inventory & Stock'], ['service', 'Job Cards & Service'],
    ['accounts', 'Payments, Cash & Banking'], ['hr', 'HR, Attendance & Payroll'],
    ['reports', 'Reports & GST'], ['masters', 'Masters & Setup'],
    ['admin', 'Administration & Users']
  ];
}
function toast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) { console.log(msg); return; }
  el.textContent = msg;
  el.className = 'toast show ' + (type || '');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.className = 'toast'; }, 2600);
}

/* initialise state at load so screen definitions can read org()/branches */
loadState();
