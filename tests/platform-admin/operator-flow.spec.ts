import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Phase 03 Deliverables 6+7 — the operator provisioning flow through the
 * real UI against the linked Supabase project, plus the tenant-isolation
 * proof through the browser path (the same PostgREST endpoints the UI
 * uses) and the proxy guard refusing a tenant role. Records proof clips
 * (video: 'on' in the workspace config). Skips cleanly when the
 * gitignored local env is absent (CI runs the smoke specs instead).
 */
function loadLocalEnv(): void {
  for (const candidate of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
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
const operatorEmail = process.env.SILID_OPERATOR_EMAIL;
const operatorPassword = process.env.SILID_OPERATOR_PASSWORD;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && publishableKey && operatorEmail && operatorPassword);

test.describe("operator provisioning flow (linked project)", () => {
  test.skip(
    !ready,
    "live Supabase env not configured — the gitignored .env.local (project URL, publishable key, operator credentials) is absent",
  );
  const run = `e2e_${Date.now()}`;
  const orgAName = `E2E Org Alpha ${run}`;
  const orgBName = `E2E Org Beta ${run}`;
  const adminEmail = `e2e-admin-${run}@silid-test.local`;
  const adminPassword = `e2e-pass-${run}-A`;

  let orgAId: string;
  let orgBId: string;
  const service = serviceKey
    ? createClient(url!, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  test.afterAll(async () => {
    // Test fixtures only: children before parents (staff/branches first —
    // the leftover-pollution incident recorded in PROGRESS.md). The
    // provisioned admin's AUTH user is deleted by email match (the profile
    // row goes with the org cleanup; the identity would otherwise leak).
    if (!service) return;
    const { data: orgs } = await service
      .from("organizations")
      .select("id")
      .in("name", [orgAName, orgBName]);
    for (const org of orgs ?? []) {
      await service.from("staff").delete().eq("org_id", org.id);
      await service.from("branches").delete().eq("org_id", org.id);
    }
    await service.from("organizations").delete().in("name", [orgAName, orgBName]);
    const { data: listed } = await service.auth.admin.listUsers();
    for (const user of listed.users) {
      if (user.email === adminEmail) await service.auth.admin.deleteUser(user.id);
    }
  });

  test("operator creates an organization, sets its status, adds a branch, provisions the org-admin; the admin sees only their organization", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // ── operator signs in through the UI ──
    await page.goto("/signin");
    await page.getByLabel("Email").fill(operatorEmail!);
    await page.getByLabel("Password").fill(operatorPassword!);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Cold start: Sentry init + first auth roundtrip through a fresh
    // `next start` can exceed the default 5s assertion window.
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible({
      timeout: 30_000,
    });

    // ── create organization A through the UI ──
    await page.getByRole("link", { name: "New organization" }).click();
    await page.getByLabel("Organization name").fill(orgAName);
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}$/);
    orgAId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByRole("heading", { name: orgAName })).toBeVisible();
    await expect(page.getByTestId("org-status")).toHaveText("active");

    // ── set its status: suspend, then reactivate ──
    await page.getByRole("button", { name: "Suspend organization" }).click();
    await expect(page.getByTestId("org-status")).toHaveText("suspended");
    await page.getByRole("button", { name: "Reactivate organization" }).click();
    await expect(page.getByTestId("org-status")).toHaveText("active");

    // ── add a branch ──
    await page.getByLabel("Branch name").fill("Alpha Branch 1");
    await page.getByRole("button", { name: "Add branch" }).click();
    await expect(page.getByRole("cell", { name: "Alpha Branch 1" })).toBeVisible();

    // ── provision the organization's first org-admin ──
    await page.getByLabel("Administrator email").fill(adminEmail);
    await page.getByLabel("Display name").fill("Alpha Admin");
    await page.getByLabel("Initial password").fill(adminPassword);
    await page.getByRole("button", { name: "Provision administrator" }).click();
    await expect(page.getByTestId("provision-success")).toContainText(adminEmail);
    await expect(page.getByRole("cell", { name: adminEmail })).toBeVisible();

    // ── the operator also creates a second organization (org B) ──
    const operatorClient = createClient(url!, publishableKey!);
    const operatorSignIn = await operatorClient.auth.signInWithPassword({
      email: operatorEmail!,
      password: operatorPassword!,
    });
    expect(operatorSignIn.error).toBeNull();
    const { data: orgB, error: orgBError } = await operatorClient
      .from("organizations")
      .insert({ name: orgBName, status: "active" })
      .select("id")
      .single();
    expect(orgBError).toBeNull();
    orgBId = orgB!.id;

    // ── sign out through the UI ──
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/signin$/);

    // ── the provisioned org-admin signs in; the operator portal refuses ──
    await page.getByLabel("Email").fill(adminEmail);
    await page.getByLabel("Password").fill(adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Not authorized")).toBeVisible();

    // ── Deliverable 7: isolation through the browser path. From the same
    // origin the UI runs on, the org-admin's session queries the exact
    // PostgREST endpoints a UI would call: their own organization is
    // visible, the operator's second organization returns ZERO rows. ──
    const isolation = await page.evaluate(
      async ({ supabaseUrl, key, email, password, ownId, otherId }) => {
        const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({ email, password }),
        });
        const tokenBody = await tokenRes.json();
        const headers = {
          apikey: key,
          Authorization: `Bearer ${(tokenBody as { access_token?: string }).access_token}`,
        };
        const query = async (orgId: string) => {
          const res = await fetch(
            `${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=id,name,status`,
            { headers },
          );
          return { status: res.status, body: await res.json() };
        };
        return {
          tokenStatus: tokenRes.status,
          tokenError: (tokenBody as { error?: string; error_description?: string }).error ?? null,
          own: await query(ownId),
          other: await query(otherId),
        };
      },
      {
        supabaseUrl: url!,
        key: publishableKey!,
        email: adminEmail,
        password: adminPassword,
        ownId: orgAId,
        otherId: orgBId,
      },
    );
    expect(isolation.tokenStatus).toBe(200);
    expect(isolation.own.status).toBe(200);
    expect(isolation.own.body).toHaveLength(1);
    expect((isolation.own.body as Array<{ id: string }>)[0].id).toBe(orgAId);
    expect(isolation.other.status).toBe(200);
    expect(isolation.other.body).toEqual([]);
  });
});
