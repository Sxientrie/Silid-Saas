import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OVERSTAY_PARAMS,
  computeOverstay,
  extensionParamsFromConfig,
} from './overstay'

// Fixed instants so nothing depends on the wall clock.
const END = Date.parse('2026-01-15T12:00:00Z')
const min = (m: number) => END + m * 60_000

// Defaults: 25-minute grace, 60-minute blocks, ₱150 per block.

describe('computeOverstay — booked phase', () => {
  it('is booked before the end time', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(-1))).toMatchObject({
      phase: 'booked',
      graceMinutesLeft: 0,
      blocksAccrued: 0,
      accruingAmount: 0,
    })
  })
})

describe('computeOverstay — grace phase', () => {
  it('enters grace exactly at the end time, full window remaining', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(0))).toMatchObject({
      phase: 'grace',
      graceMinutesLeft: 25,
      blocksAccrued: 0,
      accruingAmount: 0,
    })
  })

  it('counts the grace window down', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(10)).graceMinutesLeft).toBe(15)
  })

  it('rounds a partial grace minute up', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(24) + 30_000).graceMinutesLeft).toBe(1)
  })
})

describe('computeOverstay — overdue phase', () => {
  it('is overdue with zero blocks exactly when the grace window closes', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(25))).toMatchObject({
      phase: 'overdue',
      blocksAccrued: 0,
      accruingAmount: 0,
      overdueMinutes: 0,
    })
  })

  it('charges a started block from the first minute past grace', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(26))).toMatchObject({
      phase: 'overdue',
      blocksAccrued: 1,
      accruingAmount: 150,
    })
  })

  it('a completed block is one block', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(25 + 60)).blocksAccrued).toBe(1)
  })

  it('a minute into the second block bills two blocks', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(25 + 61))).toMatchObject({
      blocksAccrued: 2,
      accruingAmount: 300,
    })
  })

  it('the boundary between blocks rounds up', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(25 + 60) + 30_000).blocksAccrued).toBe(2)
  })
})

describe('computeOverstay — garbage inputs (display must never read NaN)', () => {
  it('an unparseable end time falls back to the booked-phase zeros', () => {
    expect(computeOverstay('not-a-date', min(120))).toMatchObject({
      phase: 'booked',
      graceMinutesLeft: 0,
      overdueMinutes: 0,
      blocksAccrued: 0,
      accruingAmount: 0,
    })
    expect(computeOverstay('', min(120)).accruingAmount).toBe(0)
  })

  it('a non-finite now is treated as unknown, never as infinite overstay', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', Infinity)).toMatchObject({
      phase: 'booked',
      accruingAmount: 0,
    })
    expect(computeOverstay('2026-01-15T12:00:00Z', NaN).accruingAmount).toBe(0)
  })

  it('garbage params cannot divide the ladder into Infinity or NaN money', () => {
    expect(
      computeOverstay('2026-01-15T12:00:00Z', min(26), {
        graceMinutes: NaN,
        blockMinutes: 0,
        chargePhp: NaN,
      })
    ).toMatchObject({ phase: 'overdue', blocksAccrued: 1, accruingAmount: 150 })
    expect(
      computeOverstay('2026-01-15T12:00:00Z', min(26), {
        graceMinutes: 0,
        blockMinutes: -60,
        chargePhp: Infinity,
      })
    ).toMatchObject({ phase: 'overdue', blocksAccrued: 1, accruingAmount: 150 })
  })
})

describe('computeOverstay — custom params', () => {
  const params = { graceMinutes: 0, blockMinutes: 30, chargePhp: 200 }

  it('with zero grace, the end time is already overdue at zero blocks', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(0), params)).toMatchObject({
      phase: 'overdue',
      blocksAccrued: 0,
      accruingAmount: 0,
    })
  })

  it('uses the custom block length and charge', () => {
    expect(computeOverstay('2026-01-15T12:00:00Z', min(31), params)).toMatchObject({
      blocksAccrued: 2,
      accruingAmount: 400,
    })
  })
})

describe('extensionParamsFromConfig', () => {
  it('falls back to defaults for missing config', () => {
    expect(extensionParamsFromConfig(null)).toEqual(DEFAULT_OVERSTAY_PARAMS)
    expect(extensionParamsFromConfig(undefined)).toEqual(DEFAULT_OVERSTAY_PARAMS)
    expect(extensionParamsFromConfig({})).toEqual(DEFAULT_OVERSTAY_PARAMS)
  })

  it('reads overrides from the extension key', () => {
    expect(
      extensionParamsFromConfig({
        extension: { grace_minutes: 10, block_minutes: 30, charge_php: 200 },
        canteen: { coffee: 35 },
      })
    ).toEqual({ graceMinutes: 10, blockMinutes: 30, chargePhp: 200 })
  })

  it('fills only the missing or invalid keys from defaults', () => {
    expect(
      extensionParamsFromConfig({ extension: { grace_minutes: 10, charge_php: 'abc' } })
    ).toEqual({ graceMinutes: 10, blockMinutes: 60, chargePhp: 150 })
  })

  it('treats invalid block lengths as unset, never as per-minute billing', () => {
    expect(
      extensionParamsFromConfig({ extension: { block_minutes: -5 } }).blockMinutes
    ).toBe(60)
    expect(
      extensionParamsFromConfig({ extension: { block_minutes: 0 } }).blockMinutes
    ).toBe(60)
    expect(
      extensionParamsFromConfig({ extension: { charge_php: -1 } }).chargePhp
    ).toBe(150)
  })

  it('accepts zero grace but not zero block length', () => {
    expect(
      extensionParamsFromConfig({ extension: { grace_minutes: 0 } }).graceMinutes
    ).toBe(0)
  })
})

describe('extensionParamsFromConfig — SQL parity edges (migration 0013)', () => {
  it('rejects fractional values where the SQL regex requires integers', () => {
    expect(
      extensionParamsFromConfig({ extension: { grace_minutes: 25.5 } }).graceMinutes
    ).toBe(25)
    expect(
      extensionParamsFromConfig({ extension: { block_minutes: '30.5' } }).blockMinutes
    ).toBe(60)
  })

  it('rejects exponent and padded text the SQL regex rejects', () => {
    expect(
      extensionParamsFromConfig({ extension: { grace_minutes: '1e2' } }).graceMinutes
    ).toBe(25)
    expect(
      extensionParamsFromConfig({ extension: { grace_minutes: ' 25' } }).graceMinutes
    ).toBe(25)
    expect(
      extensionParamsFromConfig({ extension: { block_minutes: '+60' } }).blockMinutes
    ).toBe(60)
  })

  it('falls back when a value would overflow the server int cast', () => {
    expect(
      extensionParamsFromConfig({ extension: { grace_minutes: '99999999999' } })
        .graceMinutes
    ).toBe(25)
    expect(
      extensionParamsFromConfig({ extension: { block_minutes: '1234567890' } })
        .blockMinutes
    ).toBe(60)
  })

  it('accepts values exactly at the SQL length caps (9 digits int, 12 chars money)', () => {
    expect(
      extensionParamsFromConfig({ extension: { grace_minutes: '123456789' } })
        .graceMinutes
    ).toBe(123456789)
    expect(
      extensionParamsFromConfig({ extension: { grace_minutes: '1234567890' } })
        .graceMinutes
    ).toBe(25)
    expect(
      extensionParamsFromConfig({ extension: { charge_php: '999999999999' } })
        .chargePhp
    ).toBe(999999999999)
    expect(
      extensionParamsFromConfig({ extension: { charge_php: '9999999999999' } })
        .chargePhp
    ).toBe(150)
  })

  it('never accepts a zero price — zero-price blocks fall back to the default', () => {
    expect(extensionParamsFromConfig({ extension: { charge_php: 0 } }).chargePhp).toBe(150)
    expect(
      extensionParamsFromConfig({ extension: { charge_php: '0.00' } }).chargePhp
    ).toBe(150)
  })

  it('accepts decimal prices the SQL regex accepts', () => {
    expect(
      extensionParamsFromConfig({ extension: { charge_php: '150.50' } }).chargePhp
    ).toBe(150.5)
  })

  it('rejects trailing-dot money the SQL regex rejects', () => {
    expect(extensionParamsFromConfig({ extension: { charge_php: '150.' } }).chargePhp).toBe(150)
  })
})
