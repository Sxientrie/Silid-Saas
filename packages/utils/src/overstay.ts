/**
 * The overstay ladder's display math (roadmap 06 Deliverable 4) and the
 * shared peso formatter (spec/applications.md §4 — display money uses the
 * shared currency formatter; figures are display-only renderings of
 * server-computed values).
 *
 * Pure and deterministic by design (spec/offline-sync.md §1: the desk keeps
 * computing the ladder from the session mirror while offline). The goldens
 * are vault-05/vault-06 (spec/legacy-behavior-vault.md, both OBSERVED); the
 * garbage-input fallback is spec/domain-rules.md §3.4. The authoritative
 * extension money is sealed exclusively at checkout (vault-11) — the accrual
 * figure here is what the desk watches, never what the guest is billed.
 */
import { OVERSTAY_DEFAULTS } from "@silid/db";

export type LadderPhase = "booked" | "grace" | "overdue";

export interface LadderReading {
  phase: LadderPhase;
  /** Grace minutes remaining, rounded up to the whole minute; 0 outside grace. */
  graceMinutesLeft: number;
  /** Whole minutes past the grace window; 0 before it closes. */
  overdueMinutes: number;
  /** Started blocks past grace (vault-06: ceil of the overdue time). */
  blocksAccrued: number;
  /** blocksAccrued × block price — the desk's accruing display figure. */
  accruingPhp: number;
}

export interface OverstayLadderInput {
  now: Date | string | number;
  bookedEndAt: Date | string | number | null | undefined;
  graceMinutes: number;
  blockMinutes: number;
  blockCharge: number;
}

const MINUTE_MS = 60_000;

function toFiniteMs(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Started-block count by ceil — the display twin of app.extension_blocks_due. */
function blocksFor(overdueMs: number, blockMinutes: number): number {
  if (!Number.isFinite(blockMinutes) || blockMinutes <= 0) {
    // A zero-length block would charge per-minute; a corrupted one must never
    // become punitive at the display layer (spec/domain-rules.md §3.3/§3.4).
    return 0;
  }
  return Math.ceil(overdueMs / (blockMinutes * MINUTE_MS));
}

/** A corrupted price renders no accrual rather than a wrong figure (§3.4). */
function safeCharge(blockCharge: number): number {
  return Number.isFinite(blockCharge) && blockCharge > 0 ? blockCharge : 0;
}

export function overstayLadder(input: OverstayLadderInput): LadderReading {
  const bookedEndMs = toFiniteMs(input.bookedEndAt);
  const nowMs = toFiniteMs(input.now);
  // Garbage in either instant degrades to the booked-phase zeros: silence is
  // recoverable, a NaN peso figure is a lie (spec/domain-rules.md §3.4).
  if (bookedEndMs === null || nowMs === null) {
    return { phase: "booked", graceMinutesLeft: 0, overdueMinutes: 0, blocksAccrued: 0, accruingPhp: 0 };
  }

  if (nowMs < bookedEndMs) {
    return { phase: "booked", graceMinutesLeft: 0, overdueMinutes: 0, blocksAccrued: 0, accruingPhp: 0 };
  }

  const graceMs = input.graceMinutes * MINUTE_MS;
  const overdueMs = nowMs - (bookedEndMs + graceMs);
  if (overdueMs < 0) {
    return {
      phase: "grace",
      graceMinutesLeft: Math.ceil(-overdueMs / MINUTE_MS),
      overdueMinutes: 0,
      blocksAccrued: 0,
      accruingPhp: 0,
    };
  }

  const blocks = blocksFor(overdueMs, input.blockMinutes);
  return {
    phase: "overdue",
    graceMinutesLeft: 0,
    overdueMinutes: Math.floor(overdueMs / MINUTE_MS),
    blocksAccrued: blocks,
    accruingPhp: blocks * safeCharge(input.blockCharge),
  };
}

/**
 * The desk's peso figure renderer: sign, peso mark, comma grouping. Garbage
 * or negative inputs render ₱0 — the display can degrade to silence, never
 * to a wrong figure (spec/domain-rules.md §3.4). Authoritative amounts are
 * always the server's; this formats them (or a ladder display figure) for
 * humans only.
 */
export function formatPeso(amountPhp: number): string {
  if (!Number.isFinite(amountPhp) || amountPhp <= 0) {
    return "₱0";
  }
  const grouped = Math.trunc(amountPhp)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₱${grouped}`;
}

/** The default overstay triple, re-exported from the money reference fixture. */
export const DEFAULT_OVERSTAY = OVERSTAY_DEFAULTS;
