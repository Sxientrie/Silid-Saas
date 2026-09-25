/**
 * Money Recomputation Gate utility (roadmap 02 Deliverable 14;
 * spec/domain-rules.md §7). Recomputes every peso figure the phase can
 * produce through an arithmetic path that reuses NO production code —
 * neither the SQL functions (app.stay_amounts) nor the fixture's own
 * reference path — so a shared defect cannot self-confirm. The gate hunts
 * losses, duplicates, and misattributions: a single peso of drift blocks.
 *
 * The stated figures come from the money reference fixture (@silid/db) and
 * the vault goldens (./vault-goldens.ts) — both are data, not arithmetic.
 *
 * Defined CLI invocation (the command phases 04–12 run):
 *   node packages/testing/src/money-recompute.ts --reference
 *   node packages/testing/src/money-recompute.ts --reference --out <file.md>
 *   node packages/testing/src/money-recompute.ts --ledger --seed 20260925 --events 40
 *
 * Exit code 0 only on zero drift; 1 otherwise.
 */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  OVERSTAY_DEFAULTS,
  STAY_TYPES,
  WORKED_EXAMPLES,
} from "@silid/db/src/money-reference.ts";
import { vaultBookingGoldens, vaultExtensionBlockGoldens } from "./vault-goldens.ts";
import { buildServiceConfigReport, runServiceConfigGate } from "./service-config-gate.ts";

export interface RecomputedFigure {
  source: string;
  label: string;
  independent_php: number;
  stated_php: number;
}

export interface MoneyRecomputeResult {
  recomputedFigures: RecomputedFigure[];
  driftedFigures: RecomputedFigure[];
  blockChargePhp: number;
}

export interface MoneyRecomputeReport {
  zeroDrift: boolean;
  driftedFigures: Array<RecomputedFigure & { drift_php: number }>;
  lines: Array<{ source: string; label: string; independent_php: number; stated_php: number }>;
}

/**
 * Overnight base by cumulative tier-step deltas from the lowest tier — a
 * different grouping than any production path (which selects the highest
 * matching tier directly).
 */
export function recomputeOvernightBase(pax: number): number {
  const tiers = Object.entries(STAY_TYPES.overnight.tiers)
    .map(([tierPax, price]) => ({ tierPax: Number(tierPax), price }))
    .sort((a, b) => a.tierPax - b.tierPax);
  const first = tiers[0];
  if (first === undefined) {
    throw new Error("the overnight tier list is empty");
  }
  let base = first.price;
  let stepIndex = 0;
  for (const tier of tiers.slice(1)) {
    stepIndex += 1;
    const previous = tiers[stepIndex - 1];
    if (pax >= tier.tierPax && previous !== undefined) {
      base += tier.price - previous.price;
    }
  }
  return base;
}

/**
 * Extension blocks by floor-plus-remainder — a different formula shape than
 * production's ceil(overdue / block).
 */
export function recomputeBlockCount(overdueMinutes: number): number {
  if (overdueMinutes <= 0) {
    return 0;
  }
  const wholeBlocks = (overdueMinutes - (overdueMinutes % OVERSTAY_DEFAULTS.block_minutes)) / OVERSTAY_DEFAULTS.block_minutes;
  const partialBlock = overdueMinutes % OVERSTAY_DEFAULTS.block_minutes > 0 ? 1 : 0;
  return wholeBlocks + partialBlock;
}

function independentShortTimeTotal(pax: number): { base: number; surcharge: number; total: number } {
  const base = STAY_TYPES.short_time.flat_base;
  let surcharge = 0;
  for (let extra = pax - STAY_TYPES.short_time.base_pax; extra > 0; extra -= 1) {
    surcharge += STAY_TYPES.short_time.extra_pax_charge;
  }
  return { base, surcharge, total: base + surcharge };
}

function independentOvernightTotal(pax: number): { base: number; surcharge: number; total: number } {
  const base = recomputeOvernightBase(pax);
  let surcharge = 0;
  for (let extra = pax - STAY_TYPES.overnight.surcharge_base_pax; extra > 0; extra -= 1) {
    surcharge += STAY_TYPES.overnight.extra_pax_charge;
  }
  return { base, surcharge, total: base + surcharge };
}

/** Recomputes every stated figure through the independent paths and diffs. */
export function recomputeReferenceFigures(): MoneyRecomputeResult {
  const lines: RecomputedFigure[] = [];

  for (const example of WORKED_EXAMPLES) {
    const independent =
      example.booking_type === "short_time"
        ? independentShortTimeTotal(example.pax)
        : independentOvernightTotal(example.pax);
    lines.push({
      source: "spec/domain-rules.md §1.4",
      label: `${example.booking_type} pax ${example.pax}`,
      independent_php: independent.total,
      stated_php: example.total,
    });
    lines.push({
      source: "spec/domain-rules.md §1.4",
      label: `${example.booking_type} pax ${example.pax} (base)`,
      independent_php: independent.base,
      stated_php: example.base,
    });
    lines.push({
      source: "spec/domain-rules.md §1.4",
      label: `${example.booking_type} pax ${example.pax} (surcharge)`,
      independent_php: independent.surcharge,
      stated_php: example.surcharge,
    });
  }

  for (const golden of vaultBookingGoldens()) {
    const independent =
      golden.booking_type === "short_time"
        ? independentShortTimeTotal(golden.pax)
        : independentOvernightTotal(golden.pax);
    lines.push({
      source: golden.id,
      label: `${golden.title} (total)`,
      independent_php: independent.total,
      stated_php: golden.total_php,
    });
  }

  for (const golden of vaultExtensionBlockGoldens()) {
    const blocks = recomputeBlockCount(golden.overdue_minutes_after_grace);
    lines.push({
      source: golden.id,
      label: `${golden.title} (${golden.overdue_blocks} block${golden.overdue_blocks > 1 ? "s" : ""})`,
      independent_php: blocks * OVERSTAY_DEFAULTS.block_charge,
      stated_php: golden.total_php,
    });
  }

  const drifted = lines.filter((line) => line.independent_php !== line.stated_php);
  return { recomputedFigures: lines, driftedFigures: drifted, blockChargePhp: OVERSTAY_DEFAULTS.block_charge };
}

export function diffFigures(lines: RecomputedFigure[]): MoneyRecomputeReport {
  const driftedFigures = lines
    .filter((line) => line.independent_php !== line.stated_php)
    .map((line) => ({ ...line, drift_php: line.independent_php - line.stated_php }));
  return { zeroDrift: driftedFigures.length === 0, driftedFigures, lines };
}

export interface LedgerEvent {
  id: string;
  amount_php: number;
}

export interface LedgerReconciliation {
  runningTotalPhp: number;
  groupedTotalPhp: number;
  reconciled: boolean;
  anomalies: Array<{ id: string; reason: string }>;
}

/**
 * Re-sums posted charge events two ways (running total vs grouped batches)
 * and reports anomalies — NaN, infinities, and negative pesos are surfaced,
 * never silently summed (garbage inputs fall back, never lie).
 */
export function reconcileLedger(events: LedgerEvent[]): LedgerReconciliation {
  const anomalies: Array<{ id: string; reason: string }> = [];
  let runningTotalPhp = 0;
  const batches = new Map<number, number>();
  for (const [index, event] of events.entries()) {
    if (!Number.isFinite(event.amount_php)) {
      anomalies.push({ id: event.id ?? `index-${index}`, reason: "non-finite amount" });
      continue;
    }
    if (event.amount_php < 0) {
      anomalies.push({ id: event.id ?? `index-${index}`, reason: "negative amount" });
      continue;
    }
    runningTotalPhp += event.amount_php;
    batches.set(event.amount_php, (batches.get(event.amount_php) ?? 0) + event.amount_php);
  }
  let groupedTotalPhp = 0;
  for (const batchTotal of batches.values()) {
    groupedTotalPhp += batchTotal;
  }
  return {
    runningTotalPhp,
    groupedTotalPhp,
    reconciled: anomalies.length === 0 && runningTotalPhp === groupedTotalPhp,
    anomalies,
  };
}

/** Mulberry32 — small, fully deterministic, no dependencies. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_SEED = 20260925;

/** The gate's deterministic environment: seeded synthetic charge events. */
export function seededLedger(seed: number, eventCount: number): { seed: number; events: LedgerEvent[] } {
  const cataloguePrices = [450, 650, 850, 1050, 1100, 1400, 1700, 2000, 2300, 150, 300, 20, 50, 30, 75, 250];
  const random = prng(seed);
  const events: LedgerEvent[] = [];
  for (let i = 0; i < eventCount; i += 1) {
    const priceIndex = Math.floor(random() * cataloguePrices.length);
    const amount = cataloguePrices[priceIndex];
    if (amount === undefined) {
      throw new Error("catalogue price lookup failed");
    }
    events.push({ id: `seeded-${seed}-${i}`, amount_php: amount });
  }
  return { seed, events };
}

export function buildReport(result: MoneyRecomputeReport): string {
  const out: string[] = [];
  out.push("# Money Recomputation Gate — diff report");
  out.push("");
  out.push("Independent path: per-guest accumulation, cumulative tier-step deltas,");
  out.push("floor-plus-remainder block counting, dual-order ledger summation.");
  out.push("Reuses no production arithmetic (app.stay_amounts, app.extension_blocks_due).");
  out.push("");
  for (const line of result.lines) {
    const marker = line.independent_php === line.stated_php ? "ok" : "DRIFT";
    out.push(
      `- ${marker} [${line.source}] ${line.label}: independent ₱${line.independent_php} vs stated ₱${line.stated_php}`,
    );
  }
  out.push("");
  out.push(
    result.zeroDrift
      ? "VERDICT: ZERO DRIFT — every stated figure recomputed exactly."
      : `VERDICT: DRIFT DETECTED — ${result.driftedFigures.length} figure(s) drifted; the gate blocks.`,
  );
  return out.join("\n");
}

function main(argv: string[]): number {
  const has = (flag: string) => argv.includes(flag);
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  if (!has("--reference") && !has("--ledger") && !has("--service-config")) {
    console.error(
      "money-recompute: nothing to do. Pass --reference (worked examples + vault goldens), --ledger, and/or --service-config (the rate-configuration service's accepted behavior).",
    );
    return 2;
  }

  const sections: string[] = [];
  let zeroDrift = true;

  if (has("--reference") || has("--ledger")) {
    const lines: RecomputedFigure[] = [];

    if (has("--reference")) {
      const result = recomputeReferenceFigures();
      lines.push(...result.recomputedFigures);
    }

    if (has("--ledger")) {
      const seed = Number(value("--seed") ?? DEFAULT_SEED);
      const eventCount = Number(value("--events") ?? 40);
      const ledger = reconcileLedger(seededLedger(seed, eventCount).events);
      lines.push({
        source: "seeded ledger",
        label: `seed ${seed}, ${eventCount} events (running vs grouped summation)`,
        independent_php: ledger.runningTotalPhp,
        stated_php: ledger.groupedTotalPhp,
      });
      for (const anomaly of ledger.anomalies) {
        console.error(`money-recompute: anomaly ${anomaly.id}: ${anomaly.reason}`);
      }
    }

    const report = diffFigures(lines);
    zeroDrift &&= report.zeroDrift;
    sections.push(buildReport(report));
  }

  if (has("--service-config")) {
    const gate = runServiceConfigGate();
    zeroDrift &&= gate.zeroDrift;
    sections.push(buildServiceConfigReport(gate));
  }

  const markdown = sections.join("\n\n");
  const verdict = zeroDrift
    ? undefined
    : "\nGATE: BLOCKED — drift detected (see the sections above).";
  const outPath = value("--out");
  if (outPath) {
    writeFileSync(outPath, `${markdown}${verdict ?? ""}\n`);
    console.error(`money-recompute: report written to ${outPath}`);
  }
  console.log(markdown);
  return zeroDrift ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
