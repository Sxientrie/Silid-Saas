# Roadmap Index

The build from empty repo to production-ready release plus a cutover
runbook, one phase at a time. Each phase executes in a fresh, isolated
sub-agent briefed by that phase file's copy-paste prompt; the runner
orchestrates and verifies through the per-phase review gate
(`spec/00-master-goal.md`, BUILD PIPELINE). Phase files are numbered in
build order; `spec/` is always canonical over any phase-prompt
restatement.

| Phase | File | Goal (one line) |
|---|---|---|
| 01 | `01-scaffolding.md` | Scaffold the monorepo, CI, test-and-proof tooling, Supabase project dir, report/ledger/tripwire bootstrap — smoke-tested end to end |
| 02 | `02-database-tenancy-money.md` | Author the schema, RLS policies with pgTAP proof, the money reference fixture, vault goldens parity fixture, and the scheduled escalation job |
| 03 | `03-auth-platform-admin.md` | Supabase Auth with app_metadata claims, provisioning paths, and the Platform Admin organization-management app |
| 04 | `04-api-audit-rates.md` | The tRPC API package with session-derived scope, the cross-cutting audit package, and the rate-configuration merge service |
| 05 | `05-frontdesk-shell-offline.md` | The Frontdesk PWA shell: Dexie cache/outbox, Serwist, the offline write contract, and offline E2E harness |
| 06 | `06-sessions-rooms.md` | Check-in and check-out with sealed totals, the room status machine, the overstay ladder, and the double-booking guard |
| 07 | `07-canteen-addons.md` | Canteen point-of-sale and guest add-ons posting through server-computed paths |
| 08 | `08-shift-close.md` | The shift lifecycle: open/close with server-sealed expected cash, one-shot physical count, variance, history |
| 09 | `09-rates-reports.md` | The full per-branch rate-configuration UI and the organization's reports/audit-review surfaces |
| 10 | `10-hardening-gates.md` | Full mutation and money-recomputation gate runs, the consolidated offline E2E battery, cross-cutting attack tests |
| 11 | `11-production-readiness.md` | Production Supabase push, Vercel deployment pipeline, Sentry, seed/master-data surfaces, performance passes |
| 12 | `12-cutover-runbook.md` | The cutover runbook: vault parity replay, legacy freeze checklist, final acceptance report — the build's final verdict |

## Standing rules for every phase

- The phase's copy-paste prompt is executed verbatim by a fresh sub-agent
  that reads `spec/` fresh from disk — the spec set, not the prompt
  restatement, is canonical.
- Every phase closes only through the per-phase review gate: ledger-git
  cross-verification, attack battery, mutation gate (where its packages
  are targeted), money recomputation gate (where pesos are produced),
  tripwire check, and the fresh review sub-agent.
- Every phase ends with a green client acceptance report whose proof
  clips play, plus a CLIENT BRIEFING from the runner.
- Legacy-derived behavior is drawn only from
  `spec/legacy-gap-analysis.md`, `spec/legacy-behavior-vault.md`, and
  `spec/domain-rules.md` — never from `/Silid/legacy` source.
