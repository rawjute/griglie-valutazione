# Griglie di valutazione

Web app per costruire griglie di valutazione per indicatori e usarle per correggere le verifiche di una classe.
È **un unico file HTML**: si apre con un doppio clic nel browser (Chrome, Edge o Firefox) e non richiede account, server o installazioni. Serve solo la connessione a Internet, per caricare le librerie dell'interfaccia e dei PDF/Excel.

## Cosa c'è nella cartella

| Percorso | Contenuto |
|---|---|
| `dist/Griglie di valutazione.html` | **L'app**: è l'unico file che ti serve |
| `docs/index.html` | La stessa app, per la pubblicazione su GitHub Pages |
| `src/` | Sorgenti (servono solo per modificare l'app) |
| `tools/build.ps1` | Rigenera il file in `dist/` dopo una modifica ai sorgenti |
| `tools/serve.ps1` | Server locale per lo sviluppo (`http://localhost:8765/src/index.html`) |

## Come si usa

- **Salvare**: in una verifica o in una valutazione il pulsante *Salva (scarica JSON)* scarica un file `.json`. Tienilo in una cartella tua: se usi Google Drive per desktop, puoi metterlo in una cartella di Drive per averlo anche sugli altri computer.
- **Riprendere**: dalla home, *Apri verifica (JSON)* o *Apri valutazione (JSON)*.
- **Valutare una classe**: *Nuova valutazione da verifica (JSON)* oppure, dalla verifica aperta, *Valuta una classe*. Poi carichi l'elenco studenti da un file CSV o Excel.
- **Lavoro non salvato**: finché non scarichi il JSON, nel browser resta una bozza. Alla riapertura la home propone di riprenderla.
- **Export**: dalla verifica, la griglia in PDF o HTML; dalla valutazione, XLSX con riepilogo e griglie, un PDF con tutte le griglie oppure uno ZIP con un PDF per studente. Finiscono nella cartella dei download del browser.

## Elenchi classe

Un file per classe, CSV o Excel. Il nome del file diventa il nome della classe: `3P.csv` → classe 3P.
Le colonne sono **nome**, **cognome** e **BES**. Il BES può essere vuoto o "no" (versione standard), oppure DSA, NAI o PEI: lo studente viene abbinato alla versione della verifica con quella tipologia.
Il CSV può usare il punto e virgola, come quello salvato da Excel in italiano.

## Come vengono calcolati i punteggi

- Ogni **indicatore** ha un punteggio massimo, cioè la scala su cui inserisci i voti (es. 0–20), e **livelli propri**: numero, nomi, percentuali e descrittori possono cambiare da un indicatore all'altro.
- Per ogni livello indichi **fino a che percentuale** del massimo arriva. Il livello più alto arriva sempre al 100 %, l'ultimo parte da 0. Le fasce usano anche i decimali: un livello arriva fino a percentuale × massimo (incluso) e parte appena sopra il limite del livello inferiore. Su 15 punti con la scala predefinita: Eccellente "> 12 – 15", Buono "> 9 – 12", Sufficiente "> 6,75 – 9", Insufficiente "> 4,5 – 6,75", Gravemente insufficiente "0 – 4,5".
- La scheda *Livelli predefiniti* contiene la scala data ai nuovi indicatori (Eccellente 100 %, Buono 80 %, Sufficiente 60 %, Insufficiente 45 %, Gravemente insufficiente 30 %); puoi anche applicarla a tutti.
- Il punteggio di ogni indicatore **si divide in parti uguali tra le domande da valutare che lo coprono**: un indicatore da 20 coperto da 4 domande vale 5 in ciascuna. Il "grezzo" di una domanda è la somma di queste parti.
- Ogni **domanda da valutare** (DV1, DV2…) ha un peso intero in punti: il grezzo arrotondato senza cambiarne la somma (metodo dei resti maggiori), più la **correzione** (il tuo bias). Se le correzioni non sommano a zero cambia anche il totale della verifica, e l'app lo segnala.
- Ogni casella domanda × indicatore vale una parte del peso della domanda. Il punteggio di una domanda è la somma della sua riga, il punteggio di un indicatore la somma della sua colonna. Partono dalla stessa matrice, quindi **i due totali coincidono sempre**. Senza correzioni e arrotondamenti ogni indicatore pesa esattamente quanto previsto.
  - *Proporzionale*: il peso della domanda si divide in proporzione alle parti degli indicatori coinvolti.
  - *Bilanciata*: le caselle vengono riaggiustate in modo che ogni indicatore pesi quanto previsto anche dopo correzioni e arrotondamenti.
- In correzione inserisci i punti sulla scala dell'indicatore. Il punteggio della domanda è la somma, per ogni indicatore, di (punti / massimo) × valore della casella. Accanto a ogni indicatore vedi le fasce dei livelli; il descrittore del livello compare nella barra in fondo mentre scrivi o passando sopra una fascia.
- Le **domande chiuse** sono un blocco a sé e si sommano alle domande da valutare. Ce ne sono di due tipi:
  - *Risposta singola* (DS): si indica solo quante sono e quanto vale ciascuna. In correzione si inseriscono i tre conteggi: corrette, errate, non date.
  - *Risposta multipla* (DM1, DM2…: associazioni, cloze, completamenti, più risposte da indicare…): ha un numero di parti e dà un punteggio parziale, punti × parti corrette / parti totali. In correzione si inserisce quante parti sono corrette.
- **Voto** = punteggio / totale × 10, prima con due decimali e poi arrotondato al mezzo voto. Il **voto minimo** (predefinito 2) si imposta nei dati generali, in due modi:
  - *Soglia*: un voto calcolato sotto il minimo diventa il minimo (60 % dei punti = 6).
  - *Scala*: 0 punti = voto minimo, punteggio pieno = 10. Con minimo 3, voto = 3 + punteggio / totale × 7.
- Il **punteggio totale** non si imposta: è la somma dei massimi degli indicatori (più le eventuali correzioni) e dei punti delle domande chiuse.
- **Versioni** (DSA, NAI, PEI…): ogni domanda da valutare e ogni domanda chiusa mantengono il punteggio che hanno nella standard. Il totale della versione è la somma di quello che contiene, e il voto si calcola su quel totale. Per le domande chiuse ogni versione può avere un numero diverso di risposte singole (anche maggiore), scegliere quali risposte multiple della verifica base includere e aggiungerne di proprie.
- Dalla valutazione, **Modifica verifica** apre la verifica nell'editor; *Applica alla valutazione e torna* aggiorna la valutazione mantenendo i punteggi già inseriti.

## Pubblicazione su GitHub Pages

L'app può stare online su GitHub Pages, gratis, a un indirizzo del tipo `https://<utente>.github.io/<repository>/`.
Anche online non c'è nessun server: verifiche, valutazioni e dati degli studenti restano nel browser di chi usa l'app e nei file JSON che scarica.

1. Su GitHub crea un repository, ad esempio `griglie-valutazione`. Con un account gratuito, per usare Pages deve essere **pubblico**.
2. Carica il contenuto di questa cartella:
   - con Git: `git push`;
   - oppure dal sito: *Add file → Upload files*, trascinando le cartelle `docs`, `src`, `tools` e i file `README.md` e `.gitignore`.
3. Nel repository vai su **Settings → Pages**. In *Source* scegli **Deploy from a branch**, poi il ramo **main** e la cartella **/docs**, e salva.
4. Dopo un minuto circa l'indirizzo compare nella stessa pagina.

Il sito è pubblicato qui: <https://rawjute.github.io/griglie-valutazione/> (repository <https://github.com/rawjute/griglie-valutazione>).

Per aggiornarlo dopo una modifica ai sorgenti, dalla cartella del progetto:

```
powershell -ExecutionPolicy Bypass -File tools/build.ps1
git add -A
git commit -m "Descrizione della modifica"
git push
```

GitHub Pages ripubblica da solo in circa un minuto.

## Modificare l'app

Dopo aver cambiato i file in `src/`, rigenera l'app:

```
powershell -ExecutionPolicy Bypass -File tools/build.ps1
```
