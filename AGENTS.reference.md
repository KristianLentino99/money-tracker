# AGENTS.reference.md

> Companion to [AGENTS.md](AGENTS.md). Extracted from the existing code so generated code is mergeable without a style fix.
> Where this file and `AGENTS.md` / `.pi/docs/backend-conventions.md` / `.pi/skills/frontend-rules/SKILL.md` disagree, those project-authored rules win; discrepancies are called out inline.

## 1. Overview

Money Tracker is a self-hostable personal-finance app (accounts, transactions, budgets, investments, loans, subscriptions, bank sync, AI categorization, MCP tools). It is an npm-workspaces TypeScript monorepo: an Express + Sequelize (Postgres) backend using a route → controller → service layering, a Vue 3 (`<script setup>`) + Tailwind + Vite frontend, a `shared` package of types/constants consumed by both, and an Astro landing site.

## 2. Repository Structure

```
packages/
  backend/          # Express API, Sequelize models, services, migrations, jobs
    src/routes/         # {feature}.route.ts — wiring only
    src/controllers/    # {feature}.controller.ts — zod schema + createController, thin
    src/services/       # business logic, grouped in a directory per feature
    src/models/         # Sequelize models: {name}.model.ts
    src/migrations/     # sequelize-cli migrations
    src/js/errors.ts    # custom error classes
    src/tests/helpers/  # HTTP helpers used by e2e tests
    lint/               # custom oxlint plugin (transactions boundary)
  frontend/         # Vue 3 app
    src/api/            # ALL HTTP calls live here
    src/composable/     # use-*.ts composables
    src/components/{common,lib,dialogs,fields}/  # shared components
    src/pages/<feature>/components/               # page-specific components
    src/stores/  src/routes/  src/i18n/  src/common/utils/
  shared/           # types/constants imported as @bt/shared/*
  landing/          # Astro marketing site
docs/  scripts/  docker/  self-hosting/  deploy/   # not application code
.pi/                # agent docs + skills (backend-conventions.md, frontend-rules)
```

- Put shared/reusable frontend components in `components/common/` or `components/lib/`; page-specific ones in `pages/<feature>/components/`.
- Put types/constants used by both backend and frontend in `packages/shared/src`.
- Never add business logic to routes or controllers.
- Never inline `fetch`/`axios` in components or composables; add a function to `packages/frontend/src/api/`.

## 3. Service Map

- **backend** (`budget-tracker-be`): TypeScript, Express, Sequelize, entry `src/app.ts`, npm workspace. Node version in `.nvmrc`.
- **frontend** (`budget-tracker-fe`): TypeScript + Vue 3, Vite, entry `src/main.ts`, vitest for unit tests, Playwright for e2e.
- **shared**: TypeScript types/constants, no build step, imported by path alias.
- **landing**: Astro site, independent of the app.

## 4. Cross-Service Boundaries

> **Repo-wide:** frontend and backend never import each other; both import from `shared` via the `@bt/shared/*` alias (backend maps it to `../../shared/src/*`).

```ts
import { ACCOUNT_STATUSES, TRANSACTION_TYPES } from '@bt/shared/types';
```

- API types live in `@bt/shared/types` (`api.ts`, `db-models.ts`, `endpoints.ts`). Change shared types first, then update both sides in the same change.
- No contract-test layer exists; e2e tests (backend) and Playwright (frontend) are the integration safety net.

## 5. Commands and Workflows

### Root

```bash
npm run lint         # backend + frontend oxlint
npm run typecheck    # backend tsc + frontend vue-tsc
npm test             # backend then frontend
npm run format       # used by the husky pre-commit hook (oxfmt)
```

### Backend (`packages/backend`)

```bash
npm run dev
npm run test:unit
npm run test:e2e                                  # Docker-based; never run in parallel
npm run test:e2e -- --testPathPattern='accounts/archive-account.e2e'
npm run test:lint-rules
npm run migrate:dev
npm run migrate:generate
```

- Never call `npx jest` directly; always use the npm scripts (AGENTS.md).

### Frontend (`packages/frontend`)

```bash
npm run dev
npm run test:unit    # vitest
npm run test:e2e     # playwright
```

## 6. Code Formatting

> **Repo-wide:** formatter is oxfmt, config in `.oxfmtrc.json`; `.editorconfig` at root. The pre-commit hook runs `npm run format` then `npm run lint`.

- Indent 2 spaces, no tabs. LF line endings, UTF-8, final newline, trim trailing whitespace (Markdown excepted).
- Print width 120. Semicolons. Single quotes. Trailing commas everywhere (`"trailingComma": "all"`).
- Imports are auto-sorted with blank lines between groups: side-effect, then builtin/external, then type imports, then internal (`@src` pattern), then parent/sibling/index.
- Arrow functions/objects follow oxfmt output; do not hand-align.

```ts
export const archiveAccount = async ({ account, userId }: ArchiveAccountPayload) => {
  const accountId = account.id;

  if (account.bankDataProviderConnectionId) {
    await unlinkAccountFromBankConnection({ accountId, userId });
  }
};
```

- Frontend Tailwind classes are sorted by the formatter (`sortTailwindcss`).
- Bash scripts: 2-space indent.

## 7. Naming Conventions

> **Repo-wide:** file and directory names are kebab-case (AGENTS.md rule 1).

### TypeScript (backend, frontend, shared)

- Variables/functions: `camelCase` (`getAccounts`, `createAccount`).
- Types/interfaces/classes/components: `PascalCase` (`ArchiveAccountPayload`, `CustomError`).
- Constants/enums: `SCREAMING_SNAKE_CASE` objects or enums (`ACCOUNT_STATUSES`, `ERROR_CODES`).
- Backend files: `{action}.ts` inside a feature directory (`accounts/archive-account.ts`), models `{name}.model.ts`, controllers `{feature}.controller.ts`, routes `{feature}.route.ts`.
  - Discrepancy: `.pi/docs/backend-conventions.md` documents `{action}.service.ts`, but most service files have no `.service` suffix. Follow the directory's existing pattern.
- Frontend: composables `use-*.ts` exporting `useX`; Vue files `kebab-case.vue`.
- Unused args/vars are prefixed `_` (lint config).
- New functions take a single object param (`function({ arg1, arg2 })`) except where a framework/library dictates positional args.

## 8. Type Annotations

- TypeScript with `noUncheckedIndexedAccess` on; typecheck via `tsc --noEmit` (backend) and `vue-tsc --noEmit` (frontend).
- Service params use an inline object type or a named `interface XPayload`.
- Avoid `any` unless unavoidable (frontend-rules).
- Money is a `Money` value type (`@common/types/money`); serializers convert cents to decimals at the API boundary.

## 9. Imports

- Use path aliases, not deep relative paths, for cross-feature imports: `@models/*`, `@services/*`, `@controllers/*`, `@common/*`, `@js/*`, `@tests/*`, `@root/*`, `@bt/shared/*`. Frontend uses `@/` for `src/`.
- Same-directory collaborators use `./relative`.
- Never use `import *` except for the deliberate service namespace pattern (`import * as accountsService from '@services/accounts.service'`).

```ts
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import Accounts from '@models/accounts.model';

import { unlinkAccountFromBankConnection } from './unlink-from-bank-connection';
```

## 10. Error Handling

- Throw errors from `@js/errors` (`NotFoundError`, `ValidationError`, `ConflictError`, `NotAllowedError`, `Unauthorized`, `UnexpectedError`); they carry an HTTP code and `API_ERROR_CODES`.
- Messages use an i18n key: `t({ key: 'feature.thingNotFound' })`, never a literal English string.
- For `findOne` then not-found, use `findOrThrowNotFound` from `@common/utils/find-or-throw-not-found`.
- Controllers do not catch; `createController` handles errors and the response envelope.
- Swallowing errors is accepted only for best-effort side work and must be documented, e.g. per-vehicle refresh failures are swallowed inside `refreshStaleVehicleValuesForUser`.

## 11. Comments and Docstrings

- Use JSDoc blocks on non-obvious service functions to state side effects and transaction contract (see `archive-account.ts`: "NOT wrapped in withTransaction — must be called from within an existing transaction").
- Inline comments explain why, not what; numbered step comments are used in multi-step services.
- No commented-out code.

## 12. Testing

### Backend

- Unit: `*.unit.ts` next to source; run `npm run test:unit`.
- E2E: `*.e2e.ts` colocated in the **service** directory (never in controllers), e.g. `services/accounts/archive-account.e2e.ts`.
- E2E tests only call HTTP endpoints through `@tests/helpers` (`helpers.createAccount`, `helpers.makeRequest`); never call services directly.
- Every new endpoint needs an e2e test: happy path, empty state, at least one error case.
- Bug fixes: write a failing test first.
- Jest with `@jest/globals` imports:

```ts
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Account archiving (PUT /accounts/:id)', () => {
  it('walks one account through every status transition', async () => {
    const account = await helpers.createAccount({ payload: helpers.buildAccountPayload(), raw: true });
    expect(account.status).toBe(ACCOUNT_STATUSES.active);
  });
});
```

### Frontend

- Vitest, colocated. Both `*.spec.ts` and `*.test.ts` exist; there is no single dominant suffix, so match the neighbouring files in the directory.
- Pure functions, utils and composables require unit tests.

## 13. Git

> **Repo-wide**

- Conventional-style prefixes: `feat`, `fix`, `chore`, `refactor`, `perf`, `test`, `docs`, `ci`. Optional scope in parentheses: `refactor(accounts): ...`, `test(backend): ...`.
- Lowercase imperative subject, single line is the norm; a body is uncommon.
- Merge commits are used for integration. Commits are not GPG-signed.
- Branch prefixes seen: `codex/`, `feat/`.
- Do not commit lockfile or user-data changes unrelated to the task.

## 14. Dependencies and Tooling

- npm workspaces; single root `package-lock.json` is committed. Add dependencies with `npm install <pkg> -w <workspace-name>`.
- Linter: oxlint (`packages/backend/.oxlintrc.json`, `packages/frontend/.oxlintrc.json`). Formatter: oxfmt (`.oxfmtrc.json`).
- Custom lint rules in `packages/backend/lint/` (see Red Lines). Dead-code checks via `knip`.
- DB changes require a sequelize-cli migration in `packages/backend/src/migrations/`.
- User-facing strings go through i18n (`t(...)` backend, `$t`/`t` frontend); see the `i18n-before-release` skill.

## 15. Red Lines

1. Never put business logic in a route or controller.
2. Never query the `Transactions` model directly outside the allowlisted files; go through `@models/transactions-query` (lint rule `boundary/no-direct-transactions-queries`).
3. Never write raw SQL over `"Transactions"`; target the `real_transactions` view or add a `planned-ok: <reason>` annotation.
4. Never import between `frontend` and `backend`; share through `@bt/shared`.
5. Never use raw `<button>`; use `Button` from `@/components/lib/ui/button`.
6. Never use default Tailwind colors (`text-red-500`); use tokens from `styles/global.css`, and never `text-primary`/`text-destructive` for text or icons.
7. Never hardcode route path strings; use `routes/constants.ts`.
8. Never inline `fetch`/`axios` in components; use `src/api/`.
9. Never use raw `Date` methods or other date libs in the frontend; use `date-fns`.
10. Never use `withTransaction` on plain reads; use it only for writes.
11. Never throw literal English messages from services; use `t({ key })`.
12. Never call services from e2e tests; use HTTP helpers only.
13. Never run e2e suites in parallel or invoke `npx jest` directly.
14. Never use `mr-*`/`ml-*`/`space-x-*` inside a `Button`.
15. Never use camelCase or PascalCase for file names; kebab-case only.
16. Never commit unrelated lockfile or user-data changes.

## Tentative / gaps

- `[tentative]` Block-comment density and JSDoc requirement per function: only a few services were read.
- `[tentative]` Frontend import ordering for the `@/` alias: sampled files place `@/…` before `@bt/shared`, which does not match the oxfmt group order; treat the formatter output as the source of truth.
- Frontend `.spec.ts` vs `.test.ts`: genuine inconsistency, no rule invented.
- Analyzer Python scripts (`scripts/*.py`) were unavailable locally; evidence came from `agentskill analyze`.
