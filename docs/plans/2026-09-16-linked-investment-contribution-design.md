# Contributi al portafoglio con acquisti collegati

## Obiettivo

Dal form di inserimento di una spesa, l'utente può registrare il movimento dal conto corrente verso un portafoglio di investimenti e, nella stessa operazione, indicare uno o più strumenti acquistati con quei fondi.

Il flusso deve:

- mantenere la spesa visibile nella lista del conto;
- permettere la scelta manuale di una categoria esistente, inclusa la categoria `Investimenti`;
- escludere il movimento dai totali delle spese di consumo;
- supportare più acquisti per lo stesso trasferimento;
- lasciare nel portafoglio l'eventuale residuo non investito;
- salvare trasferimento e acquisti atomicamente;
- gestire strumenti già presenti e nuovi strumenti aggiunti tramite ricerca.

## Decisioni di prodotto

- La schermata parte dalla modalità **Spesa**, non dalla modalità **Trasferimento**.
- L'utente seleziona sempre una categoria esistente: non viene applicato alcun default.
- Il collegamento al portafoglio è opzionale.
- Ogni riga di acquisto contiene strumento, quantità, prezzo unitario, commissioni e data propria. L'importo viene calcolato automaticamente.
- La data del trasferimento precompila quella di ogni acquisto, ma ogni riga resta modificabile.
- Il totale degli acquisti può essere inferiore al trasferimento. Il residuo viene mostrato come liquidità nel portafoglio.
- Gli acquisti non possono superare i fondi assegnati al trasferimento nella relativa valuta.
- Il flusso richiede almeno una riga quando il collegamento a investimento è attivato. Il trasferimento semplice resta disponibile nel flusso esistente.
- Modifica e cancellazione trattano trasferimento e acquisti come un'operazione raggruppata, con conferma esplicita prima di rimuovere acquisti.
- Per i conti sincronizzati la banca resta la fonte autorevole: l'utente seleziona una spesa già importata e usa **Collega a investimento**, senza creare un movimento artificiale.

## Architettura raccomandata

`PortfolioTransfers` diventa la radice dell'operazione. Ogni acquisto collegato riceve una relazione esplicita verso il trasferimento:

```text
Transactions (spesa sul conto)
        1
        |
PortfolioTransfers (conto -> portafoglio)
        1
        |
        *
InvestmentTransactions (acquisti)
```

Aggiungere `portfolioTransferId` nullable a `InvestmentTransactions`, con indice e foreign key verso `PortfolioTransfers`. Il campo nullable preserva la compatibilità con gli acquisti già creati dal flusso attuale. Le associazioni Sequelize e i modelli shared/serializer dovranno esporre il riferimento quando presente.

La transazione sul conto conserva `categoryId` e usa `transferNature = transfer_to_portfolio`. In questo modo il movimento rimane visibile e categorizzabile, mentre i report dei consumi possono escludere la natura di trasferimento. La categoria non deve essere eliminata quando il collegamento viene creato.

Il backend dovrà introdurre un orchestratore per il nuovo aggregate flow. La logica di creazione degli investimenti va resa riutilizzabile nella transazione Sequelize ambientale, evitando di duplicare i calcoli già presenti per holding, costo medio, cambio, commissioni e saldo cash. L'orchestratore creerà o collegherà la transazione sorgente, il trasferimento, le holding mancanti e gli acquisti nella stessa transazione database.

## API e flusso dati

Endpoint raccomandato per una nuova spesa:

```text
POST /investments/portfolios/:portfolioId/contributions
```

Il payload contiene `accountId`, `amount`, `date`, `categoryId`, nota opzionale e `purchases[]`. Ogni acquisto contiene `securityId` oppure `searchResult`, `quantity`, `price`, `fees`, `date` e i campi di regolamento già supportati:

- `settlementCurrencyCode`;
- `settlementAmount`;
- `settlementFees` oppure `settlementRate`.

Per un movimento bancario esistente si userà un endpoint dedicato o una variante con `transactionId`, ad esempio:

```text
POST /transactions/:transactionId/investment-contribution
```

Questa variante non modifica conto, importo o data della transazione bancaria. Promuove il movimento al trasferimento di portafoglio e aggiunge gli acquisti collegati.

Il servizio esegue nell'ordine logico seguente:

1. verifica ownership di conto, portafoglio e strumenti;
2. risolve i risultati di ricerca e crea le holding mancanti;
3. valida quantità, prezzi, commissioni, date e regolamento;
4. riconcilia gli importi per valuta senza sommare numericamente valute diverse;
5. crea o aggiorna la transazione sul conto;
6. crea `PortfolioTransfers` e collega la transazione sorgente;
7. crea tutte le `InvestmentTransactions` collegate;
8. aggiorna saldi cash e holding;
9. restituisce il gruppo completo.

Il dettaglio di `GET /transactions/:transactionId/portfolio-link` dovrà includere il riepilogo del trasferimento e gli acquisti associati, oppure fornire un endpoint equivalente per il dettaglio del gruppo.

## Esperienza frontend

Nel form spesa, dopo conto e categoria, un toggle mostra la sezione **Collega a un investimento**. Attivandolo, l'utente seleziona il portafoglio e vede:

- importo trasferito;
- totale assegnato per valuta;
- residuo per valuta;
- eventuali avvisi di incoerenza.

Il componente lista degli acquisti deve consentire di aggiungere, rimuovere e riordinare righe. La ricerca riutilizza il catalogo securities esistente. Un risultato non ancora presente nel portafoglio viene creato e trasformato in holding durante il salvataggio atomico; non si crea una security libera priva dei metadati di mercato.

Per ogni riga:

- quantità, prezzo e commissioni sono input decimali;
- l'importo viene calcolato con la logica di settlement esistente;
- la valuta del titolo può differire dalla valuta di regolamento;
- la data parte da quella del trasferimento ma è modificabile.

Nel dettaglio di una transazione collegata, `PortfolioLinkedView` mostrerà il gruppo e un'azione per gestire gli acquisti. La modifica del trasferimento aggiorna il residuo senza cambiare automaticamente quantità o prezzi. Un importo inferiore al totale già investito viene bloccato. La cancellazione mostrerà il numero degli acquisti coinvolti e richiederà conferma.

Il layout userà container queries, coerentemente con il form esistente, così la lista a più colonne reagisce alla larghezza del pannello e non a quella dell'intero viewport.

## Conti sincronizzati

La creazione diretta resta disponibile per i conti manuali. Per i conti sincronizzati:

1. la banca importa la transazione reale;
2. l'utente apre la spesa importata;
3. sceglie **Collega a investimento**;
4. seleziona portafoglio e acquisti;
5. il backend collega la transazione già esistente senza duplicarla.

I vincoli attuali dei conti esterni restano invariati: conto, importo e data non sono modificabili. La categoria può essere scelta secondo le regole già applicate alle transazioni importate.

## Error handling e atomicità

Il backend deve rifiutare l'intera richiesta quando una riga non è valida. Gli errori principali sono:

- portafoglio, conto o security non trovati;
- risorsa appartenente a un altro utente;
- security non supportata o holding non creabile;
- quantità, prezzo o commissioni non validi;
- dati di settlement incompleti o contraddittori;
- acquisti oltre l'importo disponibile nella valuta interessata;
- transazione già collegata a un portafoglio o a un altro gruppo.

Ogni errore deve fare rollback di spesa, trasferimento, holding e acquisti. La cancellazione aggregata deve rimuovere esplicitamente gli acquisti collegati prima di chiudere il trasferimento, con protezione contro l'uso dei vecchi endpoint di cancellazione in modo da lasciare dati orfani.

## Test plan

### Backend e2e

I test devono usare esclusivamente gli endpoint e gli helper e2e del progetto:

- due acquisti su strumenti diversi;
- residuo di liquidità;
- strumento nuovo creato da `searchResult`;
- date diverse per le righe;
- regolamento con valuta diversa dal titolo;
- rifiuto del totale oltre i fondi;
- richiesta senza righe nel nuovo flusso;
- rollback completo quando una riga fallisce;
- collegamento di una transazione bancaria esistente;
- modifica e cancellazione aggregate;
- ownership e doppio collegamento;
- regressione del trasferimento semplice e dell'acquisto indipendente.

### Frontend

Aggiungere test per:

- apertura/chiusura della sezione investimento;
- aggiunta e rimozione delle righe;
- calcolo del totale e del residuo per valuta;
- date indipendenti;
- payload con security esistente o risultato nuovo;
- blocco del submit quando il totale supera i fondi;
- visualizzazione del gruppo nel dettaglio portfolio-linked;
- conferma di cancellazione e gestione degli errori.

Le nuove stringhe UI dovranno essere aggiunte in tutte le locale supportate tramite il subagent `i18n-editor`, mantenendo le chiavi allineate.
