# Tech Stack

This file pins the technologies, records the version line to use, and
names the source consulted for every version-sensitive claim. The master
Decision Record (`spec/00-master-goal.md`) fixed the choices; the versions
below were confirmed against the npm registry (level-1 ground truth under
the verify-before-you-trust rule) on **2026-09-20**. The builder protocol
(`spec/builder-protocol.md`) requires re-confirmation at implementation
time — the table prevents drift, it does not license stale installs.

## Version-and-source table

| Library / tool | Version line to use | Source consulted | Confirmed |
|---|---|---|---|
| Next.js | 16.x (16.3.5 current; Next.js 16 is the supported LTS line — the 15 line ends support October 2026) | npm registry `npm view next version`; endoflife.date via web search | 2026-09-20 |
| React | 19.x (19.3.0) | npm registry `npm view react version` | 2026-09-20 |
| TypeScript | 7.x (7.0.2; the native-speed compiler line). Re-verify toolchain compatibility at scaffolding time; if a pinned tool lacks TS 7 support, the scaffolding phase logs the fallback decision rather than silently pinning an older line | npm registry `npm view typescript version` | 2026-09-20 |
| Tailwind CSS | 4.x (4.3.3) — the master document's "Tailwind CSS v4" pin is current | npm registry `npm view tailwindcss version` | 2026-09-20 |
| shadcn/ui (CLI) | 4.x CLI (4.21.0); components are generated source, not a dependency | npm registry `npm view shadcn version` | 2026-09-20 |
| Radix Primitives | latest 1.x/2.x per component (e.g. react-dialog 1.1.23), installed via the shadcn CLI | npm registry | 2026-09-20 |
| Lucide React | 1.x (1.47.0) | npm registry | 2026-09-20 |
| tRPC | 11.x (11.19.0) | npm registry `npm view @trpc/server version` | 2026-09-20 |
| Drizzle ORM | 0.45.x (0.45.3); drizzle-kit 0.31.x (0.31.11) | npm registry | 2026-09-25 |
| Zod | 4.x (4.6.5) | npm registry | 2026-09-20 |
| Zustand | 5.x (5.0.15) | npm registry | 2026-09-20 |
| TanStack Query | 5.x (5.103.1) | npm registry | 2026-09-20 |
| Supabase JS client | 2.x (2.116.0) | npm registry | 2026-09-20 |
| Supabase SSR helpers | 0.12.x (0.12.7) | npm registry | 2026-09-20 |
| Supabase CLI | 2.x (2.117.0); command syntax always discovered via `--help` at use time | npm registry; `spec/supabase.md` | 2026-09-20 |
| pgTAP | the extension bundled with the Supabase CLI's local stack; run via `supabase db test` — no standalone version pin | `spec/supabase.md` §6; Supabase docs | 2026-09-20 |
| Dexie | 4.x (4.4.6); dexie-react-hooks 4.4.0 | npm registry | 2026-09-20 |
| Serwist | 9.x (9.5.12; @serwist/next for the Next.js integration) | npm registry | 2026-09-20 |
| Vitest | 5.x (5.0.1) | npm registry | 2026-09-20 |
| Testing Library | 16.x (@testing-library/react 16.x line) | npm registry | 2026-09-20 |
| Playwright | 1.x (1.63.0); installed via Playwright's own init command | npm registry | 2026-09-20 |
| StrykerJS | 10.x (10.0.0); configured via Stryker's init command | npm registry `npm view @stryker-mutator/core version` | 2026-09-20 |
| pnpm | 12.x (12.5.1) | npm registry | 2026-09-20 |
| Turborepo | 2.x (2.11.2); monorepo scaffolded via create-turbo | npm registry | 2026-09-20 |
| Sentry | 10.x (@sentry/nextjs 10.75.0), wired via Sentry's official wizard | npm registry | 2026-09-20 |
| class-variance-authority | 0.7.x (0.7.1) — installed by the shadcn CLI, never hand-added | npm registry | 2026-09-20 |
| date-fns | 4.x (4.4.0), for formatting only — never for authoritative time | npm registry | 2026-09-20 |

Anything marked UNVERIFIED in a downstream artifact is a blocker for the
phase that needs it, not a note to skip. Where a builder discovers a
version conflict at implementation time (a tool deprecated, a line
withdrawn), the verify-before-you-trust rule applies: the live source
wins, the change is logged to `spec/CHANGELOG.md` in the same commit, and
the table above is updated.

## Stack decisions and their drivers

Each choice below cites its driver from the Decision Record; drivers are
not re-argued here.

- **Monorepo: pnpm + Turborepo** — three related apps, one toolchain,
  shared packages. Scaffolded by create-turbo, never hand-typed
  (`spec/monorepo-structure.md` carries the provenance table).
- **Next.js + TypeScript everywhere** — one framework across all three
  apps; simpler hiring and maintenance.
- **tRPC** — end-to-end type safety across app/package boundaries; the
  typed contracts double as a free contract-test layer.
- **Drizzle ORM over Supabase's Postgres** — SQL-first control; Drizzle
  talks to the same managed Postgres Supabase secures. Drizzle owns the
  ORM-layer schema; database migrations themselves are generated through
  the Supabase CLI (`spec/supabase.md` §2, GENERATOR-FIRST RULE).
- **Postgres Row-Level Security** — tenant isolation is contractual;
  app-layer filtering alone is not a backstop.
- **Supabase Auth** — managed identity; authorization claims in
  app_metadata (`spec/authentication.md`).
- **Offline: Dexie + Serwist** — IndexedDB cache/queue for the Frontdesk
  PWA and its service worker; the contract lives in
  `spec/offline-sync.md`.
- **State: Zustand (client state) + TanStack Query (server cache)** — a
  clean split; the Frontdesk keeps both, the other apps mostly Query.
- **Zod as single source of truth** — one schema source for runtime
  validation and inferred types, shared through `@silid/schemas`.
- **Testing: Vitest + Testing Library / Playwright / pgTAP / tRPC types** —
  fast unit loop; real-browser E2E including offline-mode tests with video
  recording; policy tests through the Supabase test runner. Coverage gate
  in CI: 80% line minimum on `packages/db`, `packages/api`, and Frontdesk
  feature-slice services. Mutation gate: Stryker on the same packages plus
  the guest-billing and money-arithmetic modules, minimum kill rate 80%
  enforced in CI (the exact threshold is whatever `spec/` states; CI
  enforces the spec, `spec/builder-protocol.md` §4 carries the gate
  mechanics).
- **Concurrency as design input** — multi-cashier operation is the normal
  case; simultaneous sessions, concurrent shift close-out, and conflicting
  offline-sync writes are named behaviors with attack scenarios
  (`spec/domain-rules.md`, vault-16).
- **Edge Functions / pg_cron for scheduled money** — server-side scheduled
  guest-billing work lives on Supabase's platform
  (`spec/supabase.md` §7).
- **Error tracking: Sentry** — wired during the scaffolding phase via the
  official wizard, never bolted on later.
- **Hosting: Vercel** for all three apps; Supabase manages all backend
  services (`spec/deployment-operations.md`).
