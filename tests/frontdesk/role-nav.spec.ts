import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 05 Deliverable 5 — role-aware navigation and the Layer 2 route guard,
 * proven through the real sign-in form against the linked Supabase project
 * (records a proof clip; video: 'on' in the workspace config).
 *
 * Fixtures are created with the elevated client and torn down in `afterAll`,
 * children before parents — the same discipline the Phase 03 operator flow
 * uses, and for the same recorded reason (leftover pollution in a shared
 * project). Claims are written server-side through the admin API: no client
 * path can set `app_metadata`, which is the property `spec/authentication.md`
 * §2 depends on, so the fixture must not pretend otherwise.
 *
 * Skips cleanly when the gitignored local env is absent; the rest of the
 * battery does not need a live project.
 */
function loadLocalEnv(): void {
  for (const candidate of [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../.env.local"),
  ]) {
    try {
      for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
      }
      return;
    } catch {
      // try the next candidate
    }
  }
}
loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && publishableKey && serviceKey);

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel("Staff identifier").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/signin$/, { timeout: 30_000 });
}

test.describe("role-aware desk navigation and route guards", () => {
  test.skip(
    !ready,
    "live Supabase env not configured — the gitignored .env.local (project URL, publishable key, service key) is absent",
  );
  test.setTimeout(180_000);

  const run = `e2e_fd_${Date.now()}`;
  const orgName = `E2E Frontdesk Org ${run}`;
  const branchName = `E2E Frontdesk Branch ${run}`;
  const cashierEmail = `e2e-cashier-${run}@silid-test.local`;
  const adminEmail = `e2e-orgadmin-${run}@silid-test.local`;
  const password = `e2e-pass-${run}-A`;
  const service = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let orgId = "";
  let branchId = "";
  const authUserIds: string[] = [];

  test.beforeAll(async () => {
    const { data: org, error: orgError } = await service
      .from("organizations")
      .insert({ name: orgName, status: "active" })
      .select("id")
      .single();
    expect(orgError).toBeNull();
    orgId = org!.id;

    const { data: branch, error: branchError } = await service
      .from("branches")
      .insert({ org_id: orgId, name: branchName })
      .select("id")
      .single();
    expect(branchError).toBeNull();
    branchId = branch!.id;

    for (const [email, role, branchClaim, displayName] of [
      [cashierEmail, "cashier", branchId, "E2E Cashier"],
      [adminEmail, "org_admin", null, "E2E Org Admin"],
    ] as const) {
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      expect(createError).toBeNull();
      authUserIds.push(created.user.id);

      // app_metadata is the authorization source and only the server writes
      // it; the admin API is the server here.
      const { error: claimError } = await service.auth.admin.updateUserById(created.user.id, {
        app_metadata: { role, org_id: orgId, branch_id: branchClaim },
      });
      expect(claimError).toBeNull();

      const { error: staffError } = await service.from("staff").insert({
        id: created.user.id,
        org_id: orgId,
        branch_id: branchClaim,
        email,
        role,
        display_name: displayName,
        is_active: true,
      });
      expect(staffError).toBeNull();
    }
  });

  test.afterAll(async () => {
    if (!ready) return;
    await service.from("staff").delete().eq("org_id", orgId);
    await service.from("branches").delete().eq("org_id", orgId);
    await service.from("organizations").delete().eq("id", orgId);
    for (const id of authUserIds) await service.auth.admin.deleteUser(id);
  });

  test("a cashier sees cashier surfaces only, and the guard refuses the org surface", async ({
    page,
  }) => {
    await signIn(page, cashierEmail, password);

    await expect(page.getByTestId("role-badge")).toHaveText("cashier");
    await expect(page.getByTestId("nav-desk")).toBeVisible();
    await expect(page.getByTestId("nav-organization")).toHaveCount(0);
    await expect(page.getByTestId("desk-home")).toBeVisible();

    // Layer 2 is the guard, and it is not a redirect: an explicit refusal, so
    // no loop can trap a signed-in visitor who typed the URL.
    const refusal = await page.goto("/organization");
    expect(refusal?.status()).toBe(403);
    await expect(page.getByText("Not authorized: a cashier cannot open /organization")).toBeVisible();
  });

  test("an org-admin sees the org surface, and the guard lets it through", async ({ page }) => {
    await signIn(page, adminEmail, password);

    await expect(page.getByTestId("role-badge")).toHaveText("org_admin");
    await expect(page.getByTestId("nav-desk")).toBeVisible();
    await expect(page.getByTestId("nav-organization")).toBeVisible();

    await page.getByTestId("nav-organization").click();
    await expect(page.getByTestId("organization-page")).toBeVisible();
    await expect(page).toHaveURL(/\/organization$/);
  });

  test("the harness is exempt from the guard, and a signed-in cashier may open it", async ({ page }) => {
    await signIn(page, cashierEmail, password);
    // The offline proof runs with no session at all, so the harness cannot sit
    // behind the guard; and a signed-in desk must not be refused for holding no
    // desk surface.
    await page.goto("/harness");
    await expect(page.getByRole("heading", { name: "Offline contract harness" })).toBeVisible();
  });

  test("a signed-out visitor is redirected to sign-in from a guarded surface", async ({ page }) => {
    await page.goto("/organization");
    await expect(page).toHaveURL(/\/signin$/);
  });
});
