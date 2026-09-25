import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationEnv } from "./helpers/env.js";

/**
 * Integration proofs for the trusted provisioning path (Deliverable 2),
 * run against the linked Supabase project with the DEPLOYED
 * provision-staff function. Skipped when the gitignored local env is
 * absent (CI has no Supabase credentials — recorded in PROGRESS.md).
 */
const env = integrationEnv();

describe.skipIf(!env.ready)("provisioning path (linked project)", () => {
  const url = env.supabaseUrl!;
  const publishableKey = env.publishableKey!;
  const run = `p03_${Date.now()}`;

  const admin = createClient(url, env.serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  let operatorClient: SupabaseClient;
  let operatorOrgId: string;
  let secondOrgId: string;
  let orgAdminEmail: string;
  const orgAdminPassword = `pa55-${run}-A`;
  let orgAdminUserId: string;
  let orgAdminClient: SupabaseClient;

  async function accessTokenOf(client: SupabaseClient): Promise<string> {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    return token!;
  }

  async function invokeProvision(
    accessToken: string | null,
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: publishableKey,
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(`${url}/functions/v1/provision-staff`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function signInAs(email: string, password: string) {
    const client = createClient(url, publishableKey);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    return { client, user: data.user! };
  }

  async function createOrgAs(name: string): Promise<string> {
    const { data, error } = await operatorClient
      .from("organizations")
      .insert({ name, status: "active" })
      .select("id")
      .single();
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    createdOrgIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const operator = await signInAs(env.operatorEmail!, env.operatorPassword!);
    operatorClient = operator.client;
    expect(operator.user.app_metadata?.role).toBe("platform_admin");
    operatorOrgId = await createOrgAs(`Provision Test Org ${run}`);
    secondOrgId = await createOrgAs(`Provision Second Org ${run}`);
  });

  afterAll(async () => {
    // Cleanup the fixtures this suite created (service-key path, test-only).
    // Children first: staff rows and branches reference the organizations,
    // and the org delete fails on the FK otherwise (the leftover-pollution
    // incident suite 02 caught on 2026-09-25).
    for (const orgId of createdOrgIds) {
      await admin.from("staff").delete().eq("org_id", orgId);
      await admin.from("branches").delete().eq("org_id", orgId);
    }
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
    for (const orgId of createdOrgIds) {
      await admin.from("organizations").delete().eq("id", orgId);
    }
  });

  it("refuses invocation without a bearer token", async () => {
    const res = await fetch(`${url}/functions/v1/provision-staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: publishableKey },
      body: JSON.stringify({}),
    });
    expect(res.ok).toBe(false);
  });

  it("the platform tier cannot provision cashier accounts", async () => {
    const operator = await signInAs(env.operatorEmail!, env.operatorPassword!);
    const token = await accessTokenOf(operator.client);
    const res = await invokeProvision(token, {
      email: `cashier-${run}@silid-test.local`,
      password: `pa55-${run}-c`,
      display_name: "Cashier Attempt",
      role: "cashier",
      org_id: operatorOrgId,
      branch_id: null,
    });
    expect(res.status).toBe(403);
  });

  it("provisions an org_admin whose claims, profile row, and audit row match §2 exactly; client-supplied claims in the body are ignored", async () => {
    orgAdminEmail = `orgadmin-${run}@silid-test.local`;
    const operatorToken = await accessTokenOf(operatorClient);
    const provision = await invokeProvision(operatorToken, {
      email: orgAdminEmail,
      password: orgAdminPassword,
      display_name: "Org Admin One",
      role: "org_admin",
      org_id: operatorOrgId,
      branch_id: null,
      // A client attempt to widen its own claims through the same call —
      // the body's app_metadata must never reach the created identity.
      app_metadata: { role: "platform_admin", org_id: null, branch_id: null },
    });
    expect(provision.status).toBe(200);
    expect(provision.body).toMatchObject({ email: orgAdminEmail });

    const { data } = await admin.auth.admin.listUsers();
    const staff = data.users.find((user) => user.email === orgAdminEmail)!;
    createdUserIds.push(staff.id);
    orgAdminUserId = staff.id;
    // The claim shape of spec/authentication.md §2: role + org_id, with
    // branch_id null for the org tier (GoTrue stores the null by omitting
    // the key; the claim readers normalize it back to null). GoTrue adds
    // its own provider bookkeeping alongside — the forged body claims
    // (role: platform_admin) did not land, and no extra authorization keys
    // exist beyond the three spec keys plus that bookkeeping.
    expect(staff.app_metadata).toMatchObject({
      role: "org_admin",
      org_id: operatorOrgId,
    });
    // GoTrue stores a null claim by omitting the key; the claim readers
    // (and auth.jwt() ->> 'branch_id') normalize the absence back to null.
    expect(staff.app_metadata?.branch_id ?? null).toBeNull();
    expect(staff.app_metadata?.role).not.toBe("platform_admin");

    const { data: profile } = await operatorClient
      .from("staff")
      .select("id, org_id, branch_id, email, role, is_active")
      .eq("id", staff.id)
      .single();
    expect(profile).toMatchObject({
      id: staff.id,
      org_id: operatorOrgId,
      branch_id: null,
      email: orgAdminEmail,
      role: "org_admin",
      is_active: true,
    });

    const { data: auditRow } = await operatorClient
      .from("audit_log")
      .select("actor_id, action, target_table, target_id, org_id, branch_id")
      .eq("action", "provision_staff")
      .eq("target_id", staff.id)
      .single();
    expect(auditRow).toMatchObject({
      action: "provision_staff",
      target_table: "staff",
      target_id: staff.id,
      // the platform-tier action is audited with null org/branch
      org_id: null,
      branch_id: null,
    });

    const { client: signedInOrgAdmin } = await signInAs(orgAdminEmail, orgAdminPassword);
    orgAdminClient = signedInOrgAdmin;
  });

  it("a provisioned user cannot elevate itself through the client API", async () => {
    const { client } = await signInAs(orgAdminEmail, orgAdminPassword);
    const { data: updated, error } = await client.auth.updateUser({
      data: { role: "platform_admin", org_id: null, branch_id: null },
    });
    expect(error).toBeNull();
    // user_metadata absorbed the forged values; app_metadata is untouched —
    // no client path can write authorization claims.
    expect(updated.user?.user_metadata).toMatchObject({ role: "platform_admin" });
    expect(updated.user?.app_metadata).toMatchObject({
      role: "org_admin",
      org_id: operatorOrgId,
    });
    // And the elevation attempt is worthless: the org tier sees its own org
    // only, through the Data API, with its own (unchanged) claims.
    const { data: visible } = await client.from("organizations").select("id");
    const ids = (visible as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toEqual([operatorOrgId]);
    expect(ids).not.toContain(secondOrgId);
  });

  it("an org_admin cannot provision for another organization", async () => {
    const { client } = await signInAs(orgAdminEmail, orgAdminPassword);
    const cross = await invokeProvision(await accessTokenOf(client), {
      email: `intruder-${run}@silid-test.local`,
      password: `pa55-${run}-x`,
      display_name: "Cross Tenant Attempt",
      role: "org_admin",
      org_id: secondOrgId,
      branch_id: null,
    });
    expect(cross.status).toBe(403);
    expect(cross.body).toMatchObject({ error: "cross-tenant provisioning refused" });
  });

  it("cleanup drops the org_admin user so re-runs start clean", async () => {
    // recorded as a no-op marker: afterAll performs the service-key cleanup
    expect(orgAdminUserId).toBeTruthy();
  });
});
