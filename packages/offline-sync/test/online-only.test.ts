import { describe, expect, it } from "vitest";
import { evaluateOnlineOnly, ONLINE_ONLY_ACTIONS } from "../src/online-only";

/**
 * Deliverable 3 — what is online-only by design (spec/offline-sync.md §3).
 * Shift close and shift open, void, and rate-configuration changes never run
 * from a desk that cannot see the server's ledger.
 */
describe("the online-only gate", () => {
  it("names exactly the four online-only actions", () => {
    expect(ONLINE_ONLY_ACTIONS).toEqual([
      "shift_open",
      "shift_close",
      "void_session",
      "update_rate_config",
    ]);
  });

  it("allows an online-only action when online with an empty outbox", () => {
    for (const action of ONLINE_ONLY_ACTIONS) {
      expect(evaluateOnlineOnly(action, { online: true, pendingMoneyEntries: 0 })).toEqual({
        allowed: true,
      });
    }
  });

  it("blocks every online-only action while offline", () => {
    for (const action of ONLINE_ONLY_ACTIONS) {
      const verdict = evaluateOnlineOnly(action, { online: false, pendingMoneyEntries: 0 });
      expect(verdict.allowed).toBe(false);
      if (verdict.allowed) throw new Error("unreachable");
      expect(verdict.code).toBe("offline");
    }
  });

  it("blocks shift open and close while money-affecting writes are still queued", () => {
    // Sealing expected cash with offline writes pending would freeze the
    // wrong numbers into the shift (spec/offline-sync.md §3).
    for (const action of ["shift_open", "shift_close"] as const) {
      const verdict = evaluateOnlineOnly(action, { online: true, pendingMoneyEntries: 3 });
      expect(verdict.allowed).toBe(false);
      if (verdict.allowed) throw new Error("unreachable");
      expect(verdict.code).toBe("pending_money");
      expect(verdict.reason).toContain("3");
    }
  });

  it("blocks a shift close while offline even with an empty outbox", () => {
    const verdict = evaluateOnlineOnly("shift_close", { online: false, pendingMoneyEntries: 0 });
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error("unreachable");
    expect(verdict.code).toBe("offline");
  });

  it("lets a void through when online even with queued money writes", () => {
    // Voids are org-tier actions on connected admin surfaces; the pending
    // ledger is the reason the desk is stale, not a reason to refuse them.
    expect(
      evaluateOnlineOnly("void_session", { online: true, pendingMoneyEntries: 2 }),
    ).toEqual({ allowed: true });
    expect(
      evaluateOnlineOnly("update_rate_config", { online: true, pendingMoneyEntries: 2 }),
    ).toEqual({ allowed: true });
  });

  it("names the blocked action in the reason the cashier is shown", () => {
    // The reason string is the entire user-facing surface of the gate, so it
    // has to say which action refused. "Cannot run offline" next to a Close
    // Shift button leaves the cashier guessing which of four buttons is dead.
    for (const action of ONLINE_ONLY_ACTIONS) {
      const verdict = evaluateOnlineOnly(action, { online: false, pendingMoneyEntries: 0 });
      if (verdict.allowed) throw new Error("unreachable");
      expect(verdict.reason).toContain(action);
    }
  });

  it("rejects an action that is not in the online-only set", () => {
    expect(evaluateOnlineOnly("check_in" as never, { online: false, pendingMoneyEntries: 0 })).toEqual(
      { allowed: true },
    );
  });
});
