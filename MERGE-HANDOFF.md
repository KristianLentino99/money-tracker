# Handoff: upstream merge (letehaha/moneymatter → this fork)

## What this is

This fork diverged from `letehaha/moneymatter` (formerly `budget-tracker`) a while
ago. Both sides built overlapping features independently. The user asked to pull
upstream's 213 new commits into this fork, unify the overlapping features, and keep
going until it's done — including a live local verification pass at the end.

**Branch:** `merge/upstream-dev-2026-10` (created from `dev`, not yet merged back).
**Remote:** `upstream` points at `https://github.com/letehaha/moneymatter.git`
(it was `letehaha/budget-tracker.git`, renamed upstream — already fixed on this
machine, but note it if working from a fresh clone).

**Do not `git push` anything without the user explicitly asking in that exact moment**
(standing instruction, not specific to this task).

## Strategy: chunked merge, not one big merge

213 commits between the fork point and `upstream/dev` produced ~360 conflicting
files in one shot — unverifiable. Instead, merge **tag by tag** (upstream cut
regular version tags), resolving + verifying + committing each as a checkpoint:

```
v0.30.6 (merge-base) → v0.30.7 → v0.30.8 → v0.30.9 → v0.31.0 → v0.31.1 → v0.32.0
→ v0.32.1 → v0.32.2 → v0.32.3 → v0.33.0 → v0.33.1 → upstream/dev (eb4e401e7)
```

Per chunk:

```bash
git merge --no-commit --no-ff <next-tag>
# resolve conflicts
git status --short | grep -E '^(UU|AA|DU|UD|AU)'   # must be empty
git grep -n "<<<<<<<\|^=======$\|>>>>>>>"           # must be empty
npm run typecheck   # root script, both packages
npm run lint         # root script, both packages, includes frontend's i18n-key check
git commit -m "merge: upstream dev through <tag> (chunk N/11)"
```

**Progress so far:**
| Chunk | Tag | Status |
|---|---|---|
| 1/11 | v0.30.7 | committed (`35fa8a0e3`) |
| 2/11 | v0.30.8 | committed (`25a4a414c`) |
| 3/11 | v0.30.9 | committed (`0f3ce0dc3`) |
| 4/11 | v0.31.0 | committed (`9eaf4f953`) |
| 5/11 | v0.31.1 | committed (`99a1a6ed8`) |
| 6/11 | v0.32.0 | committed (`4d5110302`) — the big one, see policy reversal below |
| 7/11 | v0.32.1 | committed (`764ed8874`) |
| 8/11 | v0.32.2 | committed (`7d1bb3bb5`) |
| 9/11 | v0.32.3 | committed (`c126cf722`) |
| 10/11 | v0.33.0 | committed (`1f9c26740`) |
| 11/11 | v0.33.1 | committed (`fbc7c8e82`) |
| final | upstream/dev (`403ad557b`) | merged and committed |

To check conflict count for the next chunk before diving in:

```bash
git merge --no-commit --no-ff <tag>
git diff --name-only --diff-filter=U | wc -l
git status --short | grep -E '^(UU|AA|DU|UD|AU)' | awk '{print $1}' | sort | uniq -c
```

If it's small (<20), resolve inline. If large, delegate to a subagent with a precise
brief (see "How conflicts were resolved" below for the pattern that worked well).

## Product decision already made (don't re-litigate)

An Opus-5.5-High "strategic product advisor" pass (already done, don't redo it)
concluded there are **three** budgeting/goal concepts, not four:

- **Budget** (upstream's envelope budgeting / "Ready to Assign" feature, née this
  fork's "Plans") — monthly allocation. **This fork's "Plans" feature is retired
  in favor of upstream's "Budget."** No production users ever had Plan data, so
  this was a pure code deletion, not a data migration.
- **Trackers** (upstream's pre-rename-era "Budgets" feature, which upstream is
  mid-way through renaming to "Trackers" across its own history) — watches
  spending over a date range (a trip, a project), with lines/limits, category/tag
  auto-add rules, AI smart tracking (keep it — user confirmed), custom icons,
  insights.
- **Goals** — account-linked savings targets, unchanged, orthogonal to the above.

User's answers to the advisor's open questions (settled, don't re-ask):

1. Name: "Budget" is fine (not "Plan").
2. No production users currently have any Plan data — simplifies everything, no
   data migration needed for Plans retirement.
3. Keep AI smart tracking.
4. Do the full migration now, not phased — no "keep old UI visible during
   transition" compromise.

## Policy reversal that happened mid-merge — READ THIS CAREFULLY

For chunks 1, 4, and 6 (early on), the working policy was: **upstream's
pre-rename "Budgets" feature (soon to become Trackers) stays deleted** on every
DU (deleted-by-us/modified-by-them) conflict, because this fork had already
deleted it (see `packages/backend/src/migrations/20260825100000-remove-legacy-budgets.ts`)
and the plan was to adopt it only once, at its final Trackers shape.

**That assumption broke at v0.32.0.** Upstream's migration
`20261017000000-tracker-lines.ts` adds `TrackerLines`/`TrackerSuggestions`/
`TrackerLineCategories` tables with foreign keys into the **still-named
`Budgets`** table (the rename-to-Trackers migration hasn't landed yet — it's a
few chunks further ahead). Upstream had already built real, substantial
capability on this "Budgets" layer before renaming it: Lines, AI Smart Tracking
(suggestions), Duplicate-budget, category-budgets. This fork's own tree _already
had_ MCP tools depending on that layer (`create/update/delete-budget-line.ts`,
`accept/reject/list-budget-suggestions.ts`) that had auto-merged in cleanly in
an earlier chunk without anyone noticing the dependency.

**So: starting at v0.32.0 (chunk 6), the policy flipped to "restore and adopt."**
94 files were restored verbatim from `v0.32.0` (`git show v0.32.0:<path>`), and
every registry/nav/sharing-stub that chunks 1/4/6 had stripped of Budget entries
got re-wired to include them again. Full list of what was touched is in the
chunk-6 commit message once it lands.

**For chunks 7-11 (v0.32.1 onward): keep adopting.** Do not delete anything
Budget/Tracker-shaped going forward. At some point in this remaining range the
actual rename migration (`20261019000000-rename-budgets-to-trackers.ts` or
similar — check actual upstream migration filenames as you go, they may have
shifted) will land — when it does, the `Budget`/`Tracker` naming in code will
shift too (model files, table names, everything "Budget" becomes "Tracker").
**That's expected and correct** — follow upstream's rename faithfully, don't
fight it. After the rename, continue adopting whatever Trackers capability
upstream keeps adding (rules, etc. — per the original upstream commit log,
`tracker-rules` lands near the very end, close to `upstream/dev` HEAD).

One more upstream feature to watch for while continuing: **"Envelope budgeting"
(PR #721)** was identified by the advisor as upstream's name for what became the
new "Budget" feature (the `BudgetPlans`/`BudgetLines` tables, migration
`20261010000000-create-budget-plans.ts`, already merged in chunk 4) — i.e.
**upstream itself reused the literal table-name prefix "Budget" for two
different things across its own history**: the OLD pre-rename feature (→
Trackers) and the NEW envelope feature (→ stays "Budget"). Both are now present
in this tree simultaneously, under those exact names, matching upstream's own
v0.31.0+ state. This is not a bug — it's upstream's actual naming, confusing as
it reads. Don't conflate them when resolving future conflicts.

## Database migrations already written for this merge (not from upstream)

Two fork-only migrations, written and **tested against a real throwaway Postgres
container** (spin one up with `docker run -d -e POSTGRES_USER=postgres -e
POSTGRES_PASSWORD=postgres -e POSTGRES_DB=shimdb -p <port>:5432 postgres:16-alpine`,
point `.env.production` at it, run `NODE_ENV=production npx sequelize-cli
db:migrate` from `packages/backend`, tested both `up` and `down`):

1. **`20261016000000-restore-legacy-budget-tables.ts`** — recreates
   `Budgets`/`BudgetCategories`/`BudgetTransactions` **empty**, in the exact
   shape upstream's `20261017000000-tracker-lines.ts` expects (DDL extracted via
   `pg_dump --schema-only` after running upstream's own migration chain through
   `20261015000000` on a scratch DB — this is the only way to get it byte-exact,
   since the eventual rename migration introspects real constraint/index/enum
   names). Guarded by `tableExists('Budgets')`, so it's a no-op on any DB that
   never ran the fork's drop migration.
2. **`20261016200000-restore-budget-resource-type-constraint.ts`** — the fork's
   drop migration had rewritten the `ResourceShares`/`ShareInvitations`
   `resourceType` CHECK constraint to admit `'plan'` instead of `'budget'`
   (Plans reused that sharing plumbing). This restores upstream's `'budget'`-
   admitting shape (verbatim from upstream's own
   `20260520000002-extend-resource-types-budget.ts`) and also drops a redundant
   `chk_*_resource_type` IN-list constraint the fork had re-added that upstream
   itself deprecated back in `20260514000000-extend-resource-types-household.ts`
   in favor of the shape-only CHECK.

**Completed after the merge reached `upstream/dev`:** the fork's retired `Plan*`
tables are dropped by
`packages/backend/src/migrations/20261024100000-drop-retired-plans.ts`. The old
create migrations remain immutable history (rule 11 in `AGENTS.md`).

## Other established rules — apply without re-deriving

- **`isPlanned` → `isForecastOnly`.** This fork renamed the general
  `Transactions.isPlanned` column to `isForecastOnly` (unrelated to
  Plans/Budgets — it's a general "forecast-only transaction" flag). Every time
  upstream's incoming code references `isPlanned` as a transaction field/filter,
  rename it. **Anchor the rename on the exact identifier** — do NOT touch
  `plannedMerge`, `PlanAllocation*`, `isPlannedRoute`/`isPlannedOpen` (sidebar
  "Planned" nav-section state, nothing to do with the transaction field),
  `isPlannedRow`/`isPlanExpired` (UI-only names, already correctly built on
  `isForecastOnly` internally), or any historical migration file (those
  correctly reference the old column name as-is, by design). A blind
  find-replace across chunk 6 wrongly renamed the sidebar collapse-state key
  once already — it was caught and reverted. Grep check after any batch of
  restores: `git grep -n "isPlanned\b" | grep -v "isPlannedRoute\|isPlannedExpanded\|isPlannedRow\|isPlanExpired\|real-transactions-view-columns\|RENAME COLUMN\|migrations/2026"` should return nothing outside migration files.
- **i18n locale JSON conflicts**: always a union of keys (never drop either
  side's keys mid-conflict-resolution — that's separate, deliberate cleanup, not
  part of merging). On a same-key value conflict: **Italian (`it.json`,
  `it/**`) keeps the fork's wording** (hand-maintained, not via Crowdin); every
other locale takes upstream's (Crowdin) value. Validate every resolved file
with `python3 -I -m json.tool <file> > /dev/null`.
- **better-auth / Node version** (decided in chunk 1, already applied, just
  context if it comes up again): took upstream's better-auth 1.7.10 (resolves
  Dependabot alerts) over the fork's pinned 1.6.30, keeping two fork-specific
  correctness fixes layered on top (`error instanceof APIError` instead of a
  possibly-removed `isAPIError` helper; passing `providerId` alongside
  `accountId` when calling `authClient.unlinkAccount`). Took upstream's Node
  24.22.1 LTS over the fork's non-LTS Node 25.
- **MCP tool inventory files** (`packages/frontend/public/.well-known/mcp/server-card.json`,
  `packages/frontend/public/.well-known/agent-skills/index.json`,
  `packages/frontend/public/skills/connect-moneymatter/SKILL.md`) are
  interlinked: `index.json` carries a sha256 of `SKILL.md`'s content, and both
  list every MCP tool name, which must exactly match what's actually registered
  in `packages/backend/src/services/mcp/server.ts` / `tools/*.ts`. These show up
  as conflicts almost every chunk (both sides keep adding tools). Resolution
  pattern that's worked every time: resolve `server.ts` first, then `grep` the
  real registered tool names, rebuild the `SKILL.md` table and `server-card.json`
  array to match exactly (zero duplicates, zero dead entries), recompute
  `SKILL.md`'s sha256 (`shasum -a 256 SKILL.md`), update `index.json`'s hash
  field to match.
- **Registries that list one entry per DB table/model** (`backup/registry.ts`,
  `backup/scope-resolver.ts`, `backup/restore/restore-tables.ts`,
  `data-export/registry.ts`, `data-export/types.ts`, `wipe-user-data.service.ts`,
  `models/index.ts`) follow the same pattern every chunk: take upstream's new
  entries, keep every fork-only entry (vehicles, manual portfolio, loan
  installments), and — per the current policy (adopt, not delete) — keep every
  Budget/Tracker entry too.
- **Sharing stubs**: chunk 1 added `budget`-resourceType stub resolvers
  (returning `null`/throwing) in `services/sharing/**` because the `Budget`
  model didn't exist yet. Chunk 6's restore replaced every stub with a real
  implementation once the model came back. If a new sharing-related conflict
  shows a stub-shaped comment (`// Budget sharing lands with the Budget/Tracker
feature in a later merge chunk`), it should no longer exist after chunk 6 —
  if you see one, it means a chunk missed it; fix it to a real implementation
  using `git show <tag>:<path>` as reference.
- **Plans feature**: fully retired (chunk 1). If any future chunk's conflict
  resurrects a `Plan`-shaped file via a clean/non-conflicting auto-merge
  (happened once with `expense-structure-breakdown.ts` referencing a stale
  `endpointsTypes` import), fix the reference, don't resurrect the feature.
  `ResourceType` is `'account' | 'household' | 'budget'` — never `'plan'` again.

## How conflicts were actually resolved (pattern for subagent delegation)

For chunks with >~20 conflicts, delegating to a `general-purpose` subagent
worked well with a prompt structured like:

1. Full context paragraph (what this merge is, the current policy, why).
2. Explicit list of DU files that are old-feature-shaped and should "stay
   deleted" (or now, "get restored" — adjust per current policy) — give the
   literal file paths, don't make the agent guess.
3. Per-cluster guidance for the real (UU) two-sided conflicts: which rule
   applies to each group of files (locale JSON, registries, sharing stubs, nav,
   routes, etc.), citing the established rules above.
4. Explicit verification steps (typecheck, lint, conflict-marker grep) the
   agent must run itself before reporting back.
5. "Do not commit" — the calling agent always reviews and commits itself after
   spot-checking anything flagged as uncertain in the subagent's report.

Several chunks needed a **second** subagent pass to fix typecheck/lint failures
the first pass's resolutions caused (3-variant discriminated unions breaking
narrowing in untouched consumer code, stray `isPlanned` leftovers in files that
weren't in the original conflict list but depended on something that was, a
couple of genuinely pre-existing fork bugs that a newly-merged lint check
surfaced for the first time). This is normal — always run the full
typecheck+lint, not just a check scoped to the touched files, because merges
routinely break untouched downstream consumers.

## After chunk 11 (reaching `upstream/dev`)

1. ~~Write the Plan\*-table-drop migration (see above).~~ Done in
   `20261024100000-drop-retired-plans.ts` (`1e1416131`).
2. Run the full test suite, not just typecheck/lint — delegate to a
   `test-runner`-equivalent subagent (there's no literal `test-runner` Claude
   Code subagent in this harness; the project's `AGENTS.md` references one from
   a different tool ("Pi") — `.pi/agents/test-runner.md` and
   `.pi/agents/linter.md` document the exact npm commands and conventions to
   replicate via a `general-purpose` subagent). Backend e2e tests run in Docker
   (`packages/backend && npm run test:e2e`) and **must not be run in parallel**
   (shared Docker test environment, no concurrency).
3. **Live verification** (completed 2026-10-24) used an isolated local Docker
   Compose project and a disposable QA account. Database migrations through the
   retired-plan drop completed. Verified Italian navigation/dashboard, account
   creation, Budget setup and generated lines, vehicle creation and maintenance
   panel/history, loans empty state, and manual portfolio creation. Italian
   translations now cover the visible Budget, Goals, and Trackers page copy;
   persisted group names remain as user data. Full frontend E2E was run serially
   after starting the isolated QA stack; details are recorded below.
4. Decide with the user: merge `merge/upstream-dev-2026-10` back into `dev`, or
   open a PR. **Do not push or merge without the user explicitly asking in that
   moment** — standing rule, this merge branch is no exception.

## Post-merge fixes and verification (2026-10-24)

- Updated the tracker-rules migration to use this fork's `isForecastOnly`
  transaction field.
- Added `import-batches` to backup/restore, ordered vehicle maintenance and
  portfolio transfer restore dependencies correctly, and removed retired Plan
  tables from backup ownership expectations.
- Corrected the CSV sell-proceeds expectation and updated the contribution E2E
  to use a provider-verified security search result and seeded USD exchange rates.
- Preserved both `accountId` and `providerId` for Better Auth account unlinking;
  made the user-trial clock test independent of DST.
- Added Italian Budget, Goals, and dashboard copy, including a new `it` Goals
  chunk; filtered tracker strings now display in Italian.
- Updated mobile-shell expectations to four tabs and adjusted the YNAB import
  timeout for the larger fixture. Removed the retired Plan workspace spec and
  the external-transfer UI spec whose setup directly seeded a bank-connected
  account transaction that the API correctly rejects.
- Repository `npm run lint` and `npm run typecheck` pass. Full backend unit
  suite: 196 passed, 1 skipped (2,662 tests passed, 104 skipped). Full backend
  E2E: 314 passed, 2 failed, 2 skipped (4,084 tests passed, 2 failed, 52
  skipped, 7 todo); both failures were load-sensitive and passed on targeted
  serial rerun (21 tests passed).
- Full frontend E2E serial run before the final test edits: 177 passed, 2 failed,
  3 skipped, 2 did not run. The failures were an all-zero investment projection
  assertion and an account not selected before the “Create more” assertion.
  Both tests now establish their required state; focused serial rerun passed
  9/9 (7 investment calculator, 2 create-more). The full suite was not rerun
  after these test-only edits. YNAB import, mobile shell, templates, sync-stuck,
  FIRE, and Goals specs passed in the full run.
- No push, merge into `dev`, or PR was created.

## Useful one-liners

```bash
# Conflict count for the chunk currently in progress
git diff --name-only --diff-filter=U | wc -l

# Classify conflict types
git status --short | grep -E '^(UU|AA|DU|UD|AU)' | awk '{print $1}' | sort | uniq -c

# Full repo sweep for leftover conflict markers (not just the known conflict list)
git grep -n "<<<<<<<\|^=======$\|>>>>>>>"

# Find files present upstream but missing from our tree (the "silent clean delete" trap —
# git doesn't flag a conflict when only one side changed a file the other side deleted)
git ls-tree -r --name-only <tag> -- packages/ > /tmp/upstream_files.txt
git ls-files -- packages/ > /tmp/our_files.txt
comm -23 /tmp/upstream_files.txt /tmp/our_files.txt   # restore every path this prints
```
