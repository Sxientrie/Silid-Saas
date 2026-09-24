/**
 * Money reference fixture (spec/domain-rules.md §1, §5, §6; MONEY REFERENCE
 * RULE, spec/00-master-goal.md). The single machine-readable home of every
 * peso figure the system prices from: rate card, tiers, surcharges, overstay
 * parameters, add-on and canteen catalogues, and the §1.4 worked examples.
 * No test file re-types a peso figure — everything imports from here. The
 * database-side copy of these values is the branches.rate_config column
 * default (migration 20260924141037_database_core.sql), crosswalked by
 * supabase/tests/08_money_fixture_parity_test.sql.
 */

export const CURRENCY = "PHP" as const;

export type BookingType = "short_time" | "overnight";

export const STAY_TYPES = {
  short_time: {
    duration_minutes: 180,
    base_pax: 2,
    flat_base: 450,
    extra_pax_charge: 200,
  },
  overnight: {
    duration_minutes: 720,
    tiers: { 2: 1100, 3: 1400, 4: 1700 },
    surcharge_base_pax: 4,
    extra_pax_charge: 300,
  },
} as const;

export const OVERSTAY_DEFAULTS = {
  grace_minutes: 25,
  block_minutes: 60,
  block_charge: 150,
} as const;

export const ADDON_CATALOGUE = {
  towel: 20,
  bed_sheet: 20,
  blanket: 20,
  pillow: 50,
  big_foam: 300,
  small_foam: 200,
  /** Render-only for posted rows; only the checkout transaction writes it. */
  extension_charge: 150,
} as const;

export const CANTEEN_CATEGORY_ORDER = [
  "Drinks & Beers",
  "Snacks",
  "Cup Noodles",
  "Cigars",
  "Others",
] as const;

export const CANTEEN_CATALOGUE = {
  bottled_water: { label: "Bottled Water", price: 30, category: "Drinks & Beers" },
  bottled_soft_drinks: { label: "Bottled Soft Drinks", price: 40, category: "Drinks & Beers" },
  coffee: { label: "Coffee", price: 30, category: "Drinks & Beers" },
  juice_in_can: { label: "Juice in Can", price: 70, category: "Drinks & Beers" },
  red_bull: { label: "Red Bull", price: 80, category: "Drinks & Beers" },
  gatorade_500ml: { label: "Gatorade 500ml", price: 80, category: "Drinks & Beers" },
  pale_pilsen_bottled: { label: "Pale Pilsen Bottled", price: 80, category: "Drinks & Beers" },
  san_mig_light_bottled: { label: "San Mig Light Bottled", price: 80, category: "Drinks & Beers" },
  red_horse_500ml: { label: "Red Horse 500ml", price: 90, category: "Drinks & Beers" },
  red_horse_1l: { label: "Red Horse 1L", price: 170, category: "Drinks & Beers" },
  big_curls: { label: "Big Curls", price: 60, category: "Snacks" },
  biscuits: { label: "Biscuits", price: 20, category: "Snacks" },
  fudge_bar: { label: "Fudge Bar", price: 20, category: "Snacks" },
  spicy_bulalo_bulalo: { label: "Spicy Bulalo / Bulalo", price: 75, category: "Cup Noodles" },
  jiampong: { label: "Jiampong", price: 75, category: "Cup Noodles" },
  sotanghon: { label: "Sotanghon", price: 60, category: "Cup Noodles" },
  marlboro_pack: { label: "Marlboro (pack)", price: 250, category: "Cigars" },
  trust_condom: { label: "Trust Condom", price: 70, category: "Others" },
  lighter: { label: "Lighter", price: 20, category: "Others" },
  safeguard: { label: "Safeguard", price: 25, category: "Others" },
  shampoo_conditioner: { label: "Shampoo / Conditioner", price: 25, category: "Others" },
  toothbrush: { label: "Toothbrush", price: 30, category: "Others" },
  toothpaste: { label: "Toothpaste", price: 20, category: "Others" },
  napkin: { label: "Napkin", price: 20, category: "Others" },
  drivemax_coffee: { label: "Drivemax Coffee", price: 120, category: "Others" },
  drivemax_capsule: { label: "Drivemax Capsule", price: 170, category: "Others" },
} as const;

/**
 * The §1.4 worked examples, verbatim from spec/domain-rules.md. Every charge
 * test's goldens must equal or visibly derive from these values.
 */
export const WORKED_EXAMPLES = [
  { booking_type: "short_time", pax: 2, base: 450, surcharge: 0, total: 450 },
  { booking_type: "short_time", pax: 3, base: 450, surcharge: 200, total: 650 },
  { booking_type: "short_time", pax: 4, base: 450, surcharge: 400, total: 850 },
  { booking_type: "short_time", pax: 5, base: 450, surcharge: 600, total: 1050 },
  { booking_type: "overnight", pax: 2, base: 1100, surcharge: 0, total: 1100 },
  { booking_type: "overnight", pax: 3, base: 1400, surcharge: 0, total: 1400 },
  { booking_type: "overnight", pax: 4, base: 1700, surcharge: 0, total: 1700 },
  { booking_type: "overnight", pax: 5, base: 1700, surcharge: 300, total: 2000 },
  { booking_type: "overnight", pax: 6, base: 1700, surcharge: 600, total: 2300 },
] as const;

/**
 * Independent recomputation path for the worked examples: per-guest
 * accumulation loops and an ascending tier-list walk — deliberately NOT the
 * closed-form arithmetic the SQL production path (app.stay_amounts) uses, so
 * the two cannot share a defect (Money Recomputation Gate,
 * spec/domain-rules.md §7).
 */
export function recomputeWorkedExample(
  bookingType: BookingType,
  pax: number,
): { base: number; surcharge: number; total: number } {
  if (bookingType === "short_time") {
    let surcharge = 0;
    for (let guest = STAY_TYPES.short_time.base_pax + 1; guest <= pax; guest += 1) {
      surcharge += STAY_TYPES.short_time.extra_pax_charge;
    }
    return { base: STAY_TYPES.short_time.flat_base, surcharge, total: STAY_TYPES.short_time.flat_base + surcharge };
  }

  const tiers: Readonly<Record<number, number>> = STAY_TYPES.overnight.tiers;
  const tierKeys = Object.keys(tiers)
    .map(Number)
    .filter((key) => key <= pax);
  // Tier selection is order-independent: the highest tier not exceeding the
  // guest count; a booking below every tier resolves to the lowest (vault-03).
  const selected = tierKeys.length > 0 ? Math.max(...tierKeys) : Math.min(...Object.keys(tiers).map(Number));
  const base = tiers[selected];
  if (base === undefined) {
    throw new Error("the overnight tier list is empty");
  }
  let surcharge = 0;
  for (let guest = STAY_TYPES.overnight.surcharge_base_pax + 1; guest <= pax; guest += 1) {
    surcharge += STAY_TYPES.overnight.extra_pax_charge;
  }
  return { base, surcharge, total: base + surcharge };
}
