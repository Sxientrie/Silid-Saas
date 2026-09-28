import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { OVERSTAY_DEFAULTS, WORKED_EXAMPLES } from "../../packages/db/src/money-reference";
import { formatPeso } from "../../packages/utils/src/overstay";

/**
 * Roadmap 06 Deliverables 5–6 — the desk-level money proofs and concurrency
 * clips, run against the linked Supabase project through the REAL UI path:
 * sign-in, the check-in form with its payment-confirmation gate, the
 * check-out flow displaying the sealed total, the overstay ladder, and the
 * offline write contract. Video recording is on in the workspace config;
 * every clip lands in /Silid/reports/proof/e2e/.
 *
 * Money figures import from the money reference fixture (MONEY REFERENCE
 * RULE) and their display strings from the shared formatter — nothing here
 * re-types a peso. The overstay clock is forced at the fixture layer through
 * `supabase db query --linked` (the repo's sanctioned SQL proof path); the
 * checkout instant itself is always the server's clock, because the desk's
 * check-out sends the session id alone (Invariant 2a).
 *
 * Residue discipline (the Phase 04/06 recorded pattern): the scoped service
 * grants cannot delete transactional rows, so afterAll sweeps what it can and
 * prints the org id; the builder sweeps the rest via the MCP path, audit rows
 * first.
 */

function loadLocalEnv(): void {
  for (const candidate of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "../../.env.local")]) {
    try {
      for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        if (!(key(trimmed) in process.env)) process.env[key(trimmed)] = value(trimmed);
      }
      return;
    } catch {
      // try the next candidate
    }
  }
  function key(line: string): string {
    return line.slice(0, line.indexOf("=")).trim();
  }
  function value(line: string): string {
    return line.slice(line.indexOf("=") + 1).trim();
  }
}
loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && publishableKey && serviceKey);

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

interface LedgerEntry {
  label: string;
  sessionId: string;
  bookingType: string;
  pax: number;
  bookedEndAt: string;
  checkedOutAt: string;
  sealedTotal: number;
  addons: Array<{ item: string; qty: number; unitPrice: number; total: number }>;
}

const ledger: LedgerEntry[] = [];
let ledgerPath: string | null = null;

function writeLedger(): void {
  if (ledgerPath === null) return;
  writeFileSync(ledgerPath, JSON.stringify({ generatedAt: new Date().toISOString(), runs: ledger }, null, 2));
}

async function signedInDesk(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel("Staff identifier").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  // The dashboard's queries are client-side: wait for the server's data.
  await expect(page.getByTestId("room-grid")).toBeVisible({ timeout: 30_000 });
}

/** Check in through the desk form and return when the room shows occupied. */
async function checkInViaDesk(
  page: Page,
  roomNumber: string,
  stay: "short_time" | "overnight",
  pax: number,
): Promise<void> {
  await page.getByTestId("check-in-room").selectOption({ label: `Room ${roomNumber}` });
  await page.getByTestId("check-in-stay").selectOption(stay);
  await page.getByTestId("check-in-pax").fill(String(pax));
  // The payment-confirmation gate: the form refuses to submit until the
  // cashier confirms FULL payment was collected (vault-10's house rule).
  await page.getByTestId("check-in-payment").check();
  await page.getByTestId("check-in-submit").click();
  await expect(page.getByTestId("check-in-status")).toContainText("checked in", { timeout: 30_000 });
  await expect(page.getByTestId(`room-status-${roomNumber}`)).toHaveText("occupied", { timeout: 30_000 });
}

/** Check out through the desk flow and assert the sealed total the server returned. */
async function checkOutViaDesk(page: Page, roomNumber: string, roomToSession: Map<string, string>, expectedPhp: number): Promise<void> {
  const sessionId = roomToSession.get(roomNumber);
  expect(sessionId).toBeTruthy();
  await page.getByTestId("check-out-session").selectOption(sessionId!);
  await page.getByTestId("check-out-confirm").click();
  // The desk displays the SEALED figure — the server's own number.
  await expect(page.getByTestId("check-out-sealed-total")).toHaveText(
    `Sealed total ${formatPeso(expectedPhp)}`,
    { timeout: 30_000 },
  );
  await expect(page.getByTestId(`room-status-${roomNumber}`)).toHaveText("vacant", { timeout: 30_000 });
}

test.describe("sessions & rooms money proofs (linked project)", () => {
  test.skip(!ready, "live Supabase env not configured — the gitignored .env.local is absent");

  const run = `p06e2e${Date.now()}`;
  const password = `pa55-${run}-x`;
  const orgName = `Sessions E2E ${run}`;
  const emails = {
    cashier1: `${run}-c1@silid-test.local`,
    cashier2: `${run}-c2@silid-test.local`,
  };

  let admin: SupabaseClient;
  let cashier1Raw: SupabaseClient;
  let cashier2Raw: SupabaseClient;
  let orgId = "";
  let branchId = "";
  let cashier1Id = "";
  const rooms: Record<string, string> = {}; // room number → id
  const sessionIds: string[] = [];
  const roomToSession = new Map<string, string>();
  let staffEmails: string[] = [];

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const proofDir = resolve(process.cwd(), "reports/proof/phase-06");
    mkdirSync(proofDir, { recursive: true });
    ledgerPath = join(proofDir, "session-ledger.json");

    const { data: org } = await admin.from("organizations").insert({ name: orgName }).select("id").single();
    orgId = org!.id;
    const { data: branch } = await admin.from("branches").insert({ org_id: orgId, name: "E2E Branch" }).select("id").single();
    branchId = branch!.id; // rate_config defaults to the full fixture card

    const provision = async (email: string, branchIdClaim: string | null): Promise<string> => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: "cashier", org_id: orgId, branch_id: branchIdClaim },
      });
      expect(error).toBeNull();
      return data!.user!.id;
    };
    cashier1Id = await provision(emails.cashier1, branchId);
    const cashier2Id = await provision(emails.cashier2, branchId);
    const { error: staffError } = await admin.from("staff").insert([
      { id: cashier1Id, org_id: orgId, branch_id: branchId, email: emails.cashier1, role: "cashier", display_name: "Desk One" },
      { id: cashier2Id, org_id: orgId, branch_id: branchId, email: emails.cashier2, role: "cashier", display_name: "Desk Two" },
    ]);
    expect(staffError).toBeNull();
    staffEmails = [emails.cashier1, emails.cashier2];

    const asRaw = async (email: string): Promise<SupabaseClient> => {
      const signIn = createClient(url!, publishableKey!);
      const { error } = await signIn.auth.signInWithPassword({ email, password });
      expect(error).toBeNull();
      return signIn;
    };
    cashier1Raw = await asRaw(emails.cashier1);
    cashier2Raw = await asRaw(emails.cashier2);

    // vault-13 precondition: the money-bearing desk actions require an open
    // shift, opened through the cashier's own insert policy.
    const { error: shiftError } = await cashier1Raw.from("shifts").insert({
      org_id: orgId,
      branch_id: branchId,
      opened_by: cashier1Id,
      status: "open",
    });
    expect(shiftError).toBeNull();

    // Rooms are organization-tier data; the desk consumes them. The E2E
    // fixture uses the same as-caller shape the live tests prove.
    for (const number of ["101", "102", "103", "104", "105", "106"]) {
      const id = crypto.randomUUID();
      rooms[number] = id;
    }
    // Service key holds no rooms grant — use the sealed-insert path via SQL
    // through the CLI (same sanctioned fixture path as the live tests).
    forceRoomSetupViaCli();
  });

  /** Rooms via the CLI SQL path (the service key has no rooms grant by design). */
  function forceRoomSetupViaCli(): void {
    const repoRoot = resolve(process.cwd());
    const dir = mkdtempSync(join(tmpdir(), "p06e2e-"));
    try {
      const file = join(dir, "rooms.sql");
      const values = Object.entries(rooms)
        .map(([number, id]) => `('${id}', '${orgId}', '${branchId}', '${number}')`)
        .join(", ");
      writeFileSync(file, `insert into public.rooms (id, org_id, branch_id, room_number) values ${values};\n`);
      execSync("pnpm exec supabase db query --linked -f " + JSON.stringify(file), {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function forceBookedEndViaCli(sessionId: string, bookedEndIso: string): void {
    const repoRoot = resolve(process.cwd());
    const dir = mkdtempSync(join(tmpdir(), "p06e2e-"));
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

  /** Record the sealed session and its posted rows for the recomputation gate. */
  async function recordLedgerEntry(label: string, sessionId: string): Promise<void> {
    const { data: session } = await cashier1Raw.from("sessions").select("*").eq("id", sessionId).single();
    const { data: addons } = await cashier1Raw.from("session_addons").select("*").eq("session_id", sessionId);
    expect(session).toBeTruthy();
    ledger.push({
      label,
      sessionId,
      bookingType: session!.booking_type,
      pax: session!.pax,
      bookedEndAt: session!.booked_end_at,
      checkedOutAt: session!.checked_out_at!,
      sealedTotal: Number(session!.total),
      addons: (addons ?? []).map((row) => ({
        item: row.item as string,
        qty: row.qty as number,
        unitPrice: Number(row.unit_price),
        total: Number(row.total),
      })),
    });
    writeLedger();
  }

  test.afterAll(async () => {
    if (!ready) return;
    console.log(`[sessions-money E2E] MCP sweep target org: ${orgId}`);
    writeLedger();
    await admin.from("staff").delete().eq("org_id", orgId);
    await admin.from("branches").delete().eq("org_id", branchId);
    await admin.from("organizations").delete().eq("id", orgId);
    for (const email of [...staffEmails]) {
      const { data: listed } = await admin.auth.admin.listUsers();
      for (const user of listed.users) {
        if (user.email !== null && staffEmails.includes(user.email)) await admin.auth.admin.deleteUser(user.id);
      }
    }
  });

  test("a 2-pax short-time checked out within grace seals exactly the fixture's ₱450", async ({ page }) => {
    await signedInDesk(page, emails.cashier1, password);
    await checkInViaDesk(page, "101", "short_time", 2);
    // Ladder: a fresh session sits in the booked phase.
    await expect(page.getByTestId("overstay-ladder")).toBeVisible();

    // The room grid reflects the server's write and nothing else.
    const { data: session } = await cashier1Raw
      .from("sessions")
      .select("id")
      .eq("room_id", rooms["101"]!)
      .eq("status", "active")
      .single();
    sessionIds.push(session!.id);
    roomToSession.set("101", session!.id);

    const expected = WORKED_EXAMPLES.find((e) => e.booking_type === "short_time" && e.pax === 2)!.total;
    await checkOutViaDesk(page, "101", roomToSession, expected);
    await recordLedgerEntry("2-pax short-time within grace", session!.id);
  });

  test("a 3-pax short-time seals ₱650 and a 5-pax overnight seals ₱2,000", async ({ page }) => {
    await signedInDesk(page, emails.cashier1, password);
    for (const [room, stay, pax] of [
      ["102", "short_time", 3],
      ["103", "overnight", 5],
    ] as const) {
      await checkInViaDesk(page, room, stay, pax);
      const { data: session } = await cashier1Raw
        .from("sessions")
        .select("id")
        .eq("room_id", rooms[room]!)
        .eq("status", "active")
        .single();
      sessionIds.push(session!.id);
      roomToSession.set(room, session!.id);
      const expected = WORKED_EXAMPLES.find((e) => e.booking_type === stay && e.pax === pax)!.total;
      await checkOutViaDesk(page, room, roomToSession, expected);
      await recordLedgerEntry(`${pax}-pax ${stay}`, session!.id);
    }
  });

  test("a 5-pax overnight forced 61 minutes past grace shows the accruing ladder and seals ₱2,300", async ({ page }) => {
    await signedInDesk(page, emails.cashier1, password);
    await checkInViaDesk(page, "104", "overnight", 5);
    const { data: session } = await cashier1Raw
      .from("sessions")
      .select("id, booked_end_at")
      .eq("room_id", rooms["104"]!)
      .eq("status", "active")
      .single();
    sessionIds.push(session!.id);
    roomToSession.set("104", session!.id);

    // Force the overstay clock at the fixture layer: booked end lands 86
    // minutes ago — 61 minutes past the 25-minute grace — so the desk's
    // ladder shows overdue with two started blocks accruing (vault-05/06).
    const forced = new Date(Date.now() - (OVERSTAY_DEFAULTS.grace_minutes + 61) * 60_000).toISOString();
    forceBookedEndViaCli(session!.id, forced);

    // The 15-second design poll (or the next refetch) brings the ladder's
    // overdue phase; assert on the desk's display figure.
    const expectedBlocks = 2; // ceil(61 / 60)
    await expect(
      page.getByTestId("overstay-ladder").getByText(`accruing ${formatPeso(expectedBlocks * OVERSTAY_DEFAULTS.block_charge)}`),
    ).toBeVisible({ timeout: 30_000 });

    const expected = WORKED_EXAMPLES.find((e) => e.booking_type === "overnight" && e.pax === 5)!.total + expectedBlocks * OVERSTAY_DEFAULTS.block_charge;
    await checkOutViaDesk(page, "104", roomToSession, expected);
    await recordLedgerEntry("5-pax overnight 61min past grace", session!.id);
  });

  test("two cashiers, one room, same instant: exactly one desk succeeds and the other sees why", async ({ browser }) => {
    // Contexts are created by hand (two independent sign-ins need two
    // independent cookie jars), so the config's video option does not apply —
    // record explicitly and rename the clips once the contexts close.
    const clipDir = resolve(process.cwd(), "reports/proof/e2e");
    const deskA = await browser.newContext({
      recordVideo: { dir: clipDir, size: { width: 1280, height: 720 } },
    });
    const deskB = await browser.newContext({
      recordVideo: { dir: clipDir, size: { width: 1280, height: 720 } },
    });
    const pageA = await deskA.newPage();
    const pageB = await deskB.newPage();
    const videoA = pageA.video();
    const videoB = pageB.video();
    await signedInDesk(pageA, emails.cashier1, password);
    await signedInDesk(pageB, emails.cashier2, password);

    for (const page of [pageA, pageB]) {
      await page.getByTestId("check-in-room").selectOption({ label: "Room 105" });
      await page.getByTestId("check-in-stay").selectOption("short_time");
      await page.getByTestId("check-in-pax").fill("2");
      await page.getByTestId("check-in-payment").check();
    }
    // A genuine same-instant race: both desks submit at the same barrier.
    const barrier = Date.now() + 2_000;
    await Promise.all(
      [pageA, pageB].map((page) =>
        page.evaluate(
          ({ at }) =>
            new Promise<void>((resolveClick) => {
              setTimeout(() => {
                (document.querySelector('[data-testid="check-in-submit"]') as HTMLButtonElement | null)?.click();
                resolveClick();
              }, Math.max(at - Date.now(), 0));
            }),
          { at: barrier },
        ),
      ),
    );
    const statuses = await Promise.all(
      [pageA, pageB].map((page) => page.getByTestId("check-in-status").innerText({ timeout: 30_000 })),
    );
    const winners = statuses.filter((text) => text.includes("checked in"));
    const losers = statuses.filter((text) => /room must be vacant|one_active_session_per_room/i.test(text));
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // Exactly one active session exists for the room, verified server-side.
    const { data: active } = await cashier1Raw
      .from("sessions")
      .select("id")
      .eq("room_id", rooms["105"]!)
      .eq("status", "active");
    expect(active ?? []).toHaveLength(1);
    sessionIds.push((active!)[0]!.id);
    roomToSession.set("105", (active!)[0]!.id);

    // Close the desks, then name the clips for the acceptance report.
    const pathA = (await videoA?.path()) ?? null;
    const pathB = (await videoB?.path()) ?? null;
    await deskA.close();
    await deskB.close();
    if (pathA !== null) {
      renameSync(pathA, join(clipDir, "two-cashiers-one-room-desk-a.webm"));
    }
    if (pathB !== null) {
      renameSync(pathB, join(clipDir, "two-cashiers-one-room-desk-b.webm"));
    }
  });

  test("a check-in queued offline and replayed into a since-occupied room surfaces the rejection", async ({ page }) => {
    await signedInDesk(page, emails.cashier1, password);

    // The desk loses the link and queues the check-in durably (the write
    // contract's offline branch; the reachability probe is the authority).
    await page.context().setOffline(true);
    await expect(page.getByTestId("sync-connectivity")).toHaveText("offline", { timeout: 30_000 });
    await page.getByTestId("check-in-room").selectOption({ label: "Room 106" });
    await page.getByTestId("check-in-stay").selectOption("short_time");
    await page.getByTestId("check-in-pax").fill("2");
    await page.getByTestId("check-in-payment").check();
    await page.getByTestId("check-in-submit").click();
    await expect(page.getByTestId("check-in-status")).toContainText("queued", { timeout: 30_000 });
    await expect(page.getByTestId("sync-pending-money")).toContainText("1", { timeout: 30_000 });

    // While the desk is dark, the room is occupied through the real API path.
    const { data: session, error } = await cashier2Raw.from("sessions").insert({
      room_id: rooms["106"]!,
      booking_type: "short_time",
      pax: 2,
      cashier_id: (await cashier2Raw.auth.getUser()).data.user!.id,
    }).select("id").single();
    expect(error).toBeNull();
    sessionIds.push(session!.id);
    roomToSession.set("106", session!.id);

    // The link returns; the desk's own probe confirms it (the 5s probe
    // interval is the authority — Playwright's emulation fires no events),
    // then the drain replays the queued check-in into the now occupied room
    // and the database refuses it. The desk surfaces the rejection as a
    // failed check-in — not a silent drop (spec/offline-sync.md §4).
    await page.context().setOffline(false);
    await expect(page.getByTestId("sync-connectivity")).toHaveText("online", { timeout: 15_000 });
    await page.getByTestId("sync-reconnect").click();
    await expect(page.getByTestId("sync-status")).toContainText("1 rejected", { timeout: 30_000 });
    await expect(page.locator("[data-testid^='desk-outbox-row-']").first()).toContainText("errored", {
      timeout: 30_000,
    });
    await expect(
      page.locator("[data-testid^='desk-outbox-error-']").first(),
    ).toContainText(/room must be vacant|one_active_session_per_room/i, { timeout: 30_000 });

    // The occupying session stands; the room never double-booked.
    const { data: active } = await cashier1Raw
      .from("sessions")
      .select("id")
      .eq("room_id", rooms["106"]!)
      .eq("status", "active");
    expect(active ?? []).toHaveLength(1);
    expect((active!)[0]!.id).toBe(session!.id);
  });
});
