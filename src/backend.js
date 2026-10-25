/* =====================================================================
 * backend.js — librerie esterne, elenchi classe e file locali (JSON, export)
 * ===================================================================== */

const Libs = {
  urls: {
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
    sheetjs: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  },
  loaded: {},
  load(name) {
    if (!this.loaded[name]) {
      this.loaded[name] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = this.urls[name];
        s.onload = resolve;
        s.onerror = () => { delete this.loaded[name]; reject(new Error('Impossibile caricare la libreria ' + name + ' (sei online?)')); };
        document.head.appendChild(s);
      });
    }
    return this.loaded[name];
  },
  async pdf() { await this.load('jspdf'); await this.load('autotable'); return window.jspdf.jsPDF; },
  async excel() { await this.load('exceljs'); return window.ExcelJS; },
  async sheet() { await this.load('sheetjs'); return window.XLSX; }
};

/* ---------------------------------------------------------------------
 * Elenchi classe: CSV / XLS(X) / ODS con colonne nome, cognome, BES
 * ------------------------------------------------------------------- */
const ClassList = {
  /** Nome classe dal nome file: "3P.csv" -> "3P". */
  classFromName(name) { return String(name || '').replace(/\.(csv|xlsx?|ods|txt)$/i, '').trim(); },

  parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const counts = { ';': (first.match(/;/g) || []).length, ',': (first.match(/,/g) || []).length, '\t': (first.match(/\t/g) || []).length };
    const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  },

  async parseFile(file) {
    if (/\.(csv|txt)$/i.test(file.name)) return ClassList.parseCSV(await file.text());
    const XLSX = await Libs.sheet();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  },

  /** Righe -> [{cognome, nome, bes}]. Riconosce le intestazioni; senza intestazione assume nome, cognome, BES. */
  toStudents(rows) {
    rows = (rows || []).filter(r => r && r.some(c => String(c).trim()));
    if (!rows.length) return [];
    const head = rows[0].map(c => String(c).trim().toLowerCase());
    let iN = head.findIndex(h => h === 'nome' || h === 'name');
    let iC = head.findIndex(h => h === 'cognome' || h === 'surname');
    let iB = head.findIndex(h => h === 'bes' || h.indexOf('bes') === 0 || h === 'tipologia' || h === 'versione');
    let body = rows;
    if (iN >= 0 || iC >= 0) body = rows.slice(1);
    else { iN = 0; iC = 1; iB = 2; }
    return body.map(r => ({
      nome: String(r[iN] || '').trim(),
      cognome: String(r[iC] || '').trim(),
      bes: iB >= 0 ? String(r[iB] || '').trim() : ''
    })).filter(s => s.nome || s.cognome);
  }
};

/* ---------------------------------------------------------------------
 * File locali: download e lettura
 * ------------------------------------------------------------------- */
const Files = {
  download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
  pickFile(accept) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept || '';
      inp.onchange = () => resolve(inp.files && inp.files[0] ? inp.files[0] : null);
      inp.click();
    });
  }
};
