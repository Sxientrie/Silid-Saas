import { describe, expect, it } from "vitest";
import {
  independentNormalizeMoneyText,
  independentMinuteAccepted,
  independentMoneyAccepted,
  runServiceConfigGate,
  type ServiceConfigValidator,
} from "../src/service-config-gate.js";
import { OVERSTAY_DEFAULTS } from "@silid/db";
import { readOverstayTriple } from "@silid/schemas";

/**
 * The Money Recomputation Gate's service-configuration section (roadmap 04
 * Deliverable 9): the rate-configuration service's accepted-configuration
 * behavior, recomputed independently from the fixture and the §3.3 rules.
 * The independent transcription below uses character-code loops and decimal
 * expansion — deliberately NOT the service's regexes and parseFloat — so a
 * shared defect cannot self-confirm.
 */
describe("the independent §3.3 transcription", () => {
  it("accepts whole-minute digit text up to 9 digits, zero included", () => {
    expect(independentMinuteAccepted("25")).toBe(true);
    expect(independentMinuteAccepted("0")).toBe(true);
    expect(independentMinuteAccepted("123456789")).toBe(true);
  });

  it("refuses fractional, signed, exponent, and overflow minutes", () => {
    expect(independentMinuteAccepted("25.0")).toBe(false);
    expect(independentMinuteAccepted("-5")).toBe(false);
    expect(independentMinuteAccepted("1e2")).toBe(false);
    expect(independentMinuteAccepted("1234567890")).toBe(false);
    expect(independentMinuteAccepted("")).toBe(false);
  });

  it("accepts digit money with optional decimals, at most 12 characters", () => {
    expect(independentMoneyAccepted("150")).toBe(true);
    expect(independentMoneyAccepted("0.5")).toBe(true);
    expect(independentMoneyAccepted("1234567890.1")).toBe(true);
  });

  it("refuses zero, negative, trailing-dot, and overflow money", () => {
    expect(independentMoneyAccepted("0")).toBe(false);
    expect(independentMoneyAccepted("0.00")).toBe(false);
    expect(independentMoneyAccepted("-1")).toBe(false);
    expect(independentMoneyAccepted("150.")).toBe(false);
    expect(independentMoneyAccepted("1234567890.12")).toBe(false);
    expect(independentMoneyAccepted("1234567890123")).toBe(false);
  });

  it("normalizes trailing decimal zeros the way the vault records", () => {
    expect(independentNormalizeMoneyText("150.50")).toBe("150.5");
    expect(independentNormalizeMoneyText("150.0")).toBe("150");
    expect(independentNormalizeMoneyText("0.500")).toBe("0.5");
    expect(independentNormalizeMoneyText("150")).toBe("150");
  });
});

describe("runServiceConfigGate — the service's behavior against the independent expectation", () => {
  it("finds ZERO DRIFT for the real service (every §3.3 edge behaves as specified)", () => {
    const gate = runServiceConfigGate();
    expect(gate.zeroDrift).toBe(true);
    expect(gate.lines.length).toBeGreaterThanOrEqual(20);
    // the accepted default triple matches the fixture, derived independently
    const tripleLine = gate.lines.find((line) => line.label.includes("default triple"));
    expect(tripleLine?.ok).toBe(true);
  });

  it("reports drift when the service's accepted values diverge from §3.3", () => {
    // A deliberately broken validator: it accepts a zero block length —
    // the exact punitive configuration §3.3 forbids. The gate MUST catch it.
    const broken: ServiceConfigValidator = {
      extension: (key, raw) =>
        key === "block_minutes" && raw === "0"
          ? { accepted: true, canonicalText: "0" }
          : extensionExpectation(key, raw),
      canteen: (item, raw) => extensionExpectation(item, raw),
      overstayTriple: (card) => readOverstayTriple(card),
    };
    const gate = runServiceConfigGate(broken);
    expect(gate.zeroDrift).toBe(false);
    expect(gate.lines.some((line) => !line.ok && line.label.includes("block_minutes"))).toBe(true);
  });

  it("derives the default triple from the fixture, not from the service", () => {
    const gate = runServiceConfigGate();
    const tripleLine = gate.lines.find((line) => line.label.includes("default triple"));
    expect(tripleLine).toMatchObject({
      independent: { graceMinutes: OVERSTAY_DEFAULTS.grace_minutes, blockMinutes: OVERSTAY_DEFAULTS.block_minutes, blockCharge: OVERSTAY_DEFAULTS.block_charge },
    });
  });
});

function extensionExpectation(key: string, raw: string | number): { accepted: boolean; canonicalText?: string } {
  // stand-in used only by the broken-validator test fixture: it mirrors the
  // real service on every probe EXCEPT the deliberately broken zero block
  const isMoney = key === "block_charge" || key.startsWith("bottled") || key.startsWith("red") || key.startsWith("marlboro");
  const accepted =
    (key === "grace_minutes" && independentMinuteAccepted(String(raw))) ||
    (key === "block_minutes" && independentMinuteAccepted(String(raw)) && Number.parseInt(String(raw), 10) > 0) ||
    (isMoney && independentMoneyAccepted(String(raw)));
  if (!accepted) {
    return { accepted: false };
  }
  return { accepted: true, canonicalText: isMoney ? independentNormalizeMoneyText(String(raw)) : String(raw) };
}
