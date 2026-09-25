/**
 * Money Recomputation Gate — service-configuration section (roadmap 04
 * Deliverable 9; spec/domain-rules.md §3.3, §7). Recomputes the rate
 * configuration service's accepted-configuration behavior from the money
 * reference fixture and the §3.3 rules through a path that shares NO code
 * with the service: digit checks are character-code loops, money values are
 * evaluated by decimal expansion (not parseFloat), and normalization walks
 * the string from the end. A single divergent acceptance, refusal, or
 * canonical text is drift — and drift blocks the phase.
 */
import { CANTEEN_CATALOGUE, OVERSTAY_DEFAULTS } from "@silid/db/src/money-reference.ts";
import { canteenOverridesSchema, extensionOverridesSchema, readOverstayTriple, type RateConfig } from "@silid/schemas";

export interface ServiceConfigLine {
  source: string;
  label: string;
  independent: unknown;
  actual: unknown;
  ok: boolean;
}

export interface ServiceConfigGateResult {
  lines: ServiceConfigLine[];
  driftedLines: ServiceConfigLine[];
  zeroDrift: boolean;
}

type Expectation = { accepted: true; canonicalText: string } | { accepted: false };

export interface ServiceConfigValidator {
  extension(key: "grace_minutes" | "block_minutes" | "block_charge", raw: string | number): Expectation;
  canteen(item: string, raw: string | number): Expectation;
  overstayTriple(card: RateConfig | null | undefined): { graceMinutes: number; blockMinutes: number; blockCharge: number };
}

/* ── The independent §3.3 transcription (no regexes, no parseFloat) ── */

function allDigits(text: string, maxDigits: number): boolean {
  if (text.length === 0 || text.length > maxDigits) {
    return false;
  }
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

/** §3.3 whole minutes: digit-only text, at most 9 digits; zero is legal. */
export function independentMinuteAccepted(text: string): boolean {
  return allDigits(text, 9);
}

/** §3.3 money: digits with optional decimals, at most 12 characters total. */
export function independentMoneyAccepted(text: string): boolean {
  if (text.length === 0 || text.length > 12) {
    return false;
  }
  const dot = text.indexOf(".");
  const integerPart = dot === -1 ? text : text.slice(0, dot);
  if (!allDigits(integerPart, 12)) {
    return false;
  }
  if (dot !== -1) {
    const fractionPart = text.slice(dot + 1);
    if (fractionPart.length === 0 || !allDigits(fractionPart, 99)) {
      return false;
    }
  }
  // strictly positive: any nonzero digit anywhere in the text
  let hasNonZero = false;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 49 && code <= 57) {
      hasNonZero = true;
    }
  }
  return hasNonZero;
}

/** The accepted money value, by decimal expansion (a different path than parseFloat). */
function independentMoneyValue(text: string): number {
  const dot = text.indexOf(".");
  const integerText = dot === -1 ? text : text.slice(0, dot);
  const fractionText = dot === -1 ? "" : text.slice(dot + 1);
  let value = 0;
  for (let i = 0; i < integerText.length; i += 1) {
    value = value * 10 + (integerText.charCodeAt(i) - 48);
  }
  let scale = 1;
  let fraction = 0;
  for (let i = fractionText.length - 1; i >= 0; i -= 1) {
    scale *= 10;
    fraction += (fractionText.charCodeAt(i) - 48) / scale;
  }
  return value + fraction;
}

/** vault-07: "150.50 is accepted as 150.5" — trailing decimal zeros drop. */
export function independentNormalizeMoneyText(text: string): string {
  if (!text.includes(".")) {
    return text;
  }
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 48) {
    end -= 1;
  }
  let normalized = text.slice(0, end);
  if (normalized.charCodeAt(normalized.length - 1) === 46) {
    normalized = normalized.slice(0, -1);
  }
  return normalized === "" ? "0" : normalized;
}

/* ── The probe corpus and the gate ── */

function minuteExpectation(raw: string | number, allowZero: boolean): Expectation {
  const text = String(raw);
  if (!independentMinuteAccepted(text)) {
    return { accepted: false };
  }
  const value = Number.parseInt(text, 10);
  if (!allowZero && value <= 0) {
    return { accepted: false };
  }
  return { accepted: true, canonicalText: text };
}

function moneyExpectation(raw: string | number, requirePositive: boolean): Expectation {
  const text = String(raw);
  if (!independentMoneyAccepted(text)) {
    return { accepted: false };
  }
  const value = independentMoneyValue(text);
  if (requirePositive && value <= 0) {
    return { accepted: false };
  }
  return { accepted: true, canonicalText: independentNormalizeMoneyText(text) };
}

/** The fixture-derived default triple, computed by the independent path. */
function independentDefaultTriple(): { graceMinutes: number; blockMinutes: number; blockCharge: number } {
  return {
    graceMinutes: OVERSTAY_DEFAULTS.grace_minutes,
    blockMinutes: OVERSTAY_DEFAULTS.block_minutes,
    blockCharge: OVERSTAY_DEFAULTS.block_charge,
  };
}

/** The service's real behavior, probed through its own schemas. */
const realServiceValidator: ServiceConfigValidator = {
  extension(key, raw) {
    const result = extensionOverridesSchema.safeParse({ [key]: raw });
    if (!result.success) {
      return { accepted: false };
    }
    return { accepted: true, canonicalText: result.data[key] as string };
  },
  canteen(item, raw) {
    const result = canteenOverridesSchema.safeParse({ [item]: raw } as Record<string, string>);
    if (!result.success) {
      return { accepted: false };
    }
    const values = Object.values(result.data as Record<string, string>);
    const canonical = values[0];
    return canonical === undefined ? { accepted: false } : { accepted: true, canonicalText: canonical };
  },
  overstayTriple(card) {
    return readOverstayTriple(card);
  },
};

const CORRUPTED_CARD: RateConfig = {
  extension: { grace_minutes: "25.0", block_minutes: "0", block_charge: "0.00" },
};

/**
 * Probe the service against the independent expectations. Passes a
 * validator override only for the gate's own bite test.
 */
export function runServiceConfigGate(
  validator: ServiceConfigValidator = realServiceValidator,
): ServiceConfigGateResult {
  const lines: ServiceConfigLine[] = [];
  const check = (source: string, label: string, independent: unknown, actual: unknown) => {
    lines.push({ source, label, independent, actual, ok: JSON.stringify(independent) === JSON.stringify(actual) });
  };

  const extensionProbes: Array<["grace_minutes" | "block_minutes" | "block_charge", string | number, Expectation]> = [
    ["grace_minutes", "25", minuteExpectation("25", true)],
    ["grace_minutes", "0", minuteExpectation("0", true)],
    ["grace_minutes", "123456789", minuteExpectation("123456789", true)],
    ["grace_minutes", 30, minuteExpectation(30, true)],
    ["grace_minutes", "25.0", { accepted: false }],
    ["grace_minutes", "-5", { accepted: false }],
    ["grace_minutes", "1e2", { accepted: false }],
    ["grace_minutes", "1234567890", { accepted: false }],
    ["block_minutes", "60", minuteExpectation("60", false)],
    ["block_minutes", "90", minuteExpectation("90", false)],
    ["block_minutes", "0", { accepted: false }],
    ["block_minutes", "-60", { accepted: false }],
    ["block_charge", "150", moneyExpectation("150", true)],
    ["block_charge", "175.5", moneyExpectation("175.5", true)],
    ["block_charge", "0.5", moneyExpectation("0.5", true)],
    ["block_charge", "150.50", moneyExpectation("150.50", true)],
    ["block_charge", 175.5, moneyExpectation(175.5, true)],
    ["block_charge", "0", { accepted: false }],
    ["block_charge", "0.00", { accepted: false }],
    ["block_charge", "150.", { accepted: false }],
    ["block_charge", "1234567890.1", moneyExpectation("1234567890.1", true)],
    ["block_charge", "1234567890.12", { accepted: false }],
    ["block_charge", "1234567890123", { accepted: false }],
  ];
  for (const [key, raw, expected] of extensionProbes) {
    const actual = validator.extension(key, raw);
    check(
      "spec/domain-rules.md §3.3 + fixture defaults",
      `extension.${key} = ${String(raw)} (vault-07 edge)`,
      expected,
      actual,
    );
  }

  const sampleItems: Array<keyof typeof CANTEEN_CATALOGUE> = ["bottled_water", "red_horse_1l", "marlboro_pack"];
  for (const item of sampleItems) {
    check(
      "spec/domain-rules.md §5 catalogue",
      `canteen.${item} = "0" (zero price is legal, vault-08)`,
      { accepted: true, canonicalText: "0" },
      validator.canteen(item, "0"),
    );
    check(
      "spec/domain-rules.md §5 catalogue",
      `canteen.${item} = "-1" (negative is refused)`,
      { accepted: false },
      validator.canteen(item, "-1"),
    );
    check(
      "spec/domain-rules.md §5 catalogue",
      `canteen.${item} = "150.50" (normalized)`,
      { accepted: true, canonicalText: "150.5" },
      validator.canteen(item, "150.50"),
    );
  }
  check(
    "vault-08",
    'canteen.unknown_item is refused (not a catalogue key)',
    { accepted: false },
    validator.canteen("unknown_item", "1"),
  );

  check(
    "fixture defaults (independent derivation)",
    "the default triple read from an empty card",
    independentDefaultTriple(),
    validator.overstayTriple({}),
  );
  check(
    "spec/domain-rules.md §3.3/§3.4",
    "a corrupted card falls back to the default triple (never punitive, never free)",
    independentDefaultTriple(),
    validator.overstayTriple(CORRUPTED_CARD),
  );
  check(
    "spec/domain-rules.md §3.3",
    "a valid stored card is honored (zero grace, 90-minute blocks, 175.5 charge)",
    { graceMinutes: 0, blockMinutes: 90, blockCharge: 175.5 },
    validator.overstayTriple({ extension: { grace_minutes: "0", block_minutes: "90", block_charge: "175.5" } }),
  );

  const driftedLines = lines.filter((line) => !line.ok);
  return { lines, driftedLines, zeroDrift: driftedLines.length === 0 };
}

export function buildServiceConfigReport(result: ServiceConfigGateResult): string {
  const out: string[] = [];
  out.push("## Service-configuration section (rate configuration, Phase 04)");
  out.push("");
  out.push("Independent path: character-code digit loops, decimal-expansion money");
  out.push("values, end-walk normalization — no regexes, no parseFloat, no code");
  out.push("shared with the service's schemas.");
  out.push("");
  for (const line of result.lines) {
    out.push(
      `- ${line.ok ? "ok" : "DRIFT"} [${line.source}] ${line.label}: independent ${JSON.stringify(line.independent)} vs service ${JSON.stringify(line.actual)}`,
    );
  }
  out.push("");
  out.push(
    result.zeroDrift
      ? "SERVICE VERDICT: ZERO DRIFT — the service accepts, refuses, and normalizes exactly per §3.3."
      : `SERVICE VERDICT: DRIFT DETECTED — ${result.driftedLines.length} behavior(s) diverged; the gate blocks.`,
  );
  return out.join("\n");
}
