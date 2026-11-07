# Aggiornamento Money Matter — 7 novembre 2026

## Revisioni

- Base del fork: `987f7bd3a` (`origin/dev`).
- Upstream: `letehaha/moneymatter`, tag `v0.33.12` (48 commit nuovi).
- Nuova migrazione: `20261103000000-add-refund-link-amount.ts` (importo per collegamento di rimborso).

## Novità upstream

- Livello MCP ricostruito su `defineTool` e toolset con scope, tool per il resto delle API REST (#762).
- Un rimborso collegabile a più acquisti con quote per collegamento (#853).
- Scansione scontrini con suggerimenti per il modulo, broadcast admin delle notifiche, navigazione da tastiera nei selettori.
- Correzioni a sync bancari, esportazione, importazione YNAB e prestazioni dei grafici.

## Adattamenti del fork

- Architettura MCP upstream come base; riapplicate le personalizzazioni (veicoli, portafogli manuali, contributi, `isManualTracking`, `excludePlanned`, paginazione di `search_transactions`).
- Tool solo-fork convertiti a `defineTool` (manutenzione veicoli, portafoglio manuale, contributi, collegamento rate-prestiti).
- Rinominati i tool duplicati: `get_loan` → `get_loans` con `loanId`; `get_vehicle` → `get_vehicles` con `vehicleId`; `get_subscription_pay_preview` → `preview_subscription_payment`; `suggest_subscription_matches` → `list_subscription_match_suggestions`.
- `isPlanned` → `isForecastOnly` anche nei tool MCP.
- Traduzioni: unione chiavi, italiano con la formulazione del fork.

## Verifiche locali

- TypeScript e lint backend/frontend passati.
- Backend unit: tutte passate (dopo allineamento di un caso su kilometraggio decimale).
- Frontend unit: 308 file, 4.070 test passati.
- E2E backend: 333 suite, 4.455 test passati dopo l'allineamento di due casi veicoli (kilometraggio decimale, odometro monotono).
