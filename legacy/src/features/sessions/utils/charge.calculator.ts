import {
  BOOKING_DURATION_HOURS,
  PAX_SURCHARGE_RULES,
  type BookingType,
} from '@/constants/booking.constants'

export function calculateCharge(bookingType: BookingType, pax: number) {
  // Base rates per booking type (from Idol Motel reference)
  const BASE_RATES: Record<BookingType, Record<number, number>> = {
    SHORT_TIME: { 2: 450 },
    OVERNIGHT: { 2: 1100, 3: 1400, 4: 1700 },
  }

  const rules = PAX_SURCHARGE_RULES[bookingType]
  const baseRates = BASE_RATES[bookingType]

  // Find the appropriate base rate
  let baseRate: number
  if (bookingType === 'SHORT_TIME') {
    baseRate = baseRates[2]
  } else {
    // Overnight: use the highest matching tier
    const tiers = Object.keys(baseRates)
      .map(Number)
      .sort((a, b) => a - b)
    const matchedTier = tiers.filter((t) => t <= pax).pop() ?? tiers[0]
    baseRate = baseRates[matchedTier]
  }

  // Calculate surcharges for extra guests beyond base pax
  const extraPax = Math.max(0, pax - rules.base_pax)
  const surcharges = extraPax * rules.surcharge_per_extra_pax_php

  const total = baseRate + surcharges

  return {
    baseRate,
    surcharges,
    total,
    duration: BOOKING_DURATION_HOURS[bookingType],
  }
}
