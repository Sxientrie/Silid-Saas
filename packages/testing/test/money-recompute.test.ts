import { describe, expect, it } from "vitest";
import { OVERSTAY_DEFAULTS, WORKED_EXAMPLES } from "@silid/db";
import {
  DEFAULT_SEED,
  buildReport,
  diffFigures,
  recomputeBlockCount,
  recomputeOvernightBase,
  recomputeReferenceFigures,
  recomputeSealedSession,
  recomputeSessionLedger,
  reconcileLedger,
  seededLedger,
  type MoneyRecomputeReport,
  type SealedSessionRow,
} from "../src/money-recompute.js";

describe("money recomputation gate (spec/domain-rules.md §7)", () => {
  it("recomputes the nine §1.4 worked examples with zero drift", () => {
    const result = recomputeReferenceFigures();
    expect(result.driftedFigures).toEqual([]);
    // Total, base, and surcharge are each recomputed per example.
    const sectionRows = result.recomputedFigures.filter((f) => f.source.startsWith("spec/"));
    expect(sectionRows).toHaveLength(WORKED_EXAMPLES.length * 3);
    expect(sectionRows.filter((f) => f.label.includes("(base)")).map((f) => f.independent_php)).toEqual(
      WORKED_EXAMPLES.map((e) => e.base),
    );
    for (const figure of result.recomputedFigures) {
      expect(figure.independent_php).toBe(figure.stated_php);
    }
  });

  it("recomputes the vault-06 block goldens with zero drift", () => {
    const result = recomputeReferenceFigures();
    const blockRows = result.recomputedFigures.filter((f) => f.source === "vault-06");
    expect(blockRows.map((f) => f.independent_php)).toEqual([150, 150, 300]);
  });

  it("counts blocks by a different formula shape than production (floor+remainder, never ceil-division)", () => {
    expect(recomputeBlockCount(1)).toBe(1);
    expect(recomputeBlockCount(60)).toBe(1);
    expect(recomputeBlockCount(61)).toBe(2);
    expect(recomputeBlockCount(0)).toBe(0);
    expect(recomputeBlockCount(-5)).toBe(0);
  });

  it("selects the overnight tier by cumulative deltas from the lowest tier (vault-03)", () => {
    expect(recomputeOvernightBase(2)).toBe(1100);
    expect(recomputeOvernightBase(3)).toBe(1100 + 300);
    expect(recomputeOvernightBase(4)).toBe(1100 + 300 + 300);
    expect(recomputeOvernightBase(5)).toBe(1100 + 300 + 300);
    expect(recomputeOvernightBase(1)).toBe(1100);
  });

  it("prices blocks from the fixture's overstay defaults", () => {
    const result = recomputeReferenceFigures();
    expect(result.blockChargePhp).toBe(OVERSTAY_DEFAULTS.block_charge);
  });

  it("flags a single peso of drift — the gate blocks on it", () => {
    const drift = diffFigures([
      { source: "vault-01", label: "short_time pax 2", independent_php: 450, stated_php: 449 },
    ]);
    expect(drift.zeroDrift).toBe(false);
    expect(drift.driftedFigures).toHaveLength(1);
    expect(drift.driftedFigures[0].drift_php).toBe(1);
  });

  it("reconciles a ledger by running and grouped summation", () => {
    const ledger = reconcileLedger([
      { id: "a", amount_php: 450 },
      { id: "b", amount_php: 200 },
      { id: "c", amount_php: 300 },
    ]);
    expect(ledger.reconciled).toBe(true);
    expect(ledger.runningTotalPhp).toBe(950);
    expect(ledger.groupedTotalPhp).toBe(950);
    expect(ledger.anomalies).toEqual([]);
  });

  it("reports anomalies instead of silently summing garbage (vault-05's rule for money)", () => {
    const ledger = reconcileLedger([
      { id: "a", amount_php: 450 },
      { id: "bad", amount_php: Number.NaN },
      { id: "worse", amount_php: Number.POSITIVE_INFINITY },
    ]);
    expect(ledger.reconciled).toBe(false);
    expect(ledger.anomalies.map((a) => a.id)).toEqual(["bad", "worse"]);
    expect(ledger.runningTotalPhp).toBe(450);
  });

  it("produces a deterministic seeded ledger environment", () => {
    const first = seededLedger(DEFAULT_SEED, 25);
    const second = seededLedger(DEFAULT_SEED, 25);
    expect(first.events).toEqual(second.events);
    const other = seededLedger(DEFAULT_SEED + 1, 25);
    expect(other.events).not.toEqual(first.events);
    expect(first.events).toHaveLength(25);
    for (const event of first.events) {
      expect(Number.isFinite(event.amount_php)).toBe(true);
      expect(event.amount_php).toBeGreaterThan(0);
    }
  });

  it("reconciles the seeded ledger through both summation orders", () => {
    const ledger = reconcileLedger(seededLedger(DEFAULT_SEED, 40).events);
    expect(ledger.reconciled).toBe(true);
    expect(ledger.runningTotalPhp).toBe(ledger.groupedTotalPhp);
  });

  it("renders a ZERO DRIFT report and a blocking report on drift", () => {
    const clean: MoneyRecomputeReport = {
      zeroDrift: true,
      driftedFigures: [],
      lines: [
        { source: "vault-01", label: "short_time pax 2", independent_php: 450, stated_php: 450 },
      ],
    };
    expect(buildReport(clean)).toContain("ZERO DRIFT");

    const dirty: MoneyRecomputeReport = {
      zeroDrift: false,
      driftedFigures: [],
      lines: [
        { source: "vault-01", label: "short_time pax 2", independent_php: 450, stated_php: 449 },
      ],
    };
    const report = buildReport(dirty);
    expect(report).toContain("DRIFT DETECTED");
    expect(report).toContain("vault-01");
  });
});

/**
 * The --session-ledger section (roadmap 06 Deliverable 7). It is the gate
 * over the desk's E2E sealed totals, so it has to be able to FAIL: the tests
 * below prove it detects lost money, double-charged blocks, and a tampered
 * add-on row, not just that it agrees on a clean ledger.
 */
describe("sealed-session recomputation (roadmap 06 Deliverable 7)", () => {
  const GRACE_MINUTES = OVERSTAY_DEFAULTS.grace_minutes;
  const BLOCK_CHARGE = OVERSTAY_DEFAULTS.block_charge;
  const base = "2026-09-29T10:00:00.000Z";
  const at = (minutesFromBase: number) => new Date(Date.parse(base) + minutesFromBase * 60_000).toISOString();

  const row = (over: Partial<SealedSessionRow> = {}): SealedSessionRow => ({
    label: "fixture session",
    sessionId: "4a0e6dbf-1111-2222-3333-444455556666",
    bookingType: "short_time",
    pax: 2,
    bookedEndAt: at(180),
    checkedOutAt: at(180),
    sealedTotal: 450,
    addons: [],
    ...over,
  });

  it("recomputes a within-grace short-time stay at the fixture's 450", () => {
    const result = recomputeSealedSession(row());
    expect(result.independent_php).toBe(450);
    expect(result.blocksDue).toBe(0);
    expect(result.postedExtensionQty).toBe(0);
    expect(result.rowMismatch).toBeNull();
    expect(result.blockMismatch).toBeNull();
  });

  it("charges no block while the checkout is still inside the grace window", () => {
    const result = recomputeSealedSession(
      row({ bookedEndAt: at(180), checkedOutAt: at(180 + GRACE_MINUTES) }),
    );
    expect(result.blocksDue).toBe(0);
    expect(result.blockMismatch).toBeNull();
  });

  it("finds the lost money when the clock says two blocks but one was posted", () => {
    const two = GRACE_MINUTES + 61;
    const honest = recomputeSealedSession(
      row({
        bookingType: "overnight",
        pax: 5,
        bookedEndAt: at(0),
        checkedOutAt: at(two),
        sealedTotal: 2000 + 2 * BLOCK_CHARGE,
        addons: [
          { item: "extension_charge", qty: 2, unitPrice: BLOCK_CHARGE, total: 2 * BLOCK_CHARGE },
        ],
      }),
    );
    expect(honest.blocksDue).toBe(2);
    expect(honest.independent_php).toBe(2000 + 2 * BLOCK_CHARGE);
    expect(honest.blockMismatch).toBeNull();

    const short = recomputeSealedSession(
      row({
        bookingType: "overnight",
        pax: 5,
        bookedEndAt: at(0),
        checkedOutAt: at(two),
        sealedTotal: 2000 + BLOCK_CHARGE,
        addons: [{ item: "extension_charge", qty: 1, unitPrice: BLOCK_CHARGE, total: BLOCK_CHARGE }],
      }),
    );
    expect(short.blockMismatch).toContain("clock says 2 block(s) due but 1 posted");
  });

  it("finds the double-charge when more blocks are posted than the clock allows", () => {
    const result = recomputeSealedSession(
      row({
        checkedOutAt: at(180 + GRACE_MINUTES + 1),
        sealedTotal: 450 + 2 * BLOCK_CHARGE,
        addons: [
          { item: "extension_charge", qty: 2, unitPrice: BLOCK_CHARGE, total: 2 * BLOCK_CHARGE },
        ],
      }),
    );
    expect(result.blocksDue).toBe(1);
    expect(result.blockMismatch).toContain("clock says 1 block(s) due but 2 posted");
  });

  it("catches an add-on row whose total is not qty times its unit price", () => {
    const result = recomputeSealedSession(
      row({
        sealedTotal: 450 + 300,
        addons: [{ item: "bottled_water", qty: 2, unitPrice: 150, total: 500 }],
      }),
    );
    expect(result.rowMismatch).toContain("qty 2 × unit 150 = ₱300 but row total is ₱500");
  });

  it("sums every posted add-on row into the sealed total, not just extensions", () => {
    const result = recomputeSealedSession(
      row({
        sealedTotal: 450 + 150 + 300,
        addons: [
          { item: "bottled_water", qty: 1, unitPrice: 150, total: 150 },
          { item: "red_horse_1l", qty: 2, unitPrice: 150, total: 300 },
        ],
      }),
    );
    expect(result.independent_php).toBe(450 + 150 + 300);
    expect(result.postedExtensionQty).toBe(0);
  });

  it("reports zero drift and no anomalies for a clean set of sealed rows", () => {
    const result = recomputeSessionLedger([
      row({ label: "2-pax short-time" }),
      row({ label: "3-pax short_time", pax: 3, sealedTotal: 650 }),
      row({ label: "5-pax overnight", bookingType: "overnight", pax: 5, sealedTotal: 2000 }),
    ]);
    expect(result.driftedFigures).toEqual([]);
    expect(result.anomalies).toEqual([]);
    expect(result.recomputedFigures.map((f) => f.stated_php)).toEqual([450, 650, 2000]);
  });

  it("flags a single peso of drift in any row", () => {
    const result = recomputeSessionLedger([
      row({ label: "clean", sealedTotal: 450 }),
      row({ label: "one peso short", sealedTotal: 449 }),
    ]);
    expect(result.driftedFigures).toHaveLength(1);
    expect(result.driftedFigures[0].label).toContain("one peso short");
    expect(result.anomalies).toEqual([]);
  });

  it("surfaces block and row anomalies with the session's own label", () => {
    const result = recomputeSessionLedger([
      row({
        label: "tampered row",
        sealedTotal: 450,
        addons: [{ item: "extension_charge", qty: 3, unitPrice: BLOCK_CHARGE, total: 450 }],
      }),
    ]);
    expect(result.anomalies.some((a) => a.startsWith("tampered row:"))).toBe(true);
    expect(result.anomalies.join(" ")).toContain("clock says 0 block(s) due but 3 posted");
  });

  it("never lets an unparseable timestamp become NaN money", () => {
    const result = recomputeSealedSession(
      row({ bookedEndAt: "not-a-date", sealedTotal: 450 }),
    );
    expect(Number.isFinite(result.independent_php)).toBe(true);
    expect(result.independent_php).toBe(450);
  });
});
