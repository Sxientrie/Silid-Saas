import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 05 Deliverable 6 — the offline write contract, proven in a browser
 * with the network switched off (`spec/offline-sync.md` §6). Video recording
 * is on in the workspace config and every clip lands in
 * `/Silid/reports/proof/e2e/`.
 *
 * The battery runs unauthenticated and against the harness-only double
 * (Deliverable 6's explicit allowance): queueing a write needs no identity,
 * and the whole point of the scenarios is the outage. Nothing here touches
 * business data, so nothing here can move a peso.
 *
 * The worker is the reason these tests are shaped the way they are: the first
 * navigation of a fresh context happens before the worker controls the page, so
 * the shell's HTML only enters the runtime cache on a *second* visit. Every
 * test therefore boots through `bootDesk`, which waits for the registration
 * and reloads once. A test that skipped that step would be testing the
 * network, not the cache.
 */

const HARNESS = "/harness";

/**
 * Every scenario here cold-boots a service worker, mirrors a cache, and records
 * a video. The 30s default is the budget for the whole test, and the worker
 * install alone can eat it when four workers are installing at the same time —
 * which is a scheduling fact, not a product latency claim, and so it gets its
 * own budget rather than a `ready` that is allowed to give up early.
 */
test.describe.configure({ timeout: 90_000 });

/**
 * Unique per test: the server's accept log and the read route's ledger count
 * are both scoped by run, so a collision between two workers would let one
 * scenario read another's writes. The worker pid is in the id because a
 * per-process counter alone can collide across workers in the same millisecond.
 */
let runCounter = 0;
function nextRun(prefix: string): string {
  runCounter += 1;
  return `${prefix}_${process.pid}_${Date.now()}_${runCounter}`;
}

/**
 * Cold-boot the desk: first visit registers the worker, the reload is the
 * worker-controlled visit that fills the runtime cache.
 *
 * The registration is asked for explicitly rather than only awaited. Serwist
 * registers the worker from the client bundle, and `ready` alone would sit
 * there for however long that took; under a parallel run with a dozen contexts
 * installing a worker each, that is a 30-second budget spent waiting for
 * something the test could have started.
 */
async function bootDesk(page: Page, run: string): Promise<void> {
  await page.goto(`${HARNESS}?run=${run}`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByTestId("connectivity-badge")).toHaveText("online", { timeout: 30_000 });
  await expect(page.getByTestId("probe-now")).toBeVisible();
}

test.describe("the Frontdesk installs and boots with no network", () => {
  test("the manifest is installable and the worker controls the desk", async ({ page, request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const body = (await manifest.json()) as {
      name: string;
      display: string;
      start_url: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    // display: standalone is what "installs as an app" means to a launcher.
    expect(body.display).toBe("standalone");
    expect(body.name).toBe("Silid Frontdesk");
    expect(body.start_url).toBe("/");
    expect(body.icons.map((icon) => icon.sizes)).toContain("192x192");
    expect(body.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

    // Every declared icon must actually serve a PNG, or the install prompt is
    // a broken promise.
    for (const icon of body.icons) {
      const response = await request.get(icon.src);
      expect(response.status(), `${icon.src} must serve`).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }

    await bootDesk(page, nextRun("install"));
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  });

  test("the shell renders with the network switched off", async ({ page, context }) => {
    const run = nextRun("coldboot");
    await bootDesk(page, run);
    // Second worker-controlled visit: the HTML is in the runtime cache now.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Offline contract harness" })).toBeVisible();

    await context.setOffline(true);
    await page.reload();

    // The whole shell, from the worker's cache, with no server at all.
    await expect(page.getByRole("heading", { name: "Offline contract harness" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("HARNESS-ONLY").first()).toBeVisible();
    await expect(page.getByTestId("queue-note")).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe("the write contract under an outage", () => {
  test("a write made offline is queued durably and survives a reload", async ({ page, context }) => {
    const run = nextRun("queue");
    await bootDesk(page, run);
    await context.setOffline(true);

    // The desk learns it is offline from the probe, not from a guess.
    await page.getByTestId("probe-now").click();
    await expect(page.getByTestId("connectivity-badge")).toHaveText("offline");

    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 1)");
    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 2)");

    // The row is in IndexedDB, not merely in a React state variable: read it
    // back out of the database the desk owns.
    const durable = await page.evaluate(async () => {
      const open = indexedDB.open("silid-frontdesk");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = db.transaction("outbox", "readonly");
      const rows = await new Promise<{ procedure: string; state: string }[]>((resolve, reject) => {
        const request = tx.objectStore("outbox").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return rows.map((row) => ({ procedure: row.procedure, state: row.state }));
    });
    expect(durable).toEqual([
      { procedure: "harness_note", state: "pending" },
      { procedure: "harness_note", state: "pending" },
    ]);

    // And it is still there after a reload, which is the crash-safety claim.
    await page.reload();
    await expect(page.getByTestId("outbox-row-1")).toBeVisible();
    await expect(page.getByTestId("outbox-row-2")).toBeVisible();
    await context.setOffline(false);
  });

  test("queued writes replay in order when the network returns", async ({ page, context, request }) => {
    const run = nextRun("drain");
    await bootDesk(page, run);
    await context.setOffline(true);
    await page.getByTestId("probe-now").click();
    await expect(page.getByTestId("connectivity-badge")).toHaveText("offline");

    for (const seq of [1, 2, 3]) {
      await page.getByTestId("queue-note").click();
      await expect(page.getByTestId("status")).toContainText(`queued durably (seq ${seq})`);
    }

    await context.setOffline(false);
    // The drain path is the reconnect path: drain first, then refresh.
    await page.getByTestId("reconnect").click();
    await expect(page.getByTestId("status")).toContainText("live again — drained 3");

    // The order the desk claims is the order the server recorded.
    await expect(page.getByTestId("accept-row-1")).toBeVisible();
    await expect(page.getByTestId("accept-row-2")).toBeVisible();
    await expect(page.getByTestId("accept-row-3")).toBeVisible();
    const logged = await (await request.get(`/harness/accept-log?run=${run}`)).json();
    expect((logged as { rows: { seq: number }[] }).rows.map((row) => row.seq)).toEqual([1, 2, 3]);
    await expect(page.getByTestId("outbox-rows").locator("tr")).toHaveCount(0);
  });

  test("the server's instant is the authoritative one, never the desk's", async ({ page, context, request }) => {
    const run = nextRun("seal");
    await bootDesk(page, run);
    await context.setOffline(true);
    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably");
    // Sit on the queue: the desk's own enqueue instant is now minutes stale.
    await page.waitForTimeout(1_100);
    await context.setOffline(false);
    await page.getByTestId("drain").click();
    await expect(page.getByTestId("status")).toContainText("drained 1");

    const logged = await (await request.get(`/harness/accept-log?run=${run}`)).json();
    const [row] = (logged as { rows: { receivedAt: string; clientEnqueuedAt: string }[] }).rows;
    // The client instant is preserved, but only as client metadata: the row's
    // own instant is when the server accepted it (Invariant 2a).
    expect(row!.receivedAt).not.toBe(row!.clientEnqueuedAt);
    expect(Date.parse(row!.receivedAt)).toBeGreaterThan(Date.parse(row!.clientEnqueuedAt));
  });

  test("a write carrying a server-looking timestamp is refused, not stored", async ({ request }) => {
    // The envelope schema is strict: a desk that grew a `receivedAt` field by
    // accident gets a rejection instead of a silently authoritative instant.
    const response = await request.post("/harness/write", {
      data: {
        idempotencyKey: `seal_${Date.now()}`,
        procedure: "harness_note",
        payload: { run: "seal_attempt", seq: 1 },
        clientMetadata: { enqueuedAt: new Date().toISOString() },
        receivedAt: "1999-01-01T00:00:00.000Z",
      },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe("harness_bad_envelope");

    const logged = await (await request.get("/harness/accept-log?run=seal_attempt")).json();
    expect((logged as { rows: unknown[] }).rows).toEqual([]);
  });

  test("a duplicate replay coalesces onto one row", async ({ request }) => {
    const run = nextRun("coalesce");
    const envelope = {
      idempotencyKey: `${run}_key`,
      procedure: "harness_note",
      payload: { run, seq: 1 },
      clientMetadata: { enqueuedAt: "2026-09-26T09:00:00.000Z" },
    };

    const first = await request.post("/harness/write", { data: envelope });
    const second = await request.post("/harness/write", { data: envelope });
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const firstBody = (await first.json()) as { coalesced: boolean; receivedAt: string };
    const secondBody = (await second.json()) as { coalesced: boolean; receivedAt: string };
    expect(firstBody.coalesced).toBe(false);
    // The replay is answered from the first observation, not as a new action.
    expect(secondBody.coalesced).toBe(true);
    expect(secondBody.receivedAt).toBe(firstBody.receivedAt);

    const logged = await (await request.get(`/harness/accept-log?run=${run}`)).json();
    expect((logged as { rows: unknown[] }).rows).toHaveLength(1);
  });
});

test.describe("failure isolation in the queue", () => {
  test("a rejected replay does not block the entries behind it", async ({ page, context, request }) => {
    const run = nextRun("poison");
    await bootDesk(page, run);
    await context.setOffline(true);
    await page.getByTestId("probe-now").click();
    await expect(page.getByTestId("connectivity-badge")).toHaveText("offline");

    // The fault is chosen when the write is queued: a replay carries the
    // payload it was queued with, which is exactly the property being proven.
    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 1)");
    await page.getByTestId("inject").selectOption("reject");
    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 2)");
    await page.getByTestId("inject").selectOption("none");
    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 3)");

    await context.setOffline(false);
    await page.getByTestId("drain").click();
    // The middle entry poisoned itself; the third still landed.
    await expect(page.getByTestId("status")).toContainText("drained 2, poisoned 1, remaining 1");

    const logged = await (await request.get(`/harness/accept-log?run=${run}`)).json();
    expect((logged as { rows: { seq: number }[] }).rows.map((row) => row.seq)).toEqual([1, 3]);

    // The stuck entry is visible to the desk, with its reason — not lost.
    const stuck = page.getByTestId("outbox-row-2");
    await expect(stuck).toContainText("errored");
    await expect(stuck).toContainText("409");
  });

  test("a server that becomes unreachable stops the pass and keeps the rest queued", async ({
    page,
    context,
    request,
  }) => {
    const run = nextRun("stop");
    await bootDesk(page, run);
    await context.setOffline(true);
    await page.getByTestId("probe-now").click();
    await expect(page.getByTestId("connectivity-badge")).toHaveText("offline");

    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 1)");
    await page.getByTestId("inject").selectOption("unavailable");
    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 2)");
    await page.getByTestId("inject").selectOption("none");
    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 3)");

    await context.setOffline(false);
    await page.getByTestId("drain").click();
    // The middle row's proxy answers 503, which is a transport failure: the
    // pass stops there instead of burning the connection on rows 3+.
    await expect(page.getByTestId("status")).toContainText("stopped: the server was unreachable");
    await expect(page.getByTestId("status")).toContainText("drained 1, poisoned 0, remaining 2");

    // Nothing was lost and nothing was double-sent: the stopped row is back to
    // pending with its attempt counted, and the row behind it is untouched.
    await expect(page.getByTestId("outbox-row-2")).toContainText("pending");
    await expect(page.getByTestId("outbox-row-3")).toContainText("pending");
    const logged = await (await request.get(`/harness/accept-log?run=${run}`)).json();
    expect((logged as { rows: { seq: number }[] }).rows.map((row) => row.seq)).toEqual([1]);
  });
});

test.describe("the online-only gate and the reconnect order", () => {
  test("a shift close is visibly blocked while the desk is offline", async ({ page, context }) => {
    const run = nextRun("gate");
    await bootDesk(page, run);
    await context.setOffline(true);
    await page.getByTestId("probe-now").click();
    await expect(page.getByTestId("connectivity-badge")).toHaveText("offline");

    await page.getByTestId("gate-shift_close").click();
    await expect(page.getByTestId("gate-verdict")).toContainText("shift_close: BLOCKED (offline)");
    await expect(page.getByTestId("gate-verdict")).toContainText(
      "sealed by the server with the full ledger visible",
    );

    // Every online-only action refuses the same way while the link is down.
    await page.getByTestId("gate-void_session").click();
    await expect(page.getByTestId("gate-verdict")).toContainText("void_session: BLOCKED (offline)");

    await context.setOffline(false);
    await page.getByTestId("probe-now").click();
    await expect(page.getByTestId("connectivity-badge")).toHaveText("online");
    await page.getByTestId("gate-shift_close").click();
    await expect(page.getByTestId("gate-verdict")).toContainText("shift_close: ALLOWED");
  });

  test("a shift close is blocked while money-affecting writes are still queued", async ({
    page,
    context,
  }) => {
    const run = nextRun("pendingmoney");
    await bootDesk(page, run);
    await context.setOffline(true);
    await page.getByTestId("probe-now").click();
    await expect(page.getByTestId("connectivity-badge")).toHaveText("offline");

    await page.getByTestId("queue-money").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 1)");
    await expect(page.getByTestId("pending-money")).toHaveText("1");

    // Back online, but the ledger is still incomplete: the gate still refuses.
    await context.setOffline(false);
    await page.getByTestId("probe-now").click();
    await expect(page.getByTestId("connectivity-badge")).toHaveText("online");
    await page.getByTestId("gate-shift_open").click();
    await expect(page.getByTestId("gate-verdict")).toContainText("shift_open: BLOCKED (pending_money)");

    // Draining clears it — the block was the queue, not the link.
    await page.getByTestId("drain").click();
    await expect(page.getByTestId("pending-money")).toHaveText("0");
    await page.getByTestId("gate-shift_open").click();
    await expect(page.getByTestId("gate-verdict")).toContainText("shift_open: ALLOWED");
  });

  test("reconnecting drains first and refreshes the read caches second", async ({ page, context }) => {
    const run = nextRun("refresh");
    await bootDesk(page, run);

    // A first online read: the server ledger is empty and rooms are mirrored.
    await page.getByTestId("refresh-caches").click();
    await expect(page.getByTestId("cached-room-101")).toBeVisible();
    await expect(page.getByTestId("cache-accepted-count")).toHaveText("0");
    const firstServedAt = await page.getByTestId("cache-served-at").innerText();

    // An outage with a queued write, then a reconnect.
    await context.setOffline(true);
    await page.getByTestId("queue-note").click();
    await expect(page.getByTestId("status")).toContainText("queued durably (seq 1)");
    const bootBeforeReconnect = await page.evaluate(() => performance.timeOrigin);
    await context.setOffline(false);
    await page.getByTestId("reconnect").click();
    await expect(page.getByTestId("status")).toContainText("live again — drained 1");

    // The desk did not reload to get its data back. `timeOrigin` belongs to the
    // document, so a new one means a new page: the default `reloadOnOnline`
    // would have thrown away the queued-write indicator and the cashier's
    // screen the moment the link returned, which is not the contract in §5.
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(bootBeforeReconnect);

    // The refresh that followed the drain can see the accepted write. Had the
    // order been reversed, this number would still read 0.
    await expect(page.getByTestId("cache-accepted-count")).toHaveText("1");
    await expect(page.getByTestId("cache-served-at")).not.toHaveText(firstServedAt);
    await expect(page.getByTestId("last-synced")).not.toHaveText("never");

    // The cache the desk renders came from IndexedDB, carrying the server's
    // own instant for when it was served.
    await expect(page.getByTestId("cached-room-101")).toContainText("cached 20");
  });
});
