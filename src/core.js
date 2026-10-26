/* =====================================================================
 * core.js — utilità e motore di calcolo delle griglie
 * ===================================================================== */

const U = {
  uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  },
  clone(o) { return JSON.parse(JSON.stringify(o)); },
  sum(arr, f) { return arr.reduce((s, x) => s + (f ? f(x) : x), 0); },
  /** Converte input (anche "14,5") in numero, oppure null. */
  num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  },
  round(n, d) {
    const f = Math.pow(10, d === undefined ? 2 : d);
    return Math.round((n + Number.EPSILON) * f) / f;
  },
  clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); },
  /** Formato italiano con al massimo d decimali (8,75 — 9 — 7,5). */
  fmt(n, d) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '';
    return U.round(n, d === undefined ? 2 : d).toLocaleString('it-IT', { maximumFractionDigits: d === undefined ? 2 : d, useGrouping: false });
  },
  /** Formato italiano con esattamente d decimali (8,50). */
  fmtFixed(n, d) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '';
    return n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
  },
  todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  dateIT(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : iso;
  },
  /** Nome file sicuro. */
  safeName(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'senza nome'; },
  esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  /** Distribuisce `total` (intero) proporzionalmente a values, restituendo interi (metodo dei resti maggiori). */
  largestRemainder(values, total) {
    const floors = values.map(v => Math.floor(v));
    let rem = Math.round(total - U.sum(floors));
    const order = values.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; rem > 0 && order.length; k = (k + 1) % order.length, rem--) floors[order[k][1]]++;
    return floors;
  },
  studentName(s) { return ((s.cognome || '') + ' ' + (s.nome || '')).trim(); },
  compareStudents(a, b) {
    return (a.cognome || '').localeCompare(b.cognome || '', 'it') || (a.nome || '').localeCompare(b.nome || '', 'it');
  }
};

/* ---------------------------------------------------------------------
 * Modello dati
 * ------------------------------------------------------------------- */
const Model = {
  SCHEMA: 1,
  BES_TYPES: ['DSA', 'NAI', 'PEI'],

  /** Livelli dal più alto: `max` è la percentuale massima del livello (il più alto è sempre 100). */
  defaultLevels() {
    return [
      ['Eccellente', 100], ['Buono', 80], ['Sufficiente', 60], ['Insufficiente', 45], ['Gravemente insufficiente', 30]
    ].map(([nome, max]) => ({ id: U.uid('lv'), nome, max, descrittore: '' }));
  },

  /** Copia di una scala di livelli con nuovi id (i descrittori si mantengono se richiesto). */
  copyLevels(levels, keepDesc) {
    return levels.map(l => ({ id: U.uid('lv'), nome: l.nome, max: l.max, descrittore: keepDesc ? (l.descrittore || '') : '' }));
  },

  /** Converte i livelli del vecchio formato (percentuale minima) nel nuovo (percentuale massima). */
  migrateLevels(levels, descrittori) {
    const sorted = [...levels].sort((a, b) => (U.num(b.min) || 0) - (U.num(a.min) || 0));
    return sorted.map((l, i) => ({
      id: l.id, nome: l.nome,
      max: i === 0 ? 100 : Math.max(0, (U.num(sorted[i - 1].min) || 0) - 1),
      descrittore: (descrittori || {})[l.id] || ''
    }));
  },

  newTemplate() {
    const now = new Date().toISOString();
    return {
      schema: Model.SCHEMA, tipo: 'template', id: U.uid('tpl'),
      materia: '', argomento: '', intestazione: '', descrizione: '',
      votoMin: 2,
      votoModo: 'soglia',
      distribuzione: 'proporzionale',
      notaPiede: 'La valutazione fa riferimento all’eventuale PDP/PEI redatto dal consiglio di classe.',
      notaPiedeQuando: 'bes',
      livelli: Model.defaultLevels(),
      indicatori: [],
      esercizi: [],
      // singole: quante domande a risposta singola (DS) e quanto vale ciascuna;
      // domande: le domande a risposta multipla (DM), ognuna con nome, parti e punti
      chiuse: { attive: false, singole: { numero: 0, punti: 1 }, domande: [], errata: 0, nonData: 0, minimoZero: true },
      versioni: [],
      creato: now, modificato: now
    };
  },

  newIndicator(t) {
    return { id: U.uid('ind'), nome: '', max: 20, livelli: Model.copyLevels(t.livelli, false) };
  },

  newExercise(t, list) {
    const n = (list || t.esercizi).length + 1;
    return { id: U.uid('es'), nome: 'DV' + n, testo: '', indicatori: t.indicatori.map(i => i.id), bias: 0 };
  },

  /*
   * Nomi automatici: DV = domande da valutare, DS = chiuse a risposta singola,
   * DM = chiuse a risposta multipla. Si rinumerano solo i nomi automatici
   * (anche quelli delle versioni precedenti: "Es 3", "D5"); quelli scelti a mano restano.
   */
  AUTO_DV: /^(Es ?|DV)\d+$/i,
  AUTO_CLOSED: /^(D|DS|DM)\d+$/i,

  renumber(t) {
    let k = 0;
    t.esercizi.forEach(e => { k++; if (Model.AUTO_DV.test(String(e.nome).trim())) e.nome = 'DV' + k; });
    (t.versioni || []).forEach(v => {
      let j = k;
      (v.aggiunti || []).forEach(e => { j++; if (Model.AUTO_DV.test(String(e.nome).trim())) e.nome = 'DV' + j; });
    });
    // le multiple aggiunte in una versione continuano la numerazione di quelle della verifica base
    let m = 0;
    ((t.chiuse && t.chiuse.domande) || []).forEach(q => { m++; if (Model.AUTO_CLOSED.test(String(q.nome).trim())) q.nome = 'DM' + m; });
    (t.versioni || []).forEach(v => {
      let j = m;
      (v.chiuseAggiunte || []).forEach(q => { j++; if (Model.AUTO_CLOSED.test(String(q.nome).trim())) q.nome = 'DM' + j; });
    });
    return t;
  },

  newMultiple() { return { id: U.uid('q'), nome: 'DM0', tipo: 'composta', parti: 4, punti: 4 }; },

  /**
   * Converte le domande chiuse del formato precedente (ogni risposta singola elencata con
   * il suo nome) nel formato attuale: numero di singole + punti, e solo le multiple in elenco.
   * Restituisce gli id delle singole eliminate (servono per convertire le valutazioni).
   */
  migrateClosed(chiuse) {
    const isMulti = q => q.tipo === 'composta' || q.tipo === 'associazione';
    const old = (chiuse.domande || []).filter(q => !isMulti(q));
    if (!old.length) return [];
    if (!chiuse.singole || !chiuse.singole.numero) {
      chiuse.singole = { numero: old.length, punti: U.num(old[0].punti) || 0 };
    }
    chiuse.domande = chiuse.domande.filter(isMulti);
    return old.map(q => q.id);
  },

  newVersion(tipo) {
    return {
      id: U.uid('ver'), nome: tipo === 'ALTRO' ? 'Personalizzata' : tipo, tipo, esclusi: [], testi: {}, adj: {}, aggiunti: [],
      chiuseSingole: null,   // numero di risposte singole in questa versione (null = come la verifica base)
      chiuseEscluse: [],     // risposte multiple della verifica base non incluse
      chiuseAggiunte: []     // risposte multiple solo di questa versione
    };
  },

  newSession(template, templateFileId) {
    const now = new Date().toISOString();
    return {
      schema: Model.SCHEMA, tipo: 'sessione', id: U.uid('ses'),
      template: U.clone(template), templateFileId: templateFileId || null,
      classe: '', data: U.todayISO(), studenti: [],
      creato: now, modificato: now
    };
  },

  newStudent(cognome, nome, versione) {
    return { id: U.uid('stu'), cognome: cognome || '', nome: nome || '', bes: '', versione: versione || 'std', data: '', assente: false, punteggi: {}, nonSvolti: {}, chiuse: {}, chiuseConteggi: {}, chiuseParziali: {}, note: '' };
  },

  /** Rende coerente un oggetto caricato da file (campi mancanti, schemi futuri). */
  normalizeTemplate(t) {
    const base = Model.newTemplate();
    const out = Object.assign(base, t);
    out.chiuse = Object.assign(Model.newTemplate().chiuse, U.clone(t.chiuse || {}));
    const oldSingle = Model.migrateClosed(out.chiuse);
    out.versioni = (t.versioni || []).map(v => {
      const nv = Object.assign(Model.newVersion(v.tipo || 'ALTRO'), U.clone(v));
      // formato precedente: le singole escluse in una versione diventano un numero minore
      if (oldSingle.length && nv.chiuseSingole == null) {
        const tolte = (nv.chiuseEscluse || []).filter(id => oldSingle.includes(id)).length;
        if (tolte) nv.chiuseSingole = Math.max(0, oldSingle.length - tolte);
      }
      nv.chiuseEscluse = (nv.chiuseEscluse || []).filter(id => !oldSingle.includes(id));
      return nv;
    });
    delete out.totale; // il totale ora si ricava dagli indicatori e dalle domande chiuse
    const oldFormat = l => l && l.length && l[0].min !== undefined && l[0].max === undefined;
    const tplLevels = t.livelli && t.livelli.length ? t.livelli : Model.defaultLevels();
    out.livelli = oldFormat(tplLevels) ? Model.migrateLevels(tplLevels) : tplLevels;
    out.indicatori = (t.indicatori || []).map(i => {
      const ind = Object.assign({}, i);
      if (!ind.livelli || !ind.livelli.length) {
        ind.livelli = oldFormat(tplLevels) ? Model.migrateLevels(tplLevels, i.descrittori) : Model.copyLevels(out.livelli, false);
      }
      delete ind.descrittori;
      ind.livelli = Calc.sortedLevels(ind.livelli);
      ind.livelli[0].max = 100;
      return ind;
    });
    out.esercizi = (t.esercizi || []).map(e => Object.assign({ testo: '', indicatori: [], bias: 0 }, e));
    return Model.renumber(out);
  },

  normalizeSession(s) {
    const out = Object.assign(Model.newSession(Model.newTemplate()), s);
    // formato precedente: risposte singole segnate una per una -> conteggi
    const isMulti = q => q.tipo === 'composta' || q.tipo === 'associazione';
    const oldSingle = (((s.template || {}).chiuse || {}).domande || []).filter(q => !isMulti(q)).map(q => q.id);
    out.template = Model.normalizeTemplate(s.template || {});
    out.studenti = (s.studenti || []).map(st => {
      const r = Object.assign(Model.newStudent(), st);
      const k = r.chiuseConteggi || {};
      if (oldSingle.length && k.C == null && k.E == null && k.N == null && r.chiuse && Object.keys(r.chiuse).length) {
        const c = { C: 0, E: 0, N: 0 };
        oldSingle.forEach(id => { const a = r.chiuse[id]; if (c[a] !== undefined) c[a]++; });
        r.chiuseConteggi = c;
      }
      return r;
    });
    return out;
  },

  /** Associa il valore della colonna BES a una versione del template. */
  versionForBes(t, bes) {
    const b = String(bes || '').trim().toUpperCase();
    if (!b || b === 'NO' || b === 'STANDARD') return 'std';
    const v = t.versioni.find(x => x.tipo === b) || t.versioni.find(x => x.nome.toUpperCase() === b);
    return v ? v.id : 'std';
  },

  versionName(t, vId) {
    if (!vId || vId === 'std') return 'Standard';
    const v = t.versioni.find(x => x.id === vId);
    return v ? v.nome : 'Standard';
  },

  templateTitle(t) {
    return [t.materia, t.argomento].filter(Boolean).join(' — ') || 'Verifica senza titolo';
  },

  templateFileName(t) { return U.safeName(Model.templateTitle(t)) + '.json'; },

  /** Data per i nomi dei file: gg-mm-aaaa (la barra non è ammessa nei nomi). */
  fileDate(iso) { return U.dateIT(iso).replace(/\//g, '-'); },

  testName(t) { return t.argomento || t.materia || 'verifica'; },

  /** Export di uno studente: "Cognome Nome - Classe - Data - Verifica". */
  studentFileBase(s, st) {
    return U.safeName([U.studentName(st) || 'studente', s.classe, Model.fileDate(st.data || s.data), Model.testName(s.template)].filter(Boolean).join(' - '));
  },

  /** Export di tutta la classe: "Classe - Data - Verifica". */
  classFileBase(s) {
    return U.safeName([s.classe || 'classe', Model.fileDate(s.data), Model.testName(s.template)].filter(Boolean).join(' - '));
  },

  sessionFileName(s) {
    return U.safeName([s.classe || 'classe', s.template.argomento || s.template.materia, s.data].filter(Boolean).join(' - ')) + '.json';
  }
};

/* ---------------------------------------------------------------------
 * Motore di calcolo
 *
 * Ogni esercizio i ha un peso intero w_i (punti). Ogni casella
 * (esercizio i, indicatore j) riceve una quota p_ij di quel peso.
 * Il punteggio di un esercizio è la somma per riga, quello di un
 * indicatore la somma per colonna: entrambe partono dalla stessa
 * matrice, quindi i totali coincidono sempre.
 * ------------------------------------------------------------------- */
const Calc = {
  indicator(t, id) { return t.indicatori.find(i => i.id === id); },

  /** Livelli dal più alto al più basso; il primo vale sempre fino al 100 %. */
  sortedLevels(levels) {
    return [...(levels || [])].sort((a, b) => (U.num(b.max) || 0) - (U.num(a.max) || 0));
  },

  /**
   * Fasce di punteggio di ogni livello per un indicatore di massimo `max` (dal più alto), anche decimali.
   * Un livello arriva fino a max% × massimo (incluso) e parte appena sopra il limite del livello inferiore;
   * il livello più basso parte da 0 (incluso). Es. su 15 punti: Insufficiente "> 4,5 – 6,75".
   */
  levelRanges(levels, max) {
    const sorted = Calc.sortedLevels(levels);
    const tos = sorted.map((l, i) => i === 0 ? max : U.round((U.num(l.max) || 0) / 100 * max, 2));
    return sorted.map((l, i) => {
      const last = i === sorted.length - 1;
      const from = last ? 0 : tos[i + 1];
      return { level: l, from, to: tos[i], fromIncluded: last, empty: last ? tos[i] < 0 : tos[i] <= from };
    });
  },

  /** Etichetta di una fascia: "0 – 4,5" per la più bassa, "> 4,5 – 6,75" per le altre. */
  rangeLabel(r) {
    if (r.empty) return '–';
    return (r.fromIncluded ? '' : '> ') + U.fmt(r.from) + ' – ' + U.fmt(r.to);
  },

  /** Problemi di una scala di livelli (percentuali non decrescenti, livelli vuoti). */
  levelIssues(levels, max) {
    const issues = [];
    const sorted = Calc.sortedLevels(levels);
    const name = l => '«' + (l.nome || 'livello senza nome') + '»';
    sorted.forEach((l, i) => { if (i > 0 && (U.num(l.max) || 0) >= 100) issues.push(name(l) + ': solo il livello più alto può arrivare al 100 %.'); });
    Calc.levelRanges(levels, max).forEach(r => { if (r.empty) issues.push(name(r.level) + ' non contiene nessun punteggio su ' + max + '.'); });
    return issues;
  },

  /** Voto in decimi: lineare sul punteggio, con voto minimo (soglia o scala dal minimo). */
  voto(t, totale, maxTot) {
    if (!(maxTot > 0)) return 0;
    const min = U.clamp(U.num(t.votoMin) || 0, 0, 10);
    const ratio = U.clamp(totale / maxTot, 0, 1);
    const v = t.votoModo === 'lineare' ? min + ratio * (10 - min) : Math.max(min, ratio * 10);
    return U.round(v, 2);
  },

  votoRule(t, maxTot) {
    const min = U.num(t.votoMin) || 0;
    const T = U.fmt(maxTot);
    if (!min) return 'punteggio / ' + T + ' × 10, arrotondato al mezzo voto';
    if (t.votoModo === 'lineare') return U.fmt(min) + ' + punteggio / ' + T + ' × ' + U.fmt(10 - min) + ', arrotondato al mezzo voto';
    return 'punteggio / ' + T + ' × 10 (minimo ' + U.fmt(min) + '), arrotondato al mezzo voto';
  },

  levelOf(levels, max, score) {
    if (score === null || score === undefined) return null;
    const ranges = Calc.levelRanges(levels, max);
    const r = ranges.find(x => !x.empty && (x.fromIncluded ? score >= x.from : score > x.from)) || ranges[ranges.length - 1];
    return r ? r.level : null;
  },

  version(t, vId) {
    if (!vId || vId === 'std') return null;
    return t.versioni.find(v => v.id === vId) || null;
  },

  /**
   * Domande chiuse incluse nella versione: ognuna vale i suoi punti, il blocco vale la loro somma.
   * singole: corretta / errata / non data; composte: risposte con più parti (associazioni,
   * cloze, completamenti…), con punteggio parziale proporzionale alle parti corrette.
   */
  closed(t, vId) {
    const c = t.chiuse;
    if (!c.attive) return { items: [], singole: [], composte: [], max: 0, all: 0, uniform: true };
    const v = Calc.version(t, vId);
    const val = U.num(c.singole && c.singole.punti) || 0;
    const nBase = Math.max(0, Math.round(U.num(c.singole && c.singole.numero) || 0));
    const n = v && v.chiuseSingole != null ? Math.max(0, Math.round(U.num(v.chiuseSingole) || 0)) : nBase;
    // le singole non hanno un nome proprio: si contano soltanto (DS1..DSn)
    const singole = Array.from({ length: n }, (_, k) => ({ id: 'ds' + (k + 1), nome: 'DS' + (k + 1), tipo: 'singola', valore: val }));
    const multi = q => Object.assign({}, q, { valore: U.num(q.punti) || 0, tipo: 'composta', parti: Calc.partsOf(q) });
    const composte = c.domande.filter(q => !v || !v.chiuseEscluse.includes(q.id)).map(multi)
      .concat(v ? (v.chiuseAggiunte || []).map(multi) : []);
    const items = singole.concat(composte);
    const all = nBase * val + U.sum(c.domande, q => U.num(q.punti) || 0);
    return { items, singole, composte, max: U.sum(items, q => q.valore), all, uniform: true };
  },

  /** Domanda a risposta composta ('associazione' è il nome usato nelle prime versioni dell'app). */
  isComposite(q) { return q.tipo === 'composta' || q.tipo === 'associazione'; },

  partsOf(q) { return Math.max(1, Math.round(U.num(q.parti != null ? q.parti : q.coppie) || 1)); },

  /**
   * Conteggi corrette / errate / non date delle domande a risposta singola.
   * Usa i numeri inseriti (chiuseConteggi); per le valutazioni salvate prima, li ricava
   * dalle risposte segnate domanda per domanda.
   */
  closedCounts(rec, C) {
    const k = rec.chiuseConteggi;
    if (C.uniform && k && (k.C != null || k.E != null || k.N != null)) {
      return { C: U.num(k.C) || 0, E: U.num(k.E) || 0, N: U.num(k.N) || 0 };
    }
    const out = { C: 0, E: 0, N: 0 };
    C.singole.forEach(q => { const a = rec.chiuse ? rec.chiuse[q.id] : null; if (out[a] !== undefined) out[a]++; });
    return out;
  },

  /** Parti corrette inserite per una domanda a risposta composta (null se non inserite). */
  partialValue(rec, q) {
    const src = rec.chiuseParziali && rec.chiuseParziali[q.id] != null ? rec.chiuseParziali : rec.chiuseAssoc;
    const x = U.num(src ? src[q.id] : null);
    return x === null ? null : U.clamp(x, 0, q.parti);
  },

  /** Punti degli esercizi valutati con la griglia in una versione. */
  manualTotal(t, vId) {
    const w = Calc.weights(t, vId);
    return U.sum(Calc.exercises(t, vId), e => w[e.id] || 0);
  },

  /** Punteggio totale di una versione: esercizi + domande chiuse (non è un valore fisso). */
  total(t, vId) { return Calc.manualTotal(t, vId) + Calc.closed(t, vId).max; },

  /** Esercizi di una versione (testi personalizzati applicati). */
  exercises(t, vId) {
    const v = Calc.version(t, vId);
    let list = t.esercizi
      .filter(e => !v || !v.esclusi.includes(e.id))
      .map(e => Object.assign({}, e, { testo: v && v.testi[e.id] ? v.testi[e.id] : e.testo, aggiunto: false }));
    if (v) list = list.concat(v.aggiunti.map(e => Object.assign({}, e, { aggiunto: true })));
    return list;
  },

  validIndicators(t, ex) { return ex.indicatori.filter(id => Calc.indicator(t, id)); },

  /** Quanti esercizi della lista coprono ciascun indicatore. */
  coverage(t, list) {
    const c = {};
    list.forEach(e => Calc.validIndicators(t, e).forEach(id => { c[id] = (c[id] || 0) + 1; }));
    return c;
  },

  /**
   * Quota di ogni indicatore dentro un esercizio: il punteggio dell'indicatore
   * si divide in parti uguali tra gli esercizi che lo coprono.
   */
  shares(t, ex, cov) {
    const out = {};
    Calc.validIndicators(t, ex).forEach(id => {
      out[id] = (U.num(Calc.indicator(t, id).max) || 0) / Math.max(1, cov[id] || 0);
    });
    return out;
  },

  /** "Grezzo" di un esercizio: somma delle quote degli indicatori che copre. */
  raw(t, ex, cov) { return U.sum(Object.values(Calc.shares(t, ex, cov || Calc.coverage(t, t.esercizi)))); },

  /**
   * Pesi della versione standard. Il grezzo di ogni esercizio (somma delle quote degli indicatori)
   * viene arrotondato a interi con il metodo dei resti maggiori, così la somma resta uguale alla
   * somma dei massimi degli indicatori; poi si aggiunge la correzione (bias).
   */
  standardWeights(t) {
    const cov = Calc.coverage(t, t.esercizi);
    const raws = t.esercizi.map(e => Calc.raw(t, e, cov));
    const R = U.sum(raws);
    const bases = U.largestRemainder(raws, Math.round(R));
    const out = {};
    t.esercizi.forEach((e, i) => {
      const bias = U.num(e.bias) || 0;
      out[e.id] = { raw: raws[i], base: bases[i], bias, peso: Math.max(0, bases[i] + bias) };
    });
    return { rows: out, R, cov, biasSum: U.sum(t.esercizi, e => U.num(e.bias) || 0) };
  },

  /**
   * Pesi finali di una versione: { exId: peso }.
   * Nelle versioni ogni esercizio mantiene il punteggio che ha nella standard (più l'eventuale
   * correzione della versione): il totale della versione è la somma di ciò che contiene.
   */
  weights(t, vId) {
    const std = Calc.standardWeights(t);
    const v = Calc.version(t, vId);
    const out = {};
    if (!v) {
      Object.keys(std.rows).forEach(id => { out[id] = std.rows[id].peso; });
      return out;
    }
    Calc.exercises(t, vId).forEach(e => {
      const base = e.aggiunto
        ? Math.max(0, Math.round(Calc.raw(t, e, std.cov)) + (U.num(e.bias) || 0))
        : (std.rows[e.id] ? std.rows[e.id].peso : 0);
      out[e.id] = Math.max(0, base + (U.num(v.adj[e.id]) || 0));
    });
    return out;
  },

  /** Matrice dei punti massimi per casella. */
  matrix(t, vId) {
    const exs = Calc.exercises(t, vId);
    const W = Calc.weights(t, vId);
    const usedIds = new Set();
    exs.forEach(e => Calc.validIndicators(t, e).forEach(id => usedIds.add(id)));
    const used = t.indicatori.filter(i => usedIds.has(i.id));
    // le quote degli indicatori si calcolano sulla verifica standard: togliere un esercizio
    // in una versione toglie anche la sua parte di indicatori
    const cov = Calc.coverage(t, t.esercizi);
    const nominal = {};
    used.forEach(i => { nominal[i.id] = 0; });
    const rows = exs.map(ex => {
      const sh = Calc.shares(t, ex, cov);
      const raw = U.sum(Object.values(sh));
      const cells = {};
      Object.keys(sh).forEach(id => {
        cells[id] = raw > 0 ? (W[ex.id] || 0) * sh[id] / raw : 0;
        nominal[id] += sh[id];
      });
      return { ex, peso: W[ex.id] || 0, cells };
    });
    const Tm = U.sum(rows, r => r.peso);

    if (t.distribuzione === 'bilanciata' && rows.length && used.length) {
      // Iterative proportional fitting: colonne verso il peso previsto (riscalato sul totale), righe fisse sul peso dell'esercizio
      const totNom = U.sum(used, i => nominal[i.id]);
      const target = {};
      used.forEach(i => { target[i.id] = totNom > 0 ? nominal[i.id] * Tm / totNom : 0; });
      for (let it = 0; it < 500; it++) {
        used.forEach(i => {
          const cs = U.sum(rows, r => r.cells[i.id] || 0);
          if (cs > 0) rows.forEach(r => { if (r.cells[i.id] !== undefined) r.cells[i.id] *= target[i.id] / cs; });
        });
        rows.forEach(r => {
          const rs = U.sum(Object.values(r.cells));
          if (rs > 0) Object.keys(r.cells).forEach(k => { r.cells[k] *= r.peso / rs; });
        });
      }
    }
    const eff = {};
    used.forEach(i => { eff[i.id] = U.sum(rows, r => r.cells[i.id] || 0); });
    return { rows, used, nominal, eff, Tm };
  },

  /** Calcola il risultato di uno studente. */
  score(t, vId, rec) {
    const M = Calc.matrix(t, vId);
    const C = Calc.closed(t, vId);
    const ex = {}, ind = {};
    M.used.forEach(i => { ind[i.id] = { punti: 0, max: M.eff[i.id], media: null }; });
    let complete = true, manual = 0, filledAny = false;

    M.rows.forEach(r => {
      const ns = !!(rec.nonSvolti && rec.nonSvolti[r.ex.id]);
      let pts = 0, filled = 0, n = 0;
      Object.keys(r.cells).forEach(indId => {
        n++;
        const max = U.num(Calc.indicator(t, indId).max) || 0;
        let s = ns ? 0 : U.num(rec.punteggi && rec.punteggi[r.ex.id] ? rec.punteggi[r.ex.id][indId] : null);
        if (s === null) s = 0; else filled++;
        s = U.clamp(s, 0, max);
        const c = max > 0 ? s / max * r.cells[indId] : 0;
        pts += c;
        ind[indId].punti += c;
      });
      const done = ns || filled === n;
      if (!done) complete = false;
      if (ns || filled) filledAny = true;
      ex[r.ex.id] = { punti: pts, max: r.peso, completo: done, nonSvolto: ns };
      manual += pts;
    });

    M.used.forEach(i => {
      const x = ind[i.id];
      x.media = x.max > 0 ? x.punti / x.max * (U.num(i.max) || 0) : null;
    });

    let closedPts = 0, closedAnswered = 0;
    const cnt = Calc.closedCounts(rec, C);
    if (C.uniform) {
      // tutte le domande a risposta singola valgono uguale: bastano i conteggi
      closedPts = cnt.C * (C.singole.length ? C.singole[0].valore : 0) + cnt.E * (U.num(t.chiuse.errata) || 0) + cnt.N * (U.num(t.chiuse.nonData) || 0);
      closedAnswered = cnt.C + cnt.E + cnt.N;
    } else {
      C.singole.forEach(q => {
        const a = rec.chiuse ? rec.chiuse[q.id] : null;
        if (a === 'C') closedPts += q.valore;
        else if (a === 'E') closedPts += U.num(t.chiuse.errata) || 0;
        else if (a === 'N') closedPts += U.num(t.chiuse.nonData) || 0;
        if (a) closedAnswered++;
      });
    }
    if (C.singole.length && closedAnswered !== C.singole.length) complete = false;
    let partialDone = 0;
    C.composte.forEach(q => {
      const x = Calc.partialValue(rec, q);
      if (x === null) { complete = false; return; }
      closedPts += q.valore * x / q.parti;
      partialDone++;
    });
    if (closedAnswered || partialDone) filledAny = true;
    if (t.chiuse.minimoZero) closedPts = Math.max(0, closedPts);

    const totale = manual + closedPts;
    const maxTot = M.Tm + C.max;
    const voto = Calc.voto(t, totale, maxTot);
    const votoArr = Math.round(voto * 2) / 2;
    return {
      matrix: M, closed: C, esercizi: ex, indicatori: ind,
      manuale: manual, chiuse: closedPts, chiuseConteggi: cnt, totale, max: maxTot,
      voto, votoArr, completo: complete, iniziato: filledAny
    };
  },

  /** Avvisi sulla configurazione di una versione. */
  warnings(t, vId) {
    const w = [];
    const std = Calc.standardWeights(t);
    if (std.biasSum) {
      w.push('Le correzioni sommano ' + (std.biasSum > 0 ? '+' : '') + U.fmt(std.biasSum) + ': le domande da valutare valgono ' + U.fmt(Math.round(std.R) + std.biasSum) +
        ' punti invece di ' + U.fmt(Math.round(std.R)) + ' (somma dei massimi degli indicatori) e il peso degli indicatori cambia di conseguenza.');
    }
    const exs = Calc.exercises(t, vId);
    exs.forEach(e => { if (!Calc.validIndicators(t, e).length) w.push('«' + (e.nome || 'Domanda') + '» non ha indicatori associati.'); });
    t.indicatori.forEach(i => Calc.levelIssues(i.livelli, U.num(i.max) || 0).forEach(x => w.push((i.nome || 'Indicatore') + ': ' + x)));
    if (t.distribuzione === 'bilanciata') {
      const M = Calc.matrix(t, vId);
      const totNom = U.sum(M.used, i => M.nominal[i.id]);
      const off = M.used.filter(i => totNom > 0 && Math.abs(M.eff[i.id] - M.nominal[i.id] * M.Tm / totNom) > 0.05);
      if (off.length) w.push('Con queste domande non è possibile rispettare esattamente il peso di: ' + off.map(i => i.nome).join(', ') + '.');
    }
    return w;
  }
};

if (typeof module !== 'undefined') module.exports = { U, Model, Calc };
