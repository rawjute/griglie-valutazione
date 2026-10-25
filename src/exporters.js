/* =====================================================================
 * exporters.js — griglia (vuota o compilata) in HTML, PDF e XLSX
 * ===================================================================== */

const Grid = {
  /**
   * Struttura comune a tutti gli export.
   * stu: record studente (facoltativo); ctx: { classe, data } per il piè di pagina.
   */
  data(t, vId, stu, ctx) {
    const M = Calc.matrix(t, vId);
    const res = stu ? Calc.score(t, vId, stu) : null;
    const C = Calc.closed(t, vId);
    const indList = M.rows.length ? M.used : t.indicatori;
    const cols = M.rows.map(r => ({
      id: r.ex.id, nome: r.ex.nome, peso: r.peso,
      nonSvolto: res ? res.esercizi[r.ex.id].nonSvolto : false,
      punti: res ? res.esercizi[r.ex.id].punti : null
    }));
    const inds = indList.map(i => ({
      ind: i,
      ranges: Calc.levelRanges(i.livelli, U.num(i.max) || 0),
      cells: M.rows.map(r => {
        if (r.cells[i.id] === undefined) return { v: '-', off: true };
        if (!res) return { v: '' };
        if (res.esercizi[r.ex.id].nonSvolto) return { v: 'N.S.', ns: true };
        const v = U.num(stu.punteggi && stu.punteggi[r.ex.id] ? stu.punteggi[r.ex.id][i.id] : null);
        return { v: v === null ? '' : U.fmt(v) };
      }),
      last: res ? (res.indicatori[i.id] ? U.fmt(res.indicatori[i.id].media) : '') : U.fmt(M.eff[i.id])
    }));
    const showNote = t.notaPiede && (t.notaPiedeQuando === 'sempre' || (t.notaPiedeQuando === 'bes' && vId && vId !== 'std'));
    let closedLine = null;
    if (C.items.length) {
      const parts = [];
      if (!res) {
        if (C.singole.length) {
          const vals = [...new Set(C.singole.map(q => U.fmt(q.valore)))];
          parts.push(C.singole.length + ' domande · corretta: ' + vals.join('/') + ' pt · errata: ' + U.fmt(U.num(t.chiuse.errata) || 0) + ' · non data: ' + U.fmt(U.num(t.chiuse.nonData) || 0));
        }
        if (C.composte.length) {
          parts.push((C.composte.length === 1 ? '1 risposta composta (' + C.composte[0].parti + ' parti, ' : C.composte.length + ' risposte composte (') +
            U.fmt(U.sum(C.composte, q => q.valore)) + ' pt, punteggio proporzionale alle parti corrette)');
        }
        closedLine = { label: 'Domande a risposta chiusa', text: parts.join(' · '), value: U.fmt(C.max) };
      } else {
        if (C.singole.length) {
          const cnt = Calc.closedCounts(stu, C);
          parts.push('Corrette ' + cnt.C + ' · errate ' + cnt.E + ' · non date ' + cnt.N + ' (su ' + C.singole.length + ')');
        }
        C.composte.forEach(q => {
          const x = Calc.partialValue(stu, q);
          parts.push(q.nome + ': ' + (x === null ? '-' : x) + '/' + q.parti + ' parti corrette');
        });
        closedLine = { label: 'Domande a risposta chiusa', text: parts.join(' · '), value: U.fmt(res.chiuse) + ' / ' + U.fmt(C.max) };
      }
    }
    return {
      title: 'GRIGLIA DI VALUTAZIONE' + (Model.templateTitle(t) ? ' — ' + Model.templateTitle(t).toUpperCase() : ''),
      subtitle: t.intestazione || '',
      student: !!stu,
      lastHeader: stu ? 'Media' : 'Peso',
      cols, inds, closedLine,
      totManual: M.Tm,
      res,
      total: res ? U.fmt(res.totale) + ' / ' + U.fmt(res.max) : U.fmt(M.Tm + C.max),
      voto: res ? U.fmtFixed(res.voto, 2) + '   ·   arrotondato: ' + U.fmt(res.votoArr, 1) : Calc.votoRule(t, M.Tm + C.max),
      note: showNote ? t.notaPiede : '',
      info: stu ? [['Alunno', U.studentName(stu)], ['Classe', (ctx && ctx.classe) || ''], ['Data', U.dateIT(stu.data || (ctx && ctx.data))]] : null
    };
  },

  css: `
.gv-grid{border-collapse:collapse;width:100%;font:12px/1.3 "Segoe UI",Arial,sans-serif;color:#111;background:#fff}
.gv-grid th,.gv-grid td{border:1px solid #555;padding:4px 5px;vertical-align:middle}
.gv-grid thead th{background:#dfe7f3;font-weight:600;text-align:center}
.gv-grid .gv-title{background:#c9d6ea;font-size:14px;font-weight:700;text-align:center}
.gv-grid .gv-sub{background:#eef2f8;text-align:center;font-weight:500}
.gv-grid .gv-ind{font-weight:600;background:#f6f8fb}
.gv-grid .c{text-align:center}
.gv-grid .gv-desc{font-size:11px;white-space:pre-line}
.gv-grid .gv-off{background:#e6e6e6;color:#777;text-align:center}
.gv-grid .gv-ns{background:#fdecea;text-align:center;color:#a33}
.gv-grid .gv-foot td{background:#f6f8fb;font-weight:600}
.gv-grid .gv-total td{background:#dfe7f3;font-weight:700}
.gv-grid .gv-note{font-style:italic;font-size:11px;border:none;padding-top:8px}
.gv-info{margin-top:10px;font:13px "Segoe UI",Arial,sans-serif;display:flex;gap:28px}
.gv-info b{font-weight:600}
`,

  html(d) {
    const e = U.esc;
    const n = d.cols.length;
    const width = 6 + n;
    let h = '<table class="gv-grid"><thead>';
    h += '<tr><th class="gv-title" colspan="' + width + '">' + e(d.title) + '</th></tr>';
    if (d.subtitle) h += '<tr><th class="gv-sub" colspan="' + width + '">' + e(d.subtitle) + '</th></tr>';
    h += '<tr><th>Indicatore</th><th>Punti</th><th colspan="2">Descrittori</th><th>Punteggio</th>';
    d.cols.forEach(c => { h += '<th>' + e(c.nome) + '</th>'; });
    h += '<th>' + e(d.lastHeader) + '</th></tr></thead><tbody>';
    d.inds.forEach(row => {
      const rs = row.ranges.length;
      row.ranges.forEach((r, k) => {
        h += '<tr>';
        if (k === 0) h += '<td class="gv-ind" rowspan="' + rs + '">' + e(row.ind.nome) + '</td><td class="c" rowspan="' + rs + '">' + e(U.fmt(U.num(row.ind.max))) + '</td>';
        h += '<td class="c">' + e(r.level.nome) + '</td><td class="gv-desc">' + e(r.level.descrittore || '') + '</td>';
        h += '<td class="c">' + Calc.rangeLabel(r) + '</td>';
        if (k === 0) {
          row.cells.forEach(c => { h += '<td rowspan="' + rs + '" class="' + (c.off ? 'gv-off' : c.ns ? 'gv-ns' : 'c') + '">' + e(c.v) + '</td>'; });
          h += '<td class="c" rowspan="' + rs + '">' + e(row.last) + '</td>';
        }
        h += '</tr>';
      });
    });
    const foot = (label, vals, last, cls) => {
      let s = '<tr class="' + (cls || 'gv-foot') + '"><td colspan="5">' + e(label) + '</td>';
      vals.forEach(v => { s += '<td class="c">' + e(v) + '</td>'; });
      return s + '<td class="c">' + e(last) + '</td></tr>';
    };
    h += foot(d.student ? 'Punteggio massimo esercizio' : 'Punteggio esercizio', d.cols.map(c => U.fmt(c.peso)), U.fmt(d.totManual));
    if (d.student) h += foot('Punteggio ottenuto', d.cols.map(c => c.nonSvolto ? 'N.S.' : U.fmt(c.punti)), U.fmt(d.res.manuale));
    if (d.closedLine) h += '<tr class="gv-foot"><td colspan="5">' + e(d.closedLine.label) + '</td><td colspan="' + n + '">' + e(d.closedLine.text) + '</td><td class="c">' + e(d.closedLine.value) + '</td></tr>';
    h += '<tr class="gv-total"><td colspan="5">PUNTEGGIO TOTALE</td><td colspan="' + n + '"></td><td class="c">' + e(d.total) + '</td></tr>';
    h += '<tr class="gv-total"><td colspan="5">VOTO</td><td colspan="' + (n + 1) + '" class="c">' + e(d.voto) + '</td></tr>';
    if (d.note) h += '<tr><td class="gv-note" colspan="' + width + '">' + e(d.note) + '</td></tr>';
    h += '</tbody></table>';
    if (d.info) h += '<div class="gv-info">' + d.info.map(([k, v]) => '<div><b>' + e(k) + ':</b> ' + e(v) + '</div>').join('') + '</div>';
    return h;
  },

  htmlDocument(title, bodies) {
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + U.esc(title) +
      '</title><style>body{margin:16px;background:#fff}.gv-page{page-break-after:always;margin-bottom:32px}@page{size:A4 landscape;margin:10mm}' + Grid.css + '</style></head><body>' +
      bodies.map(b => '<div class="gv-page">' + b + '</div>').join('') + '</body></html>';
  },

  /* ---------------- PDF ---------------- */
  async pdf(list) {
    const jsPDF = await Libs.pdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    // ogni griglia deve stare in una pagina: se sfora, si riprova con caratteri più piccoli
    const sizes = [7, 6.5, 6, 5.5, 5];
    list.forEach((d, idx) => {
      if (idx) doc.addPage();
      const start = doc.getNumberOfPages();
      for (let k = 0; k < sizes.length; k++) {
        const fits = Grid._pdfPage(doc, d, sizes[k]);
        if ((fits && doc.getNumberOfPages() === start) || k === sizes.length - 1) break;
        for (let p = doc.getNumberOfPages(); p >= start; p--) doc.deletePage(p);
        doc.addPage();
      }
    });
    return doc.output('blob');
  },

  _pdfPage(doc, d, fs) {
    fs = fs || 7;
    const pad = fs >= 7 ? 1.2 : fs >= 6 ? 0.9 : 0.7;
    const n = d.cols.length;
    const W = 297 - 16;
    const fixed = 30 + 11 + 22 + 18 + 15;
    const exW = U.clamp((W - fixed - 60) / Math.max(n, 1), 7, 12);
    const descW = W - fixed - exW * n;
    const head = [[
      { content: 'Indicatore' }, { content: 'Punti' }, { content: 'Descrittori', colSpan: 2 }, { content: 'Punteggio' },
      ...d.cols.map(c => ({ content: c.nome })), { content: d.lastHeader }
    ]];
    const grey = [230, 230, 230], pale = [246, 248, 251], blue = [223, 231, 243], pink = [253, 236, 234];
    const body = [];
    d.inds.forEach(row => {
      const rs = row.ranges.length;
      row.ranges.forEach((r, k) => {
        const line = [];
        if (k === 0) {
          line.push({ content: row.ind.nome, rowSpan: rs, styles: { fontStyle: 'bold', fillColor: pale, valign: 'middle' } });
          line.push({ content: U.fmt(U.num(row.ind.max)), rowSpan: rs, styles: { halign: 'center', valign: 'middle' } });
        }
        line.push({ content: r.level.nome, styles: { halign: 'center', valign: 'middle' } });
        line.push({ content: r.level.descrittore || '', styles: { fontSize: fs - 0.5 } });
        line.push({ content: Calc.rangeLabel(r), styles: { halign: 'center', valign: 'middle' } });
        if (k === 0) {
          row.cells.forEach(c => line.push({ content: c.v, rowSpan: rs, styles: { halign: 'center', valign: 'middle', fillColor: c.off ? grey : c.ns ? pink : false } }));
          line.push({ content: row.last, rowSpan: rs, styles: { halign: 'center', valign: 'middle' } });
        }
        body.push(line);
      });
    });
    const foot = (label, vals, last, fill) => [
      { content: label, colSpan: 5, styles: { fontStyle: 'bold', fillColor: fill || pale } },
      ...vals.map(v => ({ content: v, styles: { halign: 'center', fontStyle: 'bold', fillColor: fill || pale } })),
      { content: last, styles: { halign: 'center', fontStyle: 'bold', fillColor: fill || pale } }
    ];
    body.push(foot(d.student ? 'Punteggio massimo esercizio' : 'Punteggio esercizio', d.cols.map(c => U.fmt(c.peso)), U.fmt(d.totManual)));
    if (d.student) body.push(foot('Punteggio ottenuto', d.cols.map(c => c.nonSvolto ? 'N.S.' : U.fmt(c.punti)), U.fmt(d.res.manuale)));
    if (d.closedLine) body.push([
      { content: d.closedLine.label, colSpan: 5, styles: { fontStyle: 'bold', fillColor: pale } },
      { content: d.closedLine.text, colSpan: n, styles: { fillColor: pale } },
      { content: d.closedLine.value, styles: { halign: 'center', fontStyle: 'bold', fillColor: pale } }
    ]);
    body.push([
      { content: 'PUNTEGGIO TOTALE', colSpan: 5 + n, styles: { fontStyle: 'bold', fillColor: blue } },
      { content: d.total, styles: { halign: 'center', fontStyle: 'bold', fillColor: blue } }
    ]);
    body.push([
      { content: 'VOTO', colSpan: 2, styles: { fontStyle: 'bold', fillColor: blue } },
      { content: d.voto, colSpan: n + 4, styles: { halign: 'center', fontStyle: 'bold', fillColor: blue } }
    ]);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(d.title, 148.5, 11, { align: 'center' });
    let startY = 14;
    if (d.subtitle) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(d.subtitle, 148.5, 16, { align: 'center' });
      startY = 19;
    }
    const colStyles = { 0: { cellWidth: 30 }, 1: { cellWidth: 11 }, 2: { cellWidth: 22 }, 3: { cellWidth: descW }, 4: { cellWidth: 18 } };
    for (let i = 0; i < n; i++) colStyles[5 + i] = { cellWidth: exW };
    colStyles[5 + n] = { cellWidth: 15 };
    doc.autoTable({
      head, body, startY,
      margin: { left: 8, right: 8, top: 10, bottom: 10 },
      theme: 'grid',
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: fs, cellPadding: pad, lineColor: [90, 90, 90], lineWidth: 0.2, textColor: [17, 17, 17], overflow: 'linebreak' },
      headStyles: { fillColor: blue, textColor: [17, 17, 17], halign: 'center', fontStyle: 'bold' },
      columnStyles: colStyles
    });
    let y = doc.lastAutoTable.finalY + 5;
    const fits = y + (d.note ? 6 : 0) + (d.info ? 4 : 0) <= 204;
    doc.setFontSize(8);
    if (d.note) {
      doc.setFont('helvetica', 'italic');
      doc.text(d.note, 8, y); y += 6;
    }
    if (d.info) {
      doc.setFontSize(10);
      let x = 8;
      d.info.forEach(([k, v]) => {
        doc.setFont('helvetica', 'bold'); doc.text(k + ':', x, y);
        const kw = doc.getTextWidth(k + ': ');
        doc.setFont('helvetica', 'normal'); doc.text(v || '', x + kw, y);
        x += kw + Math.max(doc.getTextWidth(v || ''), 20) + 14;
      });
    }
    return fits;
  },

  /* ---------------- XLSX ---------------- */
  sheetName(name, used) {
    let base = String(name || 'Foglio').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Foglio';
    let s = base, k = 2;
    while (used.has(s.toLowerCase())) { const suf = ' (' + k++ + ')'; s = base.slice(0, 31 - suf.length) + suf; }
    used.add(s.toLowerCase());
    return s;
  },

  xlsxSheet(wb, name, d) {
    const ws = wb.addWorksheet(name, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const n = d.cols.length;
    const lastCol = 6 + n;
    const thin = { style: 'thin', color: { argb: 'FF555555' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const BLUE = 'FFDFE7F3', PALE = 'FFF6F8FB', GREY = 'FFE6E6E6', PINK = 'FFFDECEA', TITLE = 'FFC9D6EA';
    const set = (r, c, v, st) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      cell.border = border;
      cell.alignment = Object.assign({ vertical: 'middle', wrapText: true }, (st && st.align) || {});
      if (st && st.fill) cell.fill = fill(st.fill);
      if (st && st.bold) cell.font = { bold: true, size: st.size || 10 };
      else if (st && st.size) cell.font = { size: st.size };
      return cell;
    };
    const center = { horizontal: 'center' };
    const numOrText = v => { const x = U.num(v); return x === null || String(v).indexOf('/') >= 0 ? v : x; };

    ws.columns = [{ width: 24 }, { width: 8 }, { width: 10 }, { width: 62 }, { width: 11 }, ...d.cols.map(() => ({ width: 7.5 })), { width: 11 }];
    let r = 1;
    ws.mergeCells(r, 1, r, lastCol); set(r, 1, d.title, { bold: true, size: 12, fill: TITLE, align: center }); r++;
    if (d.subtitle) { ws.mergeCells(r, 1, r, lastCol); set(r, 1, d.subtitle, { align: center, fill: PALE }); r++; }
    ['Indicatore', 'Punti', 'Descrittori', '', 'Punteggio'].forEach((h, i) => set(r, i + 1, h, { bold: true, fill: BLUE, align: center }));
    ws.mergeCells(r, 3, r, 4);
    d.cols.forEach((c, i) => set(r, 6 + i, c.nome, { bold: true, fill: BLUE, align: center }));
    set(r, lastCol, d.lastHeader, { bold: true, fill: BLUE, align: center });
    r++;

    d.inds.forEach(row => {
      const rs = row.ranges.length;
      const r0 = r;
      row.ranges.forEach((lv, k) => {
        set(r + k, 1, k === 0 ? row.ind.nome : null, { bold: true, fill: PALE });
        set(r + k, 2, k === 0 ? U.num(row.ind.max) : null, { align: center });
        set(r + k, 3, lv.level.nome, { align: center });
        set(r + k, 4, lv.level.descrittore || '', { size: 9 });
        set(r + k, 5, Calc.rangeLabel(lv), { align: center });
        row.cells.forEach((c, i) => set(r + k, 6 + i, k === 0 ? numOrText(c.v) : null, { align: center, fill: c.off ? GREY : c.ns ? PINK : null }));
        set(r + k, lastCol, k === 0 ? numOrText(row.last) : null, { align: center });
      });
      if (rs > 1) {
        [1, 2].concat(d.cols.map((_, i) => 6 + i), [lastCol]).forEach(c => ws.mergeCells(r0, c, r0 + rs - 1, c));
      }
      r += rs;
    });

    const footRow = (label, vals, last, f) => {
      ws.mergeCells(r, 1, r, 5);
      set(r, 1, label, { bold: true, fill: f || PALE });
      for (let c = 2; c <= 5; c++) set(r, c, null, { fill: f || PALE });
      vals.forEach((v, i) => set(r, 6 + i, numOrText(v), { bold: true, fill: f || PALE, align: center }));
      set(r, lastCol, numOrText(last), { bold: true, fill: f || PALE, align: center });
      r++;
    };
    footRow(d.student ? 'Punteggio massimo esercizio' : 'Punteggio esercizio', d.cols.map(c => U.fmt(c.peso)), U.fmt(d.totManual));
    if (d.student) footRow('Punteggio ottenuto', d.cols.map(c => c.nonSvolto ? 'N.S.' : U.fmt(c.punti)), U.fmt(d.res.manuale));
    const spanRow = (label, text, last, f) => {
      ws.mergeCells(r, 1, r, 5); set(r, 1, label, { bold: true, fill: f });
      for (let c = 2; c <= 5; c++) set(r, c, null, { fill: f });
      if (last === undefined) {
        ws.mergeCells(r, 6, r, lastCol); set(r, 6, text, { bold: true, fill: f, align: center });
        for (let c = 7; c <= lastCol; c++) set(r, c, null, { fill: f });
      } else {
        if (n > 1) ws.mergeCells(r, 6, r, 5 + n);
        set(r, 6, text, { fill: f });
        for (let c = 7; c <= 5 + n; c++) set(r, c, null, { fill: f });
        set(r, lastCol, last, { bold: true, fill: f, align: center });
      }
      r++;
    };
    if (d.closedLine) spanRow(d.closedLine.label, d.closedLine.text, d.closedLine.value, PALE);
    spanRow('PUNTEGGIO TOTALE', '', d.total, BLUE);
    spanRow('VOTO', d.voto, undefined, BLUE);
    if (d.note) { r++; ws.mergeCells(r, 1, r, lastCol); ws.getCell(r, 1).value = d.note; ws.getCell(r, 1).font = { italic: true, size: 9 }; r++; }
    if (d.info) {
      r++;
      d.info.forEach(([k, v]) => {
        ws.getCell(r, 1).value = k; ws.getCell(r, 1).font = { bold: true };
        ws.mergeCells(r, 2, r, 4); ws.getCell(r, 2).value = v;
        r++;
      });
    }
    return ws;
  },

  async xlsxBlob(build) {
    const ExcelJS = await Libs.excel();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Griglie di valutazione';
    build(wb);
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
};

/* ---------------------------------------------------------------------
 * Riepilogo della classe
 * ------------------------------------------------------------------- */
const Summary = {
  /** Tutti gli esercizi che compaiono in almeno una versione usata. */
  columns(s) {
    const t = s.template;
    const seen = new Map();
    t.esercizi.forEach(e => seen.set(e.id, e.nome));
    t.versioni.forEach(v => v.aggiunti.forEach(e => { if (s.studenti.some(st => st.versione === v.id)) seen.set(e.id, e.nome + ' (' + v.nome + ')'); }));
    return [...seen.entries()].map(([id, nome]) => ({ id, nome }));
  },

  rows(s) {
    const t = s.template;
    return [...s.studenti].sort(U.compareStudents).map(st => {
      if (st.assente) return { st, assente: true };
      return { st, res: Calc.score(t, st.versione, st) };
    });
  },

  async xlsx(s, withStudents) {
    const t = s.template;
    const cols = Summary.columns(s);
    const rows = Summary.rows(s);
    const hasClosed = t.chiuse.attive && t.chiuse.domande.length;
    return Grid.xlsxBlob(wb => {
      const used = new Set();
      const ws = wb.addWorksheet(Grid.sheetName('Riepilogo', used));
      const header = ['Cognome', 'Nome', 'Data', 'Versione', ...cols.map(c => c.nome)];
      if (hasClosed) header.push('Domande chiuse');
      header.push('Punteggio', 'Su', 'Voto', 'Voto arrotondato', 'Stato');
      ws.addRow([Model.templateTitle(t) + ' — classe ' + (s.classe || '')]).font = { bold: true, size: 12 };
      const hr = ws.addRow(header);
      hr.font = { bold: true };
      hr.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFE7F3' } }; });
      rows.forEach(({ st, res, assente }) => {
        const line = [st.cognome, st.nome, U.dateIT(st.data || s.data), Model.versionName(t, st.versione)];
        if (assente) {
          cols.forEach(() => line.push(''));
          if (hasClosed) line.push('');
          line.push('', '', '', '', 'Assente');
        } else {
          cols.forEach(c => {
            const x = res.esercizi[c.id];
            line.push(!x ? '-' : x.nonSvolto ? 'N.S.' : U.round(x.punti, 2));
          });
          if (hasClosed) line.push(U.round(res.chiuse, 2));
          line.push(U.round(res.totale, 2), U.round(res.max, 2), U.round(res.voto, 2), res.votoArr, res.completo ? 'Completa' : 'Incompleta');
        }
        ws.addRow(line);
      });
      ws.columns.forEach((c, i) => { c.width = i < 2 ? 18 : i < 4 ? 12 : 10; });
      ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
      if (withStudents) {
        rows.filter(r => !r.assente).forEach(({ st }) => {
          Grid.xlsxSheet(wb, Grid.sheetName(U.studentName(st), used), Grid.data(t, st.versione, st, s));
        });
      }
    });
  },

  async pdf(s) {
    const jsPDF = await Libs.pdf();
    const t = s.template;
    const cols = Summary.columns(s);
    const hasClosed = t.chiuse.attive && t.chiuse.domande.length;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Riepilogo — ' + Model.templateTitle(t) + ' — classe ' + (s.classe || ''), 10, 12);
    const head = [['Studente', 'Data', 'Versione', ...cols.map(c => c.nome), ...(hasClosed ? ['Chiuse'] : []), 'Punteggio', 'Voto', 'Arr.']];
    const body = Summary.rows(s).map(({ st, res, assente }) => {
      if (assente) return [U.studentName(st), U.dateIT(st.data || s.data), Model.versionName(t, st.versione), { content: 'Assente', colSpan: cols.length + (hasClosed ? 1 : 0) + 3, styles: { halign: 'center', textColor: [150, 150, 150] } }];
      return [
        U.studentName(st), U.dateIT(st.data || s.data), Model.versionName(t, st.versione),
        ...cols.map(c => { const x = res.esercizi[c.id]; return !x ? '-' : x.nonSvolto ? 'N.S.' : U.fmt(x.punti); }),
        ...(hasClosed ? [U.fmt(res.chiuse)] : []),
        U.fmt(res.totale) + '/' + U.fmt(res.max), U.fmtFixed(res.voto, 2), U.fmt(res.votoArr, 1)
      ];
    });
    doc.autoTable({ head, body, startY: 16, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.2, halign: 'center' }, columnStyles: { 0: { halign: 'left', cellWidth: 40 } }, headStyles: { fillColor: [223, 231, 243], textColor: [17, 17, 17] } });
    return doc.output('blob');
  }
};
