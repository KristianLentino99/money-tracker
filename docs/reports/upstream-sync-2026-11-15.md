# Aggiornamento Money Matter — 15 novembre 2026

## Revisioni

- Base del fork: `70eb9e390` (`dev`).
- Upstream: `letehaha/moneymatter`, tag `v0.33.16` (63 commit nuovi).
- Nuove migrazioni: `20261107000000-add-transactions-trash`, `20261109000000-add-venture-capital-refund-event`, `20261110000000-subscription-custom-interval`, `20261113000000-restore-dangling-default-category`, `20261114000000-add-missing-fk-indexes`, `20261115000000-add-transactions-exclude-from-stats`.

## Novità upstream

- Cestino delle transazioni e flag «escludi dalle statistiche» (#891).
- Ricerca universale nell'elenco transazioni, endpoint extract-message, impostazioni iPhone Add Expense.
- Intervalli di ricorrenza personalizzati per gli abbonamenti (#875).
- Sidebar ridimensionabili, ordinamento conti con direzione, nuova landing page.
- Refactor dei provider bancari (sync, Walutomat, Enable Banking, SimpleFIN) e correzioni varie.

## Adattamenti del fork

- `isPlanned` → `isForecastOnly` anche nelle due nuove migrazioni che ricreano la vista `real_transactions` e nei file auto-uniti.
- Landing: presa quella upstream (le modifiche del fork erano minime).
- Widget struttura spese: presa la versione upstream; la percentuale mostrata dal fork è stata portata nel grafico a ciambella condiviso.
- Sidebar: larghezza ridimensionabile upstream, senza il pulsante Feedback rimosso dal fork.
- Helper di test MCP: `callMcpTool` del fork rinominato `callMcpSessionTool` (il `/mcp` upstream è senza sessione).
- Traduzioni: unione chiavi, italiano con la formulazione del fork.

## Verifiche locali

- TypeScript e lint passati.
- Backend unit: 246 suite, 3.928 test passati.
- Frontend unit: 321 file, 4.243 test passati.
- E2E backend: al primo giro 12 suite in timeout per carico della macchina; rieseguite in serie, tutte passate (623 test).
