# Authentication and Access Control

Authentication is Supabase Auth — managed identity, managed sessions, no
hand-rolled session logic anywhere. This file reproduces the ROLES BY TIER
table from `spec/00-master-goal.md` verbatim, builds the permission model
directly on top of it, and states the claim shape, token policy, and the
claim functions. The security rule it rests on is reproduced in
`spec/supabase.md` §5 and binds every session: authorization data lives in
`app_metadata`, never in `user_metadata`.

## 1. ROLES BY TIER (reproduced verbatim)

Each tier has exactly one primary role for the initial release:

| Tier                      | Role           | Scope                                                                |
|---------------------------|----------------|----------------------------------------------------------------------|
| Platform                  | platform_admin | All organizations, platform billing (future phase), system-wide audit (review UI: future phase) |
| Organization              | org_admin      | Own org only: branches, rate config, staff, cross-branch reports, audit review |
| Branch/Frontdesk/Cashier  | cashier        | Single branch only: sessions, addons, canteen, shift                  |

Exactly one role per tier is a deliberate scoping decision that keeps the
single-client first release lean. No additional role (for example a
branch-manager role distinct from `org_admin`) may be introduced without
first updating `spec/00-master-goal.md`; if a later phase surfaces a
genuine need, it is logged as a noted future-phase decision in the spec
file that surfaces the need — never added silently.

Role identifiers appear in code and schema exactly as in the table:
`platform_admin`, `org_admin`, `cashier` — snake_case, no ad hoc role
strings.

## 2. Identity, claims, and the claim shape

- **Identity provider.** Supabase Auth owns sign-in, sessions, refresh,
  and token lifecycle. Applications use Supabase Auth's documented client
  and server APIs (`@supabase/supabase-js`, `@supabase/ssr` for the
  Next.js apps) — never hand-rolled session storage, cookie formats, or
  token refresh logic.
- **Claim shape.** The authenticated JWT carries, in `app_metadata`:

  ```json
  {
    "app_metadata": {
      "role": "cashier | org_admin | platform_admin",
      "org_id": "<uuid | null>",
      "branch_id": "<uuid | null>"
    }
  }
  ```

  `org_id` and `branch_id` are null for `platform_admin`; `branch_id` is
  null for `org_admin`; a `cashier` always carries both, pointing at the
  single branch they operate.
- **Why app_metadata.** `user_metadata` is user-editable and therefore
  unacceptable for authorization — the official Supabase security rule
  reproduced in `spec/supabase.md` §5. `app_metadata` is server-managed:
  only trusted server paths (the provisioning function, the MCP/CLI with
  elevated credentials) write it.
- **Claim freshness.** JWT claims are not always fresh until the token
  refreshes (`spec/supabase.md` §5). Scope-affecting changes (a cashier
  reassigned to another branch, a staff deactivation) therefore pair the
  `app_metadata` update with a session revocation for that user, so the
  next sign-in re-issues claims that match the database. Sensitive
  operations may additionally validate `session_id` against
  `auth.sessions`.

## 3. How the layers consume the claims

- **Database (Layer 3).** RLS policies read the claims from the JWT
  (`auth.jwt() -> 'app_metadata'`), matching rows by `org_id` /
  `branch_id` and actions by `role`. Policies are `TO authenticated` (or
  the specific role where applicable) with ownership predicates in
  `USING`, and `WITH CHECK` on any writable path
  (`spec/supabase.md` §5, §6). Every tenancy- or money-touching policy has
  a pgTAP test proving a specific cross-tenant attempt returns nothing.
- **Server procedures (Layer 1).** tRPC procedures resolve scope from the
  verified session claims; procedures accept tenant identifiers from
  clients never — at most they validate a client-supplied id against the
  claims for friendly errors, then use the claims as the authority.
- **Middleware (Layer 2).** Next.js middleware guards routes by role: the
  Frontdesk's cashier surfaces vs. org surfaces, Platform Admin's
  operator-only pages, Landing's public-only pages.

## 4. Token policy

- Access tokens are Supabase-issued JWTs with short expiry (the platform
  default) and automatic refresh through the managed client libraries.
- Refresh tokens and sessions are managed by Supabase Auth; client apps
  persist sessions through the documented storage adapters of
  `@supabase/ssr` / `supabase-js`.
- Sign-out revokes the server session; deactivating a staff account
  revokes sessions first (token deletion alone does not invalidate issued
  access tokens — `spec/supabase.md` §5).
- No `service_role` or secret key ever appears in client code or
  client-exposed environment variables (`NEXT_PUBLIC_*` is sent to the
  browser by definition — `spec/supabase.md` §5).

## 5. Provisioning and account lifecycle

- **Staff accounts are provisioned, never self-serve.** An `org_admin`
  creates cashier and org-admin accounts for the organization through a
  server-side provisioning path (an Edge Function or server procedure
  holding the elevated credentials); `platform_admin` provisions
  organizations and their initial org-admin. The provisioning path sets
  `app_metadata` claims, creates the staff profile row, and returns
  nothing sensitive to the client.
- **The legacy's login-ergonomics detail** — bare identifiers mapped to an
  internal email shape at the login screen — is preserved as presentation
  ergonomics only: the identifier maps to the account's email before the
  standard Supabase password sign-in; it is not an authorization
  mechanism (vault-19).
- **Deactivation is revocation.** Deactivating a staff member revokes
  their sessions and marks the profile inactive. Historical transactional
  rows keep their attribution forever — deactivation never edits history
  (Invariant 2d).

## 6. Audit visibility

Writing audit entries is infrastructure available to every role's actions;
reviewing them is scoped (`spec/00-master-goal.md`): cashier actions
produce entries; `org_admin` reviews branch and organization audit;
`platform_admin` reviews system-wide (the review UI is a future phase —
`spec/project-overview.md`). The audit trail itself is append-only for
every role (`spec/domain-rules.md` §9).

## 7. Legacy mapping

The legacy's two roles map as stated in `spec/legacy-gap-analysis.md` §5:
legacy `cashier` → `cashier` (direct), legacy `admin` → `org_admin`
(org-level work that lacked an org boundary), `platform_admin` designed
fresh with no legacy precedent. The legacy's mechanics — role and branch
resolved by reading a profile table and trusted client-side — are
superseded by the claims model above; the vault scenario carries the
caveat (vault-19).
