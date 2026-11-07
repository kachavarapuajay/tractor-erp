/* ============================================================
   export.js — Excel (.xls), PDF / print and CSV export,
   with single-row and bulk selection
   ============================================================ */

function xmlEsc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var Export = {
  /* Excel 2003 SpreadsheetML — opens directly in Excel, WPS, Google Sheets */
  xls: function (name, cols, rows, title) {
    var h = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
      'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="t"><Font ss:Bold="1" ss:Size="13"/></Style>' +
      '<Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E8F0EA" ss:Pattern="Solid"/>' +
      '<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style></Styles>' +
      '<Worksheet ss:Name="' + xmlEsc((title || 'Data').slice(0, 28).replace(/[\\\/\?\*\[\]:]/g, ' ')) + '"><Table>';
    h += '<Row><Cell ss:StyleID="t"><Data ss:Type="String">' + xmlEsc(title || name) + '</Data></Cell></Row>';
    h += '<Row><Cell><Data ss:Type="String">' + xmlEsc((org().name || '') + ' · generated ' + dmy(today())) + '</Data></Cell></Row><Row></Row>';
    h += '<Row>';
    cols.forEach(function (c) { h += '<Cell ss:StyleID="h"><Data ss:Type="String">' + xmlEsc(c.label) + '</Data></Cell>'; });
    h += '</Row>';
    rows.forEach(function (r) {
      h += '<Row>';
      cols.forEach(function (c) {
        var v = r[c.k];
        if (v === undefined || v === null) v = '';
        var isNum = typeof v === 'number';
        h += '<Cell><Data ss:Type="' + (isNum ? 'Number' : 'String') + '">' + xmlEsc(v) + '</Data></Cell>';
      });
      h += '</Row>';
    });
    h += '</Table></Worksheet></Workbook>';
    var fname = name.replace(/[^A-Za-z0-9._-]/g, '_') + '-' + today() + '.xls';
    this.deliver(fname, h, 'application/vnd.ms-excel');
    toast('Excel file ready');
  },

  csv: function (name, cols, rows) {
    var lines = [cols.map(function (c) { return c.label; }).join(',')];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c.k] === undefined || r[c.k] === null ? '' : String(r[c.k]);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    var fname = name.replace(/[^A-Za-z0-9._-]/g, '_') + '-' + today() + '.csv';
    this.deliver(fname, lines.join('\n'), 'text/csv');
    toast('CSV file ready');
  },

  pdf: function (title, cols, rows, sub) {
    var o = org();
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + xmlEsc(title) + '</title><style>' +
      'body{font-family:Arial,sans-serif;font-size:10.5px;color:#111;padding:14px}' +
      'h1{font-size:15px;margin:0 0 2px}h2{font-size:11px;margin:0 0 10px;color:#555;font-weight:normal}' +
      'table{width:100%;border-collapse:collapse;margin-top:8px}' +
      'th{background:#eef3ef;text-align:left;padding:5px 6px;border-bottom:1px solid #999;font-size:9.5px;text-transform:uppercase}' +
      'td{padding:4px 6px;border-bottom:1px solid #e2e2e2;vertical-align:top}' +
      '.num{text-align:right}.f{margin-top:12px;font-size:9px;color:#666}' +
      '</style></head><body>' +
      '<h1>' + xmlEsc(o.name || '') + '</h1>' +
      '<h2>' + xmlEsc(title) + (sub ? ' · ' + xmlEsc(sub) : '') + ' · ' + dmy(today()) + '</h2>' +
      '<table><thead><tr>' + cols.map(function (c) { return '<th>' + xmlEsc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + cols.map(function (c) {
          var v = r[c.k];
          if (v === undefined || v === null) v = '';
          var cls = (c.num || typeof v === 'number') ? ' class="num"' : '';
          return '<td' + cls + '>' + xmlEsc(typeof v === 'number' ? fmt(v) : v) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>' +
      '<div class="f">' + rows.length + ' row(s) · Generated from Tractor ERP on ' + dmy(today()) + '</div></body></html>';
    if (window.AppBridge && window.AppBridge.printHtml) {
      window.AppBridge.printHtml(html);
      toast('Choose "Save as PDF" in the print dialog');
    } else {
      var w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); w.print(); }
      else window.print();
    }
  },

  deliver: function (fname, content, mime) {
    if (window.AppBridge && window.AppBridge.saveFile) {
      window.AppBridge.saveFile(fname, content);
    } else {
      var blob = new Blob([content], { type: mime || 'text/plain' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
    }
  },

  /* picker: single row or bulk (all ticked by default) */
  menu: function (title, cols, rows, opts) {
    opts = opts || {};
    if (!rows.length) { toast('Nothing to export', 'err'); return; }
    var sel = rows.map(function () { return true; });
    var body = '<div class="note">Choose what to export. Everything is ticked by default — untick rows for a single or partial export.</div>' +
      '<div class="between" style="margin:8px 0"><b>' + rows.length + ' row(s)</b>' +
      '<button class="btn sm" id="expAll">Toggle all</button></div>' +
      '<div style="max-height:42vh;overflow:auto;border:1px solid var(--line);border-radius:10px">' +
      rows.map(function (r, i) {
        var label = opts.label ? opts.label(r) : (r[cols[0].k] || 'Row ' + (i + 1));
        return '<label class="rowcard" style="padding:9px 10px"><div class="rc-main"><div class="rc-title" style="font-size:13px">' +
          esc(String(label).slice(0, 70)) + '</div></div>' +
          '<div class="rc-right"><input type="checkbox" data-exp="' + i + '" checked style="width:20px;height:20px"></div></label>';
      }).join('') + '</div>';
    var m = modal({
      title: 'Export · ' + title,
      wide: true,
      body: body,
      footer: '<button class="btn ghost" data-f="csv">CSV</button>' +
        '<button class="btn blue" data-f="xls">Excel</button>' +
        '<button class="btn primary" data-f="pdf">PDF / Print</button>'
    });
    qs('#expAll', m.el).onclick = function () {
      var anyOff = sel.some(function (v) { return !v; });
      sel = sel.map(function () { return anyOff; });
      qsa('[data-exp]', m.el).forEach(function (c) { c.checked = anyOff; });
    };
    qsa('[data-exp]', m.el).forEach(function (c) {
      c.onchange = function () { sel[Number(c.getAttribute('data-exp'))] = c.checked; };
    });
    qsa('[data-f]', m.el).forEach(function (b) {
      b.onclick = function () {
        var picked = rows.filter(function (r, i) { return sel[i]; });
        if (!picked.length) { toast('Select at least one row', 'err'); return; }
        var f = b.getAttribute('data-f');
        m.close();
        if (f === 'xls') Export.xls(title, cols, picked, title);
        else if (f === 'csv') Export.csv(title, cols, picked);
        else Export.pdf(title, cols, picked, opts.sub);
      };
    });
  },

  /* header action helper */
  action: function (title, colsFn, rowsFn, opts) {
    return {
      label: 'Export', icon: 'download',
      onClick: function () { Export.menu(title, colsFn(), rowsFn(), opts); }
    };
  }
};
