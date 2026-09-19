import {
  EXTENSION_BLOCK_MINUTES,
  GRACE_EXTENSION_CHARGE_PHP,
  GRACE_PERIOD_MINUTES,
} from '@/constants/grace.constants'

export type OverstayPhase = 'booked' | 'grace' | 'overdue'

export interface OverstayParams {
  /** Free minutes after booked_end_at before extension blocks start. */
  graceMinutes: number
  /** Length of one billable extension block, in minutes ("started" blocks). */
  blockMinutes: number
  /** Price of one extension block, in pesos. */
  chargePhp: number
}

/** Mirrors the SQL defaults in get_extension_params (migration 0013). */
export const DEFAULT_OVERSTAY_PARAMS: OverstayParams = {
  graceMinutes: GRACE_PERIOD_MINUTES,
  blockMinutes: EXTENSION_BLOCK_MINUTES,
  chargePhp: GRACE_EXTENSION_CHARGE_PHP,
}

export interface OverstayStatus {
  phase: OverstayPhase
  /** Minutes left in the grace window; only meaningful in 'grace'. */
  graceMinutesLeft: number
  /** Minutes past the end of the grace window; only meaningful in 'overdue'. */
  overdueMinutes: number
  /** Started extension blocks accrued; only meaningful in 'overdue'. */
  blocksAccrued: number
  /** blocksAccrued × chargePhp. DISPLAY ONLY — the authoritative figure is sealed at checkout by close_session. */
  accruingAmount: number
}

/**
 * Where a session sits on the overstay ladder at instant `nowMs`:
 *   booked  — inside the booked window
 *   grace   — past booked_end_at, free grace window still running
 *   overdue — grace expired; started extension blocks are accruing
 * Pure display math so the desk alert works without pg_cron or Edge
 * Functions. The money actually charged is computed server-side at checkout
 * (migration 0013, close_session).
 */
export function computeOverstay(
  bookedEndAt: string,
  nowMs: number,
  params: OverstayParams = DEFAULT_OVERSTAY_PARAMS
): OverstayStatus {
  // Garbage cannot reach the badge as NaN/Infinity: an unparseable
  // booked_end_at (Date.parse -> NaN; Postgres can even store 'infinity')
  // or a non-finite now suppresses the alert to the booked-phase zeros —
  // close_session still seals the real money server-side. Params go through
  // the same sanitizing get_extension_params applies in SQL, so a zero or
  // non-finite block length can never divide the ladder into Infinity.
  const endMs = Date.parse(bookedEndAt)
  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs)) {
    return { phase: 'booked', graceMinutesLeft: 0, overdueMinutes: 0, blocksAccrued: 0, accruingAmount: 0 }
  }

  const pick = (value: number, fallback: number, min: number) =>
    Number.isFinite(value) && value >= min ? value : fallback
  const graceMinutes = pick(params.graceMinutes, DEFAULT_OVERSTAY_PARAMS.graceMinutes, 0)
  const blockMinutes = pick(params.blockMinutes, DEFAULT_OVERSTAY_PARAMS.blockMinutes, 1)
  // get_extension_params only honors a strictly positive charge — a zero
  // price is treated as unset there, so the display must not show ₱0 blocks.
  const chargePhp =
    Number.isFinite(params.chargePhp) && params.chargePhp > 0
      ? params.chargePhp
      : DEFAULT_OVERSTAY_PARAMS.chargePhp

  const graceEndMs = endMs + graceMinutes * 60_000

  if (nowMs < endMs) {
    return { phase: 'booked', graceMinutesLeft: 0, overdueMinutes: 0, blocksAccrued: 0, accruingAmount: 0 }
  }

  if (nowMs < graceEndMs) {
    const graceMinutesLeft = Math.ceil((graceEndMs - nowMs) / 60_000)
    return { phase: 'grace', graceMinutesLeft, overdueMinutes: 0, blocksAccrued: 0, accruingAmount: 0 }
  }

  const overdueMinutes = (nowMs - graceEndMs) / 60_000
  const blocksAccrued = Math.ceil(overdueMinutes / blockMinutes)
  return {
    phase: 'overdue',
    graceMinutesLeft: 0,
    overdueMinutes,
    blocksAccrued,
    accruingAmount: blocksAccrued * chargePhp,
  }
}

/**
 * Reads the per-branch extension params out of branches.rate_config
 * ("extension" key), falling back to system defaults for missing or invalid
 * values. Mirrors get_extension_params in migration 0013: the SQL side
 * regex-tests the TEXT a JSONB ->> produces, so the same text form is tested
 * here — a value that is missing, non-numeric, fractional where an integer
 * is required, signed, padded, or beyond the length caps is treated as
 * unset. A bad config must never become punitive (per-minute billing), free
 * (zero-price blocks), or overflow the server's integer cast (hence the
 * length caps, mirrored on both sides). grace_minutes may legitimately be 0;
 * block_minutes and charge_php may not be 0.
 */
export function extensionParamsFromConfig(
  rateConfig: Record<string, unknown> | null | undefined
): OverstayParams {
  const extension =
    rateConfig && typeof rateConfig === 'object'
      ? (rateConfig as { extension?: Record<string, unknown> }).extension
      : undefined

  // The text form the SQL side tests: a JSON string stays as-is, a JSON
  // number contributes its numeric text (String(25) === '25').
  const asText = (value: unknown): string | null =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : null

  // Integer parameter: digit-only text of at most 9 digits (the SQL length
  // cap that keeps the ::int cast un-overflowable) and at least `min`.
  const pickInt = (value: unknown, fallback: number, min: number): number => {
    const raw = asText(value)
    if (raw === null || !/^[0-9]+$/.test(raw) || raw.length > 9) return fallback
    const parsed = Number(raw)
    return parsed >= min ? parsed : fallback
  }

  // Money parameter: digits with an optional decimal part, at most 12
  // characters (the SQL length cap), and strictly above `min` — a zero
  // price is never accepted, it falls back to the default.
  const pickMoney = (value: unknown, fallback: number, min: number): number => {
    const raw = asText(value)
    if (raw === null || !/^[0-9]+(\.[0-9]+)?$/.test(raw) || raw.length > 12)
      return fallback
    const parsed = Number(raw)
    return parsed > min ? parsed : fallback
  }

  return {
    graceMinutes: pickInt(
      extension?.grace_minutes,
      DEFAULT_OVERSTAY_PARAMS.graceMinutes,
      0
    ),
    blockMinutes: pickInt(
      extension?.block_minutes,
      DEFAULT_OVERSTAY_PARAMS.blockMinutes,
      1
    ),
    chargePhp: pickMoney(
      extension?.charge_php,
      DEFAULT_OVERSTAY_PARAMS.chargePhp,
      0
    ),
  }
}
