import { describe, expect, it } from "vitest";
import { OVERSTAY_DEFAULTS, WORKED_EXAMPLES } from "@silid/db";
import {
  DEFAULT_SEED,
  buildReport,
  diffFigures,
  recomputeBlockCount,
  recomputeOvernightBase,
  recomputeReferenceFigures,
  reconcileLedger,
  seededLedger,
  type MoneyRecomputeReport,
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
