# Decisions needed

Parked decisions that this session must not take alone. Each entry states
the options, the trade-offs, a recommendation, and a default that is never
lower than the suggestion. Work on every independent item continues; only
the affected item stops.

Raised by the Phase 04 verification session on 2026-09-26.

---

## D-001 — Stray table `public.probe_once_marker` on the linked project

**What was found.** The Supabase security advisor reports
`rls_enabled_no_policy` and the performance advisor reports
`no_primary_key`, and both point at the same object: `public.
probe_once_marker`, 8 KB, RLS enabled, zero policies, zero triggers, no
primary key, no rows of meaning. It is created by no migration and no test
in this repository, and it is mentioned nowhere in `PROGRESS.md` — it is a
leftover from an ad-hoc probe run against the project.

**Why it is parked.** Dropping a table is destructive DDL on the linked
project. The phase prompt reserves destructive operations for explicit
confirmation. It is also not mine to assume: I did not create it, and a
prior session may have left it deliberately.

**Options.**

1. Leave it in place. Cost: the two object-level advisor lints stay red, so
   every future advisor run carries two findings that are known-benign but
   unexplained to the next reader. RLS is on with no policies, so the table
   is deny-all to `anon` and `authenticated`; it is not currently a
   security exposure.
2. Drop it. Cost: none that I can see, but it is irreversible on the linked
   project and would be a change to a database I did not build.
3. Document it and keep it. Cost: same as option 1, plus a written
   justification so the lints are readable as accepted rather than
   outstanding.

**Recommendation.** Option 2, drop it — but only with confirmation. The
table has no policies, so RLS is denying all access to it anyway; it serves
no runtime purpose that I could find on disk.

**Default if no decision arrives.** Option 3. I will write the
justification into `PROGRESS.md` so the two lints are visibly accepted
rather than silently outstanding. I will NOT drop the table, because the
default must never be the more destructive option.

---

## D-002 — Leaked Password Protection is disabled on the linked project

**What was found.** The security advisor reports one WARN,
`auth_leaked_password_protection`: Supabase Auth is not checking
passwords against HaveIBeen Pwned.

**Why it is parked.** Turning it on is a one-click dashboard setting, but
it changes signup and password-change behavior for real users: a password
that appears in a breach corpus will start being rejected. That is a
user-visible behavior change on a platform project, which is past the line
of a reversible implementation detail.

**Options.**

1. Enable it. Cost: some legitimate users are refused at signup or on
   password change. Benefit: closes the only WARN on the project.
2. Leave it off until there are real users. Cost: the WARN persists.
3. Enable it with the "warn but allow" behavior if the dashboard offers a
   softer mode. Cost: none identified; I have not verified from the
   dashboard whether that option exists, so treat this as UNVERIFIED until
   the live setting page is read.

**Recommendation.** Option 1, enable it, at or before the point the
project takes real signups. The project's own threat model (spec/security
sections) treats credential compromise as in scope, and this is the
cheapest control against it.

**Default if no decision arrives.** Option 2, leave it off. The default is
never the more restrictive option for real users.
