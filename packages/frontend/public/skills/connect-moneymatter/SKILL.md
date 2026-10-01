# Connect an AI agent to MoneyMatter

MoneyMatter exposes a remote Model Context Protocol (MCP) server. Connecting an
agent to this server gives the agent OAuth-secured access to the user's
financial data (accounts, transactions, plans, subscriptions, transaction
automations, loans, vehicle maintenance, categories, tags, cash flow, balance history, investment
portfolios, holdings, and investment transactions). The agent can read these
records and — when the user grants the corresponding scopes — create, edit,
and delete them.

Use this skill when the user asks to "connect Claude to my finances", "hook up
ChatGPT to MoneyMatter", "let my AI see my finances", or similar.

## Endpoints

- **MCP transport**: `https://mcp.moneymatter.app/mcp` (Streamable HTTP)
- **Server card**: <https://moneymatter.app/.well-known/mcp/server-card.json>
- **OAuth Authorization Server metadata**: <https://moneymatter.app/.well-known/oauth-authorization-server>
- **OAuth Protected Resource metadata**: <https://moneymatter.app/.well-known/oauth-protected-resource>

## OAuth scopes

| Scope            | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `finance:read`   | Read accounts, transactions, plans, subscriptions, analytics  |
| `finance:write`  | Create and edit transactions, plans, subscriptions, and more  |
| `finance:delete` | Permanently delete records (transactions, plans, portfolios…) |
| `profile:read`   | Read the user's profile (name, email, base currency)          |
| `offline_access` | Receive a refresh token so sessions survive expiration        |

The MoneyMatter consent screen lets the user grant or deny `finance:write` and
`finance:delete` independently. Always request the narrowest set of scopes
sufficient for the job — read-only agents should not request write or delete.
Users can revoke a connected app at any time from the MoneyMatter settings
page.

## Setup steps (Claude Desktop, Claude.ai, ChatGPT, OpenClaw)

1. Ensure the user has a MoneyMatter account. If not: direct them to
   <https://moneymatter.app/sign-up>.
2. In the agent client, add a new MCP server using the URL
   `https://mcp.moneymatter.app/mcp`.
3. The client discovers the OAuth authorization server from the
   `/.well-known/oauth-protected-resource/mcp` endpoint automatically.
4. The client opens a browser window for the user to sign in and authorize
   the requested scopes. The user grants consent in the MoneyMatter UI.
5. On success, the agent receives tokens and can list the tools exposed by
   the server (see below).

## Available tools

| Tool                                              | Purpose                                                                                                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add_plan_category`                               | Add an eligible spending category to a plan                                                                                                                                                                    |
| `add_transactions_to_group`                       | Add one or more transactions to an existing transaction group                                                                                                                                                  |
| `adjust_account_balance`                          | Set an account to a specific balance by creating an adjustment transaction for the difference                                                                                                                  |
| `append_loan_note`                                | Append a user note to the loan timeline                                                                                                                                                                        |
| `archive_account`                                 | Archive or unarchive a user account                                                                                                                                                                            |
| `archive_plan`                                    | Archive or restore a spending plan                                                                                                                                                                             |
| `assign_plan_category`                            | Set one category assignment for a plan period                                                                                                                                                                  |
| `assign_tags_to_transaction`                      | Assign one or more tags to a transaction                                                                                                                                                                       |
| `auto_assign_plan`                                | Apply automatic plan allocation for a period using the current revision                                                                                                                                        |
| `bulk_assign_plan_categories`                     | Set multiple category assignments atomically for a plan period                                                                                                                                                 |
| `bulk_update_transactions`                        | Update multiple transactions at once                                                                                                                                                                           |
| `create_attachment_upload_url`                    | Get a short-lived upload URL for attaching receipt/invoice files (JPEG, PNG, WebP, PDF) to a transaction                                                                                                       |
| `create_category`                                 | Create a new transaction category                                                                                                                                                                              |
| `create_holding`                                  | Add a security as a zero-quantity holding in a portfolio before recording trades                                                                                                                               |
| `create_investment_contribution`                  | Create one grouped investment contribution: source-account expense, portfolio cash movement, holdings and purchases together                                                                                   |
| `create_investment_contribution_from_transaction` | Attach grouped investment purchases to an existing expense transaction without duplicating the account movement                                                                                                |
| `create_investment_transaction`                   | Record a new investment transaction (buy, sell, dividend, fee, etc.) in a portfolio                                                                                                                            |
| `create_loan`                                     | Create a loan account and its loan details                                                                                                                                                                     |
| `create_payee`                                    | Create a Payee (merchant/counterparty) for the user                                                                                                                                                            |
| `create_plan`                                     | Create a spending plan with selected accounts and categories                                                                                                                                                   |
| `create_portfolio`                                | Create a new investment portfolio for the user                                                                                                                                                                 |
| `create_portfolio_cash_transaction`               | Record a direct cash deposit into or withdrawal from an investment portfolio without touching any regular account — no bank transaction is created                                                             |
| `create_subscription`                             | Create a new subscription, recurring bill, or installment plan                                                                                                                                                 |
| `create_tag`                                      | Create a new tag that can be assigned to transactions                                                                                                                                                          |
| `create_transaction`                              | Create a new transaction (income, expense, or transfer)                                                                                                                                                        |
| `create_transaction_automation`                   | Create a transaction automation rule that categorizes, tags, sets a payee, or edits the note of matching transactions                                                                                          |
| `create_transaction_group`                        | Create a new transaction group that bundles related transactions together (e.g                                                                                                                                 |
| `create_vehicle`                                  | Create a vehicle and its linked asset account                                                                                                                                                                  |
| `create_vehicle_maintenance_activity`             | Create a reusable maintenance activity.                                                                                                                                                                        |
| `create_vehicle_maintenance_plan`                 | Create a maintenance reminder using a due date or distance threshold.                                                                                                                                          |
| `create_vehicle_maintenance_visit`                | Record a maintenance visit, renew plans and link existing expenses or create a quickExpense atomically.                                                                                                        |
| `create_venture_deal`                             | Create a venture deal (private/illiquid investment record)                                                                                                                                                     |
| `create_venture_event`                            | Record an event on a venture deal                                                                                                                                                                              |
| `create_venture_platform`                         | Create a venture investment platform (e.g                                                                                                                                                                      |
| `delete_category`                                 | Permanently delete a category by ID                                                                                                                                                                            |
| `delete_investment_transaction`                   | Permanently delete an investment transaction                                                                                                                                                                   |
| `delete_loan`                                     | Permanently delete a loan account when it has no linked payment legs                                                                                                                                           |
| `delete_payee`                                    | Delete a Payee                                                                                                                                                                                                 |
| `delete_plan`                                     | Permanently delete a spending plan and its allocation data                                                                                                                                                     |
| `delete_plan_category_target`                     | Remove a category target from a plan                                                                                                                                                                           |
| `delete_portfolio`                                | Permanently delete a portfolio and, if force is true, all its holdings, transactions, and cash balances                                                                                                        |
| `delete_portfolio_transfer`                       | Delete a portfolio transfer and reverse its cash effect                                                                                                                                                        |
| `delete_split`                                    | Delete a single split from a transaction by its split ID (UUID string)                                                                                                                                         |
| `delete_subscription`                             | Permanently delete a subscription or recurring bill                                                                                                                                                            |
| `delete_tag`                                      | Permanently delete a tag by ID                                                                                                                                                                                 |
| `delete_transaction`                              | Permanently delete a transaction by ID                                                                                                                                                                         |
| `delete_transaction_automation`                   | Permanently delete a transaction automation rule                                                                                                                                                               |
| `delete_transaction_group`                        | Permanently delete a transaction group                                                                                                                                                                         |
| `delete_vehicle`                                  | Delete a vehicle and its asset account using existing ownership and linked-payment protections.                                                                                                                |
| `delete_vehicle_maintenance_visit`                | Delete a maintenance visit                                                                                                                                                                                     |
| `delete_venture_deal`                             | Delete a venture deal                                                                                                                                                                                          |
| `delete_venture_event`                            | Delete a venture event                                                                                                                                                                                         |
| `delete_venture_platform`                         | Delete a venture platform                                                                                                                                                                                      |
| `detect_subscription_candidates`                  | Scan the past 12 months of transactions to detect recurring payment patterns and generate subscription candidates                                                                                              |
| `dismiss_subscription_candidate`                  | Dismiss a pending subscription candidate so it no longer appears in the candidate list                                                                                                                         |
| `execute_manual_portfolio_import`                 | Import reviewed manual portfolio transactions and end-of-day valuations                                                                                                                                        |
| `extract_manual_portfolio_import`                 | Preview manual-portfolio import candidates from deterministic CSV parsing or AI text/file extraction                                                                                                           |
| `get_accounts`                                    | List all user accounts with current balances                                                                                                                                                                   |
| `get_balance_history`                             | Get account balance over time                                                                                                                                                                                  |
| `get_cash_flow`                                   | Get income, expenses, and net cash flow for a period with configurable granularity (monthly/biweekly/weekly)                                                                                                   |
| `get_categories`                                  | List all transaction categories                                                                                                                                                                                |
| `get_eligible_maintenance_transactions`           | List expenses that can be linked to a vehicle maintenance visit.                                                                                                                                               |
| `get_expenses_for_period`                         | Get total expense amount for a date range                                                                                                                                                                      |
| `get_investment_transactions`                     | Investment transaction history: buy, sell, dividend, transfer, tax, fee, cancel, other                                                                                                                         |
| `get_loan`                                        | Retrieve one loan by account ID with decimal loan details, balance projection, payment count, balance anchor, timeline events, and linked installment schedules.                                               |
| `get_loan_balance_history`                        | Get the loan outstanding balance timeline in the loan native currency as decimal amounts, including the anchor and subsequent payment dates.                                                                   |
| `get_loans`                                       | List all loans with decimal balances, loan terms, payment counts, and payoff projections                                                                                                                       |
| `get_manual_portfolio`                            | Get a manually tracked portfolio overview, transaction records, end-of-day valuations and timeline                                                                                                             |
| `get_payee`                                       | Fetch a single Payee with aliases and computed stats                                                                                                                                                           |
| `get_payees`                                      | List Payees (merchants/counterparties) for the user, optionally filtered by a substring query                                                                                                                  |
| `get_plan`                                        | Retrieve a plan and its sharing permissions                                                                                                                                                                    |
| `get_plan_view`                                   | Get a plan period view with decimal ready-to-assign money, category assignments/activity/available balances, targets, upcoming obligations, revision, and undo state.                                          |
| `get_plans`                                       | List the user's spending plans, including active or archived plans                                                                                                                                             |
| `get_portfolio_balances`                          | Cash balances held in a portfolio, broken down per currency                                                                                                                                                    |
| `get_portfolio_holdings`                          | Positions held in a portfolio with dynamically calculated market value, cost basis, and realized/unrealized gain (value and percent)                                                                           |
| `get_portfolio_summary`                           | Portfolio-level aggregates for a single portfolio: total current market value, total cost basis, realized and unrealized gains (value and percent), cash balances, and total portfolio value (holdings + cash) |
| `get_portfolios`                                  | List the user's investment portfolios                                                                                                                                                                          |
| `get_spending_by_categories`                      | Get spending breakdown by category for a date range                                                                                                                                                            |
| `get_subscription_by_id`                          | Retrieve a single subscription by its ID including all linked transactions (with match source and date) and the computed next expected payment date.                                                           |
| `get_subscription_pay_preview`                    | Preview the decimal amount and currency that paying a subscription period would book, including cross-currency conversion when an account is linked.                                                           |
| `get_subscription_periods`                        | List generated periods for a subscription or installment, including due date, status, paid date, linked transaction, notes, and total count.                                                                   |
| `get_subscriptions`                               | List all subscriptions and recurring bills for the user                                                                                                                                                        |
| `get_subscriptions_summary`                       | Aggregate summary across all active subscriptions with an expected amount, split by direction                                                                                                                  |
| `get_tags`                                        | List all user tags                                                                                                                                                                                             |
| `get_transaction_automations`                     | List the transaction automation rules (rules engine) of the user, ordered by evaluation order                                                                                                                  |
| `get_transaction_groups`                          | List all transaction groups for the user                                                                                                                                                                       |
| `get_upcoming_subscription_payments`              | List upcoming subscription payments sorted by next expected payment date (soonest first)                                                                                                                       |
| `get_user_profile`                                | Get the user's base currency, configured currencies with exchange rates, and basic profile info                                                                                                                |
| `get_vehicle`                                     | Read a vehicle with depreciation, valuation and mileage.                                                                                                                                                       |
| `get_vehicle_maintenance`                         | Read all maintenance plans and visits for a vehicle, including linked expenses.                                                                                                                                |
| `get_vehicle_maintenance_activities`              | List the available maintenance activities and their archive status.                                                                                                                                            |
| `get_vehicle_maintenance_reminders`               | List upcoming and overdue maintenance reminders using date and mileage thresholds.                                                                                                                             |
| `get_vehicles`                                    | List vehicles with current estimated values, depreciation and mileage in the configured distance unit.                                                                                                         |
| `get_venture_deal`                                | Retrieve a single venture deal by id, including its platform and currency                                                                                                                                      |
| `get_venture_deal_metrics`                        | Compute aggregated metrics for a venture deal: cost basis, current value (latest NAV), total distributions, absolute and percent P&L, TVPI (total value to paid-in), DPI (distributions to paid-in), and IRR   |
| `get_venture_event`                               | Retrieve a single venture event by id, including its link rows (bank transactions linked to this event)                                                                                                        |
| `get_venture_platform`                            | Retrieve a single venture platform by id                                                                                                                                                                       |
| `import_manual_portfolio_json`                    | Import a versioned manual-portfolio JSON export into an existing manual portfolio                                                                                                                              |
| `link_installment_to_loan`                        | Link an expense installment subscription to an active loan account                                                                                                                                             |
| `link_loan_payments`                              | Link existing expense transactions to a loan as payments                                                                                                                                                       |
| `link_refund`                                     | Mark an existing transaction as a refund of another transaction                                                                                                                                                |
| `link_transaction_to_portfolio`                   | Link an existing regular transaction to an investment portfolio as a cash transfer                                                                                                                             |
| `link_transactions_to_subscription`               | Link one or more transactions to a subscription to mark them as payment instances                                                                                                                              |
| `link_transfer`                                   | Link two existing transactions as a transfer pair                                                                                                                                                              |
| `list_portfolio_transfers`                        | Cash movement history of a portfolio: account↔portfolio transfers, direct deposits/withdrawals, linked bank transactions, grouped investment contributions with their purchases, and currency exchanges        |
| `list_subscription_candidates`                    | List auto-detected subscription candidates sorted by confidence score                                                                                                                                          |
| `list_venture_deals`                              | List the user's venture deals (private/illiquid investments through SPVs, syndicates, or direct vehicles)                                                                                                      |
| `list_venture_events`                             | List events for a venture deal in chronological order (oldest first)                                                                                                                                           |
| `list_venture_platforms`                          | List the user's venture investment platforms (SPV syndicators, fund managers)                                                                                                                                  |
| `manage_manual_portfolio_transaction`             | Create, fully update or delete a manual portfolio cash-flow record: contribution, withdrawal, fee, tax, distribution or other income                                                                           |
| `manage_manual_portfolio_valuation`               | Create/replace an end-of-day manual valuation, fully update a valuation by ID, or delete it                                                                                                                    |
| `merge_payees`                                    | Merge a source Payee into a target Payee                                                                                                                                                                       |
| `move_plan_money`                                 | Move available money between two categories in a plan period                                                                                                                                                   |
| `pay_subscription_period`                         | Mark a subscription period paid by linking an existing transaction or creating a new expense                                                                                                                   |
| `preview_plan_auto_assign`                        | Preview automatic plan allocation for a period                                                                                                                                                                 |
| `preview_transaction_automation`                  | Dry-run a set of automation conditions against up to the last 1000 eligible existing transactions and return { matchedCount, scannedCount, matches } where matches is capped at 5 sample transactions          |
| `remove_tags_from_transaction`                    | Remove a tag from one or more transactions                                                                                                                                                                     |
| `remove_transactions_from_group`                  | Remove transactions from a group                                                                                                                                                                               |
| `reorder_transaction_automations`                 | Reorder the transaction automation rules of the user                                                                                                                                                           |
| `revert_subscription_period`                      | Reopen a paid or skipped subscription period                                                                                                                                                                   |
| `search_securities`                               | Search for securities (stocks, ETFs, crypto, etc.) by ticker symbol or company name                                                                                                                            |
| `search_transactions`                             | Search and filter transactions                                                                                                                                                                                 |
| `set_plan_category_target`                        | Create or replace a category target amount and due date                                                                                                                                                        |
| `set_portfolio_transfer_adjustment`               | Set whether an existing portfolio transfer is a balance adjustment or a contribution                                                                                                                           |
| `skip_subscription_period`                        | Skip an upcoming subscription period without creating a transaction                                                                                                                                            |
| `split_transaction`                               | Split a transaction across multiple categories                                                                                                                                                                 |
| `suggest_subscription_matches`                    | Suggest up to 100 recent real transactions matching a subscription's matching rules and excluding already linked transactions.                                                                                 |
| `toggle_subscription_active`                      | Activate or deactivate a subscription                                                                                                                                                                          |
| `transfer_account_to_portfolio`                   | Move cash from a regular account into an investment portfolio                                                                                                                                                  |
| `transfer_portfolio_to_account`                   | Withdraw cash from an investment portfolio into a regular account                                                                                                                                              |
| `undo_plan_allocation`                            | Undo the latest eligible plan allocation event for a period                                                                                                                                                    |
| `unlink_installment_from_loan`                    | Remove the loan association from an installment subscription                                                                                                                                                   |
| `unlink_loan_payment`                             | Unlink one loan payment using either leg transaction ID                                                                                                                                                        |
| `unlink_refund`                                   | Remove the refund link between two transactions                                                                                                                                                                |
| `unlink_subscription_period_transaction`          | Detach the transaction from a subscription period while keeping the transaction in the ledger                                                                                                                  |
| `unlink_transaction_from_portfolio`               | Remove the portfolio link from a transaction: deletes the portfolio transfer, reverses the portfolio cash balance change, and restores the transaction to a regular income/expense                             |
| `unlink_transactions_from_subscription`           | Unlink transactions from a subscription without deleting them                                                                                                                                                  |
| `unlink_transfer`                                 | Unlink transfer transactions by their shared transferId (UUID string)                                                                                                                                          |
| `update_category`                                 | Update an existing category by ID                                                                                                                                                                              |
| `update_investment_contribution`                  | Replace the purchases in a grouped contribution while preserving its original account cash movement                                                                                                            |
| `update_investment_transaction`                   | Update an existing investment transaction — correct the date, quantity, price, fees, category, or label                                                                                                        |
| `update_loan`                                     | Update loan metadata, payment terms, or the positive outstanding balance and anchor date                                                                                                                       |
| `update_payee`                                    | Rename a Payee or set/clear its defaultCategoryId                                                                                                                                                              |
| `update_plan`                                     | Update a plan name, period start day, or default status                                                                                                                                                        |
| `update_portfolio`                                | Update an existing portfolio's name, type, description, display currency, manual tracking or enabled state                                                                                                     |
| `update_subscription`                             | Update fields on an existing subscription or bill                                                                                                                                                              |
| `update_tag`                                      | Update an existing tag by ID                                                                                                                                                                                   |
| `update_transaction`                              | Update an existing transaction by ID                                                                                                                                                                           |
| `update_transaction_automation`                   | Update a transaction automation rule                                                                                                                                                                           |
| `update_transaction_group`                        | Update the name or note of an existing transaction group                                                                                                                                                       |
| `update_vehicle`                                  | Update vehicle details, depreciation settings and current mileage.                                                                                                                                             |
| `update_vehicle_maintenance_activity`             | Rename or archive a reusable maintenance activity.                                                                                                                                                             |
| `update_vehicle_maintenance_plan`                 | Renew, change or archive a vehicle maintenance plan.                                                                                                                                                           |
| `update_vehicle_maintenance_visit`                | Update the date, mileage, notes or activities on a maintenance visit.                                                                                                                                          |
| `update_venture_deal`                             | Update a venture deal                                                                                                                                                                                          |
| `update_venture_event`                            | Update a venture event                                                                                                                                                                                         |
| `update_venture_platform`                         | Update an existing venture platform's name, website, description, or default fees                                                                                                                              |

Call `get_user_profile` **first** — it reveals the user's base currency, which
is required to interpret `ref*` fields (refAmount, refBalance) that normalize
multi-currency data.

## Data conventions

- Plan allocations require the current view revision and a unique requestId. Reuse that requestId only to retry the same operation.
- Vehicle distance follows the configured user unit (km or mi); values returned by maintenance tools include distanceUnit.
- Manual portfolios use decimal strings in their display currency. Extract imports first, review records, then execute with explicit skipped IDs.
- Grouped investment contributions preserve a single account movement and associated purchases. Deleting purchases or the linked movement requires explicit flags.
- Use full search_securities results when creating holdings or contributions to preserve the listing provider and currency.
- Forecast transactions use isForecastOnly. Spending analytics exclude them by default.
- All monetary amounts are decimals (e.g. `42.50` means $42.50), not cents.
- Fields prefixed with `ref` are converted to the user's base currency.
  Use them for cross-account totals when accounts have different currencies.
- Transaction types: `income`, `expense`, `transfer`. Transfers are **not**
  income or expense — exclude them from spend/earn aggregations.
- File bytes never travel through MCP tool arguments. To attach a receipt, call
  `create_attachment_upload_url`, then POST each file as the raw request body to
  the returned `url` with the returned headers plus the file's URI-encoded name in
  the `filenameHeader` header (needs shell/HTTP access to the file).
- Investment vs regular transactions are **separate datasets**.
  `search_transactions` returns regular (spending) transactions; investment
  activity (buy/sell/dividend/fee) lives in `get_investment_transactions` and
  does not appear in `search_transactions`.
- Transaction automations are rules evaluated top to bottom by `position` on
  new transactions on bank-connected accounts or imported rows — never on
  transfers, planned ones, or transactions on manual (non-bank) accounts. Existing
  transactions change only when the user runs "Apply to past transactions" for a
  saved rule in the app. The first rule that applies an action wins. Test conditions with `preview_transaction_automation` before
  saving a rule, and pass the full current id set to
  `reorder_transaction_automations`.
- Portfolio queries are gated by `portfolioId`. Call `get_portfolios` first
  to discover ids before calling `get_portfolio_summary`,
  `get_portfolio_holdings`, or `get_portfolio_balances`.
- Portfolio cash moves via transfers: `link_transaction_to_portfolio` when the
  bank transaction already exists, `transfer_account_to_portfolio` /
  `transfer_portfolio_to_account` to create the transaction alongside the
  transfer, `create_portfolio_cash_transaction` when no account is involved.

## Troubleshooting

- **OAuth consent screen doesn't appear**: confirm the client fetched
  `/.well-known/oauth-authorization-server` and is using the advertised
  `authorization_endpoint`.
- **401 Unauthorized on tool calls**: the access token expired. The client
  should use the refresh token (granted via `offline_access` scope) to obtain
  a new access token.
- **Revoking access**: user goes to MoneyMatter → Settings → AI → Connectors (MCP)
  and removes it from Active connectors.

## Self-hosted deployments

Users who self-host will have their own MCP URL (e.g. `https://mcp.my-domain.tld/mcp`).
Ask the user for their deployment URL before assuming the public endpoint.
