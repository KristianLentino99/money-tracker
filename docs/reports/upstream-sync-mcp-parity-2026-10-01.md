# Aggiornamento upstream e parità MCP — 1 ottobre 2026

## Revisione integrata

- Fork: `KristianLentino99/money-tracker`, base locale `dev` a `ee7a1fb5`.
- Originale: `letehaha/budget-tracker`, branch `upstream/dev` a `54274d24`.
- Base comune: `bfe713d5`; 216 commit upstream aggiuntivi.
- Lavoro locale: `codex/upstream-sync-mcp-parity`. Integrazione preparata con merge senza commit; nessun push o deploy.
- I 192 conflitti iniziali sono stati risolti mantenendo le personalizzazioni del fork e incorporando le funzionalità upstream compatibili.

## Novità utili e integrazione con le personalizzazioni

| Novità upstream                                                              | Integrazione nel fork                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calcolatore FIRE e widget di avanzamento                                     | Aggiunti ad analytics/dashboard e navigazione, incluse le correzioni sui traguardi storici.                                                                                         |
| Riconciliazione transazioni: rimozione, unione, ripristino, pending bloccati | Integrata con Plans, collegamenti degli abbonamenti e manutenzione. L'unione conserva il collegamento della visita al movimento superstite; visite incompatibili vengono rifiutate. |
| Allegati, fatture e compilazione guidata di una transazione                  | Inclusi caricamento, entrambe le gambe dei trasferimenti e URL di upload MCP. Collegati anche alla creazione degli acquisti raggruppati del fork.                                   |
| Modifica iniziale del saldo di un conto manuale                              | Integrata con protezioni dei conti e appartenenza ai Plans.                                                                                                                         |
| Modifica delle celle delle transazioni e righe previsionali comprimibili     | Integrate conservando `isForecastOnly` e le personalizzazioni dei filtri.                                                                                                           |
| Dashboard, importi compatti, colori tag e sidebar più compatta               | Integrati anche nei Plans, preservando shell mobile/PWA e valuta esplicita dei valori.                                                                                              |
| Connessioni AI unificate e catalogo modelli aggiornabile                     | Conservati Groq, OpenRouter e DeepSeek, identità dei modelli OpenRouter e preferenze esistenti durante la migrazione.                                                               |
| Sincronizzazione bancaria in batch e aggiornamenti SSE condivisi             | Incorporati per connessioni esistenti. La UI per creare nuove connessioni resta rimossa come nel fork.                                                                              |
| Calcoli FX, riepiloghi portfolio e cash flow                                 | Incorporate ottimizzazioni e correzioni; preservati portafogli manuali e movimenti raggruppati.                                                                                     |
| Self-hosting via Portainer, dipendenze e correzioni auth/import              | Incorporati; conservate configurazioni di deploy e versione Node del fork.                                                                                                          |

Plans sostituisce ancora i vecchi budgets; prestiti, rate collegate, manutenzione, portafogli manuali, ricerca titoli con identità del provider e PWA rimangono nel progetto. Nessuna migrazione aggiuntiva è stata creata per duplicare quelle upstream.

## Parità MCP

Il catalogo passa da 94 a 157 strumenti: uno nuovo upstream per gli allegati e 62 per le personalizzazioni. Registrazione, server card, skill pubblica di connessione e hash del suo indice sono aggiornati insieme.

| Area del fork          | Nuovi strumenti | Copertura                                                                                                                                                                            |
| ---------------------- | --------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plans                  |              16 | CRUD, stato, categorie, obiettivi, viste, assegnazione singola/in blocco, spostamento, auto-assegnazione e undo. Revisioni e requestId mantengono protezioni da concorrenza e retry. |
| Prestiti               |               9 | CRUD, storico saldo, note, collegamento e scollegamento pagamenti, dettagli delle rate. Importi decimali e convenzione di passività negativa.                                        |
| Abbonamenti/rate       |               9 | Periodi, anteprima pagamento, pagamento, salto/ripristino/scollegamento, suggerimenti e associazione a prestito.                                                                     |
| Veicoli/manutenzione   |              16 | CRUD veicoli, attività, piani, visite, promemoria, spese eleggibili e generazione atomica della spesa. Distanze nella preferenza km/mi.                                              |
| Acquisti raggruppati   |               5 | Creazione, associazione a spesa esistente, sostituzione acquisti, eliminazione con flag espliciti e classificazione come rettifica.                                                  |
| Portafogli manuali     |               6 | Vista, movimenti, valutazioni, import JSON, estrazione CSV/AI e import dei record revisionati. Importi come stringhe decimali nella valuta del portfolio.                            |
| Ricerca titoli/holding |               1 | Creazione holding da securityId o risultato completo della ricerca con provider, simbolo, mercato e valuta.                                                                          |

Gli strumenti esistenti sono estesi per metadati dei portfolio, acquisti collegati, rate, filtri previsionali ed esclusione delle rettifiche. Le mutazioni aggiunte applicano autorizzazioni OAuth, sola lettura/demo e blocco durante il ricalcolo della valuta base; anche creazione/modifica MCP delle transazioni applicano quel blocco.

I test usano inizializzazione OAuth e sessioni Streamable HTTP con SDK reale. I test applicativi REST/E2E usano gli endpoint tramite helper; i dati personali del server collegato non vengono modificati per effettuare prove.

## Problemi intercettati durante l'integrazione

- Un tipo data non rappresentabile in JSON Schema bloccava `tools/list`: input ISO e conversione al confine del servizio.
- Lo schema di aggiornamento prestiti perdeva validazioni tra campi: schema REST completo conservato nel campo `data`.
- Le scritture MCP delle transazioni ignoravano il blocco del cambio valuta: controllo condiviso prima di scrivere.
- Il ripristino dei backup deve inserire i movimenti portfolio prima degli acquisti che li referenziano; ordine corretto e test HTTP di round-trip per acquisti raggruppati e relazioni di manutenzione.
- La riconciliazione perdeva i collegamenti/costi della manutenzione: trasferimento, deduplicazione e controllo conflitti prima delle mutazioni; rimozione e ripristino non ricreano implicitamente collegamenti.
- Le viste `real_transactions` devono rispettare l'ordine delle migrazioni: `isPlanned` prima della rinomina, `isForecastOnly` dopo, `deletedAt` solo dopo la sua introduzione. Eccezione alla regola sulle migrazioni già in `dev`: le migrazioni storiche sono isolate dal helper corrente per impedire che un'installazione da zero referenzi colonne introdotte successivamente. Il contratto di ciascuna fase resta quello esistente; non viene richiesta la riesecuzione delle migrazioni in produzione.

## Verifiche

- Backend unit: 173 suite passate, 2.192 test passati, 104 saltati (una suite saltata).
- Frontend unit: 230 file passati, 2.997 test passati, 33 saltati (un file saltato).
- Lint e TypeScript backend/frontend: passati.
- Build di produzione locali backend/frontend: passati; contratto PWA passato.
- Backend E2E completo: 257 suite passate, 3 suite con fallimenti, 2 saltate; 3.166 test passati, 9 falliti, 52 saltati e 7 TODO. I nove fallimenti erano nei fixture di backup/acquisti raggruppati e nel test upstream che considera Groq non supportato.
- Dopo le correzioni, rerun E2E finale di MCP, backup, acquisti raggruppati e catalogo AI: **4 suite passate, 75 test passati, uno saltato**. Nessun fallimento residuo nei percorsi verificati; non è stato ripetuto l'intero E2E dopo modifiche limitate ai fixture e al confine di validazione MCP.
- Adattatori investimento MCP sull'ultimo schema: **27/27 unit passati**.
- Regole lint del backend: **18/18 test passati**.
- Riconciliazione completa: 53/53 passati nella suite completa, incluse le quattro regressioni manutenzione e il ciclo merge/rimozione/ripristino della spesa nei Plans.
- Catalogo SDK reale: elenco dei 157 strumenti uguale alla server card e schemi input serializzabili. Scope in sola lettura, decimali, idempotenza/revisioni, manutenzione, prestiti/rate e acquisti/portafogli manuali verificati via HTTP.

Log finali: `/tmp/money-tracker-backend-unit-final.log`, `/tmp/money-tracker-frontend-unit-final.log`, `/tmp/money-tracker-backend-e2e.log`, `/tmp/money-tracker-final-focused-e2e.log`, `/tmp/money-tracker-investment-parity-final.log`, `/tmp/money-tracker-lint-rule-tests.log`, `/tmp/money-tracker-verified-lint.log`, `/tmp/money-tracker-final-backend-types.log`, `/tmp/money-tracker-verified-types.log`, `/tmp/money-tracker-backend-build-final.log` e `/tmp/money-tracker-final-frontend-build.log`.

Una compilazione locale e i test HTTP locali non dimostrano il comportamento del server pubblicato o del browser su dispositivo fisico.

## Limiti e pubblicazione

Il connettore MCP collegato attualmente espone un catalogo vecchio: comprende ancora `get_budgets`, che il server rifiuta, e non pubblicizza i nuovi strumenti del fork. Le chiamate di lettura a profilo, conti, abbonamenti e portfolio rispondono; questo non verifica le nuove funzioni locali sul server remoto.

Per rendere disponibili le nuove funzioni al connettore servono commit/integrazione in `dev`, push autorizzato, deploy e aggiornamento del catalogo tramite riconnessione; dopo va ripetuta la verifica sul server pubblicato. `scripts/deploy.sh` compila esattamente `origin/dev`, quindi la sola modifica locale non cambia produzione.

Aggiunta la chiave `transactions.reconciliation.maintenanceConflict` in tutte le 13 lingue backend per impedire unioni tra visite di manutenzione incompatibili.

L'italiano del fork è conservato e sono stati tradotti 622 valori/chiavi necessari o pertinenti; una parte dei testi upstream resta in inglese tramite fallback. Non è stata dichiarata una localizzazione italiana completa di tutte le nuove aree upstream.
