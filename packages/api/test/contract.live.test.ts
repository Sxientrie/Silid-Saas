import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { CANTEEN_CATALOGUE } from "@silid/db";
import { appRouter } from "../src/app.router.js";
import {
  createSilidCallerFactory,
  createTestCaller,
  createTrpcContext,
  type Caller,
  type SilidDataClient,
} from "../src/index.js";
import { integrationEnv } from "./helpers/integration-env.js";

/**
 * LIVE tRPC contract tests against the linked Supabase project (the
 * recorded substitution for the local stack on this Docker-less host):
 * real provisioned identities, real sign-ins, real JWT verification
 * (createTrpcContext → auth.getClaims), and real Postgres RLS under each
 * caller's own token. These are the end-to-end proofs of the deterministic
 * contracts in scope.test.ts and routers.test.ts. Skipped when the
 * gitignored local env is absent (CI has no Supabase credentials).
 *
 * Residue discipline: auth users are deleted in afterAll; the database
 * fixtures and the audit row this phase's state change legitimately writes
 * (audit_log is INSERT-only for every role by design) are swept by the
 * builder via the MCP path after the run — audit rows FIRST — returning
 * the project to its baseline.
 */
const env = integrationEnv();

describe.skipIf(!env.ready)("tRPC contracts (linked project, live)", () => {
  const url = env.supabaseUrl!;
  const publishableKey = env.publishableKey!;
  const run = `p04${Date.now()}`;
  const password = `pa55-${run}-x`;

  const admin = createClient(url, env.serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const branchA1 = crypto.randomUUID();
  const branchA2 = crypto.randomUUID();
  const branchB1 = crypto.randomUUID();
  const createdUserIds: string[] = [];

  type CallerOf = ReturnType<typeof createSilidCallerFactory>;
  let adminACaller: ReturnType<CallerOf>;
  let cashierACaller: ReturnType<CallerOf>;
  let adminBCaller: ReturnType<CallerOf>;
  let adminARawClient: SupabaseClient;
  let adminAUserId = "";

  const emails = {
    adminA: `${run}-admina@silid-test.local`,
    cashierA: `${run}-casha@silid-test.local`,
    adminB: `${run}-adminb@silid-test.local`,
  };

  async function provisionUser(
    email: string,
    claims: { role: string; org_id: string | null; branch_id: string | null },
  ): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: claims,
    });
    expect(error).toBeNull();
    const userId = data!.user!.id;
    createdUserIds.push(userId);
    return userId;
  }

  async function accessTokenFor(email: string): Promise<string> {
    const signIn = createClient(url, publishableKey);
    const { error } = await signIn.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    const { data: sessionData } = await signIn.auth.getSession();
    const token = sessionData.session?.access_token;
    expect(token).toBeTruthy();
    await signIn.auth.signOut();
    return token!;
  }

  async function contextFor(email: string): Promise<{ caller: Caller; data: SilidDataClient }> {
    const ctx = await createTrpcContext({
      supabaseUrl: url,
      publishableKey,
      accessToken: await accessTokenFor(email),
    });
    expect(ctx.caller).not.toBeNull();
    expect(ctx.data).not.toBeNull();
    return { caller: ctx.caller!, data: ctx.data! };
  }

  beforeAll(async () => {
    // Tenants: org A (two branches), org B (one branch). Branches take the
    // seeded rate_config column default (the full fixture card).
    const { error: orgError } = await admin.from("organizations").insert([
      { id: orgA, name: `API live A ${run}` },
      { id: orgB, name: `API live B ${run}` },
    ]);
    expect(orgError).toBeNull();
    const { error: branchError } = await admin.from("branches").insert([
      { id: branchA1, org_id: orgA, name: "A1" },
      { id: branchA2, org_id: orgA, name: "A2" },
      { id: branchB1, org_id: orgB, name: "B1" },
    ]);
    expect(branchError).toBeNull();

    const adminAId = await provisionUser(emails.adminA, { role: "org_admin", org_id: orgA, branch_id: null });
    const cashierAId = await provisionUser(emails.cashierA, { role: "cashier", org_id: orgA, branch_id: branchA1 });
    const adminBId = await provisionUser(emails.adminB, { role: "org_admin", org_id: orgB, branch_id: null });
    adminAUserId = adminAId;
    const { error: staffError } = await admin.from("staff").insert([
      { id: adminAId, org_id: orgA, branch_id: null, email: emails.adminA, role: "org_admin", display_name: "Admin A" },
      { id: cashierAId, org_id: orgA, branch_id: branchA1, email: emails.cashierA, role: "cashier", display_name: "Cashier A" },
      { id: adminBId, org_id: orgB, branch_id: null, email: emails.adminB, role: "org_admin", display_name: "Admin B" },
    ]);
    expect(staffError).toBeNull();

    const adminACtx = await contextFor(emails.adminA);
    const cashierACtx = await contextFor(emails.cashierA);
    const adminBCtx = await contextFor(emails.adminB);
    adminACaller = createTestCaller(adminACtx.caller, adminACtx.data);
    cashierACaller = createTestCaller(cashierACtx.caller, cashierACtx.data);
    adminBCaller = createTestCaller(adminBCtx.caller, adminBCtx.data);

    // A raw as-caller client for the org admin's legitimate room setup.
    adminARawClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${await accessTokenFor(emails.adminA)}` } },
    });
    const { error: roomsError } = await adminARawClient.from("rooms").insert([
      { org_id: orgA, branch_id: branchA1, room_number: "101" },
      { org_id: orgA, branch_id: branchA1, room_number: "102" },
      { org_id: orgA, branch_id: branchA2, room_number: "201" },
    ]);
    expect(roomsError).toBeNull();
  }, 30000);

  it("a cashier naming a sibling branch is refused — never the requested rows", async () => {
    try {
      await cashierACaller.rooms.listRooms({ branchId: branchA2 });
      throw new Error("the out-of-scope request unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("FORBIDDEN");
    }
    // Without a selector, the cashier is served exactly their claim branch.
    const rooms = await cashierACaller.rooms.listRooms({});
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    expect(rooms.every((room) => room.branchId === branchA1)).toBe(true);
  });

  it("an org admin of another organization cannot reach org A's branch or rows", async () => {
    try {
      await adminBCaller.rooms.listRooms({ branchId: branchA1 });
      throw new Error("the cross-tenant request unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      // RLS-honest refusal: the scoped branch lookup finds nothing.
      expect((error as TRPCError).code).toBe("NOT_FOUND");
    }
    await expect(adminBCaller.rates.getRateConfig({ branchId: branchA1 })).rejects.toThrow(TRPCError);
    await expect(
      adminBCaller.rates.updateRateConfig({ branchId: branchA1, extensionOverrides: { block_charge: "999" } }),
    ).rejects.toThrow(TRPCError);
    const branches = await adminBCaller.branches.listBranches();
    expect(branches.map((branch) => branch.id)).toEqual([branchB1]);
  });

  it("claim-scoped reads serve the caller's scope only (branches, staff)", async () => {
    const cashierBranches = await cashierACaller.branches.listBranches();
    expect(cashierBranches.map((branch) => branch.id)).toEqual([branchA1]);
    const cashierStaff = await cashierACaller.staff.listStaff();
    expect(cashierStaff).toHaveLength(1);
    expect(cashierStaff[0]!.role).toBe("cashier");
    const adminAStaff = await adminACaller.staff.listStaff();
    expect(adminAStaff).toHaveLength(2);
  });

  it("updateRateConfig merges through the atomic RPC, preserves keys it does not own, and persists", async () => {
    const beforeCallMs = Date.now();
    const config = await adminACaller.rates.updateRateConfig({
      branchId: branchA1,
      canteenOverrides: { bottled_water: "35.00" },
      extensionOverrides: { grace_minutes: "0", block_charge: "175.50" },
    });
    // canonical text: the §3.3 editor-block normalized the decimals
    expect(config.canteen?.overrides?.bottled_water).toBe("35");
    expect(config.extension?.grace_minutes).toBe("0");
    expect(config.extension?.block_charge).toBe("175.5");
    // vault-20: the seeded rate card's unowned keys survive the merge
    expect(config.stay_types).toBeDefined();

    const reread = await adminACaller.rates.getRateConfig({ branchId: branchA1 });
    expect(reread.rateConfig?.extension?.block_charge).toBe("175.5");
    expect(reread.rateConfig?.stay_types).toBeDefined();

    // The audit row: same transaction, server actor and server time.
    const { data: auditRows, error } = await adminARawClient
      .from("audit_log")
      .select("*")
      .eq("target_table", "branches")
      .eq("target_id", branchA1)
      .order("ts", { ascending: false })
      .limit(1);
    expect(error).toBeNull();
    const row = auditRows?.[0] as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!.action).toBe("update_rate_config");
    expect(row!.actor_id).toBe(adminAUserId);
    expect((row!.new_data as Record<string, unknown>).extension).toMatchObject({ block_charge: "175.5" });
    expect((row!.old_data as Record<string, unknown>).extension).toMatchObject({ block_charge: "150" });
    expect(new Date(row!.ts as string).getTime()).toBeGreaterThanOrEqual(beforeCallMs);
  });

  it("forged attribution fields in the input are refused, never honored", async () => {
    await expect(
      adminACaller.rates.updateRateConfig({
        branchId: branchA1,
        actor_id: "99999999-9999-4999-8999-999999999999",
        ts: "1999-01-01T00:00:00Z",
      } as unknown as { branchId: string }),
    ).rejects.toThrow(TRPCError);
  });

  it("a garbage token resolves to the anonymous context; procedures refuse it", async () => {
    const anonymous = await createTrpcContext({ supabaseUrl: url, publishableKey, accessToken: "not-a-jwt" });
    expect(anonymous.caller).toBeNull();
    expect(anonymous.data).toBeNull();
    const caller = createSilidCallerFactory(appRouter)({ caller: null, data: null });
    await expect(caller.rooms.listRooms({})).rejects.toHaveProperty("code", "UNAUTHORIZED");
  });

  it("the catalogue procedure serves the money reference fixture's prices", async () => {
    const catalogue = await cashierACaller.catalogue.getDefaultCatalogue();
    expect(catalogue.currency).toBe("PHP");
    const water = catalogue.canteen.find((item) => item.id === "bottled_water");
    expect(water!.price).toBe(CANTEEN_CATALOGUE.bottled_water.price);
    expect(catalogue.addons.find((item) => item.id === "extension_charge")!.cashierPostable).toBe(false);
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });
});
