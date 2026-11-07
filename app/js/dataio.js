/* ============================================================
   dataio.js — bulk import / export in Excel formats and
   Tally-compatible XML export
   ============================================================ */

/* ---------------- table parsers ---------------- */
function parseCsv(text) {
  var rows = [], row = [], cur = '', q = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch === '\r') { /* skip */ }
    else cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

function parseSpreadsheetXml(text) {
  var doc = new DOMParser().parseFromString(text, 'text/xml');
  var rows = [];
  var rowEls = doc.getElementsByTagName('Row');
  for (var i = 0; i < rowEls.length; i++) {
    var cells = rowEls[i].getElementsByTagName('Cell');
    var out = [];
    for (var j = 0; j < cells.length; j++) {
      var data = cells[j].getElementsByTagName('Data');
      out.push(data.length ? data[0].textContent : '');
    }
    rows.push(out);
  }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This device cannot read .xlsx — save the sheet as CSV instead');
  var ds = new DecompressionStream('deflate-raw');
  var stream = new Blob([bytes]).stream().pipeThrough(ds);
  var buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function readXlsx(file) {
  var buf = new Uint8Array(await file.arrayBuffer());
  var dv = new DataView(buf.buffer);
  // end of central directory
  var eocd = -1;
  for (var i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx file');
  var entries = dv.getUint16(eocd + 10, true);
  var offset = dv.getUint32(eocd + 16, true);
  var files = {};
  for (var n = 0; n < entries; n++) {
    if (dv.getUint32(offset, true) !== 0x02014b50) break;
    var method = dv.getUint16(offset + 10, true);
    var compSize = dv.getUint32(offset + 20, true);
    var nameLen = dv.getUint16(offset + 28, true);
    var extraLen = dv.getUint16(offset + 30, true);
    var commLen = dv.getUint16(offset + 32, true);
    var localOff = dv.getUint32(offset + 42, true);
    var name = new TextDecoder().decode(buf.subarray(offset + 46, offset + 46 + nameLen));
    files[name] = { method: method, compSize: compSize, localOff: localOff };
    offset += 46 + nameLen + extraLen + commLen;
  }
  async function get(name) {
    var f = files[name];
    if (!f) return '';
    var lo = f.localOff;
    var nLen = dv.getUint16(lo + 26, true);
    var eLen = dv.getUint16(lo + 28, true);
    var start = lo + 30 + nLen + eLen;
    var raw = buf.subarray(start, start + f.compSize);
    var out = f.method === 0 ? raw : await inflateRaw(raw);
    return new TextDecoder().decode(out);
  }
  var sheetName = Object.keys(files).filter(function (k) { return /^xl\/worksheets\/sheet1\.xml$/.test(k); })[0]
    || Object.keys(files).filter(function (k) { return /^xl\/worksheets\/.*\.xml$/.test(k); })[0];
  if (!sheetName) throw new Error('No worksheet found in the workbook');
  var shared = [];
  var ssXml = await get('xl/sharedStrings.xml');
  if (ssXml) {
    var sdoc = new DOMParser().parseFromString(ssXml, 'text/xml');
    var sis = sdoc.getElementsByTagName('si');
    for (var s = 0; s < sis.length; s++) {
      var ts = sis[s].getElementsByTagName('t');
      var txt = '';
      for (var t = 0; t < ts.length; t++) txt += ts[t].textContent;
      shared.push(txt);
    }
  }
  var sdoc2 = new DOMParser().parseFromString(await get(sheetName), 'text/xml');
  var rowEls = sdoc2.getElementsByTagName('row');
  var rows = [];
  for (var r = 0; r < rowEls.length; r++) {
    var cells = rowEls[r].getElementsByTagName('c');
    var out = [];
    for (var c = 0; c < cells.length; c++) {
      var ref = cells[c].getAttribute('r') || '';
      var colIdx = 0;
      for (var k = 0; k < ref.length; k++) {
        var code = ref.charCodeAt(k);
        if (code >= 65 && code <= 90) colIdx = colIdx * 26 + (code - 64);
        else break;
      }
      var type = cells[c].getAttribute('t');
      var v = cells[c].getElementsByTagName('v')[0];
      var val = v ? v.textContent : '';
      if (type === 's') val = shared[Number(val)] || '';
      else if (type === 'inlineStr') {
        var is = cells[c].getElementsByTagName('t')[0];
        val = is ? is.textContent : '';
      }
      while (out.length < colIdx - 1) out.push('');
      out[colIdx - 1] = val;
    }
    rows.push(out);
  }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

async function readTable(file) {
  var name = (file.name || '').toLowerCase();
  if (name.endsWith('.xlsx')) return await readXlsx(file);
  var text = await file.text();
  if (text.indexOf('<Workbook') > -1 || text.indexOf('<ss:Workbook') > -1 || text.indexOf('<Worksheet') > -1) {
    return parseSpreadsheetXml(text);
  }
  return parseCsv(text);
}

function rowsToObjects(rows) {
  if (!rows.length) return { headers: [], items: [] };
  var headers = rows[0].map(function (h) { return String(h).trim(); });
  var items = [];
  for (var i = 1; i < rows.length; i++) {
    var o = {};
    var empty = true;
    headers.forEach(function (h, j) {
      var v = rows[i][j] === undefined ? '' : String(rows[i][j]).trim();
      o[h] = v;
      if (v !== '') empty = false;
    });
    if (!empty) items.push(o);
  }
  return { headers: headers, items: items };
}

/* ---------------- importers ---------------- */
function buildPartyFromRow(row, type) {
  var name = pick(row, ['Name', 'Customer Name', 'Party Name', 'Supplier Name']);
  if (!name) return { error: 'Name is required' };
  var existing = S.parties.find(function (p) {
    return p.type === type && String(p.name).toLowerCase() === name.toLowerCase();
  });
  var village = pick(row, ['Village']);
  var mandal = pick(row, ['Mandal']);
  var rec = {
    name: name, type: type,
    contact: pick(row, ['Contact']),
    phone: pick(row, ['Phone', 'Mobile']), phone2: pick(row, ['Phone2', 'Phone 2', 'Alternate Phone']),
    email: pick(row, ['Email']), aadhaar: pick(row, ['Aadhaar']), pan: pick(row, ['PAN']).toUpperCase(),
    gstin: pick(row, ['GSTIN']).toUpperCase(), stateCode: pick(row, ['State', 'StateCode']) || org().stateCode,
    address: pick(row, ['Address']), city: pick(row, ['City']), pincode: pick(row, ['Pincode']),
    creditDays: num(pick(row, ['CreditDays']) || 0), openingBal: num(pick(row, ['OpeningBalance']) || 0),
    openingType: 'dr', branchId: (S.branches[0] || {}).id, active: true
  };
  if (village) {
    var v = S.villages.find(function (x) { return String(x.name).toLowerCase() === village.toLowerCase(); });
    if (!v) { v = { id: uid('vil'), name: village, mandalId: '', pincode: rec.pincode }; S.villages.push(v); }
    rec.villageId = v.id;
  }
  if (mandal) {
    var md = S.mandals.find(function (x) { return String(x.name).toLowerCase() === mandal.toLowerCase(); });
    if (!md) { md = { id: uid('man'), name: mandal, stateCode: rec.stateCode }; S.mandals.push(md); }
    rec.mandalId = md.id;
    if (village && !rec.villageId) { /* keep */ }
  }
  return { rec: Object.assign({}, existing || {}, rec), existing: !!existing };
}

function pick(row, keys) {
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (row[k] !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
}
function yesNo(v) { return /^(y|yes|true|1|active)$/i.test(String(v || '').trim()); }

var IMPORTERS = {
  customers: {
    label: 'Customers', group: 'Parties',
    cols: [
      ['Name', 'Venkat Reddy'], ['Phone', '9800000002'], ['Phone2', ''], ['Email', ''],
      ['Aadhaar', ''], ['PAN', ''], ['GSTIN', ''], ['State', '36'], ['Village', ''], ['Mandal', ''],
      ['Address', ''], ['City', ''], ['Pincode', ''], ['CreditDays', '0'], ['OpeningBalance', '0']
    ],
    run: function (row) { return buildPartyFromRow(row, 'customer'); }
  },

  suppliers: {
    label: 'Suppliers', group: 'Parties',
    cols: [
      ['Name', 'Tractor India Ltd'], ['Contact', ''], ['Phone', '04023456789'], ['Email', ''],
      ['GSTIN', '36AAACT2727Q1ZW'], ['State', '36'], ['Address', ''], ['City', ''], ['CreditDays', '30'],
      ['OpeningBalance', '0']
    ],
    run: function (row) { return buildPartyFromRow(row, 'supplier'); }
  },

  items: {
    label: 'Items & Spares', group: 'Inventory',
    cols: [
      ['Name', 'Rotavator 6 ft'], ['PartNo', 'KSN-ROT-6'], ['Category', 'implement'], ['Make', ''],
      ['Model', ''], ['HSN', '8432'], ['UOM', 'NOS'], ['GSTRate', '12'], ['SaleRate', '62000'],
      ['PurchaseRate', '48000'], ['OpeningQty', '0'], ['Reorder', '2'], ['SerialTracked', 'No']
    ],
    run: function (row) {
      var name = pick(row, ['Name', 'Item Name']);
      if (!name) return { error: 'Name is required' };
      var cat = (pick(row, ['Category']) || 'spare').toLowerCase();
      if (['tractor', 'implement', 'accessory', 'spare', 'service', 'other'].indexOf(cat) === -1) cat = 'spare';
      var uom = (pick(row, ['UOM', 'Unit']) || 'NOS').toUpperCase();
      if (!uomList().some(function (u) { return u.name === uom; })) {
        S.uoms.push({ id: uid('uom'), name: uom, label: uom, decimals: 0, active: true });
      }
      var makeNameRow = pick(row, ['Make', 'Brand']);
      var modelNameRow = pick(row, ['Model']);
      var makeId = '', modelId = '';
      if (makeNameRow) {
        var mk = S.makes.find(function (m) { return m.name.toLowerCase() === makeNameRow.toLowerCase() && (m.category || 'tractor') === (cat === 'spare' || cat === 'service' ? 'tractor' : cat); });
        if (!mk) {
          mk = { id: uid('mak'), name: makeNameRow, category: (cat === 'spare' || cat === 'service') ? 'tractor' : cat, active: true };
          S.makes.push(mk);
        }
        makeId = mk.id;
        if (modelNameRow) {
          var md = S.models.find(function (m) { return m.name.toLowerCase() === modelNameRow.toLowerCase() && m.makeId === mk.id; });
          if (!md) { md = { id: uid('mdl'), makeId: mk.id, name: modelNameRow, category: mk.category, active: true }; S.models.push(md); }
          modelId = md.id;
        }
      }
      var existing = S.items.find(function (i) { return i.name.toLowerCase() === name.toLowerCase(); });
      var rec = {
        name: name, partNo: pick(row, ['PartNo', 'Part No', 'Part Number']), category: cat,
        makeId: makeId, modelId: modelId, brand: makeNameRow, model: modelNameRow,
        hsn: pick(row, ['HSN', 'HSNCode']), uom: uom,
        gstRate: pick(row, ['GSTRate', 'GST']) || '18',
        saleRate: num(pick(row, ['SaleRate']) || 0), purchaseRate: num(pick(row, ['PurchaseRate']) || 0),
        openingQty: num(pick(row, ['OpeningQty']) || 0), reorder: num(pick(row, ['Reorder']) || 0),
        serialTracked: yesNo(pick(row, ['SerialTracked']))
      };
      var out = Object.assign({}, existing || {}, rec);
      if (!existing && rec.openingQty > 0 && cat !== 'tractor' && cat !== 'service') {
        S.moves.push({
          id: uid('mv'), date: today(), itemId: out.id || '', branchId: (S.branches[0] || {}).id,
          qty: rec.openingQty, rate: rec.purchaseRate, type: 'opening', refNo: 'IMPORT', note: 'Imported opening stock'
        });
      }
      return { rec: out, existing: !!existing, after: function (saved) {
        S.moves.forEach(function (mv) { if (mv.refNo === 'IMPORT' && !mv.itemId) mv.itemId = saved.id; });
      } };
    }
  },

  parts: {
    label: 'Parts (spares only)', group: 'Inventory',
    cols: [['Name', 'Oil Filter'], ['PartNo', 'OIL-F-001'], ['HSN', '8421'], ['UOM', 'NOS'],
      ['GSTRate', '18'], ['SaleRate', '480'], ['PurchaseRate', '320'], ['OpeningQty', '10'], ['Reorder', '5']],
    run: function (row) {
      row.Category = 'spare';
      return IMPORTERS.items.run(row);
    }
  },

  employees: {
    label: 'Employees', group: 'People',
    cols: [
      ['Name', 'Ravi Kumar'], ['Code', 'EMP01'], ['Type', 'sales'], ['Designation', 'Sales Executive'],
      ['Department', 'Sales'], ['Phone', '9848011223'], ['Phone2', ''], ['Aadhaar', ''], ['PAN', ''],
      ['BloodGroup', 'O+'], ['EmergencyName', ''], ['EmergencyPhone', ''], ['BankName', ''],
      ['BankAccount', ''], ['BankIFSC', ''], ['Salary', '28000'], ['IncentiveAmount', '0'],
      ['Target', '0'], ['JoinDate', '']
    ],
    run: function (row) {
      var name = pick(row, ['Name', 'Employee Name']);
      if (!name) return { error: 'Name is required' };
      var deptName = pick(row, ['Department']);
      var deptId = '';
      if (deptName) {
        var d = S.departments.find(function (x) { return x.name.toLowerCase() === deptName.toLowerCase(); });
        if (!d) { d = { id: uid('dep'), name: deptName }; S.departments.push(d); }
        deptId = d.id;
      }
      var existing = S.employees.find(function (e) { return e.name.toLowerCase() === name.toLowerCase(); });
      var rec = {
        name: name, code: pick(row, ['Code']),
        empType: (pick(row, ['Type']) || 'sales').toLowerCase(),
        designation: pick(row, ['Designation']), deptId: deptId,
        phone: pick(row, ['Phone', 'Mobile']), phone2: pick(row, ['Phone2']),
        aadhaar: pick(row, ['Aadhaar']), pan: pick(row, ['PAN']).toUpperCase(),
        bloodGroup: pick(row, ['BloodGroup']), emergencyName: pick(row, ['EmergencyName']),
        emergencyPhone: pick(row, ['EmergencyPhone']), bankName: pick(row, ['BankName']),
        bankAccount: pick(row, ['BankAccount']), bankIfsc: pick(row, ['BankIFSC']),
        salary: num(pick(row, ['Salary']) || 0), incentiveAmount: num(pick(row, ['IncentiveAmount']) || 0),
        target: num(pick(row, ['Target']) || 0),
        joinDate: pick(row, ['JoinDate']) || today(), branchId: (S.branches[0] || {}).id, active: true
      };
      return { rec: Object.assign({}, existing || {}, rec), existing: !!existing };
    }
  },

  brokers: {
    label: 'Brokers', group: 'People',
    cols: [['Name', 'Ramesh Broker'], ['Phone', ''], ['Area', ''], ['CommissionAmount', '1500'], ['GSTIN', ''], ['PAN', ''], ['Address', '']],
    run: function (row) { return partyRow(row, 'broker', 'CommissionAmount'); }
  },
  financers: {
    label: 'Financers', group: 'People',
    cols: [['Name', 'SBI Agri'], ['Contact', ''], ['Phone', ''], ['InterestRate', '9.5'], ['MaxMargin', '25'], ['GSTIN', ''], ['Address', '']],
    run: function (row) { return partyRow(row, 'financer', 'InterestRate'); }
  },
  transporters: {
    label: 'Transporters', group: 'People',
    cols: [['Name', 'Balaji Transport'], ['Phone', ''], ['VehicleNo', ''], ['GSTIN', ''], ['RatePerTrip', '0'], ['Address', '']],
    run: function (row) {
      var name = pick(row, ['Name']);
      if (!name) return { error: 'Name is required' };
      var existing = S.transporters.find(function (t) { return t.name.toLowerCase() === name.toLowerCase(); });
      var rec = {
        name: name, phone: pick(row, ['Phone']), vehicleNo: pick(row, ['VehicleNo']),
        gstin: pick(row, ['GSTIN']).toUpperCase(), ratePerTrip: num(pick(row, ['RatePerTrip']) || 0),
        address: pick(row, ['Address']), active: true
      };
      return { rec: Object.assign({}, existing || {}, rec), existing: !!existing };
    }
  },

  banks: {
    label: 'Bank Accounts', group: 'Finance',
    cols: [['Name', 'HDFC Current'], ['BankName', 'HDFC'], ['AccountNo', ''], ['IFSC', ''], ['Branch', ''], ['Type', 'current'], ['OpeningBalance', '0']],
    run: function (row) {
      var name = pick(row, ['Name']);
      if (!name) return { error: 'Name is required' };
      var existing = S.bankAccounts.find(function (b) { return b.name.toLowerCase() === name.toLowerCase(); });
      var rec = {
        name: name, bankName: pick(row, ['BankName']), accountNo: pick(row, ['AccountNo']),
        ifsc: pick(row, ['IFSC']).toUpperCase(), branch: pick(row, ['Branch']),
        type: pick(row, ['Type']) || 'current', openingBal: num(pick(row, ['OpeningBalance']) || 0)
      };
      return { rec: Object.assign({}, existing || {}, rec), existing: !!existing };
    }
  },

  villages: {
    label: 'Villages', group: 'Locations',
    cols: [['Name', 'Ramannapet'], ['Mandal', 'Chityal'], ['District', 'Nalgonda'], ['State', '36'], ['Pincode', '']],
    run: function (row) {
      var name = pick(row, ['Name', 'Village']);
      if (!name) return { error: 'Name is required' };
      var distName = pick(row, ['District']);
      var stateCode = pick(row, ['State']) || org().stateCode;
      var districtId = '';
      if (distName) {
        var d = S.districts.find(function (x) { return x.name.toLowerCase() === distName.toLowerCase(); });
        if (!d) { d = { id: uid('dis'), name: distName, stateCode: stateCode, active: true }; S.districts.push(d); }
        districtId = d.id;
      }
      var mandalNameRow = pick(row, ['Mandal']);
      var mandalId = '';
      if (mandalNameRow) {
        var m = S.mandals.find(function (x) { return x.name.toLowerCase() === mandalNameRow.toLowerCase(); });
        if (!m) { m = { id: uid('man'), name: mandalNameRow, districtId: districtId, stateCode: stateCode }; S.mandals.push(m); }
        mandalId = m.id;
      }
      var existing = S.villages.find(function (v) { return v.name.toLowerCase() === name.toLowerCase(); });
      var rec = { name: name, mandalId: mandalId, pincode: pick(row, ['Pincode']) };
      return { rec: Object.assign({}, existing || {}, rec), existing: !!existing };
    }
  },

  uom: {
    label: 'Unit Master', group: 'Masters',
    cols: [['Name', 'BAG'], ['Label', 'Bags'], ['Decimals', '0']],
    run: function (row) {
      var name = (pick(row, ['Name', 'Unit']) || '').toUpperCase();
      if (!name) return { error: 'Unit code is required' };
      var existing = uomList().find(function (u) { return u.name === name; });
      var rec = { name: name, label: pick(row, ['Label', 'Description']), decimals: num(pick(row, ['Decimals']) || 0), active: true };
      return { rec: Object.assign({}, existing || {}, rec), existing: !!existing };
    }
  },

  gstslabs: {
    label: 'GST Slabs', group: 'Masters',
    cols: [['Rate', '12'], ['Description', 'Tractors (HSN 8701)']],
    run: function (row) {
      var rate = num(pick(row, ['Rate', 'GSTRate']));
      if (isNaN(rate)) return { error: 'Rate is required' };
      var existing = gstSlabs().find(function (g) { return num(g.rate) === rate; });
      var rec = { rate: rate, label: pick(row, ['Description', 'Label']), active: true };
      return { rec: Object.assign({}, existing || {}, rec), existing: !!existing };
    }
  },

  makes: {
    label: 'Makes & Models', group: 'Masters',
    cols: [['Make', 'Mahindra'], ['Model', '575 DI XP Plus'], ['Category', 'tractor'], ['HP', '47']],
    run: function (row) {
      var mkName = pick(row, ['Make', 'Brand']);
      if (!mkName) return { error: 'Make is required' };
      var cat = (pick(row, ['Category']) || 'tractor').toLowerCase();
      var mk = S.makes.find(function (m) { return m.name.toLowerCase() === mkName.toLowerCase() && (m.category || 'tractor') === cat; });
      if (!mk) { mk = { id: uid('mak'), name: mkName, category: cat, active: true }; S.makes.push(mk); }
      var mdName = pick(row, ['Model']);
      if (!mdName) return { rec: mk, existing: true, skip: true, note: 'make only' };
      var md = S.models.find(function (m) { return m.name.toLowerCase() === mdName.toLowerCase() && m.makeId === mk.id; });
      var rec = { makeId: mk.id, name: mdName, category: cat, hp: num(pick(row, ['HP']) || 0), active: true };
      return { rec: Object.assign({}, md || {}, rec), existing: !!md, coll: 'models' };
    }
  }
};

function partyRow(row, type, extraKey) {
  var name = pick(row, ['Name']);
  if (!name) return { error: 'Name is required' };
  var existing = S.parties.find(function (p) { return p.type === type && p.name.toLowerCase() === name.toLowerCase(); });
  var rec = {
    name: name, type: type, phone: pick(row, ['Phone']), contact: pick(row, ['Contact']),
    area: pick(row, ['Area']), address: pick(row, ['Address']),
    gstin: pick(row, ['GSTIN']).toUpperCase(), pan: pick(row, ['PAN']).toUpperCase(),
    stateCode: pick(row, ['State']) || org().stateCode,
    branchId: (S.branches[0] || {}).id, active: true
  };
  if (extraKey === 'CommissionAmount') rec.commissionAmount = num(pick(row, ['CommissionAmount']) || 0);
  if (extraKey === 'InterestRate') {
    rec.interestRate = num(pick(row, ['InterestRate']) || 0);
    rec.maxMargin = num(pick(row, ['MaxMargin']) || 0);
  }
  return { rec: Object.assign({}, existing || {}, rec), existing: !!existing };
}

/* collection an importer writes to */
function importerColl(key) {
  if (key === 'customers' || key === 'suppliers' || key === 'brokers' || key === 'financers') return 'parties';
  if (key === 'items' || key === 'parts') return 'items';
  if (key === 'employees') return 'employees';
  if (key === 'transporters') return 'transporters';
  if (key === 'banks') return 'bankAccounts';
  if (key === 'villages') return 'villages';
  if (key === 'uom') return 'uoms';
  if (key === 'gstslabs') return 'gstSlabs';
  if (key === 'makes') return 'makes';
  return 'parties';
}

function runImport(key, rows) {
  var imp = IMPORTERS[key];
  var stats = { added: 0, updated: 0, skipped: 0, errors: [] };
  rows.forEach(function (row, i) {
    var res;
    try { res = imp.run(row); } catch (e) { res = { error: e.message }; }
    if (!res || res.error) { stats.errors.push('Row ' + (i + 2) + ': ' + ((res && res.error) || 'could not read')); stats.skipped++; return; }
    if (res.skip) { stats.skipped++; return; }
    var collName = res.coll || importerColl(key);
    var rec = res.rec;
    if (!rec.id) rec.id = uid(collName.slice(0, 3));
    upsert(collName, rec);
    if (res.after) { try { res.after(rec); } catch (e) {} }
    if (res.existing) stats.updated++; else stats.added++;
  });
  save(true);
  return stats;
}

/* ---------------- Tally XML ---------------- */
function tallyDate(iso) { return String(iso || today()).replace(/-/g, ''); }
function txEsc(v) { return xmlEsc(v); }

function tallyEnvelope(reportName, messages, company) {
  return '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>' +
    '<REQUESTDESC><REPORTNAME>' + reportName + '</REPORTNAME><STATICVARIABLES>' +
    '<SVCURRENTCOMPANY>' + txEsc(company || org().name || 'Tractor ERP') + '</SVCURRENTCOMPANY>' +
    '</STATICVARIABLES></REQUESTDESC><REQUESTDATA>' + messages + '</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>';
}

function tallyLedger(name, parent, extra) {
  return '<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="' + txEsc(name) + '" ACTION="Create">' +
    '<PARENT>' + txEsc(parent) + '</PARENT>' + (extra || '') + '</LEDGER></TALLYMESSAGE>';
}

var Tally = {
  ledgersXml: function () {
    var o = org();
    var out = '';
    out += tallyLedger('Sales Accounts', 'Sales Accounts', '');
    out += tallyLedger('Purchase Accounts', 'Purchase Accounts', '');
    out += tallyLedger('Output CGST', 'Duties & Taxes', '<TAXTYPE>GST</TAXTYPE>');
    out += tallyLedger('Output SGST', 'Duties & Taxes', '<TAXTYPE>GST</TAXTYPE>');
    out += tallyLedger('Output IGST', 'Duties & Taxes', '<TAXTYPE>GST</TAXTYPE>');
    out += tallyLedger('Input CGST', 'Duties & Taxes', '<TAXTYPE>GST</TAXTYPE>');
    out += tallyLedger('Input SGST', 'Duties & Taxes', '<TAXTYPE>GST</TAXTYPE>');
    out += tallyLedger('Input IGST', 'Duties & Taxes', '<TAXTYPE>GST</TAXTYPE>');
    out += tallyLedger('Round Off', 'Indirect Expenses', '');
    out += tallyLedger('Cash', 'Cash-in-Hand', '');
    S.bankAccounts.forEach(function (b) {
      out += tallyLedger(b.name, 'Bank Accounts', '<BANKDETAILS.LIST><IFSCODE>' + txEsc(b.ifsc || '') +
        '</IFSCODE><ACCOUNTNUMBER>' + txEsc(b.accountNo || '') + '</ACCOUNTNUMBER><BANKNAME>' + txEsc(b.bankName || '') +
        '</BANKNAME></BANKDETAILS.LIST>');
    });
    S.parties.forEach(function (p) {
      if (p.type === 'customer' || p.type === 'supplier') {
        var parent = p.type === 'customer' ? 'Sundry Debtors' : 'Sundry Creditors';
        var extra = '';
        if (p.gstin) {
          extra += '<PARTYGSTIN>' + txEsc(p.gstin) + '</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>' +
            '<LEDGSTREGDETAILS.LIST><APPLICABLEFROM>' + tallyDate(o.fyStart || today()) + '</APPLICABLEFROM>' +
            '<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE><GSTIN>' + txEsc(p.gstin) + '</GSTIN></LEDGSTREGDETAILS.LIST>';
        }
        if (p.address) extra += '<ADDRESS.LIST><ADDRESS>' + txEsc(p.address) + '</ADDRESS></ADDRESS.LIST>';
        if (num(p.openingBal)) {
          extra += '<OPENINGBALANCE>' + (p.type === 'customer' ? -num(p.openingBal) : num(p.openingBal)) + '</OPENINGBALANCE>';
        }
        out += tallyLedger(p.name, parent, extra);
      }
      if (p.type === 'broker') out += tallyLedger('Commission — ' + p.name, 'Indirect Expenses', '');
    });
    var heads = {};
    S.expenses.forEach(function (e) { heads[e.head] = (heads[e.head] || 0) + num(e.amount); });
    Object.keys(heads).forEach(function (h) {
      var nm = (EXPENSE_HEADS.find(function (x) { return x[0] === h; }) || [h, h])[1];
      out += tallyLedger(nm, 'Indirect Expenses', '');
    });
    return tallyEnvelope('Masters', out, o.name);
  },

  stockItemsXml: function () {
    var out = '';
    uomList().forEach(function (u) {
      out += '<TALLYMESSAGE><UNIT NAME="' + txEsc(u.name) + '" ACTION="Create"><ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>' +
        '<DECIMALPLACES>' + num(u.decimals) + '</DECIMALPLACES></UNIT></TALLYMESSAGE>';
    });
    S.items.forEach(function (i) {
      out += '<TALLYMESSAGE><STOCKITEM NAME="' + txEsc(i.name) + '" ACTION="Create">' +
        '<PARENT>' + (i.category === 'service' ? 'Services' : 'Primary') + '</PARENT>' +
        '<BASEUNITS>' + txEsc(i.uom || 'NOS') + '</BASEUNITS>' +
        '<GSTAPPLICABLE>Applicable</GSTAPPLICABLE>' +
        '<GSTTYPEOFSUPPLY>' + (i.category === 'service' ? 'Services' : 'Goods') + '</GSTTYPEOFSUPPLY>' +
        (i.hsn ? '<HSNCODE>' + txEsc(i.hsn) + '</HSNCODE>' : '') +
        '<GSTRATE>' + num(i.gstRate) + '</GSTRATE>' +
        (i.partNo ? '<ALTERNATEUNITS></ALTERNATEUNITS><DESCRIPTION>' + txEsc('Part No: ' + i.partNo) + '</DESCRIPTION>' : '') +
        '</STOCKITEM></TALLYMESSAGE>';
    });
    return tallyEnvelope('Masters', out, org().name);
  },

  voucher: function (vchType, v) {
    var entries = '';
    (v.entries || []).forEach(function (e) {
      entries += '<ALLLEDGERENTRIES.LIST><LEDGERNAME>' + txEsc(e.ledger) + '</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>' + (e.debit ? 'Yes' : 'No') + '</ISDEEMEDPOSITIVE>' +
        '<AMOUNT>' + (e.debit ? -Math.abs(num(e.amount)) : Math.abs(num(e.amount))) + '</AMOUNT>' +
        (e.gst && e.gst.rate ? '<RATEDETAILS.LIST><GSTRATEDUTYHEAD>' + e.gst.head + '</GSTRATEDUTYHEAD>' +
          '<GSTRATE>' + e.gst.rate + '</GSTRATE></RATEDETAILS.LIST>' : '') +
        '</ALLLEDGERENTRIES.LIST>';
    });
    var inv = '';
    (v.items || []).forEach(function (it) {
      inv += '<INVENTORYENTRIES.LIST><STOCKITEMNAME>' + txEsc(it.name) + '</STOCKITEMNAME>' +
        '<ISDEEMEDPOSITIVE>' + (v.stockOut ? 'No' : 'Yes') + '</ISDEEMEDPOSITIVE>' +
        '<RATE>' + num(it.rate) + '/' + txEsc(it.uom || 'NOS') + '</RATE>' +
        '<AMOUNT>' + (v.stockOut ? Math.abs(num(it.amount)) : -Math.abs(num(it.amount))) + '</AMOUNT>' +
        '<ACTUALQTY>' + Math.abs(num(it.qty)) + ' ' + txEsc(it.uom || 'NOS') + '</ACTUALQTY>' +
        '<BILLEDQTY>' + Math.abs(num(it.qty)) + ' ' + txEsc(it.uom || 'NOS') + '</BILLEDQTY>' +
        '</INVENTORYENTRIES.LIST>';
    });
    return '<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="' + vchType + '" ACTION="Create" OBJVIEW="Invoice Voucher View">' +
      '<DATE>' + tallyDate(v.date) + '</DATE>' +
      '<EFFECTIVEDATE>' + tallyDate(v.date) + '</EFFECTIVEDATE>' +
      '<VOUCHERTYPENAME>' + vchType + '</VOUCHERTYPENAME>' +
      '<VOUCHERNUMBER>' + txEsc(v.no || '') + '</VOUCHERNUMBER>' +
      (v.party ? '<PARTYLEDGERNAME>' + txEsc(v.party) + '</PARTYLEDGERNAME><BASICBUYERNAME>' + txEsc(v.party) + '</BASICBUYERNAME>' : '') +
      (v.ref ? '<REFERENCE>' + txEsc(v.ref) + '</REFERENCE>' : '') +
      (v.narration ? '<NARRATION>' + txEsc(v.narration) + '</NARRATION>' : '') +
      entries + inv + '</VOUCHER></TALLYMESSAGE>';
  },

  salesVouchers: function () {
    var out = '';
    S.invoices.forEach(function (i) {
      if (i.docType === 'financer' || i.docType === 'margin') return;
      var pt = party(i.partyId);
      var entries = [{ ledger: pt.name || 'Cash', debit: true, amount: num(i.total) }];
      entries.push({ ledger: 'Sales Accounts', debit: false, amount: num(i.taxable) });
      if (num(i.cgst)) entries.push({ ledger: 'Output CGST', debit: false, amount: num(i.cgst), gst: { head: 'CGST', rate: 0 } });
      if (num(i.sgst)) entries.push({ ledger: 'Output SGST', debit: false, amount: num(i.sgst), gst: { head: 'SGST', rate: 0 } });
      if (num(i.igst)) entries.push({ ledger: 'Output IGST', debit: false, amount: num(i.igst), gst: { head: 'IGST', rate: 0 } });
      if (num(i.roundOff)) entries.push({ ledger: 'Round Off', debit: num(i.roundOff) < 0, amount: Math.abs(num(i.roundOff)) });
      var items = (i.lines || []).map(function (l) {
        return { name: l.desc || itemName(l.itemId), qty: num(l.qty), rate: num(l.rate), uom: item(l.itemId).uom || 'NOS', amount: lineAmount(l) };
      });
      out += Tally.voucher('Sales', {
        date: i.date, no: i.no, party: pt.name, narration: i.notes || ('Invoice ' + i.no),
        entries: entries, items: items, stockOut: true
      });
    });
    return out;
  },

  purchaseVouchers: function () {
    var out = '';
    S.purchases.forEach(function (p) {
      var pt = party(p.partyId);
      var entries = [{ ledger: pt.name || 'Sundry Creditors', debit: false, amount: num(p.total) }];
      entries.push({ ledger: 'Purchase Accounts', debit: true, amount: num(p.taxable) });
      if (num(p.cgst)) entries.push({ ledger: 'Input CGST', debit: true, amount: num(p.cgst) });
      if (num(p.sgst)) entries.push({ ledger: 'Input SGST', debit: true, amount: num(p.sgst) });
      if (num(p.igst)) entries.push({ ledger: 'Input IGST', debit: true, amount: num(p.igst) });
      var items = (p.lines || []).map(function (l) {
        return { name: l.desc || itemName(l.itemId), qty: num(l.qty), rate: num(l.rate), uom: item(l.itemId).uom || 'NOS', amount: lineAmount(l) };
      });
      out += Tally.voucher('Purchase', {
        date: p.date, no: p.no, party: pt.name, narration: 'Purchase ' + p.no,
        entries: entries, items: items, stockOut: false
      });
    });
    return out;
  },

  paymentVouchers: function () {
    var out = '';
    S.payments.forEach(function (p) {
      var pt = party(p.partyId);
      var bank = p.bankAccountId ? bankAccount(p.bankAccountId).name : (p.mode === 'cash' ? 'Cash' : 'Bank Accounts');
      var entries;
      if (p.type === 'in') {
        entries = [
          { ledger: bank || 'Cash', debit: true, amount: num(p.amount) },
          { ledger: pt.name, debit: false, amount: num(p.amount) }
        ];
        out += Tally.voucher('Receipt', { date: p.date, no: p.no, party: pt.name, narration: p.note || '', entries: entries });
      } else {
        entries = [
          { ledger: pt.name, debit: true, amount: num(p.amount) },
          { ledger: bank || 'Cash', debit: false, amount: num(p.amount) }
        ];
        out += Tally.voucher('Payment', { date: p.date, no: p.no, party: pt.name, narration: p.note || '', entries: entries });
      }
    });
    S.notes.forEach(function (n) {
      var pt = party(n.partyId);
      var entries = n.type === 'credit'
        ? [{ ledger: pt.name, debit: true, amount: num(n.total) }, { ledger: 'Sales Accounts', debit: false, amount: num(n.taxable) }]
        : [{ ledger: pt.name, debit: false, amount: num(n.total) }, { ledger: 'Purchase Accounts', debit: true, amount: num(n.taxable) }];
      if (num(n.tax)) {
        entries.push({ ledger: (n.type === 'credit' ? 'Output CGST' : 'Input CGST'), debit: n.type !== 'credit', amount: num(n.tax) });
      }
      out += Tally.voucher(n.type === 'credit' ? 'Credit Note' : 'Debit Note', {
        date: n.date, no: n.no, party: pt.name, narration: n.reason || '', entries: entries
      });
    });
    return out;
  },

  fullXml: function () {
    var o = org();
    var body = this.ledgersXml().split('<REQUESTDATA>')[1].split('</REQUESTDATA>')[0] +
      this.stockItemsXml().split('<REQUESTDATA>')[1].split('</REQUESTDATA>')[0] +
      this.salesVouchers() + this.purchaseVouchers() + this.paymentVouchers();
    return tallyEnvelope('Vouchers', body, o.name);
  }
};

/* ---------------- Import & Export screen ---------------- */
function importerCols(key) {
  return IMPORTERS[key].cols.map(function (c) { return { k: c[0], label: c[0] }; });
}
function importerTemplateRows(key) {
  var cols = IMPORTERS[key].cols;
  var row = {};
  cols.forEach(function (c) { row[c[0]] = c[1] === undefined ? '' : c[1]; });
  return [row];
}
function importerExportRows(key) {
  var out = [];
  if (key === 'customers' || key === 'suppliers') {
    var type = key === 'customers' ? 'customer' : 'supplier';
    S.parties.filter(function (p) { return p.type === type; }).forEach(function (p) {
      out.push({
        Name: p.name, Phone: p.phone || '', Phone2: p.phone2 || '', Email: p.email || '',
        Aadhaar: p.aadhaar || '', PAN: p.pan || '', GSTIN: p.gstin || '', State: p.stateCode || '',
        Village: villageName(p.villageId), Mandal: mandalName(p.mandalId), Address: p.address || '',
        City: p.city || '', Pincode: p.pincode || '', CreditDays: num(p.creditDays),
        OpeningBalance: num(p.openingBal)
      });
    });
  } else if (key === 'items' || key === 'parts') {
    S.items.filter(function (i) { return key === 'items' || i.category === 'spare'; }).forEach(function (i) {
      out.push({
        Name: i.name, PartNo: i.partNo || '', Category: i.category || '', Make: makeName(i.makeId) || i.brand || '',
        Model: modelName(i.modelId) || i.model || '', HSN: i.hsn || '', UOM: i.uom || '',
        GSTRate: num(i.gstRate), SaleRate: num(i.saleRate), PurchaseRate: num(i.purchaseRate),
        OpeningQty: 0, Reorder: num(i.reorder), SerialTracked: i.serialTracked ? 'Yes' : 'No'
      });
    });
  } else if (key === 'employees') {
    S.employees.forEach(function (e) {
      out.push({
        Name: e.name, Code: e.code || '', Type: e.empType || '', Designation: e.designation || '',
        Department: (dept(e.deptId) || {}).name || '', Phone: e.phone || '', Phone2: e.phone2 || '',
        Aadhaar: e.aadhaar || '', PAN: e.pan || '', BloodGroup: e.bloodGroup || '',
        EmergencyName: e.emergencyName || '', EmergencyPhone: e.emergencyPhone || '',
        BankName: e.bankName || '', BankAccount: e.bankAccount || '', BankIFSC: e.bankIfsc || '',
        Salary: num(e.salary), IncentiveAmount: num(e.incentiveAmount), Target: num(e.target),
        JoinDate: e.joinDate || ''
      });
    });
  } else if (key === 'brokers' || key === 'financers') {
    S.parties.filter(function (p) { return p.type === (key === 'brokers' ? 'broker' : 'financer'); }).forEach(function (p) {
      out.push({
        Name: p.name, Contact: p.contact || '', Phone: p.phone || '', Area: p.area || '',
        CommissionAmount: num(p.commissionAmount), InterestRate: num(p.interestRate),
        MaxMargin: num(p.maxMargin), GSTIN: p.gstin || '', PAN: p.pan || '', Address: p.address || ''
      });
    });
  } else if (key === 'transporters') {
    S.transporters.forEach(function (t) {
      out.push({ Name: t.name, Phone: t.phone || '', VehicleNo: t.vehicleNo || '', GSTIN: t.gstin || '', RatePerTrip: num(t.ratePerTrip), Address: t.address || '' });
    });
  } else if (key === 'banks') {
    S.bankAccounts.forEach(function (b) {
      out.push({ Name: b.name, BankName: b.bankName || '', AccountNo: b.accountNo || '', IFSC: b.ifsc || '', Branch: b.branch || '', Type: b.type || '', OpeningBalance: num(b.openingBal) });
    });
  } else if (key === 'villages') {
    S.villages.forEach(function (v) {
      var m = S.mandals.find(function (x) { return x.id === v.mandalId; }) || {};
      out.push({ Name: v.name, Mandal: m.name || '', District: districtName(m.districtId) || m.district || '', State: m.stateCode || '', Pincode: v.pincode || '' });
    });
  } else if (key === 'uom') {
    uomList().forEach(function (u) { out.push({ Name: u.name, Label: u.label || '', Decimals: num(u.decimals) }); });
  } else if (key === 'gstslabs') {
    gstSlabs().forEach(function (g) { out.push({ Rate: num(g.rate), Description: g.label || '' }); });
  } else if (key === 'makes') {
    S.models.forEach(function (md) {
      var mk = S.makes.find(function (m) { return m.id === md.makeId; }) || {};
      out.push({ Make: mk.name || '', Model: md.name, Category: mk.category || 'tractor', HP: num(md.hp) });
    });
  }
  return out;
}

screen('dataio', {
  title: 'Import & Export',
  render: function (view, params) {
    var tab = params.tab || 'export';
    var key = params.key || 'customers';
    var h = pageHead('Import & Export', [], 'Excel in, Excel out — and Tally-compatible XML');
    h += '<div class="tabs">' + [['export', 'Export'], ['import', 'Import'], ['tally', 'Tally']].map(function (t) {
      return '<button class="tab ' + (tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    if (tab === 'export') {
      var groups = {};
      Object.keys(IMPORTERS).forEach(function (k) {
        var g = IMPORTERS[k].group || 'Other';
        (groups[g] = groups[g] || []).push(k);
      });
      h += '<div class="card"><div class="tiny muted">Exports the live data as an Excel file. The same column layout is used by Import, so you can export, edit in Excel and import back.</div></div>';
      Object.keys(groups).forEach(function (g) {
        h += '<div class="card tight"><h3 style="padding:12px 14px 0">' + esc(g) + '</h3>';
        groups[g].forEach(function (k) {
          var id = 'ex_' + k;
          setTimeout(function () {
            var b = document.getElementById(id);
            if (b) b.onclick = function () {
              var rows = importerExportRows(k);
              if (!rows.length) { toast('Nothing to export for ' + IMPORTERS[k].label, 'err'); return; }
              Export.xls(IMPORTERS[k].label, importerCols(k), rows, IMPORTERS[k].label);
            };
            var t = document.getElementById(id + '_t');
            if (t) t.onclick = function () {
              Export.xls(IMPORTERS[k].label + ' Template', importerCols(k), importerTemplateRows(k), IMPORTERS[k].label + ' — template');
            };
          }, 0);
          h += '<div class="rowcard"><div class="rc-main"><div class="rc-title">' + esc(IMPORTERS[k].label) + '</div>' +
            '<div class="rc-sub">' + importerExportRows(k).length + ' record(s) · ' + IMPORTERS[k].cols.length + ' columns</div></div>' +
            '<div class="rc-right"><button class="btn sm" id="' + id + '_t">Template</button> ' +
            '<button class="btn sm primary" id="' + id + '">Excel</button></div></div>';
        });
        h += '</div>';
      });
    }

    if (tab === 'import') {
      var opts = Object.keys(IMPORTERS).map(function (k) {
        return '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + esc(IMPORTERS[k].label) + '</option>';
      }).join('');
      h += '<div class="card">' +
        '<label class="fld"><span>What are you importing?</span><select id="impKey">' + opts + '</select></label>' +
        '<div class="note" style="margin-top:10px">Download the template, fill it in Excel, then choose the file. Rows are matched on name, so re-importing updates instead of duplicating. Accepts .xlsx, .csv and Excel XML (.xls).</div>' +
        '<button class="btn block" id="btnTpl" style="margin-top:10px">Download template</button>' +
        '<button class="btn primary block" id="btnPick" style="margin-top:8px">Choose file to import</button>' +
        '</div>';
      h += '<div id="impResult"></div>';
      h += '<div class="card"><h3>Columns for ' + esc(IMPORTERS[key].label) + '</h3>' +
        table({
          cls: 'compact',
          cols: [{ k: 'c', label: 'Column' }, { k: 's', label: 'Example' }],
          rows: IMPORTERS[key].cols.map(function (c) { return { c: c[0], s: c[1] || '(blank)' }; })
        }) + '</div>';
    }

    if (tab === 'tally') {
      h += '<div class="card"><h3>Tally XML export</h3><div class="tiny muted">' +
        'Creates the XML that Tally Prime / Tally ERP 9 reads through <b>Gateway of Tally → Import Data</b>. ' +
        'Ledgers use standard Tally groups (Sundry Debtors, Sundry Creditors, Bank Accounts, Duties &amp; Taxes) and vouchers carry GST ledgers, ' +
        'HSN codes and stock items, so the data posts into a GST-enabled Tally company.</div>' +
        '<button class="btn primary block" id="tlyFull" style="margin-top:12px">Export everything (masters + vouchers)</button>' +
        '<button class="btn block" id="tlyMasters" style="margin-top:8px">Ledger masters only</button>' +
        '<button class="btn block" id="tlyItems" style="margin-top:8px">Stock items &amp; units only</button>' +
        '<button class="btn block" id="tlyVouchers" style="margin-top:8px">Vouchers only</button></div>';
      h += '<div class="card"><h3>Importing into Tally</h3><div class="tiny muted">' +
        '1. Create a company in Tally with the same name as here (' + esc(org().name || '—') + ') and enable GST.<br>' +
        '2. Gateway of Tally → Import Data → XML, choose the file.<br>' +
        '3. Import masters first, then vouchers, if you prefer separate files.<br>' +
        '4. Tally will skip duplicates if you import twice — use it to keep Tally in step with the app.</div></div>';
    }

    view.innerHTML = h;
    qsa('[data-tab]', view).forEach(function (b) { b.onclick = function () { Router.go('dataio', { tab: b.getAttribute('data-tab'), key: key }); }; });

    var impKey = document.getElementById('impKey');
    if (impKey) impKey.onchange = function () { Router.go('dataio', { tab: 'import', key: impKey.value }); };

    var btnTpl = document.getElementById('btnTpl');
    if (btnTpl) btnTpl.onclick = function () {
      Export.xls(IMPORTERS[key].label + ' Template', importerCols(key), importerTemplateRows(key), IMPORTERS[key].label + ' — template');
    };

    var btnPick = document.getElementById('btnPick');
    if (btnPick) btnPick.onclick = function () {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.xlsx,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
      inp.onchange = async function () {
        var f = inp.files[0];
        if (!f) return;
        var box = document.getElementById('impResult');
        box.innerHTML = '<div class="card"><div class="tiny muted">Reading ' + esc(f.name) + '…</div></div>';
        try {
          var rows = await readTable(f);
          var parsed = rowsToObjects(rows);
          if (!parsed.items.length) { box.innerHTML = '<div class="card"><div class="note">No data rows found in that file.</div></div>'; return; }
          var preview = parsed.items.slice(0, 5).map(function (r) {
            return '<div class="rc-sub">' + esc(Object.keys(r).slice(0, 4).map(function (k) { return r[k]; }).join(' · ')) + '</div>';
          }).join('');
          box.innerHTML = '<div class="card"><h3>' + parsed.items.length + ' row(s) ready</h3>' +
            '<div class="tiny muted">Columns found: ' + esc(parsed.headers.join(', ')) + '</div>' +
            preview + '<button class="btn primary block" id="btnRun" style="margin-top:10px">Import ' + parsed.items.length + ' row(s)</button></div>';
          document.getElementById('btnRun').onclick = function () {
            var stats = runImport(key, parsed.items);
            var errs = stats.errors.slice(0, 8).map(function (e) { return '<div class="tiny red">' + esc(e) + '</div>'; }).join('');
            box.innerHTML = '<div class="card"><h3>Import finished</h3>' +
              '<div class="kv"><span>Added</span><span class="green">' + stats.added + '</span></div>' +
              '<div class="kv"><span>Updated</span><span class="blue">' + stats.updated + '</span></div>' +
              '<div class="kv"><span>Skipped</span><span>' + stats.skipped + '</span></div>' +
              (errs ? '<div class="section-label">Problems</div>' + errs : '') +
              '<button class="btn block" id="btnAgain" style="margin-top:10px">Import another file</button></div>';
            document.getElementById('btnAgain').onclick = function () { Router.go('dataio', { tab: 'import', key: key }); };
            toast('Imported ' + stats.added + ' added, ' + stats.updated + ' updated');
          };
        } catch (e) {
          box.innerHTML = '<div class="card"><div class="note">Could not read that file — ' + esc(e.message) +
            '. Save it as .xlsx or CSV from Excel and try again.</div></div>';
        }
      };
      inp.click();
    };

    var send = function (name, xml) {
      if (!xml) { toast('Nothing to export yet', 'err'); return; }
      var fname = 'tally-' + name + '-' + today() + '.xml';
      if (window.AppBridge && window.AppBridge.saveFile) window.AppBridge.saveFile(fname, xml);
      else Export.deliver(fname, xml, 'application/xml');
      toast('Tally file ready');
    };
    var tf = document.getElementById('tlyFull');
    if (tf) tf.onclick = function () { send('all', Tally.fullXml()); };
    var tm = document.getElementById('tlyMasters');
    if (tm) tm.onclick = function () { send('ledgers', Tally.ledgersXml()); };
    var ti = document.getElementById('tlyItems');
    if (ti) ti.onclick = function () { send('stock-items', Tally.stockItemsXml()); };
    var tv = document.getElementById('tlyVouchers');
    if (tv) tv.onclick = function () {
      var body = Tally.salesVouchers() + Tally.purchaseVouchers() + Tally.paymentVouchers();
      send('vouchers', tallyEnvelope('Vouchers', body, org().name));
    };
  }
});
