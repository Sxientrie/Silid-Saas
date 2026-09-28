import { describe, expect, it } from "vitest";
import { OVERSTAY_DEFAULTS } from "@silid/db";
import { formatPeso, overstayLadder } from "../src/overstay.js";

/**
 * The overstay ladder's DISPLAY goldens (roadmap 06 Deliverable 4), taken
 * from vault-05 and vault-06 of spec/legacy-behavior-vault.md — the two
 * OBSERVED scenarios whose goldens are the legacy suite's own assertions.
 * The ladder is pure display math (spec/domain-rules.md §3): it places a
 * session on booked/grace/overdue from its own timestamps and shows the
 * accruing figure, while the authoritative extension money is sealed
 * exclusively at checkout (vault-11). Every peso figure comes from the money
 * reference fixture (@silid/db) — none is re-typed here (MONEY REFERENCE
 * RULE).
 */

const BOOKED_END = "2026-01-15T12:00:00Z";
const GRACE = OVERSTAY_DEFAULTS.grace_minutes; // 25
const BLOCK = OVERSTAY_DEFAULTS.block_minutes; // 60
const CHARGE = OVERSTAY_DEFAULTS.block_charge; // 150

/** now = booked_end + offsetMinutes (fractional offsets allowed, vault-06's 60.5). */
function atOffset(offsetMinutes: number): Date {
  return new Date(Date.parse(BOOKED_END) + offsetMinutes * 60_000);
}

function reading(offsetMinutes: number, overrides?: Partial<{ blockMinutes: number; blockCharge: number; graceMinutes: number }>) {
  return overstayLadder({
    now: atOffset(offsetMinutes),
    bookedEndAt: BOOKED_END,
    graceMinutes: overrides?.graceMinutes ?? GRACE,
    blockMinutes: overrides?.blockMinutes ?? BLOCK,
    blockCharge: overrides?.blockCharge ?? CHARGE,
  });
}

describe("vault-05 ladder phases (display goldens)", () => {
  it("a minute before the booked end is booked with nothing accruing", () => {
    expect(reading(-1)).toEqual({
      phase: "booked",
      graceMinutesLeft: 0,
      overdueMinutes: 0,
      blocksAccrued: 0,
      accruingPhp: 0,
    });
  });

  it("grace begins exactly at the booked end with the full window remaining", () => {
    expect(reading(0)).toEqual({
      phase: "grace",
      graceMinutesLeft: GRACE,
      overdueMinutes: 0,
      blocksAccrued: 0,
      accruingPhp: 0,
    });
  });

  it("ten minutes into grace the countdown shows fifteen left", () => {
    const r = reading(10);
    expect(r.phase).toBe("grace");
    expect(r.graceMinutesLeft).toBe(15);
    expect(r.accruingPhp).toBe(0);
  });

  it("the exact close of the grace window is overdue with zero blocks and zero pesos", () => {
    expect(reading(GRACE)).toEqual({
      phase: "overdue",
      graceMinutesLeft: 0,
      overdueMinutes: 0,
      blocksAccrued: 0,
      accruingPhp: 0,
    });
  });

  it("one minute past grace the first block accrues", () => {
    const r = reading(GRACE + 1);
    expect(r.phase).toBe("overdue");
    expect(r.overdueMinutes).toBe(1);
    expect(r.blocksAccrued).toBe(1);
    expect(r.accruingPhp).toBe(CHARGE);
  });

  it("a partial grace minute rounds up in the countdown (30 seconds in shows the full window)", () => {
    expect(reading(0.5).graceMinutesLeft).toBe(GRACE);
  });

  it("24m30s of window remaining still displays the full minute count", () => {
    expect(reading(GRACE - 24.5).graceMinutesLeft).toBe(GRACE);
  });

  it("with a zero-grace configuration the boundary moves to the booked end itself", () => {
    const r = reading(0, { graceMinutes: 0 });
    expect(r.phase).toBe("overdue");
    expect(r.blocksAccrued).toBe(0);
    expect(r.accruingPhp).toBe(0);
    const oneMinutePast = reading(1, { graceMinutes: 0 });
    expect(oneMinutePast.blocksAccrued).toBe(1);
    expect(oneMinutePast.accruingPhp).toBe(CHARGE);
  });
});

describe("vault-06 started blocks (display goldens)", () => {
  it.each([
    { offset: 1, blocks: 1, label: "one minute past grace bills one full block" },
    { offset: 60, blocks: 1, label: "a fully elapsed block still bills one block, not two" },
    { offset: 61, blocks: 2, label: "one minute into the second hour bills a second block" },
    { offset: 60.5, blocks: 2, label: "half a minute past the block boundary rounds up" },
  ])("$label", ({ offset, blocks }) => {
    const r = reading(GRACE + offset);
    expect(r.blocksAccrued).toBe(blocks);
    expect(r.accruingPhp).toBe(blocks * CHARGE);
  });
});

describe("garbage inputs fall back to the booked-phase zeros, never NaN (spec/domain-rules.md §3.4)", () => {
  it("an unparseable booked-end time renders the booked-phase zeros", () => {
    const r = overstayLadder({
      now: new Date("2026-01-15T13:00:00Z"),
      bookedEndAt: "not-a-timestamp",
      graceMinutes: GRACE,
      blockMinutes: BLOCK,
      blockCharge: CHARGE,
    });
    expect(r).toEqual({
      phase: "booked",
      graceMinutesLeft: 0,
      overdueMinutes: 0,
      blocksAccrued: 0,
      accruingPhp: 0,
    });
  });

  it("a non-finite clock value renders the booked-phase zeros", () => {
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = overstayLadder({
        now,
        bookedEndAt: BOOKED_END,
        graceMinutes: GRACE,
        blockMinutes: BLOCK,
        blockCharge: CHARGE,
      });
      expect(r.phase).toBe("booked");
      expect(Number.isFinite(r.accruingPhp)).toBe(true);
    }
  });

  it("a missing booked end (null/undefined/empty) renders the booked-phase zeros", () => {
    for (const bookedEndAt of [null, undefined, ""]) {
      const r = overstayLadder({
        now: new Date(),
        bookedEndAt,
        graceMinutes: GRACE,
        blockMinutes: BLOCK,
        blockCharge: CHARGE,
      });
      expect(r.phase).toBe("booked");
      expect(r.accruingPhp).toBe(0);
    }
  });

  it("garbage per-branch parameters can never become punitive or free at the display layer", () => {
    // A zero-length block must not charge per-minute; a zero price must not
    // render free accrual. (readOverstayTriple already falls back per §3.3;
    // the display math defends against a corrupted triple regardless.)
    expect(reading(GRACE + 90, { blockMinutes: 0 })).toEqual({
      phase: "overdue",
      graceMinutesLeft: 0,
      overdueMinutes: 90,
      blocksAccrued: 0,
      accruingPhp: 0,
    });
    expect(reading(GRACE + 90, { blockCharge: 0 }).accruingPhp).toBe(0);
    expect(reading(GRACE + 90, { blockCharge: Number.NaN }).accruingPhp).toBe(0);
    expect(reading(GRACE + 90, { blockCharge: Number.POSITIVE_INFINITY }).accruingPhp).toBe(0);
    expect(reading(GRACE + 90, { blockMinutes: Number.NaN }).blocksAccrued).toBe(0);
  });
});

describe("formatPeso (shared display-money formatter)", () => {
  it("renders whole pesos with the peso sign and comma grouping", () => {
    expect(formatPeso(450)).toBe("₱450");
    expect(formatPeso(1050)).toBe("₱1,050");
    expect(formatPeso(2000)).toBe("₱2,000");
    expect(formatPeso(12345678)).toBe("₱12,345,678");
  });

  it("renders zero without a negative or NaN", () => {
    expect(formatPeso(0)).toBe("₱0");
  });

  it("degrades to silence on garbage instead of rendering a wrong figure", () => {
    expect(formatPeso(Number.NaN)).toBe("₱0");
    expect(formatPeso(Number.POSITIVE_INFINITY)).toBe("₱0");
    expect(formatPeso(-150)).toBe("₱0");
  });
});
