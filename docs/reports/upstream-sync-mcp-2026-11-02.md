# Aggiornamento upstream e correzioni MCP — 2 novembre 2026

## Revisioni e stato

- Fork: `KristianLentino99/money-tracker`, base `origin/dev` a `4ee7e4e2f`.
- Originale: `letehaha/moneymatter`, `upstream/dev` a `7d0d342e2`; versione frontend `0.33.8`.
- Integrati 87 commit upstream, di cui 81 non di merge, sul ramo locale `codex/upstream-sync-mcp-2026-11-02`.
- Risolti 102 conflitti, di cui 76 nei file di traduzione. Conservate le estensioni del fork per manutenzione veicoli, portafogli manuali, contributi investimento e navigazione mobile.
- Integrazione preparata senza commit, push o deploy. Nessuna migrazione eseguita sul database di produzione.

## Novità upstream

Pagamento di una transazione da più conti, metodo di pagamento predefinito per conto, nuove modalità di limite/obiettivo per i tracker, avvisi sulle perdite degli investimenti e loghi per portafogli e venture. Incluse le nuove opzioni di autenticazione Apple/OIDC, le correzioni ai periodi degli obiettivi, gli aggiornamenti di importazione/categorizzazione e documentazione.

Sette nuove migrazioni upstream: modalità limite dei tracker, fatturazione Apple, rimozione MCC, pagamenti su più conti, metodo di pagamento predefinito, stato degli avvisi perdite e loghi portafogli/venture. Le migrazioni già presenti in `dev` non sono state riscritte.

## Diagnosi dell'accesso MCP

Le chiamate autenticate al connettore di produzione hanno elencato i sei conti e letto transazioni storiche di Cash, Fineco, Macbook Pro e BPM, fino al 2024. Ford Fiesta e Directa hanno restituito una lista vuota per il registro ordinario nell'intervallo verificato; questo non implica l'assenza di altri dati, come operazioni d'investimento. Una chiamata con `offset: 500` ha letto correttamente un'ulteriore pagina.

Non è stato riprodotto un blocco generale dell'accesso tra conti. I valori predefiniti di 30 giorni e 50 risultati, il massimo di 500 risultati per pagina e la paginazione per offset erano presenti fin dall'introduzione dello strumento.

È stato invece confermato un errore nella discovery pubblica di `finance.kristianlentino.it`: la server card indicava `https://mcp.moneymatter.app/mcp`, il server OAuth indicava `https://api.moneymatter.app/api/v1/auth` e l'indice delle skill rimandava al sito originale. Questo può indirizzare un nuovo client verso il servizio sbagliato; non dimostra che il connettore già configurato usasse quegli indirizzi.

## Correzioni del fork

- `search_transactions` accetta `allTime: true`, mantiene gli eventuali limiti di data espliciti e restituisce `hasMore` e `nextOffset`. Valida limiti e offset interi; resta compatibile con il comportamento predefinito.
- Le ricerche MCP mantengono ogni movimento dei pagamenti su più conti. La lista dell'app conserva il raggruppamento upstream.
- Descrizioni e guida spiegano come includere tutti i conti, distinguere gli esclusi dalle statistiche, leggere tutte le pagine e cercare separatamente le operazioni d'investimento.
- All'avvio dell'immagine self-host, server card, endpoint operativi della skill e indice vengono adattati all'origine configurata in `MCP_BASE_URL`. Il digest della skill servita viene ricalcolato. I file sorgente mantengono i valori generici upstream.
- Pagamenti su più conti e contributi investimento sono mutuamente esclusivi; la validazione prima della scrittura impedisce di ignorare parti di pagamento inserite nel modulo.
- La nuova migrazione dei pagamenti usa il campo persistito `isForecastOnly` del fork nella vista `real_transactions`, sia nell'avanzamento sia nel rollback. Il primo avvio E2E aveva riprodotto l'errore di colonna mancante prima della correzione.
- Aggiunti 516 fallback inglesi necessari all'integrazione delle lingue. Le lacune di traduzione preesistenti rimangono fuori ambito.

## Verifiche

- Backend unit: 203 suite e 2.748 test passati; una suite e 104 test saltati.
- Frontend unit finale: 301 suite e 3.957 test passati; una suite e 33 test saltati.
- MCP unit finale mirato: 10 suite, 105 test passati.
- Le nuove regressioni MCP e il conflitto contributo/pagamento sono stati verificati in stato fallito prima della correzione.
- Lint e TypeScript backend/frontend passati; rimangono 225 warning backend e quattro frontend.
- Build di produzione backend e frontend passate, incluso il contratto PWA.
- Tutti gli 838 file JSON delle lingue sono validi; nessuna nuova chiave mancante. Tre differenze nei placeholder erano già presenti nelle revisioni di base.
- Verifiche degli spazi Git e sintassi shell passate.

- Build Docker frontend e smoke test HTTP passati con `MCP_BASE_URL=https://finance.verify.example`: verificati trasporto MCP, OAuth, indice, skill, registrazione e digest, oltre a sitemap e noindex. Immagine locale `money-tracker-frontend:mcp-verify-2026-11-02`, digest `sha256:e038288e295d948c74262874e9f572469ce8866ca938ad77f1a27f7cadc6df26`.

- E2E backend Docker: 51 suite passate, 669 test passati, uno saltato e zero fallimenti. Tutte le migrazioni applicate da zero. Coperti visibilità HTTP MCP, storico tra conti, pagamenti su più conti, condivisione, backup/ripristino, portafogli, contributi raggruppati, job, autenticazione/fatturazione Apple e avvisi investimenti. Container, rete e volumi di test ripuliti dallo script. Rimane un warning non bloccante di chiusura dei worker Jest.

Le verifiche dimostrano il comportamento locale del codice e dell'immagine. La pubblicazione e la verifica autenticata della versione aggiornata in produzione sono ancora da eseguire dopo l'autorizzazione esplicita al push.

Log della sessione: `/tmp/money-tracker-*-2026-11-02.log`.
