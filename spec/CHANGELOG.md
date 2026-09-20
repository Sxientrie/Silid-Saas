# Spec CHANGELOG

One line per spec/roadmap change made during build phases: date, phase,
file and section, the old rule, the new rule, and the reason (per
`spec/00-master-goal.md`, NON-NEGOTIABLE INVARIANTS & SPEC CHANGE-CONTROL).

- 2026-09-20 — Phase 01 — `spec/deployment-operations.md` §2 (Supabase
  project references) — production/test refs were UNRECORDED-PENDING —
  production ref recorded as `tymalzlhygkysdychbpv` (source: the live
  Supabase MCP connection, verified with `get_project_url` +
  `execute_sql`), region row updated with its verification path, test
  row recorded as "the local Supabase stack is used" — reason: Phase 01
  Deliverable 5 / Definition of done requires the table filled at the
  scaffolding phase.
- 2026-09-20 — Phase 01 — `spec/tech-stack.md` version-and-source table —
  pnpm parenthetical 12.4.2 → 12.5.1 — reason: re-confirmation at install
  time via the registry (`pnpm view pnpm version`); the live source wins
  under the verify-before-you-trust rule. Every other line this phase
  installs was re-confirmed unchanged on 2026-09-20 (next 16.3.5, react
  19.3.0, typescript 7.0.2, tailwindcss 4.3.3, shadcn 4.21.0, turbo 2.11.2,
  vitest 5.0.1, playwright 1.63.0, @stryker-mutator/core 10.0.0,
  supabase CLI 2.117.0, et al.).
- 2026-09-21 — Phase 01 — `spec/deployment-operations.md` §2 (supabase
  link status) — linking was pending operator CLI credentials — linking
  completed 2026-09-21 (operator browser login + builder-run
  `supabase link --project-ref tymalzlhygkysdychbpv`; link state under
  gitignored `supabase/.temp/`) — reason: Deliverable 5 / Definition of
  done requires the project directory linked to the recorded project;
  the operator performed the one browser-interactive step.
