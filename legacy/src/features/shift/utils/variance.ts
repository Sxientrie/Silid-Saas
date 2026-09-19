/**
 * Shared presentation helpers for shift variance figures.
 * variance = counted cash − expected cash; negative means the drawer is short.
 */

export type VarianceTone = 'short' | 'over' | 'even' | 'none'

export function varianceTone(variance: number | null): VarianceTone {
  if (variance === null) return 'none'
  if (variance < 0) return 'short'
  if (variance > 0) return 'over'
  return 'even'
}

export function formatVariance(variance: number | null): string {
  const tone = varianceTone(variance)
  switch (tone) {
    case 'short':
      return `₱${Math.abs(variance as number).toLocaleString('fil-PH')} short`
    case 'over':
      return `₱${(variance as number).toLocaleString('fil-PH')} over`
    case 'even':
      return 'exact'
    case 'none':
      return 'no count recorded'
  }
}
