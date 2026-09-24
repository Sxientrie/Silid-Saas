import { createClient } from "@supabase/supabase-js";

/**
 * Seed (idempotently) the first platform_admin identity — the SaaS
 * operator — through the trusted server path: the Supabase Auth admin API
 * with the service credentials held OUTSIDE the repo (gitignored local
 * env). app_metadata carries the spec/authentication.md §2 claim shape:
 * platform_admin with null org_id and branch_id (no tenant staff row).
 *
 * Run: node --env-file=.env.local packages/auth/src/seed-platform-admin.ts
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 *      SILID_OPERATOR_EMAIL, SILID_OPERATOR_PASSWORD
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SILID_OPERATOR_EMAIL;
const password = process.env.SILID_OPERATOR_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  console.error(
    "seed-platform-admin requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SILID_OPERATOR_EMAIL, SILID_OPERATOR_PASSWORD",
  );
  process.exit(1);
}

const claims = { role: "platform_admin", org_id: null, branch_id: null } as const;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The project is small (provisioning-only identities so far); a client-side
// email scan over the first page is sufficient and keeps the tool simple.
const { data: listed, error: listError } = await admin.auth.admin.listUsers();
if (listError) {
  console.error("listUsers failed:", listError.message);
  process.exit(1);
}
const existing = listed.users.find((user) => user.email === email);

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    app_metadata: { ...claims },
  });
  if (error) {
    console.error("updateUserById failed:", error.message);
    process.exit(1);
  }
  console.log(`platform_admin re-asserted for existing user ${existing.id} (${email})`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { ...claims },
  });
  if (error || !data.user) {
    console.error("createUser failed:", error?.message ?? "no user returned");
    process.exit(1);
  }
  console.log(`platform_admin seeded: ${data.user.id} (${email})`);
}
