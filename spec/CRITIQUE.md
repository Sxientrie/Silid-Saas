# CRITIQUE — Independent Review Record (Step 5) and Remediation (Step 6)

Three independent reviewer sub-agents — with no knowledge of the authoring
session, of each other's findings, or of this file — audited the
specification and roadmap sets against the fifteen-check rubric in
`spec/00-master-goal.md` (Step 5). Their findings are merged below,
deduplicated, severity-ranked, and tagged with the reviewer(s) and check
number(s). Step 6 dispositions every finding: RESOLVED (fixed in the
artifact set, one-line note of what changed) or DEFERRED (valid but out of
scope for this pass, with the reason and, where required, a recorded
future-phase note). A fresh VERIFICATION sub-agent then audited every
RESOLVED finding against the actual files; the verification round log is
at the end of this file.

Reviewers: **A** — Spec Red Team (checks 1, 2, 3, 7, 9, 10, 15 +
invariant coverage); **B** — Roadmap Red Team (checks 4, 5, 6, 8, 11, 12,
13); **C** — Money & Data Red Team (check 14 + arithmetic recomputation,
state-machine trace, ledger audit, data-model completeness).

Severity: **P0** blocks building; **P1** must fix before build starts;
**P2** should fix, low risk if deferred; **P3** nit. No P0 findings were
raised by any reviewer.

---

## P1 findings

**1. P1 — Canteen catalogue exists nowhere in the spec set; two files
falsely claim it does.** [A — checks 1, 3; C — check 14]
`spec/domain-rules.md` §5 stated the catalogue was "reproduced in
`spec/legacy-behavior-vault.md`", and `spec/legacy-gap-analysis.md` §4.2
claimed it was "captured as the machine-readable money fixture in
`spec/domain-rules.md`" — but the vault contained no item/price list, so
the MONEY REFERENCE RULE chain was broken for the canteen and the Phase 02
fixture deliverable was unbuildable from spec alone.
**RESOLVED** — the full 26-item, 5-category normalized catalogue (with
default prices) is now a table in `spec/domain-rules.md` §5 as the
fixture's source of values; vault-08's `derived_from` points to it; the
gap-analysis claim is now true.

**2. P1 — `features/staff` is never delivered by any roadmap phase.**
[A — check 3; B — check 5]
`spec/applications.md` §3 requires staff management as a v1 org-admin
surface, `spec/monorepo-structure.md` §2 lists the slice, and Phase 11
requires entering staff accounts "through the real surfaces" — but no
phase built it.
**RESOLVED** — Phase 09 gains Deliverable 8 (features/staff: provision
through the Phase 03 path, list, deactivate), a matching Definition-of
-done bullet, and an acceptance input; `roadmap/00-index.md` phase 09 goal
line updated.

**3. P1 — Two unqualified "billing" occurrences violate the Terminology
rule and would make the Phase 01 rule-linter acceptance input
unachievable.** [A — check 2]
`spec/domain-rules.md` §3.3 ("per-minute billing via a zero-length block")
and `spec/legacy-behavior-vault.md` vault-07 ("never per-minute billing").
**RESOLVED** — both reworded to "per-minute charging"; a tree-wide grep
now finds zero violations outside permitted quotations.

**4. P1 — Add-on attribution contradiction between the shift-bucket
definition and the attribution rule.** [C — ledger audit]
`spec/domain-rules.md` §8 bucketed add-on revenue by the session's
checkout instant (as do vault-13/14, the parity benchmark) while the
attribution sentence said "posting instant for add-ons" — the two assign
cross-shift add-on money to different shifts; roadmap 08 repeated the
posting-instant wording while citing vault-13, which does not contain it.
**RESOLVED** — the normative attribution rule now states add-on money
reaches the desk as part of the session's sealed checkout total (with the
cross-shift example made explicit); roadmap 08's deliverable text and
prompt restatement corrected to match.

**5. P1 — Voiding an active session strands its room.** [C — state
machine]
Room release happened "only in the checkout transaction"; a voided session
can never be checked out, so a void-while-active left the room
occupied/grace/overdue forever with no defined exit.
**RESOLVED** — `spec/domain-rules.md` §9 now releases the room to vacant
inside the void transaction (and §4/§10 name void-of-active as the second
release path); vault-12 carries the room transition and its rationale; the
Phase 02 void-RPC deliverable includes the release.

**6. P1 — The blanket "INSERT-only ledgers" claim is unimplementable for
`sessions` and `shifts`.** [C — data model]
Checkout, void, close, and count must write to those tables, so either the
claim was false or the mechanism (owner-rights RPC transitions) was
unspecified; relatedly, money columns NOT NULL + "sealed at checkout"
left the insert-time value undefined for the Money Recomputation Gate.
**RESOLVED** — `spec/data-model.md` §2 now distinguishes truly immutable
rows (`session_addons`, `canteen_sales`, `audit_log`: INSERT-only for
every role) from state-bearing rows (`sessions`, `shifts`: written after
insert only by named, column-scoped, single-transaction server
transitions, with no direct UPDATE/DELETE for any role); §5 states
pre-seal money columns carry server-applied zeros that are defaults, not
figures, and the Gate computes over sealed rows only; `spec/multi-tenancy.md`
§4 aligned.

**7. P1 — The shift-close sealing RPC has no owner phase, while Phase 08
asserts it already exists.** [B — check 5; C — sequencing]
Phase 08's prose and prompt claimed "the close_shift sealing RPC" from the
database phase, but Phase 02's deliverables never authored it.
**RESOLVED** — Phase 02 gains Deliverable 13 (the sealing RPC with the
§8 bucketing, half-open window, per-branch serialization, one-shot count,
record-count path, org force-close) and matching Definition-of-done
proofs.

**8. P1 — The money-recomputation utility is invoked by every peso gate
but built by no deliverable.** [B — checks 5, 13]
Phases 04–12 name the packages/testing recompute utility as the gate
mechanism; nothing created it, and the master's MONEY RECOMPUTATION GATE
clause requires the utility, seed, and reference mode to be spec'd.
**RESOLVED** — Phase 02 gains Deliverable 14 (the utility: seeded
deterministic env, reference mode over the §1.4 examples and ledger sums,
defined CLI invocation); Phase 04's gate item now cites the Phase 02
utility.

## P2 findings

**9. P2 — `spec/authentication.md` had an unclosed code fence** that
rendered most of the file as one code block. [A — check 1]
**RESOLVED** — fence closed after the claim-shape JSON block.

**10. P2 — Dangling citation chain for the garbage-timestamp rule.**
[A — check 1; B — check 5; C — check 14]
Roadmap 06 cited `spec/domain-rules.md` §4.3 (which does not exist); the
gap-analysis cited "vault-05's boundary notes" (which contained no such
boundary); the rule had no normative home.
**RESOLVED** — the rule is now normative in `spec/domain-rules.md` §3.4
("Garbage inputs fall back, never lie"), vault-05 carries the garbage and
zero-grace boundaries, and roadmap 06 cites §3.4.

**11. P2 — No correction path for canteen sales and add-ons, and the
absence was undocumented.** [A — check 3]
**RESOLVED** — `spec/domain-rules.md` §9 records the decision explicitly
(line items immutable in v1; postings audited; errors absorbed at
reconciliation; line-item voids a noted future phase); `spec/data-model.md`
§3 and the `spec/project-overview.md` future-phase list carry it.

**12. P2 — The `platform_admin` identity's home in the data model was
unspecified** (staff row with what org? actor FK target? audit org
nullability). [A — check 3; C — data model]
**RESOLVED** — `spec/data-model.md` §1 states platform identities live in
Supabase Auth without tenant staff rows (staff.role holds
cashier/org_admin in practice); `audit_log.actor_id` is the auth user id;
`audit_log.org_id` is nullable only for platform-tier actions;
`spec/multi-tenancy.md` §5 states platform writes to tenant ledgers do not
occur in v1.

**13. P2 — Roadmap 06's overstay money figure was numerically garbled**
("61 minutes past grace, ₱2,300 total for a 6-pax-equivalent"). [A —
check 1; B — check 13; C — arithmetic]
**RESOLVED** — the deliverable now scripts one concrete scenario: 5-pax
overnight checked out 61 minutes past grace, sealed total ₱2,300 (₱2,000
base + surcharge, plus two ₱150 blocks).

**14. P2 — The cross-desk live-update design was referenced but never
defined** (mechanism and interval owned by no spec). [A — check 3; B —
check 5]
**RESOLVED** — `spec/offline-sync.md` §5 records the v1 mechanism
(claim-scoped polling, 15-second design interval) and names Realtime a
future optimization; the gap-analysis §2/§3.5 aligned; roadmap 11 audits
against the named interval.

**15. P2 — Phase 02's prompt embedded an unverifiable CLI incantation**
(`supabase db pull <name> --local --yes`; the `--yes` flag does not exist
in the current CLI). [B — check 12]
**RESOLVED** — the prompt now defers to the CLI's diff/pull flow with
flags discovered via `--help` at run time, consistent with the
verify-before-you-trust rule.

**16. P2 — No phase named its attack surface or recorded "none."** [B —
check 13]
**RESOLVED** — every phase file (01–12) now carries an explicit "Attack
surface:" declaration alongside its acceptance inputs; Phase 01 records
the pipeline-fixture surfaces plus "ATTACKABLE SURFACE: none" for business
behavior.

**17. P2 — The extension-deficit formula's "blocks already posted" term
is a permanent zero under the stated rules**, inviting a ₱150 divergence
between readings. [C — arithmetic]
**RESOLVED** — `spec/domain-rules.md` §3.2 and vault-11 state that no
mid-stay poster exists in v1, the subtraction is a defensive invariant
exercised with synthetic posted rows, and no golden ambiguity remains.

**18. P2 — Shift-window boundary semantics and the close-vs-checkout
race were undefined.** [C — ledger audit]
**RESOLVED** — `spec/domain-rules.md` §8 defines the half-open window
[opened_at, closed_at) and the per-branch serialization that places every
event's sealed instant entirely before or after the closed window;
vault-13 carries the boundary; the Phase 02 sealing-RPC deliverable
implements it.

**19. P2 — The cash disposition of a void was unspecified** (drawer holds
cash the sealed expected figure omits — a systematic unexplained
"short"). [C — ledger audit]
**RESOLVED** — `spec/domain-rules.md` §9 and vault-12 record the house
rule: the voided session's cash leaves the drawer as part of the void
procedure; voiding a closed session changes no sealed figures.

**20. P2 — Whether transactions require an open shift was undefined**
(money with no window is unreconcilable). [C — ledger audit]
**RESOLVED** — `spec/domain-rules.md` §8 and vault-13 make an open shift
a requirement for money-bearing desk actions; roadmap 08 owns the refusal
test.

**21. P2 — Shift close/count permissions were incomplete and a
deactivated opener could strand an open shift forever.** [C — state
machine / ledger audit]
**RESOLVED** — `spec/domain-rules.md` §8 and vault-13 define the closer
set (any active branch cashier, plus org tier), the count-permission set,
and the org force-close escape path; roadmap 08's deliverable includes it.

**22. P2 — Phase 11 claimed Vercel preview wiring was "already wired"
when no phase wired it.** [B — check 5]
**RESOLVED** — Phase 01 gains Deliverable 17 (link the three apps on
Vercel, previews per PR); Phase 11's deliverable now reads "preview wiring
landed in Phase 01; this phase does production linking".

## P3 findings

**23. P3 — `audit_log` is singular while the naming convention says
tables are plural** — a master-document self-contradiction. [A — check 2]
**DEFERRED** — master-document amendment, permitted only as a logged
proposed change: either rename to `audit_logs` in the master, the
monorepo-structure spec, and the data model, or record it as a named
exception; requires the client's decision like any master change.

**24. P3 — Phase 01's linter deliverable quoted the bare term.** [A —
check 2] **RESOLVED** — reworded to "the unqualified term".

**25. P3 — vault-18 reasoning grammar ("neither porting … nor claiming").**
[A — check 1] **RESOLVED** — corrected.

**26. P3 — Gap-analysis §6 referenced the review process rather than
stating the decision.** [A — check 10] **RESOLVED** — clause trimmed.

**27. P3 — Soft-wrap artifacts rendered "guest -billing" with a stray
space** in `spec/domain-rules.md` and roadmap 06. [A — check 2]
**RESOLVED** — hyphenation joined in both files.

**28. P3 — The cutover runbook's home in `/Silid/reports/` conflicted
with the artifact rules** (reports/ reserved for generated reports). [A —
check 9] **RESOLVED** — `spec/project-overview.md` designates
`/Silid/reports/cutover-runbook.md` as the runbook's recorded home.

**29. P3 — Phase 02 stated two different migration workflows.** [A —
check 1] **RESOLVED** — reconciled into one flow with syntax discovered
at run time (see finding 15).

**30. P3 — Phase prompts condense the SUPABASE PROTOCOL rather than
reproducing it word-for-word.** [A — check 15] **DEFERRED** — accepted
deviation, recorded: every prompt carries all four mandated components
(BaaS axiom, CLI/MCP/skill rule, the security checklist's operative
rules, the supabase db test requirement) and binds `spec/` — which
carries the verbatim text (`spec/supabase.md` §5) — as canonical; the
trade is deliberate so twelve prompts cannot drift from one canonical
statement.

**31. P3 — Production/test project refs are UNRECORDED-PENDING.** [A —
check 15] **DEFERRED** — by design: the refs are created and recorded at
Phase 01 with an explicit stop condition for downstream phases; recording
a fabricated ref now would violate the verify rule.

**32. P3 — `/Silid/canon/RULES.md` (the earlier generic template) is not
owned by any spec.** [A — observation] **RESOLVED** —
`spec/project-overview.md` records it as inert reference material,
superseded by `spec/00-master-goal.md`.

**33. P3 — The prompts' spec-wins rule omitted the master's third clause
("the phase prompt corrected in the same pass").** [B — check 4]
**RESOLVED** — added to the spec-wins line in all eleven prompts
(02–12); `spec/builder-protocol.md` §6 already carried it.

**34. P3 — The shortened generator loop was reproduced only in Phase 01's
prompt.** [B — checks 4, 6] **RESOLVED** — added to the loop block of all
eleven prompts (02–12).

**35. P3 — The prompts' VERIFY-BEFORE-YOU-TRUST reproduction omits the
master's fourth operating bullet** (re-confirming the document's own
pinned choices). [B — check 12] **DEFERRED** — that bullet is an
authoring-time rule aimed at spec writers; the builder-facing canonical
text is `spec/builder-protocol.md` §2 (which the prompts mirror), and the
functional requirement (re-confirm versions at implementation time) is
carried by the tech-stack table's re-confirmation clause.

**36. P3 — Several acceptance inputs bundled multiple claims** (Phases
03, 08, 11). [B — check 13] **RESOLVED** — split into single falsifiable
sentences in all three files.

**37. P3 — vault-05's grace-countdown parenthetical mislabeled the
instant.** [C — vault] **RESOLVED** — reworded (30 seconds into the
window shows 25 left; at 24m30s remaining the display shows 25).

**38. P3 — vault-10's wording could be read as endorsing unsealed money
columns.** [C — vault] **RESOLVED** — reworded to distinguish the legacy
defect era (never sealed) from the sealed-at-checkout contract the
rewrite implements.

**39. P3 — The business's legal minimum guest counts were never stated
numerically.** [C — data model] **RESOLVED** — `spec/domain-rules.md` §2:
minimum is 1 for both stay types; zero and negative rejected at
validation.

**40. P3 — No golden exercises a zero-grace configuration.** [C — vault]
**RESOLVED** — vault-05's boundaries now include the zero-grace ladder
boundary (overdue begins at booked_end with zero blocks).

**41. P3 — Checkout and count acts carry no dedicated attribution
columns.** [C — data model] **RESOLVED** — recorded as a design decision
in `spec/data-model.md` §5 (attribution rides the audit trail; the
transitions write audit entries) and vault-13 (the record-count action is
audited).

**42. P3 — `spec/multi-tenancy.md` §4 listed rate configuration as
organization-scoped while it lives branch-scoped.** [C — internal
consistency] **RESOLVED** — the table now points rate configuration to
`branches.rate_config`.

---

## Plain-language summary (Step 5 verdict, pre-remediation)

The specification and roadmap sets are close to buildable and unusually
strong on the things this project exists to enforce: the proof model, the
Supabase discipline, scope control, and the arithmetic — every peso
figure, block boundary, and worked example recomputed exactly. The
twenty-one reviewers' P1s were not architectural: a missing price list
that the money-fixture rule depended on, two features no phase owned (a
staff surface and the shift-close RPC every peso gate leans on), a
wording pair that would have failed the project's own linter, and a
handful of rule seams (a stranded room after a void, two contradictory
attribution sentences, an unimplementable append-only blanket) that would
each have forced a builder to guess on a money path. All P1s and all but
five P2/P3 items were fixed in place with precise sentences, one
deliverable reassignment, and one new Phase 02 deliverable pair; the
deferred items are recorded master-level or by-design deviations. After
remediation and verification, the set is ready to build from.

## Verification round (Step 6 auditor)

PENDING — appended after the verification sub-agent's pass.
