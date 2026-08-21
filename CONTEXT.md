# Investment Security Search Context

This context defines the language for finding and selecting investable securities from multiple market-data sources.

## Search and market data

**Security**:
An investable instrument tracked in a portfolio, such as a stock, ETF, or crypto market pair.
_Avoid_: Asset, when referring to the persisted portfolio instrument

**Provider listing**:
A provider-specific representation of a Security returned by a market-data source, including the provider's native identifier and exchange metadata.
_Avoid_: Duplicate, when two listings describe the same ticker from different providers

**Market pair**:
A crypto Security formed by a base asset and a quote currency, such as BTC/USD; the quote currency is the denomination of its price.
_Avoid_: Crypto asset, when the quote side matters

**Provider catalog**:
The searchable set of provider listings available from an external market-data source.
_Avoid_: Ticker list, when the entries include exchange, quote, and provider identity

**Provider-grouped search**:
A search result presentation that keeps provider listings in separate sections so users can compare source-specific symbols and metadata.
_Avoid_: Deduplicated search, because cross-provider matches remain visible

## Zero-based planning glossary

### Plan

A separate zero-based allocation boundary for a user's finances. Users may create, edit, and delete multiple Plans. A Plan owns monthly category assignments and Ready to Assign calculations; it is not the same concept as a reporting Budget. The default Plan automatically includes active categories and spendable on-budget accounts; additional Plans require explicit category and account membership. A spendable account belongs to at most one active Plan. Plan is a top-level primary workspace and is separate from the Planned section for forecast-only transactions and reporting budgets.

### Plan workspace

The primary top-level workspace for allocating money in a selected Plan period. It contains Plan and period navigation, Ready to Assign, allocation actions, grouped category rows, and responsive assignment interactions. It is distinct from the Planned navigation section.

### Funded status

A category status shown only when a known upcoming obligation exists and the category's Available amount covers that obligation.

### Plan template

A static, built-in category structure defined in application code. It can be copied into a newly created Plan, but users cannot create, edit, or share templates in v1.

### Plan export

A versioned export containing Plan metadata, immutable currency and period settings, membership snapshots, and sparse assignments. It is separate from existing reporting Budget exports.

### Underfunded status

A category status shown only when a known upcoming obligation exists and the category's Available amount is less than that obligation. v1 does not introduce target or goal fields.

### Plan view

The server-authoritative derived view for one Plan period. It contains period metadata, Ready to Assign, grouped category rows, Assigned, Activity, Available, status details, upcoming-obligation summaries, permissions, revision, and valid Undo metadata. Monetary values are serialized as API decimals.

### Expected revision

The allocation period revision supplied by a client mutation. The server accepts the mutation only when it matches the current period revision, unless the request is an idempotent retry identified by the same request ID.

### Private Plan

A zero-based Plan visible and editable only by its owner. A user may create multiple private Plans. A private Plan can be converted to a Shared Plan, but a Shared Plan cannot be converted back to private.

### Shared Plan

A zero-based Plan shared with invited members. Its active members see and edit the same assignments, categories, and eligible on-budget accounts according to the Plan's permissions. The owner manages invitations, membership, conversion, and deletion; active members have full allocation and edit access. Converting a Private Plan to a Shared Plan is irreversible, preserves the Plan identity, and requires an explicit review of which accounts and categories enter the shared scope. Shared Plans cannot be converted back to private.

### Liability account

A loan or other debt account that remains outside the Plan's spendable cash pool. Payments from a Plan account are categorized outflows; proceeds entering a Plan account increase Ready to Assign. Existing liability projections remain authoritative.

### Cross-Plan transfer

A transfer between accounts assigned to different Plans. It is a categorized outflow from the source Plan and a Ready to Assign inflow into the destination Plan. Normal transactions cannot combine an account and category from different Plans.

### Reporting Budget

The existing date-, category-, or transaction-scoped object used to analyze spending. Reporting Budgets do not own Plan assignments or determine Ready to Assign.

### Forecast-only transaction

A scheduled or future transaction intention represented by the canonical `isForecastOnly` flag. It is not an allocation and does not create Activity until a real transaction is recorded. Forecast-only transactions may appear in a separate upcoming-obligations forecast from the first release, but never change Ready to Assign, Activity, or Available. The previous `isPlanned` field is not retained as a compatibility alias.

### Materialized transaction

A real transaction created from a subscription or other automation with `isForecastOnly = false`. It follows the same Plan rules as a manually recorded transaction.

### Upcoming obligation

A read-only forecast entry derived from a planned transaction. It helps the user see future commitments without reserving money or changing the Plan's actual-money calculations.

### Transfer to an off-budget account

A movement of money out of a Plan's spendable cash pool into a tracking scope such as an investment account. It is recorded as a categorized outflow so the Plan shows which category funded it. A transfer between two spendable accounts is neutral to Ready to Assign. The reverse movement from a tracking account into a Plan account increases Ready to Assign as new spendable cash and is not category Activity.

### Opening balance

The starting balance of an on-budget account. It contributes to the Plan's Ready to Assign cash basis and can therefore be allocated to categories.

### Balance adjustment

A correction that changes an account's actual balance. A positive adjustment increases Ready to Assign and a negative adjustment decreases it, without inventing category Activity.

### Clearing status

A reconciliation state on a recorded transaction. Clearing status does not change Ready to Assign, Activity, or Available; every recorded non-forecast transaction participates equally in Plan calculations.

### Negative on-budget balance

A negative balance on a spendable account. It reduces Ready to Assign rather than being clamped or hidden. Credit-card accounts use dedicated payment-category semantics instead of ordinary negative-cash treatment.

### Active category

A non-archived category in the user's category hierarchy. Active categories are eligible for Plan allocation and inherit the existing category-group structure. An active category belongs to at most one active Plan, although it may appear in multiple reporting Budgets.

### Spendable on-budget account

An account whose balance belongs to a Plan's assignable cash pool. Its balance contributes to Ready to Assign; accounts outside this pool remain tracking accounts for planning purposes. A spendable account belongs to at most one active Plan. Plan participation is explicit and separate from reporting visibility, with account-category defaults used only as initial suggestions.

### On-budget account

An account explicitly included in a Plan's spendable cash pool. Its current balance contributes to Ready to Assign.

### Tracking account

An account excluded from a Plan's spendable cash pool. Its balance may still contribute to net worth and its transfers into or out of a Plan are represented by their actual categorized cash-flow effect.

### Default Plan

The user's first explicitly created Plan, if they choose to designate one as default. Plans are not automatically provisioned for existing or new users. The first-Plan flow can start blank or apply a built-in template; additional Plans use explicit membership.

### Plan period

A monthly allocation interval belonging to a Plan. The default period starts on the first day of the calendar month; the Plan can configure another monthly start day from 1 through 31 to align with the user's pay cycle. When a month has fewer days than the configured start day, the period starts on that month's last day. The period ends the day before the next period's clamped start. Assignment, Activity, Available, and rollover are evaluated within Plan periods rather than assuming every Plan uses calendar-month boundaries. A newly created Plan starts fresh in its current period from current spendable balances; prior transaction history is not backfilled into Plan Activity or rollover.

### Assigned

The amount deliberately allocated to a category for one Plan period. Assigned is a stored allocation fact, separate from transaction Activity and derived Available. Users may assign future periods before cash arrives; assignments do not change account balances. Inline assignment sets an absolute amount; moving money is a separate action. Move money is limited to categories within the same Plan period; cross-period changes use explicit assignments in each period. Inline assignment rejects negative values, and zero clears the absolute assignment.

### Move money

A same-period reallocation between two categories. It transfers an amount from source Available to destination Available without creating cash. The source must have enough Available; failed moves are atomic and leave both categories unchanged.

### Bulk assignment

A batch of absolute category assignments for one Plan period. The entire batch validates and commits atomically; one invalid row prevents all changes.

### Auto-Assign

A safe additive action that proposes or applies multiple assignments from currently available Ready to Assign. It never removes existing assignments or creates a negative Ready to Assign. In v1 it uses the previous Plan period's assignments in category order as its recommendation strategy.

### Undo allocation

An atomic inverse of the last successful allocation mutation, covering assignment, Move money, bulk assignment, and Auto-Assign. It restores prior assignment values but never undoes transaction or account changes. Undo is rejected when another user has changed the affected assignments since the original action.

### Allocation revision

The concurrency version of the assignments affected by an allocation mutation. A stale mutation based on an older revision is rejected atomically rather than overwriting another member's changes.

### Allocation audit event

An append-only record for a successful allocation mutation. It identifies the actor, time, action, affected Plan period/categories, and before/after assignment values. It does not record transaction or account changes.

### Activity

The signed sum of recorded non-forecast transactions affecting a category during one Plan period. Expenses reduce Activity; category inflows increase it.

### Available

The amount currently available in a category for a Plan period, derived from prior positive Available, current Assigned, and current Activity. Positive Available rolls forward; cash overspending is handled through Ready to Assign rather than carried as category debt.

### Category inflow

A recorded non-forecast positive transaction assigned to a normal category, such as a refund or reimbursement. It increases that category's Activity and Available without increasing Ready to Assign. Adding or editing a transaction in a prior Plan period recomputes all affected later periods; Available and rollover are derived rather than snapshotted.

### Transaction split

A transaction whose amount is distributed across multiple category lines. Plan Activity uses the split lines exactly once and ignores the parent category for that transaction when splits exist.

### Linked refund

A positive transaction explicitly linked to an original expense. Its Plan Activity and Available effect belong to the original expense's category automatically.

### Credit-card account

An on-budget account whose purchases create debt rather than immediately reducing spendable cash. Its category Activity participates in Plan, while its payment obligation is tracked through a system-managed payment category. An unfunded credit-card purchase may leave the spending category negative as debt without immediately reducing Ready to Assign.

### Uncategorized category

A system-managed category for an expense that has not yet been assigned a user category. Its Activity and Available effects remain visible in Plan, and the transaction is flagged for categorization. It is not a normal allocation target.

### Credit-card payment category

A system-managed category associated with one credit-card account. It holds money earmarked to pay that card; card purchases increase its Available, and payments to the card spend it.

### Ready to Assign

The Plan-wide amount of spendable cash that has not yet been assigned to categories. Its cash basis starts from the current balances of all spendable on-budget accounts, including opening balances and recorded transactions, converted into the user's base currency when needed. Ready to Assign is calculated cumulatively through the selected Plan period; assignments in later periods do not change earlier periods. Ready to Assign may be negative when assignments exceed available cash, and the Plan presents that state explicitly as over-assigned. The treatment of prior assignments and overspending is defined by the monthly allocation rules.

### Ready to Assign category

A system-managed category scoped to a Plan for classifying unassigned inflows. Normal income into a spendable account increases Ready to Assign through this category. It is not a normal allocation target, and its transaction activity does not replace the computed Ready to Assign value. Refunds and transfers follow separate rules.
