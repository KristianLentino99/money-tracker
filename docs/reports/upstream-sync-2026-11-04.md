# Aggiornamento Money Matter — 4 novembre 2026

## Revisioni

- Produzione/base del fork: `a60e70f97` (`origin/dev`).
- Upstream: `letehaha/moneymatter`, ramo `dev`, `e6d3111a3`.
- Versione frontend: `0.33.9`.
- Inclusi otto nuovi commit upstream e tre commit upstream già presenti sul ramo locale ma non pubblicati.
- Nessuna nuova migrazione del database.

## Novità

- Investimenti: usa l'ultimo prezzo negoziato di Yahoo/FMP e associa le quotazioni azionarie al giorno della sessione; conserva i timestamp intraday per le criptovalute.
- Esportazione: conserva la categoria radice e il percorso delle sottocategorie annidate.
- Importazione: “Visualizza transazioni” apre il lotto appena importato.
- Tabella transazioni: la scelta della categoria nell'editor rapido salva subito la modifica.
- Campi di selezione: il pulsante per cancellare il valore funziona senza aprire la lista.
- Layout: barra di scorrimento accessibile sopra l'intestazione fissa.
- Italiano riconosciuto upstream come lingua della community; aggiornamenti delle traduzioni e loghi delle integrazioni bancarie.
- Landing upstream: pagina di supporto e aggiornamenti delle pagine legali.

## Adattamenti del fork

- Risolti i conflitti dell'italiano usando il registro centralizzato delle bandiere upstream, senza duplicare lingua e locale delle date.
- Conservati dimensionamento flessibile, safe area e spaziatura della navigazione mobile.
- Ripristinate 613 chiavi ancora necessarie eliminate dall'aggiornamento Crowdin: 349 italiane e 24 per ciascuna di altre 11 lingue. Conservate le nuove traduzioni upstream. L'italiano contiene tutte le chiavi inglesi.
- Conservate le funzionalità personalizzate per veicoli, portafogli manuali, contributi investimento e discovery MCP self-hosted.
- Test E2E dei nuovi casi di quotazione adattati alle API HTTP: ricerca titoli, creazione posizioni e lettura prezzi tramite helper di endpoint, senza accessi diretti ai modelli.
- Documentazione Finance allineata all'istanza attuale `money-tracker-finance-prod-1gb`, 1 GB RAM con 2 GB swap, stesso IP di produzione.

## Verifiche locali

- Backend unit: 203 suite e 2.748 test passati; una suite e 104 test saltati.
- Lint e TypeScript backend/frontend passati, zero errori (225 warning backend, quattro frontend).
- Build di produzione backend/frontend e contratto PWA passati.
- Frontend unit: 302 file e 3.961 test passati; un file e 33 test saltati.
- Traduzioni: 893 file JSON validi; placeholder delle 613 chiavi ripristinate coerenti con l’inglese.
- Revisione: nessuna regressione applicativa confermata; adattato l’accesso HTTP nei nuovi E2E investimenti.
- Preflight produzione: checkout pulito a `a60e70f97`, backend/database/Redis sani, 24 GB disco liberi.

Il rilascio resta subordinato alla conclusione degli E2E e alla conferma esplicita del push richiesta dalle regole del progetto.
