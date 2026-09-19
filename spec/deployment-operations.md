# Deployment and Operations

This file records the deployment topology, environments, CI pipeline, and
the Supabase project references the Supabase protocol depends on
(`spec/supabase.md` §3, §8). The client runs nothing: hosting is Vercel
for the applications, Supabase's platform for every backend service, and
the database is Supabase managed Postgres with point-in-time recovery and
automated daily backups included in the managed platform.

## 1. Environments

| Environment | Purpose | Application hosting | Backend |
|---|---|---|---|
| Local development | builder sessions, unit/E2E, pgTAP via the local stack | Next.js dev servers | Supabase local emulated stack (`supabase start`) |
| Preview | per-pull-request verification | Vercel preview deployments | dedicated Supabase test project (or local stack for RLS/money proofs) |
| Production | the live system | Vercel | the production Supabase project |

"Run it and show output" for tenancy, RLS, or money claims always means a
real or locally-emulated Postgres — never a mocked database
(`spec/supabase.md` §8).

## 2. Supabase project references

The Supabase MCP server config and every `supabase link` target take the
refs from this table (`spec/supabase.md` §3). The refs are recorded here
at the scaffolding phase, when the projects are created and linked; until
then the field is explicitly unrecorded — builders wire the MCP config
with the ref from this file, never from memory.

| Field | Value |
|---|---|
| Production project ref | UNRECORDED-PENDING — recorded in this table at the scaffolding phase when the production project is created and linked |
| Production region | UNRECORDED-PENDING — recorded alongside the ref (nearest region to the branches; Philippines-serving region chosen at creation) |
| Test project ref (CI/runbook) | UNRECORDED-PENDING — recorded at the scaffolding phase, or the local stack is used |

The scaffolding phase's Definition of done includes filling this table and
committing it. A downstream phase that finds these fields still
UNRECORDED-PENDING stops and reports rather than guessing a ref.

## 3. CI/CD — GitHub Actions

Every pull request runs, in order: lint → typecheck → test → build. The
test stage carries the proof gates:

- **Unit/component** — Vitest + Testing Library across apps and packages.
- **Coverage gate** — 80% line minimum on `packages/db`, `packages/api`,
  and Frontdesk feature-slice services.
- **Mutation gate** — Stryker on the same packages plus the guest-billing
  and money-arithmetic modules; minimum kill rate 80% (the spec's stated
  threshold is what CI enforces). Mutation output lands in
  `/Silid/reports/proof/` each phase.
- **RLS policy tests** — `supabase db test` (pgTAP) against the local
  stack or the test project.
- **E2E** — Playwright, including offline-mode/network-throttled tests
  for the PWA sync path, video recording enabled for proof clips.
- **Rule linter** — the scaffolding phase's rule-lint CI job enforces
  documentation-pipeline rules mechanically (terminology qualification,
  EVIDENCE-tag presence in the log, acceptance-input shape).

Builds deploy through Vercel (preview per PR; production on merge).
Sentry is wired during the scaffolding phase via its official wizard and
receives runtime errors from all three apps.

## 4. Operations

- **Backups and recovery** — Supabase managed Postgres: automated daily
  backups and point-in-time recovery are platform features; the client
  operates nothing.
- **Error tracking** — Sentry across all three apps.
- **Scheduled work** — pg_cron inside Supabase (room-status escalation)
  and Edge Functions where platform-appropriate (`spec/supabase.md` §7).
- **Secrets** — Supabase publishable keys in client-exposed env vars only;
  `service_role` and secret keys never appear in client code or
  client-exposed variables (`spec/supabase.md` §5). Platform secrets live
  in the platform's env/secret stores, recorded by name — never by value —
  in any artifact.
- **Cost commitments** — the deployment spec as written covers Vercel
  hosting, one Supabase production project, and one test project or the
  local stack. Any phase needing spend beyond this pattern parks the
  decision in `/Silid/DECISIONS-NEEDED.md` per the Standing Rules.
