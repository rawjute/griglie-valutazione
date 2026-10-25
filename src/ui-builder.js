/* =====================================================================
 * ui-builder.js — creazione / modifica della verifica
 * ===================================================================== */

function Builder() {
  const t = S.tpl;
  const stdWarn = Calc.warnings(t, 'std');
  const tabs = [
    { id: 'generale', label: 'Dati generali' },
    { id: 'livelli', label: 'Livelli predefiniti' },
    { id: 'indicatori', label: 'Indicatori', badge: t.indicatori.length || null },
    { id: 'esercizi', label: 'Esercizi', badge: t.esercizi.length || null, badgeKind: stdWarn.length ? 'warn' : '' },
    { id: 'chiuse', label: 'Domande chiuse', badge: t.chiuse.attive ? t.chiuse.domande.length : null },
    { id: 'versioni', label: 'Versioni', badge: t.versioni.length || null },
    { id: 'griglia', label: 'Griglia ed export' }
  ];
  const body = {
    generale: BGenerale, livelli: BLivelli, indicatori: BIndicatori, esercizi: BEsercizi,
    chiuse: BChiuse, versioni: BVersioni, griglia: BGriglia
  }[S.builderTab];
  return html`<div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow">Creazione verifica</div>
        <h1>${Model.templateTitle(t)}</h1>
        <div class=${'small ' + (S.tplDirty ? 'save-pending' : 'muted')}>${S.tplDirty ? 'Modifiche non ancora scaricate in JSON' : 'Salvata (JSON scaricato)'}</div>
      </div>
      <div class="actions">
        <button class="btn primary" onClick=${saveTemplate}>Salva (scarica JSON)</button>
        <button class="btn" onClick=${async () => {
          if (S.tplDirty && !(await ask('La verifica ha modifiche non salvate. La valutazione userà la versione attuale. Continuare?', 'Continua'))) return;
          startSession(U.clone(t));
        }}>Valuta una classe →</button>
      </div>
    </div>
    <${Tabs} items=${tabs} value=${S.builderTab} onChange=${v => { S.builderTab = v; refresh(); }} />
    <div class="panel"><${body} t=${t} /></div>
  </div>`;
}

/* ---------------- Dati generali ---------------- */
function BGenerale({ t }) {
  const set = (k, v) => { t[k] = v; changedTpl(); };
  return html`
    <div class="grid2">
      <${Field} label="Materia"><${TextInput} value=${t.materia} onInput=${v => set('materia', v)} /><//>
      <${Field} label="Argomento"><${TextInput} value=${t.argomento} onInput=${v => set('argomento', v)} /><//>
    </div>
    <${Field} label="Intestazione (facoltativa)" hint="Seconda riga della griglia, es. il dipartimento o la scuola.">
      <${TextInput} value=${t.intestazione} onInput=${v => set('intestazione', v)} />
    <//>
    <${Field} label="Descrizione (solo per te, non compare negli export)">
      <${TextArea} rows="3" value=${t.descrizione} onInput=${v => set('descrizione', v)} />
    <//>
    <div class="grid3">
      <div class="field">
        <span class="field-label">Punteggio totale della verifica</span>
        <span class="total-big">${U.fmt(Calc.total(t, 'std'))}</span>
        <span class="hint">Calcolato: esercizi ${U.fmt(Calc.manualTotal(t, 'std'))}${Calc.closed(t, 'std').max ? ' + domande chiuse ' + U.fmt(Calc.closed(t, 'std').max) : ''}.
          Gli esercizi valgono la somma dei massimi degli indicatori${Calc.standardWeights(t).biasSum ? ', più le correzioni' : ''}.</span>
      </div>
      <${Field} label="Voto minimo" hint=${Calc.votoRule(t, Calc.total(t, 'std'))}>
        <${NumInput} value=${t.votoMin} min=${0} max=${10} onChange=${v => set('votoMin', v === null ? 0 : U.clamp(v, 0, 10))} width="80px" />
      <//>
      <${Field} label="Uso del voto minimo">
        <select value=${t.votoModo} disabled=${!(U.num(t.votoMin) > 0)} onChange=${e => set('votoModo', e.target.value)}>
          <option value="soglia">Soglia: sotto il minimo si assegna il minimo</option>
          <option value="lineare">Scala: 0 punti = voto minimo, punteggio pieno = 10</option>
        </select>
      <//>
    </div>
    <div class="grid2">
      <${Field} label="Nota a piè di griglia">
        <${TextInput} value=${t.notaPiede} onInput=${v => set('notaPiede', v)} />
        <select value=${t.notaPiedeQuando} onChange=${e => set('notaPiedeQuando', e.target.value)}>
          <option value="bes">Mostra solo nelle versioni DSA / NAI / PEI</option>
          <option value="sempre">Mostra sempre</option>
          <option value="mai">Non mostrare</option>
        </select>
      <//>
    </div>`;
}

/* ---------------- Livelli ---------------- */

/** Riordina i livelli dal più alto e fissa il primo al 100 %. */
function tidyLevels(owner) {
  owner.livelli = Calc.sortedLevels(owner.livelli);
  if (owner.livelli.length) owner.livelli[0].max = 100;
}

/**
 * Editor di una scala di livelli (della verifica o di un indicatore).
 * Si modifica la percentuale massima di ogni livello; il più alto vale sempre fino al 100 %.
 */
function LevelsEditor({ owner, max, withDesc }) {
  const levels = owner.livelli;
  const ranges = max ? Calc.levelRanges(levels, max) : [];
  const rangeOf = l => ranges.find(r => r.level === l);
  return html`
    <table class="tbl compact levels-tbl">
      <thead><tr><th>Livello</th><th>Fino al</th>${max ? html`<th>Punti</th>` : null}${withDesc ? html`<th>Descrittore</th>` : null}<th></th></tr></thead>
      <tbody>${levels.map((l, i) => {
        const r = rangeOf(l);
        return html`<tr key=${l.id}>
          <td class="lv-name"><${TextInput} value=${l.nome} onInput=${v => { l.nome = v; changedTpl(); }} /></td>
          <td class="lv-pct nowrap">${i === 0 ? html`<span class="muted">100 %</span>` : html`<${NumInput} value=${l.max} min=${0} max=${99.99} width="64px"
            onChange=${v => { l.max = v === null ? 0 : v; changedTpl(); }} onBlur=${() => { tidyLevels(owner); changedTpl(); }} /> %`}</td>
          ${max ? html`<td class=${'nowrap c ' + (r && r.empty ? 'bad' : '')}>${r ? (r.empty ? 'vuoto' : Calc.rangeLabel(r)) : ''}</td>` : null}
          ${withDesc ? html`<td><${TextArea} rows="2" value=${l.descrittore} onInput=${v => { l.descrittore = v; changedTpl(); }} /></td>` : null}
          <td><${IconBtn} icon="✕" title="Elimina livello" disabled=${levels.length <= 1} onClick=${() => {
            owner.livelli = levels.filter(x => x !== l); tidyLevels(owner); changedTpl();
          }} /></td>
        </tr>`;
      })}</tbody>
    </table>
    <button class="btn small" onClick=${() => {
      const low = levels[levels.length - 1];
      levels.push({ id: U.uid('lv'), nome: '', max: low ? Math.floor((U.num(low.max) || 0) / 2) : 100, descrittore: '' });
      tidyLevels(owner); changedTpl();
    }}>+ Aggiungi livello</button>`;
}

/** Fasce percentuali di una scala: [{ level, text }] dal livello più alto. */
function percentBands(levels) {
  const sorted = Calc.sortedLevels(levels);
  return sorted.map((l, i) => {
    const top = i === 0 ? 100 : (U.num(l.max) || 0);
    const next = sorted[i + 1];
    const text = next
      ? 'oltre ' + U.fmt(U.num(next.max) || 0) + ' % e fino a ' + U.fmt(top) + ' %'
      : 'da 0 % a ' + U.fmt(top) + ' %';
    return { level: l, text, empty: next && (U.num(next.max) || 0) >= top };
  });
}

function BLivelli({ t }) {
  return html`
    <p class="muted">Questa è la scala che ricevono i nuovi indicatori. Ogni indicatore può poi avere livelli propri (numero, nomi e percentuali) nella scheda «Indicatori».
      Per ogni livello indichi fino a che percentuale del punteggio massimo arriva; il livello più alto arriva sempre al 100 %.</p>
    <div style="max-width:560px"><${LevelsEditor} owner=${t} /></div>
    <h3>Riepilogo fasce</h3>
    <table class="tbl compact" style="max-width:560px">
      <thead><tr><th>Livello</th><th>Fascia del punteggio massimo</th></tr></thead>
      <tbody>${percentBands(t.livelli).map(b => html`<tr key=${b.level.id}>
        <td>${b.level.nome || html`<span class="muted">senza nome</span>`}</td>
        <td class=${b.empty ? 'bad' : ''}>${b.empty ? 'vuota: controlla le percentuali' : b.text}</td>
      </tr>`)}</tbody>
    </table>
    ${t.indicatori.length ? html`<button class="btn" onClick=${async () => {
      if (!(await ask('Sostituire i livelli di tutti gli indicatori con questa scala? I descrittori dei livelli con lo stesso nome vengono mantenuti.', 'Applica'))) return;
      t.indicatori.forEach(ind => applyDefaultLevels(t, ind));
      changedTpl();
      toast(t.indicatori.length === 1 ? 'Scala applicata all’indicatore' : 'Scala applicata a ' + t.indicatori.length + ' indicatori');
    }}>Applica a tutti gli indicatori</button>` : null}`;
}

function applyDefaultLevels(t, ind) {
  const old = ind.livelli || [];
  ind.livelli = Model.copyLevels(t.livelli, false);
  ind.livelli.forEach(l => {
    const same = old.find(o => (o.nome || '').trim().toLowerCase() === (l.nome || '').trim().toLowerCase());
    if (same) l.descrittore = same.descrittore || '';
  });
}

/* ---------------- Indicatori ---------------- */
function BIndicatori({ t }) {
  const totMax = U.sum(t.indicatori, i => U.num(i.max) || 0);
  return html`
    <p class="muted">Il punteggio massimo è la scala su cui inserirai i voti in correzione (es. 0–20) e definisce il peso dell'indicatore nella verifica.
      Ogni indicatore ha i suoi livelli: puoi aggiungerne, toglierne e cambiarne le percentuali.</p>
    ${t.indicatori.map((ind, idx) => html`<div class="card" key=${ind.id}>
      <div class="row gap">
        <${Field} label=${'Indicatore ' + (idx + 1)} class="grow"><${TextInput} value=${ind.nome} onInput=${v => { ind.nome = v; changedTpl(); }} /><//>
        <${Field} label="Punteggio massimo"><${NumInput} value=${ind.max} min=${1} width="90px" onChange=${v => { ind.max = v === null ? 0 : Math.round(v); changedTpl(); }} /><//>
        <div class="field"><span class="field-label">Peso</span><span class="pill">${totMax ? U.fmt((U.num(ind.max) || 0) / totMax * 100, 1) + ' %' : '—'}</span></div>
        <div class="row end">
          <${IconBtn} icon="↑" title="Sposta su" disabled=${idx === 0} onClick=${() => { moveItem(t.indicatori, idx, -1); changedTpl(); }} />
          <${IconBtn} icon="↓" title="Sposta giù" disabled=${idx === t.indicatori.length - 1} onClick=${() => { moveItem(t.indicatori, idx, 1); changedTpl(); }} />
          <${IconBtn} icon="✕" title="Elimina indicatore" onClick=${async () => {
            if (!(await ask('Eliminare l’indicatore «' + (ind.nome || 'senza nome') + '»? Verrà tolto anche dagli esercizi.', 'Elimina', true))) return;
            t.indicatori = t.indicatori.filter(x => x !== ind);
            const strip = e => { e.indicatori = e.indicatori.filter(x => x !== ind.id); };
            t.esercizi.forEach(strip);
            t.versioni.forEach(v => v.aggiunti.forEach(strip));
            changedTpl();
          }} />
        </div>
      </div>
      <${LevelsEditor} owner=${ind} max=${U.num(ind.max) || 0} withDesc=${true} />
      <button class="btn small" title="Sostituisce i livelli con la scala predefinita della verifica" onClick=${async () => {
        if (!(await ask('Sostituire i livelli di questo indicatore con la scala predefinita? I descrittori dei livelli con lo stesso nome vengono mantenuti.', 'Sostituisci'))) return;
        applyDefaultLevels(t, ind); changedTpl();
      }}>Usa la scala predefinita</button>
      ${Calc.levelIssues(ind.livelli, U.num(ind.max) || 0).length ? html`<${Warnings} list=${Calc.levelIssues(ind.livelli, U.num(ind.max) || 0)} />` : null}
    </div>`)}
    <button class="btn" onClick=${() => { t.indicatori.push(Model.newIndicator(t)); changedTpl(); }}>+ Aggiungi indicatore</button>`;
}

/* ---------------- Esercizi ---------------- */
function ExerciseRow({ t, ex, idx, list, weight, extra }) {
  return html`<tr key=${ex.id}>
    <td class="nowrap">
      <${IconBtn} icon="↑" title="Sposta su" disabled=${idx === 0} onClick=${() => { moveItem(list, idx, -1); changedTpl(); }} />
      <${IconBtn} icon="↓" title="Sposta giù" disabled=${idx === list.length - 1} onClick=${() => { moveItem(list, idx, 1); changedTpl(); }} />
    </td>
    <td><${TextInput} value=${ex.nome} width="80px" onInput=${v => { ex.nome = v; changedTpl(); }} /></td>
    <td><${TextInput} value=${ex.testo} onInput=${v => { ex.testo = v; changedTpl(); }} /></td>
    ${t.indicatori.map(i => html`<td class="c"><input type="checkbox" checked=${ex.indicatori.includes(i.id)} title=${i.nome}
      onChange=${e => { ex.indicatori = e.target.checked ? t.indicatori.filter(x => x.id === i.id || ex.indicatori.includes(x.id)).map(x => x.id) : ex.indicatori.filter(x => x !== i.id); changedTpl(); }} /></td>`)}
    ${extra}
    <td><${NumInput} value=${ex.bias} width="56px" onChange=${v => { ex.bias = v === null ? 0 : Math.round(v); changedTpl(); }} /></td>
    <td class="c strong">${U.fmt(weight)}</td>
    <td><${IconBtn} icon="✕" title="Elimina esercizio" onClick=${() => { list.splice(idx, 1); changedTpl(); }} /></td>
  </tr>`;
}

function BEsercizi({ t }) {
  const std = Calc.standardWeights(t);
  const [nAdd, setNAdd] = useState(1);
  return html`
    <p class="muted">Seleziona gli indicatori coinvolti in ogni esercizio. Il punteggio di ogni indicatore si divide in parti uguali tra gli esercizi che lo coprono:
      il «grezzo» di un esercizio è la somma di queste parti (es. un indicatore da 20 coperto da 4 esercizi vale 5 in ciascuno).
      Il grezzo viene arrotondato a un intero («base») senza cambiare il totale. La <b>correzione</b> (il tuo bias) aggiunge o toglie punti per pesare la difficoltà:
      se le correzioni non sommano a zero cambia anche il totale della verifica.</p>
    <div class="table-scroll">
    <table class="tbl compact">
      <thead><tr>
        <th></th><th>Nome</th><th>Consegna</th>
        ${t.indicatori.map(i => html`<th class="vert" title=${i.nome}><span>${i.nome || '(senza nome)'}</span></th>`)}
        <th>Grezzo</th><th>Base</th><th>Correzione</th><th>Peso</th><th></th>
      </tr></thead>
      <tbody>
        ${t.esercizi.map((ex, idx) => html`<${ExerciseRow} key=${ex.id} t=${t} ex=${ex} idx=${idx} list=${t.esercizi} weight=${std.rows[ex.id].peso}
          extra=${html`<td class="c muted">${U.fmt(std.rows[ex.id].raw)}</td><td class="c">${U.fmt(std.rows[ex.id].base)}</td>`} />`)}
      </tbody>
      <tfoot><tr>
        <td colspan=${3 + t.indicatori.length} class="right">Totale</td>
        <td class="c muted">${U.fmt(std.R)}</td><td class="c">${U.fmt(Math.round(std.R))}</td>
        <td class=${'c ' + (std.biasSum ? 'bad' : '')}>${std.biasSum > 0 ? '+' : ''}${U.fmt(std.biasSum)}</td>
        <td class="c strong">${U.fmt(Calc.manualTotal(t, 'std'))}</td><td></td>
      </tr></tfoot>
    </table>
    </div>
    <div class="row gap wrap">
      <button class="btn" onClick=${() => { for (let k = 0; k < Math.max(1, nAdd); k++) t.esercizi.push(Model.newExercise(t)); changedTpl(); }}>+ Aggiungi</button>
      <${NumInput} value=${nAdd} min=${1} width="56px" onChange=${v => setNAdd(Math.max(1, Math.round(v || 1)))} /> <span class="muted">esercizi</span>
      <span class="spacer"></span>
      <span class="total-line">Totale verifica: ${U.fmt(Calc.total(t, 'std'))}${Calc.closed(t, 'std').max ? ' (esercizi ' + U.fmt(Calc.manualTotal(t, 'std')) + ' + domande chiuse ' + U.fmt(Calc.closed(t, 'std').max) + ')' : ''}</span>
    </div>
    <${Warnings} list=${Calc.warnings(t, 'std')} />
    <${MatrixView} t=${t} vId="std" />`;
}

function MatrixView({ t, vId }) {
  const M = Calc.matrix(t, vId);
  if (!M.rows.length || !M.used.length) return null;
  return html`<div class="card">
    <div class="row gap wrap">
      <h3 class="grow">Distribuzione dei punti</h3>
      <label class="field inline"><span class="field-label">Ripartizione dentro l'esercizio</span>
        <select value=${t.distribuzione} onChange=${e => { t.distribuzione = e.target.value; changedTpl(); }}>
          <option value="proporzionale">Proporzionale alle quote degli indicatori</option>
          <option value="bilanciata">Bilanciata sui pesi degli indicatori</option>
        </select>
      </label>
    </div>
    <p class="muted small">Ogni casella è il valore in punti di quell'indicatore in quell'esercizio. La somma per riga dà il punteggio dell'esercizio, la somma per colonna il peso effettivo dell'indicatore: i due totali coincidono sempre.
      ${t.distribuzione === 'bilanciata' ? ' La ripartizione bilanciata modifica le caselle in modo che ogni indicatore pesi quanto previsto.' : ' Arrotondamenti e correzioni possono far scostare un po’ il peso effettivo di un indicatore da quello previsto: la modalità bilanciata lo riallinea.'}</p>
    <div class="table-scroll">
    <table class="tbl compact matrix">
      <thead><tr><th>Esercizio</th>${M.used.map(i => html`<th>${i.nome}</th>`)}<th>Peso</th></tr></thead>
      <tbody>${M.rows.map(r => html`<tr>
        <td>${r.ex.nome}${r.ex.aggiunto ? html` <span class="tag">aggiunto</span>` : null}</td>
        ${M.used.map(i => html`<td class=${'c ' + (r.cells[i.id] === undefined ? 'off' : '')}>${r.cells[i.id] === undefined ? '–' : U.fmt(r.cells[i.id])}</td>`)}
        <td class="c strong">${U.fmt(r.peso)}</td>
      </tr>`)}</tbody>
      <tfoot>
        <tr><td>Peso effettivo</td>${M.used.map(i => html`<td class="c strong">${U.fmt(M.eff[i.id])}</td>`)}<td class="c strong">${U.fmt(M.Tm)}</td></tr>
        <tr><td class="muted">Peso previsto</td>${M.used.map(i => html`<td class=${'c muted ' + (Math.abs(M.eff[i.id] - M.nominal[i.id]) > 0.05 ? 'bad' : '')}>${U.fmt(M.nominal[i.id])}</td>`)}<td></td></tr>
      </tfoot>
    </table>
    </div>
  </div>`;
}

/* ---------------- Domande chiuse ---------------- */
function BChiuse({ t }) {
  const c = t.chiuse;
  const [n, setN] = useState(10);
  const [pts, setPts] = useState(1);
  const C = Calc.closed(t, 'std');
  return html`
    <label class="check"><input type="checkbox" checked=${c.attive} onChange=${e => { c.attive = e.target.checked; changedTpl(); }} /> La verifica contiene domande a risposta chiusa</label>
    ${c.attive ? html`
      <p class="muted">Le domande chiuse formano un blocco a sé: il loro punteggio si somma a quello degli esercizi valutati con la griglia.
        Punteggio totale ${U.fmt(Calc.total(t, 'std'))} = esercizi ${U.fmt(Calc.manualTotal(t, 'std'))} + domande chiuse ${U.fmt(C.max)}.</p>
      <div class="card row gap wrap">
        <span>Genera</span><${NumInput} value=${n} min=${1} width="60px" onChange=${v => setN(Math.max(1, Math.round(v || 1)))} />
        <span>domande da</span><${NumInput} value=${pts} min=${0} width="60px" onChange=${v => setPts(v || 0)} /><span>punti</span>
        <button class="btn" onClick=${async () => {
          const composte = c.domande.filter(q => Calc.isComposite(q));
          if (c.domande.length > composte.length && !(await ask('Sostituire le domande a risposta singola esistenti? Le risposte composte restano.', 'Sostituisci'))) return;
          c.domande = Array.from({ length: n }, (_, k) => ({ id: U.uid('q'), nome: 'D' + (k + 1), tipo: 'singola', punti: pts }))
            .concat(composte.map((q, k) => Object.assign(q, { nome: /^D\d+$/.test(q.nome) ? 'D' + (n + k + 1) : q.nome })));
          changedTpl();
        }}>Genera</button>
      </div>
      <div class="grid3">
        <${Field} label="Punti per risposta errata" hint="Solo domande a risposta singola. Anche negativo, es. -0,25"><${NumInput} value=${c.errata} width="90px" onChange=${v => { c.errata = v || 0; changedTpl(); }} /><//>
        <${Field} label="Punti per risposta non data" hint="Solo domande a risposta singola."><${NumInput} value=${c.nonData} width="90px" onChange=${v => { c.nonData = v || 0; changedTpl(); }} /><//>
        <label class="check"><input type="checkbox" checked=${c.minimoZero} onChange=${e => { c.minimoZero = e.target.checked; changedTpl(); }} /> Il blocco non scende sotto zero</label>
      </div>
      <p class="muted small">Le domande a <b>risposta composta</b> (associazioni, cloze, completamenti, più risposte da indicare…) hanno più parti
        e danno un punteggio parziale: punti × parti corrette / parti totali (es. 4 punti, 1 parte corretta su 4 = 1 punto).
        In correzione inserisci solo quante parti sono corrette.</p>
      <table class="tbl compact" style="max-width:640px">
        <thead><tr><th>Domanda</th><th>Tipo</th><th>Parti</th><th>Punti</th><th></th></tr></thead>
        <tbody>${c.domande.map((q, i) => html`<tr key=${q.id}>
          <td><${TextInput} value=${q.nome} onInput=${v => { q.nome = v; changedTpl(); }} /></td>
          <td><select value=${Calc.isComposite(q) ? 'composta' : 'singola'} onChange=${e => {
            q.tipo = e.target.value;
            if (q.tipo === 'composta' && !q.parti) q.parti = Calc.partsOf(q) > 1 ? Calc.partsOf(q) : 4;
            delete q.coppie;
            changedTpl();
          }}>
            <option value="singola">Risposta singola</option>
            <option value="composta">Risposta composta</option>
          </select></td>
          <td>${Calc.isComposite(q) ? html`<${NumInput} value=${Calc.partsOf(q)} min=${1} width="60px" onChange=${v => { q.parti = Math.max(1, Math.round(v || 1)); delete q.coppie; changedTpl(); }} />` : null}</td>
          <td><${NumInput} value=${q.punti} min=${0} width="80px" onChange=${v => { q.punti = v || 0; changedTpl(); }} /></td>
          <td><${IconBtn} icon="✕" title="Elimina" onClick=${() => { c.domande.splice(i, 1); changedTpl(); }} /></td>
        </tr>`)}</tbody>
        <tfoot><tr><td colspan="3">Totale</td><td class="c strong">${U.fmt(C.all)}</td><td></td></tr></tfoot>
      </table>
      <div class="row gap wrap">
        <button class="btn" onClick=${() => {
          const last = [...c.domande].reverse().find(q => !Calc.isComposite(q));
          c.domande.push({ id: U.uid('q'), nome: 'D' + (c.domande.length + 1), tipo: 'singola', punti: last ? last.punti : 1 });
          changedTpl();
        }}>+ Aggiungi domanda</button>
        <button class="btn" onClick=${() => { c.domande.push({ id: U.uid('q'), nome: 'D' + (c.domande.length + 1), tipo: 'composta', parti: 4, punti: 4 }); changedTpl(); }}>+ Aggiungi risposta composta</button>
      </div>
      ${!C.uniform ? html`<div class="alert warn">⚠ Le domande a risposta singola hanno punteggi diversi: in correzione andranno segnate una per una invece che con i soli conteggi.</div>` : null}
    ` : null}`;
}

/* ---------------- Versioni ---------------- */
function BVersioni({ t }) {
  let v = t.versioni.find(x => x.id === S.editVersion) || t.versioni[0] || null;
  const add = tipo => {
    const nv = Model.newVersion(tipo);
    t.versioni.push(nv); S.editVersion = nv.id; changedTpl();
  };
  return html`
    <p class="muted">Le versioni (DSA, NAI, PEI…) partono dalla verifica standard: puoi togliere esercizi, cambiarne il testo, aggiungerne di nuovi.
      Ogni esercizio mantiene il punteggio che ha nella versione standard: il totale della versione è la somma di quello che contiene
      (la standard vale ${U.fmt(Calc.total(t, 'std'))}). Il voto si calcola sempre sul totale della versione svolta.</p>
    <div class="row gap wrap">
      ${Model.BES_TYPES.map(tp => html`<button class="btn" onClick=${() => add(tp)}>+ ${tp}</button>`)}
      <button class="btn" onClick=${() => add('ALTRO')}>+ Personalizzata</button>
    </div>
    ${t.versioni.length ? html`
      <${Tabs} items=${t.versioni.map(x => ({ id: x.id, label: x.nome || '(senza nome)', badge: U.fmt(Calc.total(t, x.id)) + ' pt' }))}
        value=${v.id} onChange=${id => { S.editVersion = id; refresh(); }} />
      <${VersionEditor} t=${t} v=${v} />` : html`<p class="empty">Nessuna versione oltre a quella standard.</p>`}`;
}

function VersionEditor({ t, v }) {
  const stdW = Calc.weights(t, 'std');
  const W = Calc.weights(t, v.id);
  const C = Calc.closed(t, v.id);
  const Tm = Calc.manualTotal(t, v.id);
  return html`<div class="card">
    <div class="row gap wrap">
      <${Field} label="Nome"><${TextInput} value=${v.nome} onInput=${x => { v.nome = x; changedTpl(); }} /><//>
      <${Field} label="Tipologia (per l'abbinamento con la colonna BES)">
        <select value=${v.tipo} onChange=${e => { v.tipo = e.target.value; changedTpl(); }}>
          ${Model.BES_TYPES.map(x => html`<option value=${x}>${x}</option>`)}<option value="ALTRO">Altro</option>
        </select>
      <//>
      <span class="spacer"></span>
      <button class="btn" onClick=${() => { const c = U.clone(v); c.id = U.uid('ver'); c.nome = v.nome + ' (copia)'; c.aggiunti.forEach(e => { const old = e.id; e.id = U.uid('es'); if (c.adj[old] !== undefined) { c.adj[e.id] = c.adj[old]; delete c.adj[old]; } }); t.versioni.push(c); S.editVersion = c.id; changedTpl(); }}>Duplica</button>
      <button class="btn danger" onClick=${async () => { if (!(await ask('Eliminare la versione ' + v.nome + '?', 'Elimina', true))) return; t.versioni = t.versioni.filter(x => x !== v); S.editVersion = null; changedTpl(); }}>Elimina</button>
    </div>
    <h3>Esercizi della verifica standard</h3>
    <div class="table-scroll">
    <table class="tbl compact">
      <thead><tr><th>Includi</th><th>Esercizio</th><th>Testo personalizzato</th><th>Peso standard</th><th>Correzione</th><th>Peso in ${v.nome}</th></tr></thead>
      <tbody>${t.esercizi.map(ex => {
        const incl = !v.esclusi.includes(ex.id);
        return html`<tr key=${ex.id} class=${incl ? '' : 'dim'}>
          <td class="c"><input type="checkbox" checked=${incl} onChange=${e => { v.esclusi = e.target.checked ? v.esclusi.filter(x => x !== ex.id) : v.esclusi.concat(ex.id); changedTpl(); }} /></td>
          <td>${ex.nome}</td>
          <td><${TextInput} value=${v.testi[ex.id] || ''} onInput=${x => { v.testi[ex.id] = x; changedTpl(); }} /></td>
          <td class="c muted">${U.fmt(stdW[ex.id])}</td>
          <td>${incl ? html`<${NumInput} value=${v.adj[ex.id] || 0} width="56px" onChange=${x => { v.adj[ex.id] = x === null ? 0 : Math.round(x); changedTpl(); }} />` : null}</td>
          <td class="c strong">${incl ? U.fmt(W[ex.id]) : '–'}</td>
        </tr>`;
      })}</tbody>
    </table>
    </div>
    <h3>Esercizi aggiuntivi di questa versione</h3>
    ${v.aggiunti.length ? html`<div class="table-scroll"><table class="tbl compact">
      <thead><tr><th></th><th>Nome</th><th>Consegna</th>${t.indicatori.map(i => html`<th class="vert" title=${i.nome}><span>${i.nome}</span></th>`)}<th>Correzione</th><th>Peso</th><th></th></tr></thead>
      <tbody>${v.aggiunti.map((ex, idx) => html`<${ExerciseRow} key=${ex.id} t=${t} ex=${ex} idx=${idx} list=${v.aggiunti} weight=${W[ex.id]} extra=${null} />`)}</tbody>
    </table></div>` : null}
    <button class="btn" onClick=${() => { const e = Model.newExercise(t, t.esercizi.concat(v.aggiunti)); e.nome = 'Es ' + (t.esercizi.length + v.aggiunti.length + 1); v.aggiunti.push(e); changedTpl(); }}>+ Aggiungi esercizio</button>
    <div class="total-line">Totale ${v.nome}: ${U.fmt(Tm + C.max)} punti${C.items.length ? ' (esercizi ' + U.fmt(Tm) + ' + domande chiuse ' + U.fmt(C.max) + ')' : ''}</div>
    ${t.chiuse.attive && t.chiuse.domande.length ? html`
      <h3>Domande chiuse</h3>
      <p class="muted small">Ogni domanda mantiene il suo punteggio: in questa versione il blocco vale ${U.fmt(C.max)} punti su ${U.fmt(C.all)}.</p>
      <div class="chips">${t.chiuse.domande.map(q => {
        const incl = !v.chiuseEscluse.includes(q.id);
        const it = C.items.find(x => x.id === q.id);
        return html`<label class=${'chip ' + (incl ? 'on' : '')}><input type="checkbox" checked=${incl}
          onChange=${e => { v.chiuseEscluse = e.target.checked ? v.chiuseEscluse.filter(x => x !== q.id) : v.chiuseEscluse.concat(q.id); changedTpl(); }} />
          ${q.nome}${incl && it ? html` <span class="muted">${U.fmt(it.valore)}</span>` : null}</label>`;
      })}</div>` : null}
    <${Warnings} list=${Calc.warnings(t, v.id)} />
    <${MatrixView} t=${t} vId=${v.id} />
  </div>`;
}

/* ---------------- Griglia ed export ---------------- */
function versionOptions(t) {
  return [{ id: 'std', nome: 'Standard' }].concat(t.versioni.map(v => ({ id: v.id, nome: v.nome })));
}

function BGriglia({ t }) {
  if (!t.versioni.find(v => v.id === S.previewVersion)) S.previewVersion = 'std';
  const vId = S.previewVersion;
  const d = Grid.data(t, vId, null);
  const exs = Calc.exercises(t, vId);
  const W = Calc.weights(t, vId);
  const C = Calc.closed(t, vId);
  const title = Model.templateTitle(t);
  const vName = Model.versionName(t, vId);
  const fname = ext => U.safeName('Griglia - ' + title + (vId === 'std' ? '' : ' - ' + vName)) + '.' + ext;
  const listText = exs.map(e => e.nome + ': ' + U.fmt(W[e.id]) + ' punti').concat(C.items.length ? ['Domande chiuse: ' + U.fmt(C.max) + ' punti'] : []).join('\n');
  const all = () => versionOptions(t).map(o => Grid.data(t, o.id, null));
  return html`
    <div class="row gap wrap">
      <${Field} label="Versione" class="inline">
        <select value=${vId} onChange=${e => { S.previewVersion = e.target.value; refresh(); }}>
          ${versionOptions(t).map(o => html`<option value=${o.id}>${o.nome}</option>`)}
        </select>
      <//>
      <span class="spacer"></span>
      <button class="btn primary" onClick=${() => withBusy('Creo il PDF…', async () => deliver(await Grid.pdf([d]), fname('pdf')))}>PDF</button>
      <button class="btn" onClick=${() => withBusy('Creo l’HTML…', async () => deliver(new Blob([Grid.htmlDocument(title, [Grid.html(d)])], { type: 'text/html' }), fname('html')))}>HTML</button>
      ${t.versioni.length ? html`<button class="btn" onClick=${() => withBusy('Creo il PDF…', async () => deliver(await Grid.pdf(all()), U.safeName('Griglie - ' + title + ' - tutte le versioni') + '.pdf'))}>PDF di tutte le versioni</button>` : null}
    </div>
    <${Warnings} list=${Calc.warnings(t, vId)} />
    <div class="grid-preview" dangerouslySetInnerHTML=${{ __html: Grid.html(d) }}></div>
    <div class="card">
      <div class="row gap"><h3 class="grow">Punteggi da riportare nel compito (${vName})</h3>
        <button class="btn" onClick=${() => { navigator.clipboard.writeText(listText).then(() => toast('Copiato negli appunti'), () => toast('Copia non riuscita', 'error')); }}>Copia</button></div>
      <table class="tbl compact" style="max-width:640px">
        <tbody>${exs.map(e => html`<tr><td>${e.nome}</td><td class="muted">${e.testo}</td><td class="c strong">${U.fmt(W[e.id])} pt</td></tr>`)}
        ${C.items.length ? html`<tr><td>Domande chiuse</td><td class="muted">${C.items.length} domande</td><td class="c strong">${U.fmt(C.max)} pt</td></tr>` : null}</tbody>
      </table>
    </div>`;
}
