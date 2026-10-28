/* =====================================================================
 * moodle.js — importazione delle domande chiuse dal report "Valutazioni"
 * di un quiz Moodle (CSV o Excel)
 *
 * Colonne usate: Cognome, Nome e una colonna per domanda con il punteggio
 * massimo nell'intestazione ("D. 3 /1,00" in italiano, "Q. 3 /1.00" in inglese).
 * Nelle celle: punteggio ottenuto; "-" (o vuoto) = domanda non data.
 * ===================================================================== */

const Moodle = {
  /** Testo senza accenti, minuscolo, con spazi singoli: per confrontare i nomi. */
  key(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  },

  /** Valore di una cella: numero, oppure null se la domanda non è stata data o valutata. */
  value(v) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!s || s === '-' || s === '–') return null;
    return U.num(s);
  },

  /**
   * Righe del file -> { questions: [{ key, label, max, col }], records: [{ cognome, nome, values: { key: num|null } }] }.
   * Lancia un errore con un messaggio comprensibile se il file non è un report Valutazioni.
   */
  parse(rows) {
    rows = (rows || []).filter(r => r && r.some(c => String(c).trim()));
    const hi = rows.findIndex(r => r.some(c => /^(cognome|surname|last name)$/i.test(String(c).trim())));
    if (hi < 0) throw new Error('Non trovo la colonna «Cognome»: serve il report «Valutazioni» del quiz scaricato da Moodle.');
    const head = rows[hi].map(c => String(c).trim());
    const iC = head.findIndex(h => /^(cognome|surname|last name)$/i.test(h));
    const iN = head.findIndex(h => /^(nome|first name|firstname)$/i.test(h));
    const questions = [];
    head.forEach((h, col) => {
      const m = /^(?:d|q|domanda|question)\.?\s*(\d+)\s*\/\s*([\d.,]+)\s*$/i.exec(h);
      if (m) questions.push({ key: 'q' + m[1], label: 'D. ' + m[1], num: +m[1], max: U.num(m[2]) || 0, col });
    });
    if (!questions.length) throw new Error('Non trovo le colonne delle domande (es. «D. 1 /1,00»): nel report di Moodle va scelto di mostrare i punteggi delle singole domande.');
    const records = rows.slice(hi + 1).map(r => {
      const values = {};
      questions.forEach(q => { values[q.key] = Moodle.value(r[q.col]); });
      return { cognome: String(r[iC] || '').trim(), nome: iN >= 0 ? String(r[iN] || '').trim() : '', values };
    }).filter(r => r.cognome && !/^(media|overall|average)/i.test(Moodle.key(r.cognome)));
    return { questions, records };
  },

  /**
   * Proposta di abbinamento domande Moodle -> verifica: { qKey: 'DS' | idRispostaMultipla | '' }.
   * Le domande in cui qualcuno ha un punteggio parziale vanno alle multiple (in ordine), quelle senza
   * alcun punteggio (aperte non ancora valutate) su "Ignora", le altre alle singole.
   */
  suggest(t, parsed) {
    const multi = t.chiuse.domande.slice();
    const map = {};
    parsed.questions.forEach(q => {
      // nessun punteggio per nessuno: domanda aperta ancora da valutare ("Da valutare")
      if (parsed.records.length && parsed.records.every(r => r.values[q.key] === null)) { map[q.key] = ''; return; }
      const partial = parsed.records.some(r => { const v = r.values[q.key]; return v !== null && v > 1e-9 && v < q.max - 1e-9; });
      map[q.key] = partial && multi.length ? multi.shift().id : 'DS';
    });
    return map;
  },

  /** Abbina le righe di Moodle agli studenti della valutazione (cognome+nome, anche invertiti). */
  match(records, studenti) {
    const byName = new Map();
    studenti.forEach(st => {
      byName.set(Moodle.key(st.cognome + ' ' + st.nome), st.id);
      byName.set(Moodle.key(st.nome + ' ' + st.cognome), st.id);
    });
    return records.map(r => byName.get(Moodle.key(r.cognome + ' ' + r.nome)) || '');
  },

  /**
   * Applica i risultati. matches[i] = id dello studente per records[i] ('' = salta).
   * Restituisce { updated, warnings }.
   */
  apply(s, parsed, map, matches) {
    const t = s.template;
    let updated = 0;
    const warnings = [];
    parsed.records.forEach((r, i) => {
      const st = s.studenti.find(x => x.id === matches[i]);
      if (!st) return;
      const C = Calc.closed(t, st.versione);
      const cnt = { C: 0, E: 0, N: 0 };
      let nDS = 0;
      if (!st.chiuseParziali) st.chiuseParziali = {};
      parsed.questions.forEach(q => {
        const dest = map[q.key];
        const v = r.values[q.key];
        if (dest === 'DS') {
          nDS++;
          if (v === null) cnt.N++;
          else if (q.max > 0 && v >= q.max - 1e-9) cnt.C++;
          else cnt.E++;
        } else if (dest) {
          const dm = C.composte.find(x => x.id === dest);
          if (!dm) return; // risposta multipla non presente nella versione dello studente
          const frac = v === null || !(q.max > 0) ? 0 : U.clamp(v / q.max, 0, 1);
          st.chiuseParziali[dm.id] = Math.round(frac * dm.parti);
        }
      });
      if (nDS) st.chiuseConteggi = { C: cnt.C, E: cnt.E, N: cnt.N, Nauto: false };
      if (nDS && nDS !== C.singole.length) {
        warnings.push(U.studentName(st) + ': ' + nDS + ' risposte singole da Moodle, ma la sua versione ne prevede ' + C.singole.length + '.');
      }
      updated++;
    });
    return { updated, warnings };
  }
};
