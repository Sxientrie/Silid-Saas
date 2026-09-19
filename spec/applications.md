# Applications

Three applications ship in the initial release. All three are Next.js +
TypeScript (`spec/tech-stack.md`), hosted on Vercel, talking to Supabase
through the shared packages (`spec/monorepo-structure.md`). This file
defines each app's v1 boundary — what it does, and just as importantly
what it does not do yet.

## 1. Platform Admin — the operator portal

**Audience:** the SaaS operator only. Not reachable by any tenant role.

**v1 scope: organization management only.**

- Create organizations; manage organization status (active / suspended).
- Manage branch structure per organization (create branches, set names).
- Provision each organization's initial org-admin account.

**Deliberately absent in v1** (future phases, `spec/project-overview.md`):

- The system-wide audit review UI (audit logging itself is built from the
  start; the operator's review interface is not).
- Platform billing in any form — no invoicing, no subscription management;
  the organization's reserved `plan_status` field is the only trace.

Platform Admin is internal and small: the operator provisions tenants, and
everything tenants do happens in Frontdesk. Its surfaces are server
-procedure-driven with platform-tier claims (`spec/authentication.md`).

## 2. Landing — the public marketing site

**v1 scope: marketing only.** Product description, contact route to the
operator. No signup, no tenant onboarding, no dashboard, no auth surface
beyond static content — tenant provisioning is operator-driven
(`spec/project-overview.md`, scope decisions). Self-serve signup is a
noted future phase; nothing in the v1 data model or middleware assumes it.

Landing carries the public brand: Silid, the room-first front-desk
platform for multi-branch motel operations.

## 3. Frontdesk — the org-facing application

**Audience:** cashiers and organization administrators of a tenant.

**Offline-first PWA.** The desk machines run the app as an installed PWA:
Serwist precaches the shell, Dexie holds the local cache and outbox, and
the offline contract in `spec/offline-sync.md` governs what works without
the network. Multi-cashier operation is the normal case, not an edge case.

### Cashier surfaces (branch-scoped)

- **Dashboard** — active sessions with the overstay ladder: every active
  session placed on the booked/grace/overdue ladder from its own
  timestamps, overdue rooms rising to the top with the accruing display
  figure; room status counts alongside (vault-05, vault-14, vault-15).
- **Check-in** — pick the room (first vacant preselected, one-tap
  override), stay type, guest count; confirm full payment collected; the
  server seals time and occupies the room (vault-10).
- **Check-out** — the sealed-total flow: server computes and freezes
  base, surcharges, add-ons, and the extension deficit in one
  transaction; the desk reviews and confirms (vault-11).
- **Canteen** — item picker with per-branch prices, cart with quantity
  controls, one posted row per line, today's sales list (vault-08).
- **Add-ons** — chargeable items posted to a guest's open session
  (vault-09).
- **Shift** — open shift, live display-only summary mirroring the close
  arithmetic, end-shift with optional physical count, online-only close
  (vault-13, vault-14).

### Organization-admin surfaces (org-scoped)

- **Cross-branch reports and dashboards** — live revenue and activity
  across the org's branches.
- **Rate configuration** — the full per-branch rate card (stay types,
  tiers, surcharges, overstay parameters, catalogue price overrides)
  through the merge write path (vault-20).
- **Staff management** — provision cashier and org-admin accounts
  (`spec/authentication.md` §5).
- **Shift history** — every shift across branches with expected vs.
  counted and variance; the one-shot record-count recovery (vault-13).
- **Audit review** — the org's audit trail (`spec/domain-rules.md` §9).

### Feature-slice organization

Frontdesk code is organized as the vertical slices listed in
`spec/monorepo-structure.md` §2 (sessions, rooms, addons, canteen, rates,
shift, staff, reports), each with its own types, services, hooks, and
components; audit writing is cross-cutting infrastructure, not a slice.

## 4. Cross-application rules

- **Scope never comes from the client.** Each app resolves the tenant and
  branch from session claims; request-supplied tenant identifiers are
  never authoritative (`spec/multi-tenancy.md`).
- **Route guarding is per role** (`spec/authentication.md` §3): cashier
  routes, org routes, platform routes, public routes — with the guard as
  user experience, RLS as the boundary.
- **Display money uses the shared currency formatter** (`packages/utils`);
  figures are display-only renderings of server-computed values.
- **Every app ships a smoke test (unit + E2E) before real feature work**
  (`spec/00-master-goal.md`, TECH STACK testing clause).
