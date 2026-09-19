import { useEffect, useState } from 'react'
import {
  computeOverstay,
  DEFAULT_OVERSTAY_PARAMS,
  type OverstayParams,
  type OverstayStatus,
} from '../utils/overstay'

const TICK_MS = 10_000

/**
 * Live overstay status for one session, re-evaluated every 10 seconds.
 * Pure display math over session timestamps (see utils/overstay.ts) — the
 * authoritative extension charge is sealed server-side at checkout. Returns
 * null while there is no session end to evaluate.
 */
export function useGracePeriod(
  sessionEndAt: string | null,
  params: OverstayParams = DEFAULT_OVERSTAY_PARAMS
): OverstayStatus | null {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  if (!sessionEndAt) return null
  return computeOverstay(sessionEndAt, nowMs, params)
}
