/* =====================================================================
 * app.js — home e avvio
 * ===================================================================== */

const APP_VERSION = '2026-10-24c';

function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function Home() {
  const draft = Draft.read();
  /** Apre un JSON: una verifica (per modificarla o per valutare) oppure una valutazione già iniziata. */
  const openJSON = async want => {
    const obj = await importJSONFile();
    if (!obj) return;
    if (obj.tipo === 'sessione') openSessionObj(obj, true);
    else if (obj.tipo !== 'template') toast('Il file non è una verifica né una valutazione di questa app', 'error');
    else if (want === 'eval') startSession(obj);
    else openTemplateObj(obj, true);
  };
  return html`<div class="page">
    ${draft ? html`<div class="alert info row gap wrap">
      <span class="grow">C'è del lavoro non scaricato del ${fmtWhen(draft.savedAt)}${draft.tpl ? ' (verifica «' + Model.templateTitle(draft.tpl) + '»)' : ''}${draft.ses ? ' (valutazione' + (draft.ses.classe ? ' ' + draft.ses.classe : '') + ')' : ''}.</span>
      ${draft.tpl ? html`<button class="btn small" onClick=${() => openTemplateObj(draft.tpl, false)}>Riprendi verifica</button>` : null}
      ${draft.ses ? html`<button class="btn small" onClick=${() => openSessionObj(draft.ses, false)}>Riprendi valutazione</button>` : null}
      <button class="btn small" onClick=${() => { Draft.clear(); refresh(); }}>Scarta</button>
    </div>` : null}
    <div class="home-grid">
      <section class="card mode">
        <div class="mode-icon">✎</div>
        <h2>Creazione verifica</h2>
        <p class="muted">Indicatori, livelli, esercizi, domande chiuse e versioni DSA / NAI / PEI. Esporta la griglia in PDF o HTML.</p>
        <div class="row gap wrap">
          <button class="btn primary" onClick=${() => openTemplateObj(Model.newTemplate(), false)}>Nuova verifica</button>
          <button class="btn" onClick=${() => openJSON('edit')}>Apri verifica (JSON)</button>
        </div>
      </section>
      <section class="card mode">
        <div class="mode-icon">✓</div>
        <h2>Valutazione</h2>
        <p class="muted">Applica una verifica a una classe, inserisci i punteggi e ottieni voto, griglie per studente e riepilogo.</p>
        <div class="row gap wrap">
          <button class="btn primary" title="Scegli il JSON della verifica da applicare alla classe" onClick=${() => openJSON('eval')}>Nuova valutazione da verifica (JSON)</button>
          <button class="btn" title="Scegli il JSON di una valutazione salvata" onClick=${() => openJSON('eval')}>Apri valutazione (JSON)</button>
        </div>
      </section>
    </div>
    <p class="muted small center">Verifiche e valutazioni si salvano come file JSON sul tuo computer: con «Salva» scarichi il file, con «Apri» lo riprendi.
      Se usi Google Drive per desktop, salvali in una cartella di Drive per averli anche sugli altri dispositivi.</p>
  </div>`;
}

/**
 * Se una schermata va in errore mentre viene disegnata, mostra il messaggio invece di
 * lasciare l'app bloccata, così si può tornare alla home e segnalare il problema.
 */
function Safe({ children }) {
  const [err, reset] = htmPreact.useErrorBoundary(e => {
    console.error(e);
    S.busy = null;
  });
  if (!err) return children;
  return html`<div class="page"><div class="alert warn">
    <h2>Si è verificato un errore in questa schermata</h2>
    <p>Il lavoro non salvato resta nella bozza del browser. Copia il messaggio qui sotto se vuoi segnalarlo.</p>
    <pre class="err-box">${String(err && err.message || err)}${'\n\nSchermata: ' + S.view + (S.view === 'builder' ? ' / ' + S.builderTab : S.view === 'session' ? ' / ' + S.sesTab : '') + ' · versione app ' + APP_VERSION}${err && err.stack ? '\n\n' + String(err.stack).split('\n').slice(0, 6).join('\n') : ''}</pre>
    <div class="row gap">
      <button class="btn primary" onClick=${() => { S.view = 'home'; S.busy = null; reset(); refresh(); }}>Torna alla home</button>
      <button class="btn" onClick=${() => { S.busy = null; reset(); refresh(); }}>Riprova</button>
    </div>
  </div></div>`;
}

function App() {
  const [, set] = useState(0);
  _bump = () => set(x => x + 1);
  const crumbs = { home: null, builder: 'Creazione verifica', session: 'Valutazione' }[S.view];
  return html`
    <header class="topbar">
      <button class="brand" onClick=${() => leaveTo('home')}><span class="logo">▦</span> Griglie di valutazione</button>
      ${crumbs ? html`<span class="crumb">› ${crumbs}</span>` : null}
    </header>
    <main>
      <${Safe} key=${S.view}>${S.view === 'home' ? html`<${Home} />` : S.view === 'builder' ? html`<${Builder} />` : html`<${Session} />`}<//>
    </main>
    ${S.busy ? html`<div class="busy"><div class="spinner"></div>${S.busy}</div>` : null}
    <${Dialog} />
    ${S.toast ? html`<div class=${'toast ' + S.toast.kind} onClick=${() => { S.toast = null; refresh(); }}>${S.toast.msg}</div>` : null}`;
}

window.addEventListener('beforeunload', e => {
  if ((S.view === 'builder' && S.tplDirty) || (S.ses && S.sesRev !== S.savedRev)) { e.preventDefault(); e.returnValue = ''; }
});

(function boot() {
  const style = document.createElement('style');
  style.textContent = Grid.css;
  document.head.appendChild(style);
  render(html`<${App} />`, document.getElementById('app'));
})();
