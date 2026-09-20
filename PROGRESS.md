# PROGRESS — Silid build log

```json
{
  "schema": "silid-progress/2",
  "last_updated": "2026-09-21",
  "current_phase": "01",
  "phase_status": { "01": "in_progress" },
  "last_commit": "69fe30a",
  "resume_point": "Phase 01: Deliverables 1-8, 11-16 done; 6/7 acceptance inputs green. Remaining: operator-credential items (supabase link; Sentry wizard; Vercel link+GitHub remote for CI/previews), then the runner review gate closes the phase",
  "open_decisions": 0
}
```

---

## Append-only build log

### 2026-09-20 — Phase 01 session start (builder)

Read in full, from disk: every file in `/Silid/spec/*.md` (00-master-goal,
applications, authentication, builder-protocol, CRITIQUE, data-model,
deployment-operations, domain-rules, legacy-behavior-vault,
legacy-gap-analysis, monorepo-structure, multi-tenancy, offline-sync,
project-overview, supabase, tech-stack), `/Silid/roadmap/00-index.md`,
`/Silid/roadmap/01-scaffolding.md`. PROGRESS.md did not exist before this
phase; it is being created now (Deliverable 10 satisfied progressively —
the ledger above is maintained at task boundaries, this log is append-only).
`/Silid/tripwire-registry.json` was not read and is not on any reading list.

**Environment research (level-1 ground truth, all commands run live):**

- `node --version` → v24.21.0. `git --version` → git 2.55.0.windows.5.
- `pnpm --version` → 11.26.0 at session start. Registry (`pnpm view pnpm
  version`) → **12.5.1**; upgraded the global install to pnpm@12.5.1
  (`npm install -g pnpm@12.5.1`, verified `pnpm --version` → 12.5.1). The
  spec table's parenthetical (12.4.2) is a patch behind the live registry —
  table will be updated to 12.5.1 with a `spec/CHANGELOG.md` entry in the
  commit that fills the deployment refs (same-commit rule).
- Version re-confirmation against the npm registry (`pnpm view <pkg>
  version`, 2026-09-20) — the live registry **confirms every line in the
  `spec/tech-stack.md` table that this phase installs**: next 16.3.5,
  react 19.3.0, typescript 7.0.2, tailwindcss 4.3.3, shadcn 4.21.0, turbo
  2.11.2, vitest 5.0.1, @testing-library/react 16.3.3, playwright 1.63.0,
  @stryker-mutator/core 10.0.0, @sentry/nextjs 10.75.0, supabase CLI
  2.117.0, @supabase/supabase-js 2.116.0, @supabase/ssr 0.12.7,
  lucide-react 1.47.0, class-variance-authority 0.7.1, zod 4.6.5,
  @trpc/server 11.19.0. No discrepancies except the pnpm patch noted above.
- Supabase MCP server: **connected** in this harness. `get_project_url` →
  `https://tymalzlhygkysdychbpv.supabase.co`, i.e. project ref
  `tymalzlhygkysdychbpv`. Per `spec/supabase.md` §3 the MCP is configured
  with the ref from `spec/deployment-operations.md` §2 — this discovered
  ref is therefore the production project of record and will fill the
  UNRECORDED-PENDING production-ref field (commit + CHANGELOG entry when
  written).
- Environment limits recorded honestly: no Docker daemon (the local
  Supabase stack `supabase start` cannot run this session — not required
  by Phase 01, which wires but does not run pgTAP tests); no git remote
  configured (`git remote -v` empty); no SUPABASE_ACCESS_TOKEN,
  SENTRY_AUTH_TOKEN, VERCEL_TOKEN/GITHUB_TOKEN env credentials. Supabase
  CLI and Vercel CLI are not yet installed on the host.
  - TS 7 toolchain note: `spec/tech-stack.md` requires re-verifying TS 7
  compatibility at scaffolding time. The generators will pin their own TS
  versions; their choices and typecheck results will be logged here, with
  a fallback decision (per the spec table) only if a pinned tool breaks
  under TS 7.

### 2026-09-20 — Deliverable 1: monorepo generator (create-turbo) — DONE

- Generator command run (logged per generator-first rule):
  `pnpm create turbo@2.11.2 turbo-scaffold -m pnpm --skip-install --no-git
  --turbo-version 2.11.2` (syntax from `--help`; run into
  `/Silid/.tmp-scaffold/` because the workspace root is non-empty, then
  copied verbatim to the root; the temp dir is gitignored). Lockfile
  generated at the root by `pnpm install` (pnpm 12.5.1).
- Two pre-install reconciliation edits to generated root files (logged as
  customization, visible in the scaffold commit diff): root package name
  `turbo-scaffold` → `silid`; `packageManager` `pnpm@11.25.0` (the
  generator's hardcoded value, stale) → `pnpm@12.5.1`. The two pre-existing
  `.gitignore` lines (`node_modules/`, `legacy/dist/`) were merged with the
  generated body in the same commit; `.tmp-scaffold/` added to it.
- Customization commit after the generator commit (reviewable separately):
  removed the generated example apps `apps/web` and `apps/docs` (the spec's
  three apps come from create-next-app per `spec/monorepo-structure.md` §4);
  consolidated the generated `@repo/eslint-config` +
  `@repo/typescript-config` packages into `packages/config` as
  `@silid/config` (spec §1 lists exactly one `config` package; the config
  FILES are generator output, only the merged package.json is hand-made —
  its devDependencies were installed with
  `pnpm add -D --save-exact ...` at the versions the generator pinned);
  renamed `@repo/ui` → `@silid/ui` (`pnpm pkg set name`, workspace dep swap
  via `pnpm remove`/`pnpm add "@silid/config@workspace:*"`, tsconfig extends
  and eslint import updated by sed).
- Verification: `pnpm check-types` → 1/1 successful (TS 7.0.2 typechecks
  the workspace — no TS 7 toolchain fallback needed so far); `pnpm lint` →
  1/1 successful; `pnpm build` → 0 tasks (no buildable packages yet, as
  expected pre-D2).

EVIDENCE 4faff69 /Silid/turbo.json:1 — create-turbo 2.11.2 generator output (root configs, workspace, example apps) committed verbatim before customization
EVIDENCE 63ebaef /Silid/packages/config/package.json:1 — consolidation to @silid/config and example-app removal; workspace typecheck+lint green

STATUS: DONE — Deliverable 1 (run the monorepo generator), with logged customizations.

### 2026-09-20 — Deliverable 2: three Next.js apps (create-next-app) — DONE

- Generator command run per app (syntax from `--help`):
  `pnpm create next-app@latest apps/<landing|platform-admin|frontdesk> --ts
  --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
  --disable-git --yes`. create-next-app resolved to 16.3.5 and pinned
  next 16.3.5, react 19.2.8, eslint ^9 + eslint-config-next 16.3.5,
  typescript ^5 (5.9.3 resolved), tailwindcss ^4 + @tailwindcss/postcss.
- TypeScript toolchain record (spec table asked for this at scaffolding
  time): the root workspace pins typescript 7.0.2 (create-turbo's choice,
  registry-confirmed current) and package typechecks run on it; the app
  generator itself pins the TS 5.9.3 line inside each app and that is kept
  as generator output — the apps' next build/typegen runs on the
  generator's choice. Not a silent fallback: both lines are recorded here;
  no tool failed under TS 7 (workspace check-types green).
- Reconciliation of nested workspace files (logged): create-next-app
  16.3.5 emitted a per-app `pnpm-workspace.yaml` (containing only an
  `allowBuilds` policy: sharp false, unrs-resolver false) and a per-app
  `pnpm-lock.yaml`. In a pnpm monorepo the root owns both, so the
  per-app files were removed and the `allowBuilds` policy was hoisted to
  the root `pnpm-workspace.yaml`; the root lockfile was regenerated with
  `pnpm install` (+247 packages). App package names were set to
  `@silid/<app>` via `pnpm pkg set` before committing.
- CNA also generated `AGENTS.md` (+ a one-line `CLAUDE.md` pointing at it)
  in each app, instructing that Next 16 differs from older training data
  and to read the bundled docs — kept verbatim as generator output.
- Verification: `pnpm build` → 3 successful, 3 total (each app prerenders
  `/` static), on the freshly reconciled lockfile.

EVIDENCE fdb9a69 /Silid/apps/landing/package.json:1 — landing generated by create-next-app 16.3.5 (package.json + full app tree committed alone)
EVIDENCE bd44b5f /Silid/apps/platform-admin/package.json:1 — platform-admin generated by create-next-app 16.3.5
EVIDENCE 5c3fb61 /Silid/apps/frontdesk/package.json:1 — frontdesk generated by create-next-app 16.3.5

STATUS: DONE — Deliverable 2 (run the Next.js app generator three times), with logged reconciliation.

### 2026-09-20 — Deliverable 3: shared packages — DONE

- No-generator rationale (logged per package, sanctioned by
  `spec/monorepo-structure.md` §4): db, auth, api, schemas, offline-sync,
  audit, utils, testing — no dedicated generator exists for bespoke
  workspace packages; each was hand-written as a MINIMAL skeleton
  (package.json manifest, tsconfig extending the generator-produced
  `@silid/config` bases, one-line `src/index.ts`, eslint.config.mjs
  importing `@silid/config/base`) following the conventions of the
  generated monorepo. eslint devDependency installed with
  `pnpm add -D --save-exact eslint@10.9.1` + `@silid/config@workspace:*`
  per package (never hand-edited manifests). ui and config already existed
  from Deliverable 1's generator output and consolidation.
- Verification: `pnpm check-types` 9/9 successful; `pnpm lint` 13/13
  successful. Improve step after first verification: `@silid/config` had
  gained a self-dependency and a stray `check-types` script during setup —
  both removed, an eslint.config.mjs added for the config package itself,
  re-verified green, committed as a separate fix.

EVIDENCE 792b94d /Silid/packages/db/package.json:1 — eight @silid package skeletons created (no generator exists, per spec §4)
EVIDENCE fc3c326 /Silid/packages/config/eslint.config.mjs:1 — config package self-lint fix verified green

STATUS: DONE — Deliverable 3 (create the shared packages).

### 2026-09-20 — Deliverable 4: shadcn pipeline in apps/frontdesk — DONE

- Generator commands run (syntax from `--help`):
  `pnpm dlx shadcn@4.21.0 init -c . -y --base radix -p nova --no-monorepo`
  (the interactive preset prompt was answered non-interactively with the
  `-p nova` preset — the Lucide/Geist preset, matching the spec's Lucide
  icon line — on the `radix` base, matching the spec's Radix Primitives
  line), then `pnpm dlx shadcn@4.21.0 add button -c . -y`.
- Output committed verbatim: `components.json`, `src/lib/utils.ts`,
  `src/components/ui/button.tsx`, updated `globals.css`/fonts; the CLI
  installed its dependencies itself (class-variance-authority ^0.7.1,
  lucide-react ^1.47.0, radix-ui ^1.6.7, tw-animate-css, cn).
- Verification: `pnpm --filter @silid/frontdesk build` succeeds after init
  and add (static prerender green).

EVIDENCE 83714ec /Silid/apps/frontdesk/components.json:1 — shadcn init + add button output committed; frontdesk build green after

STATUS: DONE — Deliverable 4 (run the shadcn CLI).

### 2026-09-20 — Deliverable 5: Supabase project dir + refs — DONE (link pending operator credentials)

- CLI installed as a pinned workspace devDependency:
  `pnpm add -wD --save-exact supabase@2.117.0` (registry-confirmed latest;
  `pnpm exec supabase --version` → 2.117.0).
- Generator command run (flags from `--help`): `pnpm exec supabase init
  --yes` → created `/Silid/supabase/` (config.toml with project_id
  "Silid", .gitignore, .temp/), committed alone as generator output.
- MCP + skill compliance: the official Supabase agent skill available in
  this harness was read before touching the platform; its security
  checklist matches `spec/supabase.md` §5 verbatim; the official
  changelog (`supabase.com/changelog.md`) was fetched and scanned —
  nothing blocks init/link. One forward note recorded for later phases:
  new tables stop being auto-exposed to the Data/GraphQL API (enforced on
  all projects 2026-10-30), so the database phase must explicitly expose
  and grant tables.
- Production ref DISCOVERED (never from memory): the harness's Supabase
  MCP server answered `get_project_url` → `tymalzlhygkysdychbpv`
  (`https://tymalzlhygkysdychbpv.supabase.co`), and a live `execute_sql`
  probe confirmed the managed Postgres (PostgreSQL 17.6). Per
  `spec/supabase.md` §3 the MCP is configured with the ref from
  `spec/deployment-operations.md` §2 — this is therefore the production
  ref of record. Recorded in that table, together with the region row's
  honest state (not queryable via CLI/MCP tooling without operator CLI
  auth; dashboard verification path written into the row) and the test
  row ("the local Supabase stack is used" — this spec's allowed option;
  keeps the cost envelope minimal). Repo-root `.mcp.json` created with
  the remote MCP URL carrying the same ref (no generator exists for a
  project-scoped MCP config; the path and shape follow
  `spec/supabase.md` §3 and the official skill's troubleshooting note).
- BLOCKED ITEM (user action needed, not a decision): `supabase link`
  requires CLI auth — `supabase login` refuses non-TTY runs without
  `--token`/`SUPABASE_ACCESS_TOKEN` (attempted, exact error recorded).
  Once the operator runs `pnpm exec supabase login` once, the phase's
  pending check is `pnpm exec supabase link --project-ref
  tymalzlhygkysdychbpv`. Recorded in `spec/deployment-operations.md` §2.
- Spec amendments logged in `spec/CHANGELOG.md` in the same commit
  (deployment-operations §2 fill; tech-stack pnpm 12.4.2 → 12.5.1).

EVIDENCE 44e07d4 /Silid/supabase/config.toml:1 — supabase init output committed (CLI 2.117.0)

STATUS: DONE — Deliverable 5 (run supabase init; refs recorded; `supabase link` pending operator CLI login — the one open item of this phase).

### 2026-09-20 — Deliverable 8: Vitest + Testing Library wiring — DONE

- No-generator note: Vitest ships no init command; configs are the minimal
  hand-written wiring per official docs (logged as no-generator-available).
- Installed via pnpm (never hand-edited manifests): vitest@5.0.1 -E in all
  10 packages + 3 apps; jsdom@30.1.0 + @testing-library/react@16.3.3 in
  the React workspaces (3 apps + ui); @vitest/coverage-v8@5.0.1 -E in
  packages/db and packages/api.
- Pipeline wiring: turbo.json gains the `test` task (outputs coverage/**);
  root script `test` = `turbo run test`; every workspace got a `test`
  script via `pnpm pkg set` (db/api run `vitest run --coverage` — the gate
  is un-skippable; others `vitest run`). Vitest configs: packages/db and
  packages/api enforce `thresholds.lines: 80` over `src/**` (v8
  provider); apps + ui run jsdom; test locations are `<workspace>/test/`.
- Verification: the pipeline-proof smoke test
  (`packages/utils/test/smoke.test.ts`) passes through `pnpm test`
  (turbo dispatched all 13 workspaces; utils green). The 12 other
  workspaces fail only with "No test files found" until Deliverable 15
  adds their smoke tests — expected mid-phase state, resolved by D15
  before phase close. The coverage gate was proven to bite early:
  `vitest run --coverage --passWithNoTests` in packages/db FAILED with
  "Coverage for lines (0%) does not meet global threshold (80%)" — the
  threshold machinery is live, and D15's tests must actually cover the
  packages to pass it.

EVIDENCE bbca036 /Silid/turbo.json:1 — test task wired; utils pipeline smoke test green through turbo

STATUS: DONE — Deliverable 8 (install and wire Vitest + Testing Library; coverage gate wired in CI to follow with the CI workflow file).

### 2026-09-21 — Phase 01 session resume (new builder)

Fresh builder session, zero prior memory. Read in full, from disk: every
file in `/Silid/spec/*.md` (16 files, including 00-master-goal,
CRITIQUE, CHANGELOG, legacy-behavior-vault, legacy-gap-analysis),
`/Silid/roadmap/00-index.md`, `/Silid/roadmap/01-scaffolding.md`, and
`/Silid/PROGRESS.md`. `/Silid/tripwire-registry.json` was not read and is
not on any reading list.

**Ledger-git cross-verification findings (flagged per the verify rule,
not silently obeyed):**

1. DISCREPANCY — the ledger header's `last_commit: 9345347` is stale: HEAD
   is `21d0b9e` and commits `d3e3331`/`21d0b9e` (Deliverable 6's Playwright
   generator run + customization) landed after the last ledger update.
   `git cat-file -t 9345347` confirms the old sha exists (an ancestor), so
   the ledger is stale, not corrupted — but the header was not maintained
   at task boundaries (the prose log ends at Deliverable 8 and never
   logged Deliverable 6, whose generator output IS committed). Convention
   adopted from here on: `last_commit` records the most recent commit at
   the moment of the ledger update (the parent of the ledger commit), and
   the header is refreshed at every task boundary.
2. Deliverable 6's state reconstructed from git (the Remember step was
   never run by the prior session): `d3e3331` committed the
   `create-playwright 1.63.0` output at the workspace root (playwright
   config, package script, .gitignore additions, lockfile); `21d0b9e`
   customized the generated config (three app projects matching the three
   apps, `video: 'on'`, outputDir `reports/proof/e2e`, three webServer
   entries). NOT yet done for D6: the E2E smoke specs themselves
   (Deliverable 15's scope), the per-app dev-server ports the three
   webServer entries assume (all three apps currently default to 3000 —
   two servers would collide), and an actual green run producing clips.
   D6 is therefore REOPENED and is closed below together with D15's E2E
   run.
3. Defect found and fixed: the D1 customization commit (`63ebaef`) removed
   the generated example apps incompletely — `apps/docs/next-env.d.ts` and
   `apps/web/next-env.d.ts` remained tracked and on disk. Removed in
   `7f77a8a`. `/Silid/apps` now contains exactly the three spec apps.
4. Environment re-verified this session: node v24.21.0, pnpm 12.5.1,
   git 2.55.0.windows.5, Playwright browsers present (chromium-1243),
   working tree clean at `21d0b9e`. No SUPABASE_ACCESS_TOKEN,
   SENTRY_AUTH_TOKEN, VERCEL_TOKEN, GITHUB_TOKEN; `git remote -v` empty;
   no Docker daemon. Consequences: `supabase link`, the Sentry wizard,
   Vercel linking, and a hosted CI run all remain blocked on operator
   credentials/remote (each attempted or re-verified where possible, and
   logged at its deliverable entry below).
5. `pnpm test` re-run at resume: 0/13 tasks — every workspace fails with
   "No test files found" except `@silid/utils` (D8's recorded mid-phase
   state, resolved by Deliverable 15 below). `packages/db` and
   `packages/api` additionally fail their 80% coverage thresholds with
   zero tests, as recorded in the D8 entry.

STATUS: IN PROGRESS — session resumed; discrepancies flagged; Deliverable
6 reopened pending E2E run; proceeding through Deliverables 11–17.

### 2026-09-21 — Deliverable 11 (tripwire registry) + Deliverable 12 (reports dirs) — DONE

- D11: `/Silid/tripwire-registry.json` created write-only as the
  bootstrap scaffold (`{"entries": []}`); consistent with the registry's
  owner (the runner) maintaining it thereafter. It was created without
  being read (it did not exist beforehand; the builder never reads it).
- D12: no generator exists for directories + a README (logged
  no-generator rationale). `/Silid/reports/` and `/Silid/reports/proof/`
  created with `README.md` explaining the acceptance-report and
  proof-clip layout (phase-<NN>-acceptance.md reports; clips under
  reports/proof/e2e/; gate outputs land in reports/proof/).

EVIDENCE 3a3e6dc /Silid/tripwire-registry.json:1 — bootstrap registry created (entries: [])
EVIDENCE 3a3e6dc /Silid/reports/README.md:1 — reports/ + reports/proof/ with layout README

STATUS: DONE — Deliverables 11 and 12.






### 2026-09-21 — Deliverable 13: acceptance-report generator — DONE

- No-generator rationale (logged): the acceptance-report generator is
  bespoke build tooling; no scaffolder produces it. Full builder loop
  applied (tests written first, then implementation).
- Files (all hand-written domain/test code, the generator-first
  sanctioned categories): `packages/testing/src/acceptance-report.ts`
  (single self-contained module; runs as a CLI via Node 24's native TS
  type-stripping when executed directly:
  `node packages/testing/src/acceptance-report.ts --phase-file <phase.md>
  --results <results.json> --out <report.md>`), `src/index.ts`
  re-exports, `test/acceptance-report.test.ts` (7 tests: input parsing,
  green/blocked/fail rendering, case-insensitive result matching, and a
  real CLI end-to-end run into a temp dir), fixtures under
  `test/fixtures/phase-00-fixture*.md/json`.
- Design notes: inputs are parsed from the phase file's
  "## Acceptance-report inputs" section (the format actually on disk in
  the roadmap files — bullets, optionally quoted — rather than the
  prompt's parenthetical "YAML/JSON block"); results arrive as a JSON
  file keyed by normalized sentence; unmatched inputs render BLOCKED;
  the report carries one line per capability with proof clip / attack
  test / EVIDENCE slots plus MONEY RECOMPUTATION GATE and MUTATION GATE
  lines and an ALL GREEN / NOT GREEN verdict.
- Toolchain notes (logged per verify rule): Node 24 runs the TS module
  directly (type stripping; `"type": "module"` set on the package to
  silence the module-type warning — the package has no `.js` files);
  `@types/node` added via pnpm; `"types": ["node"]` pinned in the
  package tsconfig (TS 7.0.2 did not auto-include them); node globals
  declared in the package's own eslint config.
- Verification: 7/7 vitest tests pass; `tsc --noEmit` clean;
  `eslint --max-warnings 0` clean; the CLI run against the fixture phase
  emitted `/Silid/reports/proof/phase-00-fixture-acceptance.md`
  (committed), ALL GREEN, well-formed (2 capability lines, each with all
  three proof slots, both gate lines).

EVIDENCE 5d806ee /Silid/packages/testing/src/acceptance-report.ts:1 — generator module + tests + fixture CLI run committed
EVIDENCE 5d806ee /Silid/reports/proof/phase-00-fixture-acceptance.md:1 — fixture-phase report emitted by the generator CLI

STATUS: DONE — Deliverable 13 (acceptance-report generator runs against a fixture phase and emits a well-formed report).

### 2026-09-21 — Deliverable 14: rule-lint CI job — DONE (proven against a non-compliant fixture)

- No-generator rationale (logged): bespoke build tooling; no scaffolder
  produces a documentation-policy linter. Full builder loop applied
  (tests first: 11 new rule-lint tests; 18 total in the package).
- `packages/testing/src/rule-lint.ts`, run from the repo root via the
  new root script `pnpm rule-lint`
  (`node packages/testing/src/rule-lint.ts`, default scan: spec/*.md,
  roadmap/*.md, PROGRESS.md — 31 files). Three checks:
  1. `terminology-qualified` — flags the unqualified term outside
     permitted contexts; understands the qualified/hyphenated/soft-wrap
     forms, permits the master goal's own TERMINOLOGY section (the
     rule's definition home), and excludes `spec/CRITIQUE.md` as a
     historical review record quoting fixed findings (logged decision;
     spec/00-master-goal.md Step 6: "a historical review record, and
     nothing more").
  2. `evidence-tag-missing` — every PROGRESS.md task block whose STATUS
     claims DONE must carry a resolvable EVIDENCE tag
     (`EVIDENCE <sha> <path>:<line>`); IN-PROGRESS statuses are exempt
     (not completion claims).
  3. `acceptance-input-sentence` — every roadmap file's
     "## Acceptance-report inputs" bullets must be single sentences
     (boundary heuristic tolerates ".md" and "e.g." mid-sentence;
     two-sentence bullets fail).
- Parser fix found by verification: `parseAcceptanceInputs` previously
  took only the first line of a soft-wrapped bullet — it now joins
  continuation lines (this also fixed the acceptance-report generator
  for the wrapped inputs actually used by the roadmap files).
- Non-compliant-fixture proof (DoD requirement, run once): the CLI run
  against `packages/testing/test/fixtures/violation/` (bare term, DONE
  without EVIDENCE, two-sentence input) exited 1 with:
  `rule-lint: ...violation-doc.md:3 [terminology-qualified] ...`,
  `rule-lint: ...PROGRESS.md:5 [evidence-tag-missing] ...`,
  `rule-lint: ...01-violation-phase.md:5 [acceptance-input-sentence] ...`
  — `3 violation(s) across 3 files`. The fixture files remain on disk as
  the unit tests' attack material; the compliant tree scan exits 0
  (`rule-lint: clean (31 files scanned)`).
- CI wiring: the workflow file (Deliverable for CI below) runs
  `pnpm rule-lint` as its own step on every push/PR.

EVIDENCE c755e34 /Silid/packages/testing/src/rule-lint.ts:1 — linter module + 11 tests + violation fixtures committed
EVIDENCE c755e34 /Silid/package.json:1 — root rule-lint script

STATUS: DONE — Deliverable 14 (rule linter demonstrably fails the non-compliant fixture and passes the compliant tree).

### 2026-09-21 — Deliverable 7: Stryker mutation gate — DONE (gate live; bite proven)

- Research finding (logged per verify rule): the phase prompt's
  "`pnpm dlx @stryker-mutator/init` family" is stale —
  `@stryker-mutator/init` does not exist on the npm registry (404,
  checked 2026-09-21); `init` is a subcommand of `@stryker-mutator/core`
  (`pnpm dlx @stryker-mutator/core@10.0.0 init --help`: "Usage: stryker
  init [options]" — no non-interactive flags). The interactive prompts
  (inquirer list/checkbox, read from the installed
  `dist/src/initializer/` sources) require a TTY; piped stdin hangs and
  this Windows host has no `script` pseudo-TTY utility. Per the
  generator-first operating rules (prompt cannot be bypassed here), the
  config was hand-written to the MINIMUM the init writer itself emits
  (`packageManager`, `reporters`, `testRunner` + comment — read from
  `dist/src/initializer/stryker-config-writer.js` on disk) plus the
  spec-mandated mutation targets/thresholds, which the deliverable
  requires configuring anyway. No-generator rationale recorded here.
- Gate configuration (packages/db and packages/api, the spec's mutation
  targets for this phase): `testRunner: vitest`,
  `mutate: ["src/**/*.ts"]`,
  `thresholds: { high: 90, low: 80, break: 80 }` (break = CI fails below
  80% kill rate), reporters clear-text/progress/html/json with
  html/json outputs landing in `/Silid/reports/proof/mutation/<pkg>/`,
  `ignorePatterns: ["../../legacy/**", "coverage/**"]` (explicit legacy
  exclusion). Scripts: `mutation` in db/api; root `pnpm mutation` =
  `turbo run mutation`; turbo task `mutation` (cache off). Wiring into
  the CI workflow file follows with the CI deliverable below.
- TS 7 toolchain fallback decision (spec/tech-stack.md anticipated this:
  "if a pinned tool lacks TS 7 support, the scaffolding phase logs the
  fallback decision"): Stryker 10.0.0 — current latest per registry —
  crashed under the workspace's TypeScript 7.0.2
  (`ts.parseConfigFileTextToJson is not a function`; the native TS 7
  removed the API). Stryker's troubleshooting docs have no entry for it.
  Fallback (logged, scoped): pnpm `packageExtensions` in
  `pnpm-workspace.yaml` give `@stryker-mutator/core@10.0.0` and
  `@stryker-mutator/vitest-runner@10.0.0` a `typescript@5.9.3`
  dependency, so Stryker's own module graph resolves the TS 5.9.3 line.
  The workspace root stays on 7.0.2 (check-types green) and apps stay on
  their generator-pinned TS 5 line — nothing else moved.
- Second compat fix (pnpm patch): the vitest-runner eagerly
  `JSON.stringify`s vitest 5's (circular) config object for a debug log,
  crashing every run (`dist/src/vitest-test-runner.js:95`). Patched via
  `pnpm patch` / `pnpm patch-commit` to try/catch the dump
  (recorded in `pnpm-workspace.yaml` patchedDependencies). Registry
  versions unaffected.
- Verification: `pnpm mutation` → 2/2 tasks successful; both packages'
  reports written to `/Silid/reports/proof/mutation/{db,api}/`.
  Stryker's bite was proven live: with a temporary scratch module (4
  mutants, uncovered by tests) the gate FAILED with "Final mutation
  score 0.00 under breaking threshold 80, setting exit code to 1" — the
  scratch file was then removed. With the current skeleton code
  (`as const` identity export) Stryker instruments 0 mutants and the
  score is NaN ≥ threshold (pass); real mutants arrive with Phase 02's
  schema/API code, where the gate becomes substantive.
- Also fixed during this task: the ten D15 smoke unit tests (all apps +
  packages) were written and `pnpm test` is now 13/13 green — recorded
  under Deliverable 15 below.

EVIDENCE 56f7c69 /Silid/packages/db/stryker.conf.json:1 — mutation gate config (thresholds.break 80, reports to reports/proof/mutation)
EVIDENCE 56f7c69 /Silid/pnpm-workspace.yaml:1 — packageExtensions (Stryker on TS 5.9.3) + vitest-runner patch record

STATUS: DONE — Deliverable 7 (Stryker wired into the pipeline with the 80% kill-rate threshold; gate bite proven with a failing scratch run).

### 2026-09-21 — Deliverable 15: smoke tests everywhere + Deliverable 6 close — DONE

- Unit smoke tests (hand-written; tests are a sanctioned hand-written
  category): one per app and package. db/api/auth/schemas/offline-sync/
  audit/utils assert the package identity export (mirrors the D8 utils
  convention); ui renders its generated Button via Testing Library;
  config loads the shared eslint base; the three apps assert their
  package identity. `pnpm test` → **13/13 turbo tasks successful**
  (db/api pass their 80% line-coverage thresholds; the mid-phase "No
  test files found" state recorded under D8 is resolved).
- Minimal per-app customization (sanctioned by Deliverable 2: "names,
  base layout content"): each app's metadata title/description and h1
  now identify the app (landing: "Silid — the room-first front-desk
  platform"; platform-admin/frontdesk likewise), so the E2E proofs
  assert real identity rather than template text.
- E2E smoke tests: one Playwright spec per app under `/Silid/tests/`
  (tests/<app>/<app>.spec.ts) — loads the root page and asserts the
  app's title and h1. Verification revealed two defects in the D6
  generator config (Improve step): (1) all three `webServer` entries
  defaulted to port 3000 — two servers would collide; fixed with
  distinct ports (platform-admin 3001, frontdesk 3002 via webServer
  env PORT — a `-- -p` passthrough turned out to be forwarded literally
  by pnpm and was removed); (2) verified fixed by the green run below.
- Proof clips: `pnpm test:e2e` → **3 passed (11.3s)**; every test
  records a video (`video: 'on'`, outputDir `reports/proof/e2e/`)
  — three playable .webm clips (EBML header verified per file) now
  committed under `/Silid/reports/proof/e2e/`.
- D6 closure: the Playwright generator run + video-recording
  configuration (committed 2026-09-20 in d3e3331/21d0b9e, Remember step
  never executed by the prior session) is now verified end to end:
  browser tests run green against built apps and clips land under
  `/Silid/reports/proof/` per the deliverable.

EVIDENCE ed4fd89 /Silid/packages/ui/test/smoke.test.tsx:1 — smoke unit tests in all 13 workspaces; pnpm test 13/13
EVIDENCE 8fda7b6 /Silid/tests/landing/landing.spec.ts:1 — per-app E2E specs, port fix, and three proof clips
EVIDENCE 8fda7b6 /Silid/reports/proof/e2e/landing-landing-landing-lo-3403c-page-and-shows-its-identity-landing/video.webm:1 — playable landing proof clip (webm)

STATUS: DONE — Deliverable 15 (smoke unit + E2E everywhere, clips recorded) and Deliverable 6 closed (Playwright pipeline green with video proof).

### 2026-09-21 — Deliverable 16: legacy exclusions — DONE (proofs collected)

`/Silid/legacy` (144 tracked files) is reference material and is
excluded from every gate. Proof output per gate, collected live on
2026-09-21:

- **Workspace scope** — `pnpm-workspace.yaml` globs are `apps/*` and
  `packages/*` only; `pnpm ls -r` lists 13 workspaces, 0 under legacy.
  No build (turbo/next), test, or lint task can ever select it.
- **Lint** — a workspace eslint run's JSON file list contains 0 legacy
  paths (utils: 1 file linted, 0 legacy). Negative proof: explicitly
  passing a legacy file fails with "No files matching the pattern
  'legacy/eslint.config.js' were found" (exit nonzero) — outside every
  config's base path.
- **Test/coverage** — packages/db's vitest coverage report lists only
  `src/index.ts` (100% lines, threshold green); include patterns are
  `test/**` and `src/**` per workspace.
- **Mutation** — stryker's debug "All input files" list for db contains
  only `packages/db/**` paths; `mutate: ["src/**/*.ts"]` plus
  `ignorePatterns: ["../../legacy/**"]` (committed 56f7c69) exclude it
  explicitly.

EVIDENCE 63ebaef /Silid/pnpm-workspace.yaml:1 — workspace globs exclude legacy (file unchanged since the D1 reshape; verified in the tree at 62a393e)
EVIDENCE 56f7c69 /Silid/packages/db/stryker.conf.json:1 — explicit legacy ignorePatterns in the mutation gate

STATUS: DONE — Deliverable 16 (all gate globs report zero legacy files; proofs above are from live runs).

### 2026-09-21 — CI workflow + Deliverable 9/17/D5 blocked-item status

- **CI workflow** (no generator exists for a project GitHub Actions
  workflow — hand-written per the official Actions docs, logged):
  `.github/workflows/ci.yml`, one job running, in order, on every
  push/PR: rule-lint → lint → typecheck → test (Vitest; coverage gates
  live inside db/api) → mutation gate (Stryker, break 80%) → build →
  E2E (Playwright chromium) → proof artifacts uploaded
  (reports/proof/e2e clips, mutation reports, coverage). RLS policy
  tests join the test stage in Phase 02 when the schema exists. YAML
  validated by parse. A hosted run could not be produced: `git remote
  -v` is empty and no GITHUB_TOKEN exists in this environment — the
  workflow file is committed and the run is an operator push away
  (EVIDENCE below; honest limitation, not a claim of a green run).
- **Deliverable 9 (Sentry wizard) — BLOCKED on operator credentials.**
  Researched live: `pnpm dlx @sentry/wizard@latest --help` (flags
  -i/--org/--project/--saas verified current). Attempt:
  `pnpm dlx @sentry/wizard@latest -i nextjs --saas --disable-telemetry`
  → `ERR_TTY_INIT_FAILED (EBADF, uv_tty_init)` — the wizard requires a
  TTY for its auth/project flow and no SENTRY_AUTH_TOKEN exists in this
  environment. Per the generator-first rule the wizard (not manual SDK
  config) must produce the Sentry wiring, so nothing was hand-written.
  Operator step (one command per app, or once with --org/--project):
  run `pnpm dlx @sentry/wizard@latest -i nextjs` interactively in
  apps/landing, apps/platform-admin, apps/frontdesk, then commit the
  generated config.
- **Deliverable 17 (Vercel linking) — BLOCKED on operator credentials.**
  Attempt: `pnpm dlx vercel@latest link --yes` → "No existing
  credentials found. Please run `vercel login` or pass --token". No
  VERCEL_TOKEN and no git remote exist here. Operator steps: `pnpm dlx
  vercel login`, then per app (`apps/landing`, `apps/platform-admin`,
  `apps/frontdesk`) `pnpm dlx vercel link --yes --project silid-<app>`
  and push the repo to GitHub so per-PR previews deploy. Production
  linking stays with Phase 11 (per the deliverable).
- **Deliverable 5 residue (supabase link) — still BLOCKED on operator
  credentials** (re-verified this session): `pnpm exec supabase link
  --project-ref tymalzlhygkysdychbpv` → "Access token not provided.
  Supply an access token by running `supabase login` or setting the
  SUPABASE_ACCESS_TOKEN environment variable." The recorded operator
  path in spec/deployment-operations.md §2 stands.
- None of the three is a client DECISION (no cost commitment beyond
  spec/deployment-operations.md — Sentry/Vercel/Supabase are the spec's
  recorded stack); they are credential-gated operator actions, so
  DECISIONS-NEEDED.md stays empty and the ledger's resume_point carries
  them.

EVIDENCE b775068 /Silid/.github/workflows/ci.yml:1 — CI pipeline file (lint/typecheck/test+gates/build/e2e on push and PR)

STATUS: DONE for the CI file; BLOCKED (operator) for Deliverables 9, 17, and the Deliverable 5 link residue — exact commands recorded above.

### 2026-09-21 — Phase 01 session close (builder) — final status

Final verification sequence, all run live on 2026-09-21 (frozen
lockfile, current tree): `pnpm install --frozen-lockfile` OK;
`pnpm build` 3/3; `pnpm lint` 13/13; `pnpm check-types` 9/9;
`pnpm test` 13/13 (coverage gates green on db/api); `pnpm rule-lint`
clean (31 files); `pnpm mutation` 2/2; `pnpm test:e2e` 3 passed with
three refreshed proof clips.

Builder draft of `/Silid/reports/phase-01-acceptance.md` generated by
the Deliverable 13 generator from the real phase inputs
(`reports/proof/phase-01-results.json`): **6/7 green; 1 BLOCKED** (the
Supabase link input — operator credentials). The runner's review gate
(ledger-git cross-verification, attack battery, mutation gate, tripwire
check, fresh review sub-agent) compiles the final report and closes the
phase; the attack-battery and EVIDENCE slots it fills are honestly
"none recorded" in the draft.

Deliverables scoreboard at close: 1-8 and 11-16 DONE; 9 (Sentry wizard)
and 17 (Vercel link) BLOCKED on operator credentials with exact
commands recorded; 5's link residue BLOCKED likewise; 10 (PROGRESS.md)
is this ledger, maintained; 10/15/16 proven above. Phase remains
in_progress pending the operator actions and the runner review gate.

EVIDENCE 8db3dcf /Silid/reports/phase-01-acceptance.md:1 — draft acceptance report (6/7 green, supabase-link input blocked)
EVIDENCE 8db3dcf /Silid/patches/@stryker-mutator__vitest-runner@10.0.0.patch:1 — vitest-runner compat patch committed (referenced by pnpm-workspace.yaml)

STATUS: SESSION CLOSED — Phase 01 in_progress; resume at the operator
credential items (supabase login/link, Sentry wizard, Vercel
link + GitHub push for CI/previews), then the runner review gate.

### 2026-09-21 — MCP re-verification (operator confirmed the MCP logged in) — results

Re-checked live on operator prompt. Findings:

1. **The Supabase MCP server IS connected and authenticated** in this
   harness. Verified live: `get_project_url` →
   `https://tymalzlhygkysdychbpv.supabase.co` (the ref of record);
   `execute_sql` → PostgreSQL 17.6, database `postgres`;
   `list_migrations` → 0 (no schema yet — correct for Phase 01); the
   repo-root `.mcp.json` matches `spec/supabase.md` §3's URL shape with
   the recorded ref exactly.
2. **CLI `supabase link` remains operator-gated** — re-attempted →
   "Access token not provided" (unchanged). Distinction recorded
   precisely: the MCP's OAuth session and the CLI's SUPABASE_ACCESS_TOKEN
   are separate credential stores; MCP login does not issue a CLI token.
   What MCP login DOES provide is the protocol's primary live
   verification channel (`spec/supabase.md` §2-3) — the production
   project is now verified reachable and queryable on the record.
3. **Security advisor finding (pre-existing, not ours)** — 2 WARNs on
   `public.rls_auto_enable()`: a SECURITY DEFINER function executable by
   anon/authenticated. Inspection (read-only): it is the standard RLS
   auto-enable event-trigger helper, paired with the enabled event
   trigger `ensure_rls` (ddl_command_end) — a hardening mechanism that
   auto-enables RLS on every new `public` table, i.e. aligned with the
   spec's own invariant, installed before this build began (0
   migrations). Exploitability assessment: direct RPC calls fail
   harmlessly (`pg_event_trigger_ddl_commands()` raises outside event
   trigger context). Residual checklist concern stands nonetheless
   (PUBLIC EXECUTE on a definer function in the exposed schema).
   **Disposition: Phase 02's first generated migration hardens it**
   (revoke EXECUTE from anon/authenticated or move the helper out of the
   exposed schema) — Phase 01 produces no schema and must not alter
   pre-existing production state; the finding is recorded here so the
   Phase 02 builder and the runner's review gate inherit it.

EVIDENCE bec4aaf /Silid/.mcp.json:1 — the committed MCP config (ref of record, spec/supabase.md §3 shape) whose live server was verified in this session: get_project_url → tymalzlhygkysdychbpv, execute_sql → PostgreSQL 17.6, list_migrations → 0, advisors → 2 WARNs on pre-existing public.rls_auto_enable() (full results in the prose above)

STATUS: MCP verified logged in and live; CLI link unchanged (operator token); advisor finding routed to Phase 02.

### 2026-09-21 — Repository hygiene before first push (operator request)

- Removed from the index: the root `README.md` (stale create-turbo
  starter boilerplate still describing the deleted `docs`/`web` example
  apps — kept on disk, ignored via root-scoped `/README.md`) and
  Playwright's churn file `reports/proof/e2e/.last-run.json` (ignored;
  the proof clips themselves stay tracked). `reports/README.md` (the
  Deliverable 12 deliverable) and `legacy/README.md` (reference
  material) remain tracked — the ignore pattern is root-scoped
  deliberately.
- `.gitignore` rewritten cleanly: every previously-ignored pattern
  preserved (verified against the old file), plus `*.log` (stryker.log,
  pnpm-debug.log, turbo logs outside .turbo/), `*.tsbuildinfo`,
  `.eslintcache`, Windows junk (`Thumbs.db`, `desktop.ini`), and the two
  removals above. Deduplicated the merged create-turbo/create-next-app
  sections.
- Verification: `git ls-files -ci --exclude-standard` → empty (no
  tracked file matches an ignore pattern); `git check-ignore` spot
  checks all pass; `git ls-files` scanned for log/cache/junk — the two
  removals above were the only hits.

EVIDENCE <this commit> /Silid/.gitignore:1 — cleaned ignore rules, junk untracked

STATUS: DONE — repo is push-ready; spec/, roadmap/, canon/, legacy/ untouched.
