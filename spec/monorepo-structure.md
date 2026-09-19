# Monorepo Structure and Naming Conventions

The repository is a pnpm + Turborepo monorepo with three applications and
shared packages, organized for strict separation of concerns. This file
defines the target structure, the naming conventions every artifact
follows, and the scaffolding provenance table mapping every app and
package to the generator command that creates it (GENERATOR-FIRST RULE,
`spec/00-master-goal.md`).

## 1. Target structure

```
apps/
  landing/            # public marketing site (v1: marketing only)
  platform-admin/     # operator portal (v1: organization management)
  frontdesk/          # org-facing PWA for cashiers and org admins
packages/
  ui/                 # design system: shadcn-generated components + shared primitives
  db/                 # Drizzle schema over Supabase Postgres, migrations helpers
  auth/               # Supabase Auth clients, claim readers, guards
  api/                # tRPC routers and procedures (server-side scope resolution)
  schemas/            # Zod schemas — single source of truth for validation + types
  offline-sync/       # Dexie cache/outbox, Serwist wiring, drain worker (Frontdesk)
  audit/              # cross-cutting audit-entry writing infrastructure
  utils/              # shared pure utilities (money display, time formatting)
  config/             # shared eslint/tsconfig/tailwind bases (generator-produced)
  testing/            # money-recomputation utility, gate scripts, report-generator helpers
supabase/             # Supabase project dir (config.toml, migrations/, functions/)
```

## 2. Frontdesk vertical feature slices

Inside `apps/frontdesk`, code is organized as vertical feature slices —
this is the exhaustive list for the initial release:

```
features/
  sessions/   rooms/   addons/   canteen/
  rates/      shift/    staff/    reports/
```

Each slice owns its own types, services (remote via tRPC, local via
Dexie), hooks, and components. Audit logging is not a feature slice: it is
cross-cutting infrastructure in `packages/audit`, invoked by every state
-changing service. Org-scoped audit review lives in `features/reports`;
the system-wide review UI belongs to Platform Admin and is a future phase
(`spec/project-overview.md`).

The test-and-proof infrastructure is a first-class slice:
`packages/testing` hosts the money-recomputation utility, the mutation and
coverage gate scripts, and the acceptance-report generator's helpers, so
the gates are shared code rather than per-phase copies.

## 3. Naming conventions

| Kind | Convention | Example |
|---|---|---|
| Packages | `@silid/kebab-case` | `@silid/offline-sync` |
| Apps | kebab-case directories | `apps/platform-admin` |
| React components | PascalCase files and exports | `SessionCard.tsx` |
| Hooks | camelCase with `use` prefix | `useCheckIn` |
| Remote services | `<domain>.remote.ts` | `sessions.remote.ts` |
| Local services | `<domain>.local.ts` | `sessions.local.ts` |
| tRPC routers | `<domain>.router.ts`; procedures as verbNoun | `createSession`, `closeSession` |
| Zod schemas | `<domain>.schema.ts` | `session.schema.ts` |
| Constants | `<domain>.constants.ts`, SCREAMING_SNAKE_CASE or namespaced objects | `GRACE_PERIOD_MINUTES` |
| Database tables | snake_case, plural | `session_addons`, `audit_log` |
| Tenancy columns | every org-scoped table carries `org_id`; every branch-scoped table carries `branch_id` — both indexed FKs | `spec/data-model.md` |
| Role identifiers | snake_case, verbatim from ROLES BY TIER | `platform_admin`, `org_admin`, `cashier` |
| Env vars | SCREAMING_SNAKE_CASE; `NEXT_PUBLIC_` prefix only when client-exposed | `SUPABASE_PROJECT_REF` |
| Git branches | `type/short-scope-description` | `feat/shift-close-rpc` |
| Commits | Conventional Commits | `feat(api): seal checkout totals` |
| Vault scenarios | `vault-<nn>`, referenced verbatim | `vault-11` |

## 4. Scaffolding provenance table

Every app and package maps to the generator that creates it. Deliverables
in the roadmap phrase these as "Run <command>", and any hand-written file
a generator could have produced is a defect (GENERATOR-FIRST RULE). Where
no generator exists, the roadmap says so and the builder hand-writes the
minimum following official docs, logging that no generator exists.

| Artifact | Generator command (current syntax verified at run time per the verify rule) |
|---|---|
| Monorepo skeleton | `pnpm create turbo@latest` (create-turbo) — root package.json, workspace, turbo.json, shared tsconfig/eslint bases |
| apps/landing, apps/platform-admin, apps/frontdesk | `pnpm create next-app@latest` per app (with pnpm, TypeScript, Tailwind) |
| packages/ui components | `pnpm dlx shadcn@latest init` then `pnpm dlx shadcn@latest add <component>` |
| Supabase project dir | `supabase init` |
| Database migrations | `supabase migration new <name>`; SQL generated via `supabase db pull` / `supabase db diff` against the local stack |
| pgTAP policy tests | run via `supabase db test` (test files live under `supabase/tests/`) |
| Edge Functions | `supabase functions new <name>` |
| Dependencies | `pnpm add` / `pnpm add -D` — never hand-edited package.json entries |
| E2E setup | Playwright's init command (`pnpm dlx playwright init` family — exact syntax via `--help`) |
| Mutation testing | Stryker's init command (`pnpm dlx @stryker-mutator/init` family — exact syntax via `--help`) |
| Error tracking | Sentry's official setup wizard |
| packages/db, auth, api, schemas, offline-sync, audit, utils, testing | **no dedicated generator exists** — hand-written package skeletons following the workspace conventions of the generated monorepo, each noted in the build log as no-generator-available |

The `packages/*` skeletons are the deliberate exception: the Turborepo
generator produces workspace package scaffolding conventions; each shared
package is created as a minimal workspace package under those conventions
rather than by a bespoke generator, and the build log records the no-
generator rationale per package.

## 5. Build/lint/test scope exclusions

`/Silid/legacy` is reference material, not part of the new system: the
monorepo's build, lint, coverage, mutation, and test globs exclude it
explicitly. The scaffolding phase wires these exclusions so no gate ever
counts legacy code.
