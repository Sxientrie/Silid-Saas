import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OVERSTAY_DEFAULTS, WORKED_EXAMPLES } from "@silid/db";
import { createTestCaller, createTrpcContext, type Caller, type SilidDataClient } from "../src/index.js";
import { integrationEnv } from "./helpers/integration-env.js";

/**
 * LIVE session-procedure proofs against the linked Supabase project (the
 * recorded substitution for the local stack on this Docker-less host):
 * check-in/check-out through the real API path with real Postgres RLS, the
 * sealing RPC, and the database's own constraints (roadmap 06 Deliverables
 * 1, 5, and the API-layer half of 6; the desk-level clips are the E2E
 * battery's). Skipped when the gitignored local env is absent.
 *
 * Money figures import from the money reference fixture (MONEY REFERENCE
 * RULE) — no peso figure is re-typed here. The overstay clock is forced at
 * the FIXTURE layer (booked_end pulled back by the elevated test client);
 * the checkout instant itself stays the server's clock, because the API
 * surface never passes the RPC's test-seam timestamp (Invariant 2a).
 *
 * Residue discipline (the Phase 04 recorded pattern): the service_role's
 * grants are deliberately scoped (migration 20260925093000), so transactional
 * fixtures ride REAL ROLES — rooms by an org admin, the shift by a cashier,
 * the sibling-branch session by that branch's own cashier. The afterAll
 * sweeps everything the service key can reach (staff, branches, org, auth
 * users) and prints the org id; the builder sweeps the remaining transactional
 * rows via the MCP path after the run, audit rows FIRST.
 */
const env = integrationEnv();

describe.skipIf(!env.ready)("session procedures (linked project, live)", () => {
  const url = env.supabaseUrl!;
  const publishableKey = env.publishableKey!;
  const run = `p06${Date.now()}`;
  const password = `pa55-${run}-x`;

  let admin: SupabaseClient;
  const orgA = crypto.randomUUID();
  const branchA1 = crypto.randomUUID();
  const branchA2 = crypto.randomUUID();
  const createdUserIds: string[] = [];
  const roomIds: string[] = [];
  const emails = {
    adminA: `${run}-admin@silid-test.local`,
    cashier1: `${run}-c1@silid-test.local`,
    cashier2: `${run}-c2@silid-test.local`,
    cashier3: `${run}-c3@silid-test.local`, // branch A2 — the sibling-branch fixture
  };
  let cashier1: ReturnType<typeof createTestCaller>;
  let cashier2: ReturnType<typeof createTestCaller>;
  let cashier3: ReturnType<typeof createTestCaller>;
  let cashier2Raw: SupabaseClient;
  let adminARaw: SupabaseClient;
  let staffId1 = "";

  /** Expected sealed total for a stay, straight from the fixture's worked examples. */
  function expectedTotal(bookingType: "short_time" | "overnight", pax: number): number {
    const example = WORKED_EXAMPLES.find((e) => e.booking_type === bookingType && e.pax === pax);
    if (example === undefined) throw new Error(`no worked example for ${bookingType} pax ${pax}`);
    return example.total;
  }

  /**
   * Force the overstay clock at the fixture layer through the SAME tooling
   * path the repo's SQL proofs use: `supabase db query --linked`, running as
   * the migration owner. The service key deliberately has no sessions grant
   * (migration 20260925093000), and the API surface has no timestamp
   * parameter (Invariant 2a), so a test that needs booked_end in the past
   * goes through the sanctioned SQL path — a fixture action, not a client
   * path. (The CLI prints nothing for a command tag, so callers assert the
   * effect by reading the row back.)
   */
  function forceBookedEndViaCli(sessionId: string, bookedEndIso: string): void {
    const repoRoot = resolve(process.cwd(), "../..");
    const dir = mkdtempSync(join(tmpdir(), "p06-force-"));
    try {
      const file = join(dir, "force.sql");
      writeFileSync(file, `update public.sessions set booked_end_at = '${bookedEndIso}' where id = '${sessionId}';\n`);
      execSync("pnpm exec supabase db query --linked -f " + JSON.stringify(file), {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    admin = createClient(url, env.serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: orgError } = await admin.from("organizations").insert({ id: orgA, name: `Sessions live ${run}` });
    expect(orgError).toBeNull();
    // Branches take the seeded rate_config default — the full fixture card.
    const { error: branchError } = await admin.from("branches").insert([
      { id: branchA1, org_id: orgA, name: "S1" },
      { id: branchA2, org_id: orgA, name: "S2" },
    ]);
    expect(branchError).toBeNull();

    const provision = async (
      email: string,
      claims: { role: string; org_id: string | null; branch_id: string | null },
    ): Promise<string> => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: claims,
      });
      expect(error).toBeNull();
      createdUserIds.push(data!.user!.id);
      return data!.user!.id;
    };
    const adminAId = await provision(emails.adminA, { role: "org_admin", org_id: orgA, branch_id: null });
    staffId1 = await provision(emails.cashier1, { role: "cashier", org_id: orgA, branch_id: branchA1 });
    const staffId2 = await provision(emails.cashier2, { role: "cashier", org_id: orgA, branch_id: branchA1 });
    const staffId3 = await provision(emails.cashier3, { role: "cashier", org_id: orgA, branch_id: branchA2 });
    const { error: staffError } = await admin.from("staff").insert([
      { id: adminAId, org_id: orgA, branch_id: null, email: emails.adminA, role: "org_admin", display_name: "Admin A" },
      { id: staffId1, org_id: orgA, branch_id: branchA1, email: emails.cashier1, role: "cashier", display_name: "Cashier One" },
      { id: staffId2, org_id: orgA, branch_id: branchA1, email: emails.cashier2, role: "cashier", display_name: "Cashier Two" },
      { id: staffId3, org_id: orgA, branch_id: branchA2, email: emails.cashier3, role: "cashier", display_name: "Cashier Three" },
    ]);
    expect(staffError).toBeNull();

    const [r101, r102, r201] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    roomIds.push(r101!, r102!, r201!);
    // Rooms are written by the organization tier through the real policy.
    adminARaw = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${await accessTokenFor(emails.adminA)}` } },
    });
    const { error: roomsError } = await adminARaw.from("rooms").insert([
      { id: r101, org_id: orgA, branch_id: branchA1, room_number: "101" },
      { id: r102, org_id: orgA, branch_id: branchA1, room_number: "102" },
      { id: r201, org_id: orgA, branch_id: branchA2, room_number: "201" },
    ]);
    expect(roomsError).toBeNull();

    const ctx1 = await contextFor(emails.cashier1);
    const ctx2 = await contextFor(emails.cashier2);
    const ctx3 = await contextFor(emails.cashier3);
    cashier1 = createTestCaller(ctx1.caller, ctx1.data);
    cashier2 = createTestCaller(ctx2.caller, ctx2.data);
    cashier3 = createTestCaller(ctx3.caller, ctx3.data);
    adminARaw = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${await accessTokenFor(emails.adminA)}` } },
    });
    cashier2Raw = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${await accessTokenFor(emails.cashier2)}` } },
    });
  }, 60_000);

  afterAll(async () => {
    if (!env.ready) return;
    // What the scoped service grants allow: staff, branches, org, auth users.
    // The transactional rows (sessions, addons, shifts, rooms, audit) and any
    // remaining staff children are swept by the builder via the MCP path
    // after the run, audit rows first (the Phase 04 recorded discipline).
    console.log(`[sessions.live] MCP sweep target org: ${orgA}`);
    await admin.from("staff").delete().eq("org_id", orgA);
    await admin.from("branches").delete().eq("org_id", orgA);
    await admin.from("organizations").delete().eq("id", orgA);
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("the fixture's open shifts exist only through the cashiers' own policies (vault-13 precondition)", async () => {
    // The shift lifecycle is Phase 08's surface; the fixture opens the shifts
    // through the real insert policies (cashier + claim branch + own id).
    const openShift = async (email: string, staffId: string, branchId: string): Promise<void> => {
      const raw = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${await accessTokenFor(email)}` } },
      });
      const { error } = await raw.from("shifts").insert({
        org_id: orgA,
        branch_id: branchId,
        opened_by: staffId,
        status: "open",
      });
      expect(error).toBeNull();
    };
    const { data: staff } = await admin.from("staff").select("id, email").eq("org_id", orgA);
    const byEmail = new Map((staff ?? []).map((row) => [row.email as string, row.id as string]));
    await openShift(emails.cashier1, byEmail.get(emails.cashier1)!, branchA1);
    await openShift(emails.cashier3, byEmail.get(emails.cashier3)!, branchA2);
  });

  it("check-in seals time and derives the booked end server-side (vault-04, vault-10)", async () => {
    const beforeMs = Date.now() - 5_000;
    const session = await cashier1.sessions.createSession({
      roomId: roomIds[0]!,
      bookingType: "short_time",
      pax: 2,
    });
    const checkedInMs = Date.parse(session.checkedInAt);
    expect(checkedInMs).toBeGreaterThanOrEqual(beforeMs);
    // booked_end = check-in + 180 minutes for short time (fixture duration).
    expect(Date.parse(session.bookedEndAt) - checkedInMs).toBe(180 * 60_000);
    expect(session.status).toBe("active");
    expect(session.baseRate).toBe("0"); // money seals at checkout, not check-in
    // The room flipped in the same server-side write.
    const rooms = await cashier1.rooms.listRooms({});
    expect(rooms.find((room) => room.id === roomIds[0])?.status).toBe("occupied");
  });

  it("TWO CASHIERS, ONE ROOM, SAME INSTANT: exactly one check-in succeeds (vault-16)", async () => {
    // Fire both through the real API path at the same instant. The database
    // serializes on the branch lock; the loser must be cleanly rejected by
    // the constraint layer — either the vacant-room guard or the partial
    // unique index — never half-applied.
    const [winner, loser] = await Promise.allSettled([
      cashier1.sessions.createSession({ roomId: roomIds[1]!, bookingType: "short_time", pax: 3 }),
      cashier2.sessions.createSession({ roomId: roomIds[1]!, bookingType: "short_time", pax: 2 }),
    ]);
    const successes: Array<PromiseFulfilledResult<{ id: string }>> = [];
    const failures: PromiseRejectedResult[] = [];
    for (const outcome of [winner, loser]) {
      if (outcome.status === "fulfilled") successes.push(outcome);
      else failures.push(outcome);
    }
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const reason = String((failures[0]!.reason as Error)?.message ?? failures[0]!.reason);
    expect(
      /one_active_session_per_room|room must be vacant/i.test(reason),
      `expected a database-constraint rejection, got: ${reason}`,
    ).toBe(true);
    // Exactly one active session exists for the room, verified server-side.
    const sessions = await cashier1.sessions.listSessions({});
    const active = sessions.filter((s) => s.roomId === roomIds[1] && s.status === "active");
    expect(active).toHaveLength(1);
  });

  it("a check-in naming a room in a sibling branch never leaves the claim branch", async () => {
    await expect(
      cashier2.sessions.createSession({ roomId: roomIds[2]!, bookingType: "short_time", pax: 2 }),
    ).rejects.toThrow(/room must be vacant in the cashier branch/i);
  });

  it("sealed within-grace totals equal the fixture goldens (2-pax short-time, and the race's winner by its own pax)", async () => {
    const sessions = await cashier1.sessions.listSessions({});
    const room101 = sessions.find((s) => s.roomId === roomIds[0] && s.status === "active");
    const room102 = sessions.find((s) => s.roomId === roomIds[1] && s.status === "active");
    expect(room101).toBeDefined();
    expect(room102).toBeDefined();
    const sealed101 = await cashier1.sessions.closeSession({ sessionId: room101!.id });
    expect(Number(sealed101.total)).toBe(expectedTotal("short_time", 2));
    expect(sealed101.session.status).toBe("closed");
    expect(sealed101.session.checkedOutAt).not.toBeNull();
    // The room was released in the same transaction.
    const rooms = await cashier1.rooms.listRooms({});
    expect(rooms.find((room) => room.id === roomIds[0])?.status).toBe("vacant");
    // Double close refused.
    await expect(cashier1.sessions.closeSession({ sessionId: room101!.id })).rejects.toThrow(/not active/i);
    // The race's winner seals by its own pax (3 → ₱650, 2 → ₱450), straight
    // from the fixture either way.
    const sealed102 = await cashier2.sessions.closeSession({ sessionId: room102!.id });
    expect(Number(sealed102.total)).toBe(expectedTotal("short_time", room102!.pax));
  });

  it("a 5-pax overnight forced 61 minutes past grace seals base + surcharge + two blocks", { timeout: 120_000 }, async () => {
    const overnight5 = WORKED_EXAMPLES.find((e) => e.booking_type === "overnight" && e.pax === 5)!;
    // Check into the room freed by the checkout above.
    const session = await cashier1.sessions.createSession({
      roomId: roomIds[0]!,
      bookingType: "overnight",
      pax: 5,
    });
    expect(session.baseRate).toBe("0");

    // Force the overstay clock at the FIXTURE layer: the booked end moves so
    // the server's own checkout instant lands 61 minutes past grace. The
    // checkout instant itself is the database clock — the API surface has no
    // timestamp parameter (Invariant 2a), and the fixture runs the update
    // through the sanctioned CLI SQL path (see forceBookedEndViaCli).
    const forcedBookedEnd = new Date(Date.now() - (OVERSTAY_DEFAULTS.grace_minutes + 61) * 60_000).toISOString();
    forceBookedEndViaCli(session.id, forcedBookedEnd);
    // The force landed (the CLI prints no command tag, so read it back).
    const forced = await cashier1.sessions.getSession({ sessionId: session.id });
    expect(Date.parse(forced!.bookedEndAt)).toBe(Date.parse(forcedBookedEnd));

    const result = await cashier1.sessions.closeSession({ sessionId: session.id });
    const expected = overnight5.total + 2 * OVERSTAY_DEFAULTS.block_charge;
    expect(Number(result.total)).toBe(expected);

    // The deficit posted as extension rows — exactly the two blocks. The
    // reads ride the org admin's real policy (the service key has no grants
    // on these tables by design).
    const { data: addonRows } = await adminARaw
      .from("session_addons")
      .select("*")
      .eq("session_id", session.id)
      .eq("item", "extension_charge");
    expect(addonRows ?? []).toHaveLength(1); // one deficit row
    expect(addonRows![0]!.qty).toBe(2);
    expect(Number(addonRows![0]!.total)).toBe(2 * OVERSTAY_DEFAULTS.block_charge);

    // The audit row rides the same transaction, actor and time sealed.
    const { data: auditRows } = await adminARaw
      .from("audit_log")
      .select("*")
      .eq("target_table", "sessions")
      .eq("target_id", session.id)
      .eq("action", "check_out");
    expect(auditRows ?? []).toHaveLength(1);
  });

  it("checkout vs check-in on the same room serialize on the branch lock — no torn state", async () => {
    const checkIn = await cashier1.sessions.createSession({
      roomId: roomIds[1]!,
      bookingType: "short_time",
      pax: 1,
    });
    // Both at once: cashier1 closes the session, cashier2 checks into the
    // same room. The branch lock picks the order; the end state is consistent
    // either way — the room frees then re-occupies, or the check-in is
    // refused and the close proceeds.
    const [closeResult, checkInResult] = await Promise.allSettled([
      cashier1.sessions.closeSession({ sessionId: checkIn.id }),
      cashier2.sessions.createSession({ roomId: roomIds[1]!, bookingType: "short_time", pax: 2 }),
    ]);
    const sessions = await cashier1.sessions.listSessions({});
    const activeForRoom = sessions.filter((s) => s.roomId === roomIds[1] && s.status === "active");
    if (closeResult.status === "fulfilled" && checkInResult.status === "rejected") {
      // Close won: the session is closed and the room freed.
      expect(activeForRoom).toHaveLength(0);
    } else if (closeResult.status === "fulfilled" && checkInResult.status === "fulfilled") {
      // Close freed the room, then the check-in legitimately succeeded —
      // exactly one active session remains for the room.
      expect(activeForRoom).toHaveLength(1);
      expect(activeForRoom[0]!.id).toBe(checkInResult.value.id);
    } else {
      // Close-rejected is impossible (the close always finds its session), so
      // any other combination is a torn state worth failing on.
      expect.unreachable(`torn state: ${JSON.stringify(closeResult)} / ${JSON.stringify(checkInResult)}`);
    }
    // Deterministic handoff to the next test: close whatever is active.
    for (const active of activeForRoom) {
      await cashier1.sessions.closeSession({ sessionId: active.id });
    }
  });

  it("a tampered client figure changes nothing server-side (Invariant 2c)", async () => {
    const session = await cashier1.sessions.createSession({
      roomId: roomIds[0]!,
      bookingType: "short_time",
      pax: 2,
    });
    // Direct PostgREST patch with the caller's own token: sessions carry no
    // UPDATE policy, so the write is refused at the database door.
    const { error, status } = await cashier2Raw.from("sessions").update({ total: "1", base_rate: "999" }).eq("id", session.id);
    expect(error).not.toBeNull();
    expect(status).toBeGreaterThanOrEqual(400);
    const reread = await cashier1.sessions.getSession({ sessionId: session.id });
    expect(reread?.total).toBe("0"); // still the pre-seal default, untouched
    // Checkout computes from configuration, never from the client's figure.
    const result = await cashier1.sessions.closeSession({ sessionId: session.id });
    expect(Number(result.total)).toBe(expectedTotal("short_time", 2));
  });

  it("a 5-pax short-time seals the fixture's fifth figure (₱1,050)", async () => {
    const session = await cashier1.sessions.createSession({
      roomId: roomIds[1]!,
      bookingType: "short_time",
      pax: 5,
    });
    const result = await cashier1.sessions.closeSession({ sessionId: session.id });
    expect(Number(result.total)).toBe(expectedTotal("short_time", 5));
  });

  it("a session outside the caller's branch is invisible and uncloseable", async () => {
    // Room 201 belongs to branch A2: its own cashier checks in (the real
    // path), and cashier1 of branch A1 can neither read nor close it.
    const session = await cashier3.sessions.createSession({
      roomId: roomIds[2]!,
      bookingType: "short_time",
      pax: 2,
    });
    expect(await cashier1.sessions.getSession({ sessionId: session.id })).toBeNull();
    await expect(cashier1.sessions.closeSession({ sessionId: session.id })).rejects.toThrow(
      /outside caller scope/i,
    );
    // The sibling-branch cashier closes cleanly — the session never leaks.
    const sealed = await cashier3.sessions.closeSession({ sessionId: session.id });
    expect(Number(sealed.total)).toBe(expectedTotal("short_time", 2));
  });
});
