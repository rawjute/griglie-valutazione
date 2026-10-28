/* =====================================================================
 * ui-session.js — valutazione di una classe
 * ===================================================================== */

function Session() {
  const s = S.ses;
  const t = s.template;
  const done = s.studenti.filter(st => !st.assente && Calc.score(t, st.versione, st).completo).length;
  const present = s.studenti.filter(st => !st.assente).length;
  const stateLabel = { idle: '', saved: 'JSON scaricato', pending: 'Modifiche non ancora scaricate in JSON' }[S.saveState] || '';
  const body = { classe: SClasse, correzione: SCorrezione, riepilogo: SRiepilogo }[S.sesTab];
  return html`<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Valutazione${s.classe ? ' · classe ' + s.classe : ''}</div>
        <h1>${Model.templateTitle(t)}</h1>
        <div class=${'muted small save-' + S.saveState}>${stateLabel}</div>
      </div>
      <div class="actions">
        <button class="btn primary" onClick=${saveSession}>Salva (scarica JSON)</button>
        <button class="btn" title="Apre la verifica nell'editor; i punteggi già inseriti restano" onClick=${editSessionTemplate}>Modifica verifica</button>
        ${t.chiuse.attive ? html`<button class="btn" title="Compila le domande chiuse dal report Valutazioni di un quiz Moodle (CSV o Excel)" onClick=${startMoodleImport}>Importa risposte Moodle</button>` : null}
      </div>
    </div>
    <${Tabs} value=${S.sesTab} onChange=${v => { S.sesTab = v; refresh(); }} items=${[
      { id: 'classe', label: 'Classe e studenti', badge: s.studenti.length || null },
      { id: 'correzione', label: 'Correzione', badge: present ? done + '/' + present : null },
      { id: 'riepilogo', label: 'Riepilogo ed export' }
    ]} />
    <div class="panel"><${body} s=${s} /></div>
    ${S.moodle ? html`<${MoodleImport} />` : null}
  </div>`;
}

/* ---------------- Classe e studenti ---------------- */
function SClasse({ s }) {
  const t = s.template;
  const vopts = versionOptions(t);

  const importRows = (rows, fileName) => {
    const list = ClassList.toStudents(rows);
    if (!list.length) { toast('Nessuno studente trovato nel file (servono le colonne nome, cognome, BES)', 'error'); return; }
    const key = x => (U.studentName(x)).toLowerCase();
    const existing = new Set(s.studenti.map(key));
    let added = 0;
    list.forEach(x => {
      if (existing.has(key(x))) return;
      const st = Model.newStudent(x.cognome, x.nome, Model.versionForBes(t, x.bes));
      st.bes = x.bes && x.bes.toLowerCase() !== 'no' ? x.bes.toUpperCase() : '';
      s.studenti.push(st); added++;
    });
    const cls = ClassList.classFromName(fileName);
    if (cls && !s.classe) s.classe = cls;
    changedSes();
    toast(added ? 'Aggiunti ' + added + ' studenti' : 'Tutti gli studenti erano già presenti');
  };

  const fromFile = async () => {
    const f = await Files.pickFile('.csv,.xlsx,.xls,.ods,.txt');
    if (!f) return;
    await withBusy('Leggo il file…', async () => importRows(await ClassList.parseFile(f), f.name));
  };

  const replaceTemplate = async obj => {
    if (!obj || obj.tipo !== 'template') { toast('Il file non è una verifica', 'error'); return; }
    if (obj.id !== t.id && !(await ask('Questa verifica ha un identificativo diverso: i punteggi già inseriti potrebbero non corrispondere. Continuare?', 'Continua'))) return;
    applyTemplateToSession(s, obj);
    toast('Verifica aggiornata');
  };

  return html`
    <div class="grid3">
      <${Field} label="Classe"><${TextInput} value=${s.classe} onInput=${v => { s.classe = v; changedSes(); }} /><//>
      <${Field} label="Data predefinita" hint="Vale per chi non ha una data propria.">
        <input type="date" value=${s.data} onInput=${e => { s.data = e.target.value; changedSes(); }} />
      <//>
      <div class="field"><span class="field-label">Verifica</span>
        <div class="row gap wrap">
          <span class="pill">${vopts.map(o => o.nome).join(' · ')}</span>
          <button class="btn small" title="Apre la verifica nell'editor; i punteggi già inseriti restano" onClick=${editSessionTemplate}>Modifica verifica</button>
          <button class="btn small" title="Se hai modificato la verifica dopo aver iniziato: i punteggi già inseriti restano"
            onClick=${async () => replaceTemplate(await importJSONFile())}>Sostituisci da JSON</button>
        </div>
      </div>
    </div>

    <div class="card row gap wrap">
      <b>Carica elenco studenti</b>
      <button class="btn" onClick=${fromFile}>Scegli file (CSV / Excel)</button>
      <span class="muted small">Colonne: nome, cognome, BES (vuoto o «no» = standard; DSA, NAI, PEI)</span>
    </div>

    ${s.studenti.length ? html`<div class="table-scroll"><table class="tbl compact">
      <thead><tr><th>#</th><th>Cognome</th><th>Nome</th><th>BES</th><th>Versione</th><th>Data</th><th>Assente</th><th></th></tr></thead>
      <tbody>${[...s.studenti].sort(U.compareStudents).map((st, i) => {
        const mismatch = st.bes && st.versione === 'std' && Model.versionForBes(t, st.bes) === 'std';
        return html`<tr key=${st.id} class=${st.assente ? 'dim' : ''}>
          <td class="muted">${i + 1}</td>
          <td><${TextInput} value=${st.cognome} onInput=${v => { st.cognome = v; changedSes(); }} /></td>
          <td><${TextInput} value=${st.nome} onInput=${v => { st.nome = v; changedSes(); }} /></td>
          <td>${st.bes ? html`<span class="tag">${st.bes}</span>` : null}</td>
          <td><select value=${st.versione} onChange=${e => { st.versione = e.target.value; changedSes(); }}>
            ${vopts.map(o => html`<option value=${o.id}>${o.nome}</option>`)}</select>
            ${mismatch ? html`<span class="warn-text small" title="Nella verifica non c'è una versione con questa tipologia"> nessuna versione ${st.bes}</span>` : null}</td>
          <td><input type="date" value=${st.data || ''} title="Lascia vuoto per usare la data predefinita" onInput=${e => { st.data = e.target.value; changedSes(); }} /></td>
          <td class="c"><input type="checkbox" checked=${st.assente} onChange=${e => { st.assente = e.target.checked; changedSes(); }} /></td>
          <td><${IconBtn} icon="✕" title="Elimina studente" onClick=${async () => {
            if (Calc.score(t, st.versione, st).iniziato && !(await ask('Lo studente ha già dei punteggi. Eliminarlo?', 'Elimina', true))) return;
            s.studenti = s.studenti.filter(x => x !== st); changedSes();
          }} /></td>
        </tr>`;
      })}</tbody>
    </table></div>` : html`<p class="empty">Nessuno studente: carica un elenco o aggiungili a mano.</p>`}
    <div class="row gap">
      <button class="btn" onClick=${() => { s.studenti.push(Model.newStudent('', '', 'std')); changedSes(); }}>+ Aggiungi studente</button>
      <span class="spacer"></span>
      ${s.studenti.length ? html`<button class="btn primary" onClick=${() => { S.sesTab = 'correzione'; refresh(); }}>Vai alla correzione →</button>` : null}
    </div>`;
}

/* ---------------- Correzione ---------------- */
function studentStatus(t, st) {
  if (st.assente) return { cls: 'absent', label: 'assente' };
  const r = Calc.score(t, st.versione, st);
  if (r.completo) return { cls: 'done', label: U.fmt(r.votoArr, 1), res: r };
  if (r.iniziato) return { cls: 'partial', label: 'in corso', res: r };
  return { cls: 'todo', label: 'da fare', res: r };
}

function SCorrezione({ s }) {
  const t = s.template;
  const sorted = [...s.studenti].sort(U.compareStudents);
  if (!sorted.length) return html`<p class="empty">Aggiungi prima gli studenti nella scheda «Classe e studenti».</p>`;
  let cur = s.studenti.find(x => x.id === S.cur);
  if (!cur) { cur = sorted.find(x => !x.assente) || sorted[0]; S.cur = cur.id; }
  const dates = [...new Set(sorted.map(st => st.data || s.data))];
  return html`<div class="eval-layout">
    <aside class="student-list">
      ${sorted.map(st => {
        const stt = studentStatus(t, st);
        return html`<button key=${st.id} class=${'student ' + (st.id === cur.id ? 'active ' : '') + stt.cls} onClick=${() => { S.cur = st.id; refresh(); }}>
          <span class="name">${U.studentName(st) || '(senza nome)'}</span>
          <span class="meta">${dates.length > 1 ? U.dateIT(st.data || s.data) + ' · ' : ''}${st.versione !== 'std' ? Model.versionName(t, st.versione) + ' · ' : ''}${stt.label}</span>
        </button>`;
      })}
    </aside>
    <${StudentEval} key=${cur.id} s=${s} st=${cur} sorted=${sorted} />
  </div>`;
}

function focusNext(e, dir) {
  const box = e.target.closest('.eval-main');
  const inputs = [...box.querySelectorAll('input[data-nav]')].sort((a, b) => a.dataset.nav - b.dataset.nav);
  const i = inputs.indexOf(e.target);
  const nx = inputs[i + dir];
  if (nx) { nx.focus(); }
}

/**
 * Domande chiuse in correzione.
 * - Risposta singola, tutte dello stesso valore: solo i numeri di corrette, errate e non date
 *   (le non date si completano da sole finché non le modifichi).
 * - Risposta singola con valori diversi: si segna ogni domanda.
 * - Risposta composta (associazioni, cloze…): per ogni domanda il numero di parti corrette.
 */
function ClosedBlock({ t, st, C, res, onKey }) {
  const n = C.singole.length;
  if (!st.chiuseConteggi) st.chiuseConteggi = {};
  if (!st.chiuseParziali) st.chiuseParziali = Object.assign({}, st.chiuseAssoc || {}); // nome usato nelle prime versioni
  delete st.chiuseAssoc;
  const P = st.chiuseParziali;
  const k = st.chiuseConteggi;
  const has = k.C != null || k.E != null || k.N != null;
  if (C.uniform && !has && st.chiuse && Object.keys(st.chiuse).length) Object.assign(k, Calc.closedCounts(st, C)); // valutazioni salvate prima
  const set = (field, v) => {
    k[field] = v === null ? null : Math.max(0, Math.round(v));
    if (field === 'N') k.Nauto = v === null;
    else if (k.Nauto !== false) k.N = (k.C == null && k.E == null) ? null : Math.max(0, n - (k.C || 0) - (k.E || 0));
    changedSes();
  };
  const sum = (k.C || 0) + (k.E || 0) + (k.N || 0);
  const fields = n ? [['C', 'Corrette', U.fmt(C.singole[0].valore) + ' pt'], ['E', 'Errate', U.fmt(U.num(t.chiuse.errata) || 0) + ' pt'], ['N', 'Non date', U.fmt(U.num(t.chiuse.nonData) || 0) + ' pt']] : [];
  const allCorrect = () => {
    if (C.uniform) st.chiuseConteggi = { C: n, E: 0, N: 0 };
    else C.singole.forEach(q => { st.chiuse[q.id] = 'C'; });
    C.composte.forEach(q => { P[q.id] = q.parti; });
    changedSes();
  };
  return html`<div class="card">
    <div class="row gap wrap"><h3 class="grow">Domande a risposta chiusa</h3>
      <button class="btn small" onClick=${allCorrect}>Tutte corrette</button>
      <button class="btn small" onClick=${() => { st.chiuseConteggi = {}; st.chiuse = {}; st.chiuseParziali = {}; changedSes(); }}>Azzera</button></div>

    ${n && C.uniform ? html`
      <div class="muted small">Risposta singola (DS): ${n} domande</div>
      <div class="row gap wrap closed-counts">
        ${fields.map(([f, label, hint], i) => html`<label class="field inline">
          <span class="field-label">${label}</span>
          <${NumInput} value=${k[f]} min=${0} max=${n} width="64px" nav=${100000 + i} onKeyDown=${onKey} onChange=${v => set(f, v)} />
          <span class="muted small">× ${hint}</span>
        </label>`)}
      </div>
      ${sum > n ? html`<div class="small bad">La somma (${sum}) supera il numero di domande (${n}).</div>`
        : sum < n && has ? html`<div class="small muted">Mancano ${n - sum} domande.</div>` : null}` : null}

    ${n && !C.uniform ? html`
      <div class="muted small">Risposta singola (DS): le domande hanno punteggi diversi, segna ciascuna.</div>
      <div class="closed-grid">${C.singole.map(q => html`<div class="closed-q">
        <span class="qn">${q.nome}</span>
        ${[['C', '✓', 'corretta'], ['E', '✗', 'errata'], ['N', '–', 'non data']].map(([kk, ic, lab]) => html`
          <button class=${'qbtn q' + kk + (st.chiuse[q.id] === kk ? ' on' : '')} title=${lab}
            onClick=${() => { if (st.chiuse[q.id] === kk) delete st.chiuse[q.id]; else st.chiuse[q.id] = kk; changedSes(); }}>${ic}</button>`)}
      </div>`)}</div>` : null}

    ${C.composte.length ? html`
      <div class="muted small">Risposta multipla (DM): inserisci quante parti sono corrette</div>
      <div class="row gap wrap closed-counts">
        ${C.composte.map((q, i) => {
          const x = Calc.partialValue(st, q);
          return html`<label class="field inline">
            <span class="field-label">${q.nome}</span>
            <${NumInput} value=${P[q.id]} min=${0} max=${q.parti} width="56px" nav=${100010 + i} onKeyDown=${onKey}
              onChange=${v => { if (v === null) delete P[q.id]; else P[q.id] = Math.round(v); changedSes(); }} />
            <span class="muted small">/ ${q.parti} · ${x === null ? U.fmt(q.valore) + ' pt' : U.fmt(q.valore * x / q.parti) + ' / ' + U.fmt(q.valore) + ' pt'}</span>
          </label>`;
        })}
      </div>` : null}

    <div class="small muted">Punti domande chiuse: ${U.fmt(res.chiuse)} / ${U.fmt(C.max)}</div>
  </div>`;
}

/**
 * Frecce nella griglia di correzione: su/giù cambiano indicatore, sinistra/destra esercizio.
 * Le caselle non previste (indicatore non coinvolto, esercizio N.S.) vengono saltate.
 * Sinistra/destra spostano solo se il cursore è già all'inizio/alla fine del numero
 * (o se il numero è tutto selezionato, come appena entri nella casella).
 */
function moveWithArrows(e, rows, cols) {
  const dir = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
  const el = e.target;
  if (!dir || el.dataset.r === undefined || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (dir[1]) {
    const len = el.value.length, a = el.selectionStart, b = el.selectionEnd;
    const all = a === 0 && b === len;
    if (dir[1] < 0 && !(all || b === 0)) return;
    if (dir[1] > 0 && !(all || a === len)) return;
  }
  e.preventDefault();
  const box = el.closest('.eval-main');
  let r = +el.dataset.r, c = +el.dataset.c;
  while (true) {
    r += dir[0]; c += dir[1];
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    const next = box.querySelector('input[data-r="' + r + '"][data-c="' + c + '"]');
    if (next) { next.focus(); return; }
  }
}

/** Classe colore di un livello (0 = il più alto); l'ultimo è sempre il rosso. */
function levelClass(count, rank) {
  return rank === count - 1 ? 'lvlow' : 'lv' + Math.min(rank, 3);
}

function StudentEval({ s, st, sorted }) {
  const t = s.template;
  const res = Calc.score(t, st.versione, st);
  const M = res.matrix;
  const C = res.closed;
  const others = sorted.filter(x => !x.assente || x.id === st.id);
  const pos = others.indexOf(st);
  const go = d => { const n = others[pos + d]; if (n) { S.cur = n.id; refresh(); } };
  const setScore = (exId, indId, v) => {
    st.punteggi[exId] = st.punteggi[exId] || {};
    if (v === null) delete st.punteggi[exId][indId]; else st.punteggi[exId][indId] = v;
    changedSes();
  };
  const fileBase = Model.studentFileBase(s, st);
  const nInd = M.used.length;
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); focusNext(e, e.shiftKey ? -1 : 1); return; }
    moveWithArrows(e, nInd, M.rows.length);
  };
  const [focus, setFocus] = useState(null);
  const [hover, setHover] = useState(null);

  // descrittore da mostrare: livello sotto il mouse, altrimenti quello del punteggio della casella attiva
  let hint = null;
  const hintFor = (ind, level) => {
    const ranges = Calc.levelRanges(ind.livelli, U.num(ind.max) || 0);
    const k = ranges.findIndex(r => r.level === level);
    return k < 0 ? null : { ind, range: ranges[k], cls: levelClass(ranges.length, k) };
  };
  if (hover) {
    const ind = t.indicatori.find(i => i.id === hover.indId);
    const level = ind && ind.livelli.find(l => l.id === hover.levelId);
    if (level) hint = hintFor(ind, level);
  } else if (focus) {
    const ind = t.indicatori.find(i => i.id === focus.indId);
    const v = ind && st.punteggi[focus.exId] ? U.num(st.punteggi[focus.exId][ind.id]) : null;
    if (v !== null) hint = hintFor(ind, Calc.levelOf(ind.livelli, U.num(ind.max) || 0, v));
  }

  return html`<section class="eval-main">
    <div class="row gap wrap eval-head">
      <button class="btn small" disabled=${pos <= 0} onClick=${() => go(-1)}>←</button>
      <h2 class="grow">${U.studentName(st) || '(senza nome)'}</h2>
      <label class="field inline"><span class="field-label">Versione</span>
        <select value=${st.versione} onChange=${e => { st.versione = e.target.value; changedSes(); }}>
          ${versionOptions(t).map(o => html`<option value=${o.id}>${o.nome}</option>`)}</select></label>
      <label class="field inline"><span class="field-label">Data</span>
        <input type="date" value=${st.data || s.data} onInput=${e => { st.data = e.target.value === s.data ? '' : e.target.value; changedSes(); }} /></label>
      <label class="check"><input type="checkbox" checked=${st.assente} onChange=${e => { st.assente = e.target.checked; changedSes(); }} /> Assente</label>
      <button class="btn small" disabled=${pos >= others.length - 1} onClick=${() => go(1)}>→</button>
    </div>

    ${st.assente ? html`<p class="empty">Studente assente. Togli la spunta quando recupera la verifica (puoi indicare una data diversa).</p>` : html`
    <p class="muted small">Inserisci il punteggio sulla scala di ogni indicatore. Con le frecce ti sposti tra le caselle; Invio passa alla successiva domanda per domanda, Maiusc+Invio torna indietro.</p>
    <div class="table-scroll">
    <table class="tbl eval">
      <thead>
        <tr><th>Indicatore</th>${M.rows.map(r => html`<th class="ex-head"><div>${r.ex.nome}</div><div class="muted small">${U.fmt(r.peso)} pt</div></th>`)}<th>Indicatore</th></tr>
        <tr class="sub"><th></th>${M.rows.map(r => html`<th><label class="check tiny" title="Domanda non svolta: tutti gli indicatori a 0">
          <input type="checkbox" checked=${!!st.nonSvolti[r.ex.id]} onChange=${e => { if (e.target.checked) st.nonSvolti[r.ex.id] = true; else delete st.nonSvolti[r.ex.id]; changedSes(); }} />N.S.</label></th>`)}<th></th></tr>
      </thead>
      <tbody>${M.used.map((ind, ri) => {
        const max = U.num(ind.max) || 0;
        const ir = res.indicatori[ind.id];
        const ranges = Calc.levelRanges(ind.livelli, max);
        // fascia della casella su cui stai scrivendo, evidenziata nella legenda della riga
        const focusVal = focus && focus.indId === ind.id && st.punteggi[focus.exId] ? U.num(st.punteggi[focus.exId][ind.id]) : null;
        const focusLv = focusVal === null ? null : Calc.levelOf(ind.livelli, max, focusVal);
        return html`<tr key=${ind.id} class=${focus && focus.indId === ind.id ? 'row-focus' : ''}>
          <th class="ind-name">
            <div>${ind.nome} <span class="muted small">(0 – ${max})</span></div>
            <ul class="bands">${ranges.map((r, k) => html`<li key=${r.level.id}
              onMouseEnter=${() => setHover({ indId: ind.id, levelId: r.level.id })} onMouseLeave=${() => setHover(null)}
              class=${'band ' + levelClass(ranges.length, k) + (focusLv === r.level ? ' active' : '') + (hover && hover.levelId === r.level.id && hover.indId === ind.id ? ' hover' : '')}>
              <span class="b-range">${Calc.rangeLabel(r)}</span><span class="b-name">${r.level.nome}</span>
            </li>`)}</ul>
          </th>
          ${M.rows.map((r, ci) => {
            if (r.cells[ind.id] === undefined) return html`<td class="off">–</td>`;
            if (st.nonSvolti[r.ex.id]) return html`<td class="ns">N.S.</td>`;
            const v = st.punteggi[r.ex.id] ? st.punteggi[r.ex.id][ind.id] : null;
            const lv = Calc.levelOf(ind.livelli, max, U.num(v));
            const rank = lv ? ranges.findIndex(x => x.level === lv) : -1;
            return html`<td class=${'cell ' + (rank >= 0 ? levelClass(ranges.length, rank) : '')}>
              <${NumInput} value=${v} min=${0} max=${max} nav=${ci * nInd + ri} row=${ri} col=${ci} onKeyDown=${onKey} onChange=${x => setScore(r.ex.id, ind.id, x)}
                onFocus=${() => setFocus({ exId: r.ex.id, indId: ind.id })} onBlur=${() => setFocus(null)} />
              <div class="lvname">${lv ? lv.nome : ''}</div>
            </td>`;
          })}
          <td class="c ind-res"><b>${U.fmt(ir.punti)}</b> / ${U.fmt(ir.max)}<div class="muted small">media ${U.fmt(ir.media)} / ${max}</div></td>
        </tr>`;
      })}</tbody>
      <tfoot><tr><th>Punti domanda</th>${M.rows.map(r => {
        const x = res.esercizi[r.ex.id];
        return html`<td class=${'c ' + (x.completo ? '' : 'muted')}><b>${U.fmt(x.punti)}</b> / ${U.fmt(x.max)}</td>`;
      })}<td class="c"><b>${U.fmt(res.manuale)}</b> / ${U.fmt(M.Tm)}</td></tr></tfoot>
    </table>
    </div>

    <div class=${'desc-bar ' + (hint ? hint.cls : 'empty')} aria-live="polite">
      ${hint ? html`
        <div class="desc-head">
          <span class="desc-ind">${hint.ind.nome}</span>
          <span class=${'desc-level ' + hint.cls}>${hint.range.level.nome || 'livello'}</span>
          <span class="muted">${Calc.rangeLabel(hint.range)}</span>
        </div>
        <div class="desc-text">${hint.range.level.descrittore || html`<span class="muted">Nessun descrittore per questo livello.</span>`}</div>`
      : html`<span class="muted">Passa sopra un livello o scrivi un punteggio per leggere il descrittore.</span>`}
    </div>

    ${C.items.length ? html`<${ClosedBlock} t=${t} st=${st} C=${C} res=${res} onKey=${onKey} />` : null}

    <div class="result-bar">
      <div><span class="muted">Domande</span><b>${U.fmt(res.manuale)}</b><span class="muted">/ ${U.fmt(M.Tm)}</span></div>
      ${C.items.length ? html`<div><span class="muted">Chiuse</span><b>${U.fmt(res.chiuse)}</b><span class="muted">/ ${U.fmt(C.max)}</span></div>` : null}
      <div><span class="muted">Totale</span><b>${U.fmt(res.totale)}</b><span class="muted">/ ${U.fmt(res.max)}</span></div>
      <div><span class="muted">Voto</span><b>${U.fmtFixed(res.voto, 2)}</b></div>
      <div class="big"><span class="muted">Arrotondato</span><b>${U.fmt(res.votoArr, 1)}</b></div>
      ${res.completo ? null : html`<div class="warn-text small">griglia incompleta</div>`}
    </div>

    <${Field} label="Note (solo per te, non esportate)"><${TextArea} rows="2" value=${st.note} onInput=${v => { st.note = v; changedSes(); }} /><//>

    <div class="row gap wrap">
      <button class="btn" onClick=${() => withBusy('Creo il PDF…', async () => deliver(await Grid.pdf([Grid.data(t, st.versione, st, s)]), fileBase + '.pdf'))}>PDF studente</button>
      <button class="btn" onClick=${() => withBusy('Creo l’Excel…', async () => deliver(await Grid.xlsxBlob(wb => Grid.xlsxSheet(wb, Grid.sheetName(U.studentName(st), new Set()), Grid.data(t, st.versione, st, s))), fileBase + '.xlsx'))}>XLSX studente</button>
    </div>
    `}
  </section>`;
}

/* ---------------- Riepilogo ---------------- */
function SRiepilogo({ s }) {
  const t = s.template;
  const cols = Summary.columns(s);
  const rows = Summary.rows(s);
  const valid = rows.filter(r => !r.assente && r.res.iniziato);
  const avg = valid.length ? U.sum(valid, r => r.res.voto) / valid.length : null;
  const suff = valid.filter(r => r.res.votoArr >= 6).length;
  const hasClosed = !!t.chiuse.attive;
  const base = Model.classFileBase(s);
  const present = rows.filter(r => !r.assente);
  const incomplete = present.filter(r => !r.res.completo).length;

  // un PDF per studente, tutti dentro un unico file ZIP (un solo download)
  const zipPdf = () => withBusy('Creo i PDF…', async () => {
    const JSZip = await Libs.zip();
    const zip = new JSZip();
    const used = new Set();
    for (const r of present) {
      let name = Model.studentFileBase(s, r.st);
      for (let k = 2; used.has(name.toLowerCase()); k++) name = Model.studentFileBase(s, r.st) + ' (' + k + ')';
      used.add(name.toLowerCase());
      zip.file(name + '.pdf', await Grid.pdf([Grid.data(t, r.st.versione, r.st, s)]));
    }
    deliver(await zip.generateAsync({ type: 'blob' }), base + ' - PDF studenti.zip');
  });

  return html`
    <div class="stats">
      <div><span class="muted">Valutati</span><b>${valid.length}</b></div>
      <div><span class="muted">Media voti</span><b>${avg === null ? '–' : U.fmtFixed(avg, 2)}</b></div>
      <div><span class="muted">Sufficienti</span><b>${suff}</b><span class="muted">/ ${valid.length}</span></div>
      <div><span class="muted">Assenti</span><b>${rows.length - present.length}</b></div>
    </div>
    ${incomplete ? html`<div class="alert warn">⚠ ${incomplete} griglie non sono complete.</div>` : null}
    <div class="row gap wrap">
      <button class="btn primary" onClick=${() => withBusy('Creo l’Excel…', async () => deliver(await Summary.xlsx(s, true), base + ' - griglie.xlsx'))}>XLSX riepilogo + griglie</button>
      <button class="btn" onClick=${() => withBusy('Creo il PDF…', async () => deliver(await Grid.pdf(present.map(r => Grid.data(t, r.st.versione, r.st, s))), base + ' - griglie.pdf'))}>PDF con tutte le griglie</button>
      <button class="btn" onClick=${zipPdf}>ZIP con un PDF per studente</button>
    </div>
    <div class="table-scroll">
    <table class="tbl compact summary">
      <thead><tr><th>Studente</th><th>Data</th><th>Versione</th>${cols.map(c => html`<th>${c.nome}</th>`)}${hasClosed ? html`<th>Chiuse</th>` : null}<th>Punteggio</th><th>Voto</th><th>Arr.</th></tr></thead>
      <tbody>${rows.map(({ st, res, assente }) => html`<tr key=${st.id} class=${assente ? 'dim' : ''} onClick=${() => { S.cur = st.id; S.sesTab = 'correzione'; refresh(); }} style="cursor:pointer">
        <td>${U.studentName(st)}</td><td>${U.dateIT(st.data || s.data)}</td><td>${Model.versionName(t, st.versione)}</td>
        ${assente ? html`<td colspan=${cols.length + (hasClosed ? 1 : 0) + 3} class="c muted">assente</td>` : html`
          ${cols.map(c => { const x = res.esercizi[c.id]; return html`<td class="c">${!x ? '–' : x.nonSvolto ? 'N.S.' : U.fmt(x.punti)}</td>`; })}
          ${hasClosed ? html`<td class="c">${U.fmt(res.chiuse)}</td>` : null}
          <td class="c">${U.fmt(res.totale)} / ${U.fmt(res.max)}</td>
          <td class="c">${U.fmtFixed(res.voto, 2)}</td>
          <td class=${'c strong ' + (res.votoArr >= 6 ? 'good' : 'bad')}>${U.fmt(res.votoArr, 1)}${res.completo ? '' : ' *'}</td>`}
      </tr>`)}</tbody>
    </table>
    </div>
    <p class="muted small">* griglia incompleta. Clic su una riga per aprire la correzione.</p>`;
}

/* ---------------- Importazione domande chiuse da Moodle ---------------- */
async function startMoodleImport() {
  const f = await Files.pickFile('.csv,.xlsx,.xls,.ods,.txt');
  if (!f) return;
  await withBusy('Leggo il file di Moodle…', async () => {
    const parsed = Moodle.parse(await ClassList.parseFile(f));
    const s = S.ses;
    S.moodle = { fileName: f.name, parsed, map: Moodle.suggest(s.template, parsed), matches: Moodle.match(parsed.records, s.studenti), result: null };
  });
}

function MoodleImport() {
  const m = S.moodle;
  const s = S.ses;
  const t = s.template;
  const close = () => { S.moodle = null; refresh(); };
  if (m.result) {
    return html`<div class="modal-back"><div class="modal wide" role="dialog" aria-modal="true">
      <h2>Domande chiuse compilate</h2>
      <p>Aggiornati ${m.result.updated} studenti con le risposte di Moodle.</p>
      ${m.result.warnings.length ? html`<div class="alert warn">${m.result.warnings.map(w => html`<div>⚠ ${w}</div>`)}</div>` : null}
      <div class="row gap end-row"><button class="btn primary" onClick=${close}>Chiudi</button></div>
    </div></div>`;
  }
  // destinazioni possibili: risposte singole, risposte multiple della verifica base e delle versioni
  const multi = t.chiuse.domande.map(q => ({ id: q.id, nome: q.nome }))
    .concat(...t.versioni.map(v => (v.chiuseAggiunte || []).map(q => ({ id: q.id, nome: q.nome + ' (' + v.nome + ')' }))));
  const nDS = m.parsed.questions.filter(q => m.map[q.key] === 'DS').length;
  const nMatched = m.matches.filter(Boolean).length;
  const sorted = [...s.studenti].sort(U.compareStudents);
  const apply = () => {
    m.result = Moodle.apply(s, m.parsed, m.map, m.matches);
    changedSes();
  };
  return html`<div class="modal-back"><div class="modal wide" role="dialog" aria-modal="true">
    <div class="row gap"><h2 class="grow">Importa risposte da Moodle</h2><${IconBtn} icon="✕" title="Chiudi" onClick=${close} /></div>
    <p class="muted small">${m.fileName} · ${m.parsed.questions.length} domande · ${m.parsed.records.length} studenti.
      Per gli studenti abbinati i dati delle domande chiuse vengono sostituiti.</p>
    <div class="moodle-cols">
      <div>
        <h3>Domande</h3>
        <p class="muted small">Risposte singole: ${nDS} (la verifica ne prevede ${Calc.closed(t, 'std').singole.length}).
          Le domande aperte di Moodle vanno su «Ignora».</p>
        <div class="table-scroll moodle-scroll"><table class="tbl compact">
          <thead><tr><th>Moodle</th><th>Max</th><th>Nella verifica</th></tr></thead>
          <tbody>${m.parsed.questions.map(q => html`<tr key=${q.key}>
            <td>${q.label}</td><td class="c">${U.fmt(q.max)}</td>
            <td><select value=${m.map[q.key]} onChange=${e => { m.map[q.key] = e.target.value; refresh(); }}>
              <option value="DS">Risposta singola (DS)</option>
              ${multi.map(x => html`<option value=${x.id}>${x.nome} (multipla)</option>`)}
              <option value="">Ignora</option>
            </select></td>
          </tr>`)}</tbody>
        </table></div>
      </div>
      <div>
        <h3>Studenti</h3>
        <p class="muted small">Riconosciuti ${nMatched} su ${m.parsed.records.length}.${nMatched < m.parsed.records.length ? ' Abbina a mano quelli mancanti o lasciali su «salta».' : ''}</p>
        <div class="table-scroll moodle-scroll"><table class="tbl compact">
          <thead><tr><th>Moodle</th><th>Studente</th></tr></thead>
          <tbody>${m.parsed.records.map((r, i) => html`<tr key=${i} class=${m.matches[i] ? '' : 'unmatched'}>
            <td>${r.cognome} ${r.nome}</td>
            <td><select value=${m.matches[i]} onChange=${e => { m.matches[i] = e.target.value; refresh(); }}>
              <option value="">— salta —</option>
              ${sorted.map(st => html`<option value=${st.id}>${U.studentName(st)}</option>`)}
            </select></td>
          </tr>`)}</tbody>
        </table></div>
      </div>
    </div>
    <div class="row gap end-row">
      <button class="btn" onClick=${close}>Annulla</button>
      <button class="btn primary" disabled=${!nMatched} onClick=${apply}>Compila le domande chiuse (${nMatched} studenti)</button>
    </div>
  </div></div>`;
}
