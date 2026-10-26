/* =====================================================================
 * ui-common.js — stato dell'app, azioni condivise, componenti base
 * ===================================================================== */

const { render, useState, useEffect, useRef, useMemo } = htmPreact;

/**
 * html`` di htm, con un controllo: se in posizione di tag arriva qualcosa che non è un
 * componente (funzione) o un nome di tag, l'errore dice quale modello e quale valore,
 * invece del generico "createElement: tag name ''" di Preact.
 */
const _checkedTemplates = new WeakSet();
function html(strings) {
  if (!_checkedTemplates.has(strings)) {
    _checkedTemplates.add(strings);
    // un "<" che non apre un tag (né un componente interpolato) farebbe creare a htm un elemento senza nome
    strings.forEach((s, i) => {
      const re = /<(?=[^a-zA-Z\/])/g;
      let m;
      while ((m = re.exec(s))) {
        throw new Error('Modello alterato: carattere «<» fuori posto in «' + s.slice(Math.max(0, m.index - 50), m.index + 40).replace(/\s+/g, ' ') + '»');
      }
      if (i < strings.length - 1 && /<\s+$/.test(s)) throw new Error('Modello alterato vicino a «' + s.slice(-50) + '»');
    });
  }
  for (let i = 1; i < arguments.length; i++) {
    const v = arguments[i];
    if (/<\/?$/.test(strings[i - 1]) && (typeof v !== 'function' && (typeof v !== 'string' || !v))) {
      throw new Error('Componente non valido (' + (v === '' ? 'stringa vuota' : Object.prototype.toString.call(v)) + ') nel modello: «' +
        strings[i - 1].replace(/\s+/g, ' ').slice(-80) + '…' + String(strings[i] || '').replace(/\s+/g, ' ').slice(0, 60) + '»');
    }
  }
  return htmPreact.html.apply(null, arguments);
}

const S = {
  view: 'home',
  // verifica in modifica
  tpl: null, tplDirty: false, builderTab: 'generale', editVersion: null, previewVersion: 'std',
  // sessione di valutazione (sesRev / savedRev: modifiche fatte / modifiche già scaricate in JSON)
  ses: null, sesRev: 0, savedRev: 0, saveState: 'idle', sesTab: 'classe', cur: null,
  returnToSession: false, // la verifica è stata aperta dalla valutazione: l'editor offre il ritorno
  busy: null, toast: null, dialog: null
};

let _bump = () => {};
function refresh() { _bump(); }

/* ---------------- bozza locale (recupero in caso di chiusura) ---------------- */
const Draft = {
  KEY: 'gv_draft_v1',
  timer: null,
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        localStorage.setItem(this.KEY, JSON.stringify({
          savedAt: new Date().toISOString(),
          tpl: S.tplDirty ? S.tpl : null,
          ses: S.ses && S.sesRev !== S.savedRev ? S.ses : null
        }));
      } catch (e) { /* spazio esaurito o storage bloccato: si ignora */ }
      if (S.view === 'home') refresh();
    }, 400);
  },
  read() { try { const d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); return d && (d.tpl || d.ses) ? d : null; } catch (e) { return null; } },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* ignora */ } }
};

/* ---------------- notifiche ---------------- */
let _toastTimer = null;
function toast(msg, kind) {
  S.toast = { msg, kind: kind || 'ok' };
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { S.toast = null; refresh(); }, kind === 'error' ? 7000 : 3500);
  refresh();
}

/** Conferma dentro la pagina (window.confirm() in alcuni contesti viene bloccato). */
function ask(msg, okLabel, danger) {
  return new Promise(resolve => {
    S.dialog = { msg, okLabel: okLabel || 'Conferma', danger: !!danger, resolve };
    refresh();
  });
}

function closeDialog(answer) {
  const d = S.dialog;
  S.dialog = null;
  refresh();
  if (d) d.resolve(answer);
}

function Dialog() {
  const d = S.dialog;
  const okRef = useRef(null);
  useEffect(() => { if (okRef.current) okRef.current.focus(); }, [d]);
  if (!d) return null;
  return html`<div class="modal-back" onClick=${e => { if (e.target === e.currentTarget) closeDialog(false); }}
    onKeyDown=${e => { if (e.key === 'Escape') closeDialog(false); }}>
    <div class="modal" role="dialog" aria-modal="true">
      <p>${d.msg}</p>
      <div class="row gap end-row">
        <button class="btn" onClick=${() => closeDialog(false)}>Annulla</button>
        <button ref=${okRef} class=${'btn ' + (d.danger ? 'danger-solid' : 'primary')} onClick=${() => closeDialog(true)}>${d.okLabel}</button>
      </div>
    </div>
  </div>`;
}

async function withBusy(label, fn) {
  S.busy = label; refresh();
  try { return await fn(); }
  catch (e) { console.error(e); toast(e.message || String(e), 'error'); }
  finally { S.busy = null; refresh(); }
}

/* ---------------- modifiche ---------------- */
function changedTpl() {
  Model.renumber(S.tpl); // DV / DS / DM sempre in sequenza dopo aggiunte, eliminazioni e spostamenti
  S.tplDirty = true;
  S.tpl.modificato = new Date().toISOString();
  Draft.save();
  refresh();
}

function changedSes() {
  S.sesRev++;
  S.ses.modificato = new Date().toISOString();
  S.saveState = 'pending';
  Draft.save();
  refresh();
}

/* ---------------- salvataggio: file JSON scaricati ---------------- */
function saveTemplate() {
  exportJSON(S.tpl, Model.templateFileName(S.tpl));
  S.tplDirty = false; Draft.save();
  toast('File JSON della verifica scaricato');
}

function saveSession() {
  if (!S.ses) return;
  exportJSON(S.ses, Model.sessionFileName(S.ses));
  S.savedRev = S.sesRev; S.saveState = 'saved'; Draft.save();
  toast('File JSON della valutazione scaricato');
}

function exportJSON(obj, name) {
  Files.download(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }), name);
}

async function importJSONFile() {
  const f = await Files.pickFile('.json,application/json');
  if (!f) return null;
  try { return JSON.parse(await f.text()); }
  catch (e) { toast('Il file non è un JSON valido', 'error'); return null; }
}

/** Apre una verifica; fromFile: appena letta da un JSON (quindi senza modifiche da salvare). */
function openTemplateObj(obj, fromFile) {
  S.tpl = Model.normalizeTemplate(obj);
  S.tplDirty = !fromFile;
  S.builderTab = 'generale';
  S.editVersion = null;
  S.previewVersion = 'std';
  S.view = 'builder';
  refresh();
}

/** Apre una valutazione; fromFile: appena letta da un JSON. */
function openSessionObj(obj, fromFile) {
  S.ses = Model.normalizeSession(obj);
  S.sesRev = fromFile ? 0 : 1;
  S.savedRev = 0;
  S.saveState = fromFile ? 'saved' : 'pending';
  S.sesTab = S.ses.studenti.length ? 'correzione' : 'classe';
  S.cur = S.ses.studenti.length ? [...S.ses.studenti].sort(U.compareStudents)[0].id : null;
  S.view = 'session';
  refresh();
}

function startSession(tplObj) {
  const ses = Model.newSession(Model.normalizeTemplate(tplObj), null);
  openSessionObj(ses, false);
  S.sesTab = 'classe';
  refresh();
}

/**
 * Sostituisce la verifica di una valutazione (i punteggi già inseriti restano, perché sono
 * legati agli identificativi di domande e indicatori). Gli studenti assegnati a una versione
 * che non esiste più tornano alla versione indicata dal loro BES.
 */
function applyTemplateToSession(s, tplObj) {
  s.template = Model.normalizeTemplate(U.clone(tplObj));
  s.studenti.forEach(st => {
    if (st.versione !== 'std' && !s.template.versioni.find(v => v.id === st.versione)) st.versione = Model.versionForBes(s.template, st.bes);
  });
  changedSes();
}

/** Dalla valutazione: apre la sua verifica nell'editor, con il ritorno alla valutazione. */
function editSessionTemplate() {
  openTemplateObj(U.clone(S.ses.template), true);
  S.returnToSession = true;
  refresh();
}

/** Dall'editor: applica le modifiche alla valutazione aperta e torna alla correzione. */
function backToSession(apply) {
  if (apply) applyTemplateToSession(S.ses, S.tpl);
  S.returnToSession = false;
  S.view = 'session';
  refresh();
  if (apply) toast('Verifica aggiornata nella valutazione');
}

/** Scarica un file di export. */
function deliver(blob, name) {
  Files.download(blob, name);
}

async function leaveTo(view) {
  if (S.view === 'builder' && S.tplDirty && !(await ask('Ci sono modifiche alla verifica non scaricate in JSON. Uscire comunque? (Resta una bozza nel browser.)', 'Esci'))) return;
  if (S.view === 'session' && S.sesRev !== S.savedRev && !(await ask('La valutazione ha modifiche non scaricate in JSON. Uscire comunque? (Resta una bozza nel browser.)', 'Esci'))) return;
  S.view = view;
  S.returnToSession = false;
  refresh();
}

/* ---------------- componenti base ---------------- */

/** Campo numerico che accetta la virgola e non perde il cursore mentre si scrive. */
function NumInput(p) {
  const show = v => (v === null || v === undefined || v === '') ? '' : U.fmt(U.num(v), 4);
  const [txt, setTxt] = useState(show(p.value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(show(p.value)); }, [p.value]);
  const n = U.num(txt);
  const invalid = txt.trim() !== '' && (n === null || (p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max));
  return html`<input
    class=${'num ' + (invalid ? 'invalid ' : '') + (p.class || '')}
    inputmode="decimal" autocomplete="off"
    value=${txt} title=${p.title || ''}
    disabled=${p.disabled} data-nav=${p.nav} data-r=${p.row} data-c=${p.col}
    style=${p.width ? 'width:' + p.width : ''}
    onFocus=${e => { focused.current = true; e.target.select(); if (p.onFocus) p.onFocus(); }}
    onBlur=${() => { focused.current = false; setTxt(show(p.value)); if (p.onBlur) p.onBlur(); }}
    onInput=${e => {
      const t = e.target.value; setTxt(t);
      const x = U.num(t);
      if (t.trim() === '') p.onChange(p.allowEmpty === false ? 0 : null);
      else if (x !== null) p.onChange(x);
    }}
    onKeyDown=${p.onKeyDown} />`;
}

function Field(p) {
  return html`<label class=${'field ' + (p.class || '')}>
    <span class="field-label">${p.label}</span>
    ${p.children}
    ${p.hint && html`<span class="hint">${p.hint}</span>`}
  </label>`;
}

function TextInput(p) {
  return html`<input type="text" class=${p.class || ''} value=${p.value || ''}
    onInput=${e => p.onInput(e.target.value)} style=${p.width ? 'width:' + p.width : ''} />`;
}

function TextArea(p) {
  return html`<textarea class=${p.class || ''} rows=${p.rows || 2} value=${p.value || ''}
    onInput=${e => p.onInput(e.target.value)}></textarea>`;
}

function Tabs(p) {
  return html`<nav class="tabs">${p.items.map(it => html`
    <button class=${'tab ' + (p.value === it.id ? 'active' : '')} onClick=${() => p.onChange(it.id)}>
      ${it.label}${it.badge ? html`<span class=${'badge ' + (it.badgeKind || '')}>${it.badge}</span>` : null}
    </button>`)}</nav>`;
}

function Warnings(p) {
  if (!p.list || !p.list.length) return null;
  return html`<div class="alert warn">${p.list.map(w => html`<div>⚠ ${w}</div>`)}</div>`;
}

function IconBtn(p) {
  return html`<button class=${'icon-btn ' + (p.class || '')} title=${p.title} disabled=${p.disabled} onClick=${p.onClick}>${p.icon}</button>`;
}

function moveItem(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  const x = arr[i]; arr[i] = arr[j]; arr[j] = x;
}
