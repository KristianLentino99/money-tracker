# Aggiornamento del fork — 8 ottobre 2026

## Origine e ambito

- Fork: `KristianLentino99/money-tracker`, branch `dev`, base `50d44460`.
- Repository originale: `letehaha/budget-tracker`, branch `dev`, commit `de5319f7`.
- Ultima base upstream già integrata: `54274d24`.
- Nuovi commit upstream: 28, inclusi i merge. Il frontend upstream dichiara versione `0.30.6`; il confronto è con il branch di sviluppo, non con una sola release pubblicata.
- Ramo di integrazione: `codex/upstream-sync-2026-10-08`.
- Alla conclusione della preparazione, il working tree iniziale era pulito e il merge locale era risolto e preparato nell'indice, senza commit, push o deploy. Successivamente l'utente ha autorizzato la finalizzazione del merge, la pubblicazione su `origin/dev` e il deploy, da eseguire come passaggi successivi.

## Novità integrate

| Area                           | Novità e correzioni                                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transazioni                    | Duplicazione di una transazione con data corrente, pulsante e scorciatoia; modalità «Crea ancora» per inserimenti consecutivi senza richiudere il modulo. Copia controllata dei campi, reinizializzazione del modulo e protezioni sui trasferimenti non duplicabili. |
| Dashboard e imposte            | Widget delle imposte con aliquota media rispetto alle entrate, andamento mensile e dettaglio per categoria. Selezione delle categorie fiscali nelle impostazioni.                                                                                                    |
| Flussi di denaro               | Sankey con sottocategorie e ramo dedicato alle imposte; miglioramenti a etichette, disposizione e lista associata.                                                                                                                                                   |
| Navigazione                    | Possibilità di nascondere i collegamenti a prestiti, investimenti e venture nel gruppo Conti; applicata anche alla sidebar compatta.                                                                                                                                 |
| Importazioni                   | Registrazione dei batch e degli effetti sui saldi iniziali; annullamento che ripristina quegli effetti, gestione dei conti creati dal batch e blocco dell'annullamento durante un'importazione ancora attiva. Backup e ripristino includono i nuovi dati.            |
| Conti bancari                  | Correzioni al tipo delle transazioni dopo scollegamento/ricollegamento. Protezioni contro importazioni, rettifiche e movimenti manuali incompatibili con i saldi gestiti dalla banca.                                                                                |
| Pagamenti ricorrenti           | Blocco della creazione manuale e della registrazione automatica sui conti sincronizzati. Rimangono possibili il solo aggiornamento dello stato e il collegamento a movimenti esistenti.                                                                              |
| Sicurezza MCP                  | Accesso al trasporto subordinato a `finance:read`; eliminazione e unione dei beneficiari richiedono `finance:delete`. Controlli automatici dei permessi aggiornati per coprire gli strumenti del fork.                                                               |
| Lingue e piccoli miglioramenti | Tedesco disponibile come lingua della comunità, aggiornamenti delle traduzioni, anno limitato a quattro cifre nel campo data, nomi dei conti obbligatori e testo delle rate corretto.                                                                                |
| Provider e telemetria          | Correzioni alla sincronizzazione iniziale Enable Banking, disponibilità limitata per nuovi utenti cloud e chiarimento del supporto SimpleFIN ai conti bancari. Nuovo evento di inizio abbonamento in PostHog.                                                        |

## Conciliazione con il fork

- Risolti 42 conflitti iniziali, di cui 27 nei file di traduzione.
- Conservati Plans, collegamenti ai pagamenti ricorrenti, manutenzione dei veicoli, contributi investimento raggruppati, portafogli manuali e configurazione Terraform/Lightsail.
- Conservati la shell mobile/PWA, il pulsante mobile di creazione e la navigazione Plans. La duplicazione apre il modulo globale sia su desktop sia su mobile.
- Conservata la rimozione dell'interfaccia per aggiungere nuove connessioni bancarie: il componente SimpleFIN eliminato nel fork non viene ripristinato.
- Il dialogo di pagamento del fork continua a offrire il collegamento a una transazione esistente; sui conti bancari offre stato e collegamento, sui conti manuali creazione e collegamento.
- Adattati i nuovi percorsi e test frontend/backend al campo `isForecastOnly` del fork. La nuova migrazione bancaria viene resa compatibile prima dell'esecuzione; nessuna migrazione già presente in `dev` viene riscritta.
- Registro e tipi dei backup includono sia le estensioni del fork sia i nuovi batch. I vecchi Budgets non vengono ripristinati.
- Conservato il catalogo MCP esteso. Il test upstream che riconosceva solo chiamate dirette a `requireScope` è adattato a `assertMcpMutationAllowed`, che applica già i permessi e il blocco delle mutazioni durante il ricalcolo valuta. Lo scanner controlla tutte le registrazioni di ogni file e i permessi distruttivi restano espliciti.
- L'estensione del controllo dei permessi ha individuato una lacuna reale del fork: `delete_plan_category_target` eliminava un obiettivo con il solo `finance:write`. Ora richiede `finance:delete`, anche nella descrizione pubblica. `suggest_subscription_matches`, che calcola candidati senza scrivere dati, resta una lettura riconosciuta esplicitamente.
- Corretto un problema upstream nelle importazioni concorrenti: un job bloccato non deve impostare come terminati tutti i batch incompleti dello stesso utente, rendendo annullabile un altro import ancora attivo. La regressione è stata riprodotta con un test fallito prima della correzione. Rimane il timeout di protezione previsto per i batch interrotti.
- Italiano: tradotte 48 nuove chiavi upstream e aggiornati due messaggi sul fallback dei cambi. Per le altre lingue sono aggiunti 473 valori di fallback inglesi mancanti, senza sostituire traduzioni esistenti. Verificati 729 file JSON e i placeholder delle nuove chiavi.

## Migrazioni nuove

1. `20261001000000-create-import-batches.ts`: tabelle dei batch e relativi effetti sui conti.
2. `20261007000000-disable-auto-record-on-bank-accounts.ts`: disabilita la registrazione automatica sui conti bancari già configurati.
3. `20261007000000-restore-relinked-transactions-account-type.ts`: ripara i tipi delle transazioni dopo ricollegamento, rispettando `isForecastOnly`.

Queste migrazioni saranno necessarie alla pubblicazione. Nessuna migrazione è eseguita sul database di produzione durante questo lavoro.

## Verifiche

- Lint e TypeScript backend/frontend: passati, zero errori. Il lint segnala 145 warning backend e sette frontend.
- Unit frontend: 236 suite passate, una saltata; 3.069 test passati, 33 saltati.
- Unit backend: la prima esecuzione completa ha passato 175 suite e individuato il test di deriva dei permessi incompatibile con le protezioni del fork. Dopo l'estensione dello scanner sono emersi il caso di sola lettura e il permesso distruttivo descritti sopra. Verifica finale mirata: nove suite, 65 test passati, inclusi i controlli MCP e la regressione delle importazioni concorrenti.
- Regole lint backend: 18 test passati.
- Build di produzione backend/frontend: passate, incluso il controllo del contratto PWA.
- E2E backend completo: database isolato creato da zero, tutte le migrazioni passate e dati di cambio verificati. **258 suite passate, tre fallite e due saltate; 3.235 test passati, tre falliti, 52 saltati e sette TODO.** I fallimenti sono la fixture dei cambi, un timeout di preparazione database/Redis in `get-combined-balance-history` e una risposta 429 inattesa nel test delle sincronizzazioni concorrenti dei prezzi. Nessun altro fallimento nella suite completa.
- Esecuzione E2E finale: immagine ricostruita dal codice definitivo; verifica seriale di MCP, import CSV, annullamento/storico importazioni e delle tre suite con fallimenti: **nove suite, 160 test passati, zero fallimenti**. Tutti e tre i casi falliti nella suite completa passano in questa esecuzione. Le risorse Docker di test sono state ripulite dallo script.
- Revisione statica mirata: nessun ulteriore problema confermato nelle interazioni mobile, transazioni previsionali, pagamenti ricorrenti, backup, Plans e manutenzione. Il problema delle importazioni concorrenti è stato corretto come descritto sopra.

La suite completa ha anche fatto emergere una fixture valutaria preesistente non isolata: un cambio USD/valuta base lasciato da altri test poteva prevalere sul cambio atteso dalla fixture. La correzione isola e ripristina la coppia di cambi, mantenendo il risultato atteso `4800`; non cambia i calcoli applicativi. Il timeout e il rate limit non si riproducono nella verifica seriale finale: non è stata stabilita una causa definitiva per quelle due interferenze.

La suite completa è stata eseguita prima delle ultime correzioni puntuali a guardia MCP, handler dei job import falliti e fixture FX. Dopo quelle modifiche sono state eseguite le nove suite finali mirate, senza ripetere l'intera suite.

Log di questa sessione: `/tmp/money-tracker-upstream-2026-10-08-*.log`. Risultati finali in `backend-unit-final.log`, `backend-e2e-final.log`, `final-lint.log`, `final-types.log` e `final-backend-fixture-types.log`, con lo stesso prefisso.

Le verifiche locali non dimostrano il comportamento del server pubblicato o del browser su un dispositivo fisico. Gli E2E frontend richiedono frontend e API locali attivi, assenti all'inizio del lavoro.
