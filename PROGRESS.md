# PROGRESS — Silid build log

```json
{
  "schema": "silid-progress/2",
  "last_updated": "2026-09-20",
  "current_phase": "01",
  "phase_status": { "01": "in_progress" },
  "last_commit": "9345347",
  "resume_point": "Phase 01 started: spec/roadmap read, environment researched; next Deliverable 1 (create-turbo monorepo scaffold)",
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

