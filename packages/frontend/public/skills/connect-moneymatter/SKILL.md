# Connect an AI agent to MoneyMatter

MoneyMatter exposes a remote Model Context Protocol (MCP) server. Connecting an
agent to this server gives the agent OAuth-secured access to the user's
financial data (accounts, transactions, subscriptions, transaction
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

| Scope            | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `finance:read`   | Read accounts, transactions, subscriptions, analytics  |
| `finance:write`  | Create and edit transactions, subscriptions, and more  |
| `finance:delete` | Permanently delete records (transactions, portfolios…) |
| `profile:read`   | Read the user's profile (name, email, base currency)   |
| `offline_access` | Receive a refresh token so sessions survive expiration |

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

| Tool                                              | Purpose                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `get_user_profile`                                | Base currency, configured currencies, profile basics                                                                                    |
| `get_accounts`                                    | List accounts with balances, types, currencies                                                                                          |
| `search_transactions`                             | Filter transactions by date, category, tag, amount, etc.                                                                                |
| `get_categories`                                  | List spending/income categories                                                                                                         |
| `get_tags`                                        | List transaction tags                                                                                                                   |
| `get_spending_by_categories`                      | Aggregate spending by category over a range                                                                                             |
| `get_cash_flow`                                   | Income vs expenses over a range                                                                                                         |
| `get_balance_history`                             | Time-series of account balances                                                                                                         |
| `get_expenses_for_period`                         | Expenses summary for a time period                                                                                                      |
| `get_portfolios`                                  | List investment portfolios (types, enabled state)                                                                                       |
| `get_portfolio_summary`                           | Portfolio totals, P&L, cash balances                                                                                                    |
| `get_portfolio_holdings`                          | Positions with market value and gains/losses                                                                                            |
| `get_portfolio_balances`                          | Portfolio cash balances per currency                                                                                                    |
| `get_investment_transactions`                     | Buy/sell/dividend/fee history for investments                                                                                           |
| `search_securities`                               | Search securities by ticker/name; resolves to securityId                                                                                |
| `create_portfolio`                                | Create a new investment portfolio (`finance:write`)                                                                                     |
| `update_portfolio`                                | Rename, recategorize, or disable a portfolio (`finance:write`)                                                                          |
| `delete_portfolio`                                | Delete a portfolio and optionally all its data (`finance:delete`)                                                                       |
| `create_investment_transaction`                   | Record a buy/sell/dividend/fee transaction (`finance:write`)                                                                            |
| `update_investment_transaction`                   | Correct a transaction's date, quantity, price, or fees (`finance:write`)                                                                |
| `delete_investment_transaction`                   | Delete an investment transaction (`finance:delete`)                                                                                     |
| `link_transaction_to_portfolio`                   | Link an existing transaction to a portfolio as a cash transfer (`finance:write`)                                                        |
| `unlink_transaction_from_portfolio`               | Remove a transaction's portfolio link and reverse the cash change (`finance:write`)                                                     |
| `transfer_account_to_portfolio`                   | Move cash from an account into a portfolio (`finance:write`)                                                                            |
| `transfer_portfolio_to_account`                   | Withdraw portfolio cash into an account (`finance:write`)                                                                               |
| `create_portfolio_cash_transaction`               | Direct portfolio cash deposit/withdrawal, no account involved (`finance:write`)                                                         |
| `list_portfolio_transfers`                        | Cash movement history of a portfolio (transfers, deposits, exchanges)                                                                   |
| `adjust_account_balance`                          | Set an account to a target balance via an adjustment transaction (`finance:write`)                                                      |
| `archive_account`                                 | Archive or unarchive an account; handles side effects (`finance:write`)                                                                 |
| `get_transaction_groups`                          | List transaction groups with counts/dates or full embedded transactions                                                                 |
| `create_transaction_group`                        | Bundle related transactions into a group (e.g. split bill) (`finance:write`)                                                            |
| `update_transaction_group`                        | Rename or add a note to an existing group (`finance:write`)                                                                             |
| `delete_transaction_group`                        | Delete a group — transactions kept (`finance:delete`)                                                                                   |
| `add_transactions_to_group`                       | Add transactions to an existing group (`finance:write`)                                                                                 |
| `remove_transactions_from_group`                  | Remove transactions from a group, optionally dissolving it (`finance:write`)                                                            |
| `get_subscriptions`                               | List subscriptions/bills with frequency, amount, and linked count                                                                       |
| `get_subscription_by_id`                          | Single subscription with linked transactions and next payment date                                                                      |
| `create_subscription`                             | Create a subscription, bill, or installment — expense by default or income via transactionType (`finance:write`)                        |
| `update_subscription`                             | Update subscription fields (`finance:write`)                                                                                            |
| `delete_subscription`                             | Delete a subscription and its transaction links (`finance:delete`)                                                                      |
| `toggle_subscription_active`                      | Activate or deactivate a subscription (`finance:write`)                                                                                 |
| `detect_subscription_candidates`                  | Scan 12 months of transactions to auto-detect recurring patterns (`finance:write`)                                                      |
| `list_subscription_candidates`                    | List auto-detected candidates sorted by confidence score                                                                                |
| `dismiss_subscription_candidate`                  | Dismiss a pending candidate (`finance:write`)                                                                                           |
| `link_transactions_to_subscription`               | Mark transactions as payment instances of a subscription (`finance:write`)                                                              |
| `unlink_transactions_from_subscription`           | Remove transaction links from a subscription (`finance:write`)                                                                          |
| `get_upcoming_subscription_payments`              | Upcoming payments sorted by next expected date                                                                                          |
| `get_subscriptions_summary`                       | Monthly/yearly cost, expected monthly income, and per-direction active counts in base currency                                          |
| `get_transaction_automations`                     | List automation rules with evaluation order, enabled state, match counts, and pause reason                                              |
| `preview_transaction_automation`                  | Dry-run automation conditions against recent transactions; nothing is modified                                                          |
| `create_transaction_automation`                   | Create a rule that sets category, tags, payee, or note on matching transactions (`finance:write`)                                       |
| `update_transaction_automation`                   | Change a rule name, conditions, actions, or enabled state (`finance:write`)                                                             |
| `delete_transaction_automation`                   | Permanently delete an automation rule (`finance:delete`)                                                                                |
| `reorder_transaction_automations`                 | Set the top-to-bottom evaluation order of the automation rules (`finance:write`)                                                        |
| `create_transaction`                              | Create an income, expense, or transfer with optional splits/tags/original-currency amount (`finance:write`)                             |
| `update_transaction`                              | Update amount, date, category, tags, note, splits, or original-currency amount (`finance:write`)                                        |
| `delete_transaction`                              | Permanently delete a transaction; transfer pairs are deleted together (`finance:delete`)                                                |
| `create_attachment_upload_url`                    | Get a short-lived URL to upload receipt files (JPEG/PNG/WebP/PDF) to a transaction over HTTP (`finance:write`)                          |
| `bulk_update_transactions`                        | Update category, note, or tags on multiple transactions at once (`finance:write`)                                                       |
| `split_transaction`                               | Split a transaction across multiple categories (`finance:write`)                                                                        |
| `delete_split`                                    | Delete a single split by split ID (`finance:delete`)                                                                                    |
| `link_transfer`                                   | Link two existing transactions as a transfer pair (`finance:write`)                                                                     |
| `unlink_transfer`                                 | Unlink a transfer pair by transferId (`finance:write`)                                                                                  |
| `link_refund`                                     | Mark a transaction as a refund of another (`finance:write`)                                                                             |
| `unlink_refund`                                   | Remove the refund link between two transactions (`finance:write`)                                                                       |
| `assign_tags_to_transaction`                      | Assign tags to a transaction (`finance:write`)                                                                                          |
| `remove_tags_from_transaction`                    | Remove tags from one or more transactions (`finance:write`)                                                                             |
| `create_category`                                 | Create a new category, optionally nested (`finance:write`)                                                                              |
| `update_category`                                 | Rename, recolor, or change a category's icon (`finance:write`)                                                                          |
| `delete_category`                                 | Delete a category; supply replacement for linked transactions (`finance:delete`)                                                        |
| `create_tag`                                      | Create a new transaction tag (`finance:write`)                                                                                          |
| `update_tag`                                      | Rename, recolor, or update a tag (`finance:write`)                                                                                      |
| `delete_tag`                                      | Permanently delete a tag and unlink it from all transactions (`finance:delete`)                                                         |
| `create_payee`                                    | Create a Payee (merchant/counterparty) for the user (`finance:write`)                                                                   |
| `get_payee`                                       | Fetch a single Payee with aliases and computed stats                                                                                    |
| `get_payees`                                      | List Payees (merchants/counterparties) for the user, optionally filtered by a substring query                                           |
| `update_payee`                                    | Rename a Payee or set/clear its defaultCategoryId (`finance:write`)                                                                     |
| `delete_payee`                                    | Delete a Payee (`finance:delete`)                                                                                                       |
| `merge_payees`                                    | Merge a source Payee into a target Payee (`finance:write`)                                                                              |
| `get_subscription_periods`                        | List generated periods for a subscription or installment, including due date and status                                                 |
| `get_subscription_pay_preview`                    | Preview the decimal amount and currency that paying a subscription period would book                                                    |
| `pay_subscription_period`                         | Mark a subscription period paid by linking an existing transaction or creating a new expense (`finance:write`)                          |
| `skip_subscription_period`                        | Skip an upcoming subscription period without creating a transaction (`finance:write`)                                                   |
| `revert_subscription_period`                      | Reopen a paid or skipped subscription period (`finance:write`)                                                                          |
| `unlink_subscription_period_transaction`          | Detach the transaction from a subscription period while keeping the transaction in the ledger (`finance:write`)                         |
| `suggest_subscription_matches`                    | Suggest recent transactions matching a subscription's matching rules, excluding already linked ones                                     |
| `delete_portfolio_transfer`                       | Delete a portfolio transfer and reverse its cash effect (`finance:delete`)                                                              |
| `set_portfolio_transfer_adjustment`               | Set whether an existing portfolio transfer is a balance adjustment or a contribution (`finance:write`)                                  |
| `create_holding`                                  | Add a security as a zero-quantity holding in a portfolio before recording trades (`finance:write`)                                      |
| `create_investment_contribution`                  | Create one grouped investment contribution: account expense, portfolio cash movement, holdings and purchases together (`finance:write`) |
| `create_investment_contribution_from_transaction` | Attach grouped investment purchases to an existing expense transaction without duplicating the account movement (`finance:write`)       |
| `update_investment_contribution`                  | Replace the purchases in a grouped contribution while preserving its original account cash movement (`finance:write`)                   |
| `get_manual_portfolio`                            | Get a manually tracked portfolio overview, transaction records, end-of-day valuations and timeline                                      |
| `extract_manual_portfolio_import`                 | Preview manual-portfolio import candidates from deterministic CSV parsing or AI text/file extraction                                    |
| `execute_manual_portfolio_import`                 | Import reviewed manual portfolio transactions and end-of-day valuations (`finance:write`)                                               |
| `import_manual_portfolio_json`                    | Import a versioned manual-portfolio JSON export into an existing manual portfolio (`finance:write`)                                     |
| `manage_manual_portfolio_transaction`             | Create, fully update or delete a manual portfolio cash-flow record (`finance:write`)                                                    |
| `manage_manual_portfolio_valuation`               | Create/replace, update, or delete an end-of-day manual valuation (`finance:write`)                                                      |
| `get_loans`                                       | List all loans with decimal balances, loan terms, payment counts, and payoff projections                                                |
| `get_loan`                                        | Retrieve one loan with decimal loan details, balance projection, and linked installment schedules                                       |
| `get_loan_balance_history`                        | Get the loan outstanding balance timeline in the loan native currency as decimal amounts                                                |
| `create_loan`                                     | Create a loan account and its loan details (`finance:write`)                                                                            |
| `update_loan`                                     | Update loan metadata, payment terms, or the outstanding balance and anchor date (`finance:write`)                                       |
| `delete_loan`                                     | Permanently delete a loan account when it has no linked payment legs (`finance:delete`)                                                 |
| `append_loan_note`                                | Append a user note to the loan timeline (`finance:write`)                                                                               |
| `link_installment_to_loan`                        | Link an expense installment subscription to an active loan account (`finance:write`)                                                    |
| `unlink_installment_from_loan`                    | Remove the loan association from an installment subscription (`finance:write`)                                                          |
| `link_loan_payments`                              | Link existing expense transactions to a loan as payments (`finance:write`)                                                              |
| `unlink_loan_payment`                             | Unlink one loan payment using either leg transaction ID (`finance:write`)                                                               |
| `get_vehicles`                                    | List vehicles with current estimated values, depreciation and mileage in the configured distance unit                                   |
| `get_vehicle`                                     | Read a vehicle with depreciation, valuation and mileage                                                                                 |
| `create_vehicle`                                  | Create a vehicle and its linked asset account (`finance:write`)                                                                         |
| `update_vehicle`                                  | Update vehicle details, depreciation settings and current mileage (`finance:write`)                                                     |
| `delete_vehicle`                                  | Delete a vehicle and its asset account (`finance:delete`)                                                                               |
| `get_vehicle_maintenance`                         | Read all maintenance plans and visits for a vehicle, including linked expenses                                                          |
| `get_vehicle_maintenance_activities`              | List the available maintenance activities and their archive status                                                                      |
| `create_vehicle_maintenance_activity`             | Create a reusable maintenance activity (`finance:write`)                                                                                |
| `update_vehicle_maintenance_activity`             | Rename or archive a reusable maintenance activity (`finance:write`)                                                                     |
| `get_vehicle_maintenance_reminders`               | List upcoming and overdue maintenance reminders using date and mileage thresholds                                                       |
| `get_eligible_maintenance_transactions`           | List expenses that can be linked to a vehicle maintenance visit                                                                         |
| `create_vehicle_maintenance_plan`                 | Create a maintenance reminder using a due date or distance threshold (`finance:write`)                                                  |
| `update_vehicle_maintenance_plan`                 | Renew, change or archive a vehicle maintenance plan (`finance:write`)                                                                   |
| `create_vehicle_maintenance_visit`                | Record a maintenance visit and link existing expenses or create a new one (`finance:write`)                                             |
| `update_vehicle_maintenance_visit`                | Update the date, mileage, notes or activities on a maintenance visit (`finance:write`)                                                  |
| `delete_vehicle_maintenance_visit`                | Delete a maintenance visit (`finance:delete`)                                                                                           |
| `list_venture_deals`                              | List the user's venture deals (private/illiquid investments through SPVs, syndicates, or direct vehicles)                               |
| `get_venture_deal`                                | Retrieve a single venture deal by id, including its platform and currency                                                               |
| `get_venture_deal_metrics`                        | Compute aggregated metrics for a venture deal: cost basis, current value, distributions, P&L, TVPI, DPI, and IRR                        |
| `create_venture_deal`                             | Create a venture deal (`finance:write`)                                                                                                 |
| `update_venture_deal`                             | Update a venture deal (`finance:write`)                                                                                                 |
| `delete_venture_deal`                             | Delete a venture deal (`finance:delete`)                                                                                                |
| `list_venture_events`                             | List events for a venture deal in chronological order (oldest first)                                                                    |
| `get_venture_event`                               | Retrieve a single venture event by id, including its linked bank transactions                                                           |
| `create_venture_event`                            | Record an event on a venture deal (`finance:write`)                                                                                     |
| `update_venture_event`                            | Update a venture event (`finance:write`)                                                                                                |
| `delete_venture_event`                            | Delete a venture event (`finance:delete`)                                                                                               |
| `list_venture_platforms`                          | List the user's venture investment platforms (SPV syndicators, fund managers)                                                           |
| `get_venture_platform`                            | Retrieve a single venture platform by id                                                                                                |
| `create_venture_platform`                         | Create a venture investment platform (`finance:write`)                                                                                  |
| `update_venture_platform`                         | Update an existing venture platform's name, website, description, or default fees (`finance:write`)                                     |
| `delete_venture_platform`                         | Delete a venture platform (`finance:delete`)                                                                                            |

Call `get_user_profile` **first** — it reveals the user's base currency, which
is required to interpret `ref*` fields (refAmount, refBalance) that normalize
multi-currency data.

## Data conventions

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
