export const BOOKING_DURATION_HOURS = {
  SHORT_TIME: 3,
  OVERNIGHT:  12,
} as const;

export type BookingType = keyof typeof BOOKING_DURATION_HOURS;

export const PAX_SURCHARGE_RULES = {
  SHORT_TIME: {
    base_pax:                    2,
    surcharge_per_extra_pax_php: 200,
  },
  OVERNIGHT: {
    base_pax:                    4,
    surcharge_per_extra_pax_php: 300,
  },
} as const;
