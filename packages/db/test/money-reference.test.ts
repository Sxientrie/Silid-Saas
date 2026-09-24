import { describe, expect, it } from "vitest";
import {
  ADDON_CATALOGUE,
  CANTEEN_CATALOGUE,
  CANTEEN_CATEGORY_ORDER,
  CURRENCY,
  OVERSTAY_DEFAULTS,
  STAY_TYPES,
  WORKED_EXAMPLES,
  recomputeWorkedExample,
} from "../src/money-reference.js";

/**
 * The worked examples are recomputed through an independent arithmetic path
 * — per-guest accumulation loops and tier-list walking instead of the
 * closed-form formulas — and must land exactly on the spec's stated figures
 * (spec/domain-rules.md §1.4). This is the TypeScript side of the Money
 * Recomputation crosswalk; the SQL side runs app.stay_amounts against the
 * seeded default in supabase/tests/08_money_fixture_parity_test.sql.
 */
describe("money reference fixture (spec/domain-rules.md §1)", () => {
  it("recomputes every §1.4 worked example through an independent path", () => {
    for (const example of WORKED_EXAMPLES) {
      const recomputed = recomputeWorkedExample(example.booking_type, example.pax);
      expect(
        recomputed,
        `${example.booking_type} pax ${example.pax}`,
      ).toEqual({ base: example.base, surcharge: example.surcharge, total: example.total });
    }
  });

  it("states all nine §1.4 worked examples verbatim from the spec", () => {
    expect(
      WORKED_EXAMPLES.map((e) => [e.booking_type, e.pax, e.total]),
    ).toEqual([
      ["short_time", 2, 450],
      ["short_time", 3, 650],
      ["short_time", 4, 850],
      ["short_time", 5, 1050],
      ["overnight", 2, 1100],
      ["overnight", 3, 1400],
      ["overnight", 4, 1700],
      ["overnight", 5, 2000],
      ["overnight", 6, 2300],
    ]);
  });

  it("fixes the stay-type durations and surcharge structure", () => {
    expect(STAY_TYPES.short_time.duration_minutes).toBe(180);
    expect(STAY_TYPES.short_time.base_pax).toBe(2);
    expect(STAY_TYPES.short_time.flat_base).toBe(450);
    expect(STAY_TYPES.short_time.extra_pax_charge).toBe(200);
    expect(STAY_TYPES.overnight.duration_minutes).toBe(720);
    expect(STAY_TYPES.overnight.tiers).toEqual({ 2: 1100, 3: 1400, 4: 1700 });
    expect(STAY_TYPES.overnight.surcharge_base_pax).toBe(4);
    expect(STAY_TYPES.overnight.extra_pax_charge).toBe(300);
  });

  it("carries the 25/60/₱150 overstay defaults (vault-05/06/07)", () => {
    expect(OVERSTAY_DEFAULTS).toEqual({ grace_minutes: 25, block_minutes: 60, block_charge: 150 });
  });

  it("carries the six-item add-on catalogue plus the render-only extension item (vault-09)", () => {
    expect(ADDON_CATALOGUE).toEqual({
      towel: 20,
      bed_sheet: 20,
      blanket: 20,
      pillow: 50,
      big_foam: 300,
      small_foam: 200,
      extension_charge: 150,
    });
  });

  it("carries the 26-item canteen catalogue in five categories (vault-08)", () => {
    const items = Object.entries(CANTEEN_CATALOGUE);
    expect(items).toHaveLength(26);
    const byCategory = new Map<string, number>();
    for (const [, item] of items) {
      byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
      expect(item.price).toBeGreaterThan(0);
    }
    expect([...byCategory.keys()].sort()).toEqual([...CANTEEN_CATEGORY_ORDER].sort());
    expect(byCategory.get("Drinks & Beers")).toBe(10);
    expect(byCategory.get("Snacks")).toBe(3);
    expect(byCategory.get("Cup Noodles")).toBe(3);
    expect(byCategory.get("Cigars")).toBe(1);
    expect(byCategory.get("Others")).toBe(9);
  });

  it("prices every canteen item at the spec's stated default", () => {
    const specPrices: Record<string, number> = {
      bottled_water: 30,
      bottled_soft_drinks: 40,
      coffee: 30,
      juice_in_can: 70,
      red_bull: 80,
      gatorade_500ml: 80,
      pale_pilsen_bottled: 80,
      san_mig_light_bottled: 80,
      red_horse_500ml: 90,
      red_horse_1l: 170,
      big_curls: 60,
      biscuits: 20,
      fudge_bar: 20,
      spicy_bulalo_bulalo: 75,
      jiampong: 75,
      sotanghon: 60,
      marlboro_pack: 250,
      trust_condom: 70,
      lighter: 20,
      safeguard: 25,
      shampoo_conditioner: 25,
      toothbrush: 30,
      toothpaste: 20,
      napkin: 20,
      drivemax_coffee: 120,
      drivemax_capsule: 170,
    };
    expect(Object.fromEntries(itemsWithPrices())).toEqual(specPrices);
  });

  it("resolves a one-guest overnight to the lowest tier with no surcharge (vault-03)", () => {
    expect(recomputeWorkedExample("overnight", 1)).toEqual({ base: 1100, surcharge: 0, total: 1100 });
  });

  it("denominates everything in Philippine peso", () => {
    expect(CURRENCY).toBe("PHP");
  });
});

function itemsWithPrices(): [string, number][] {
  return Object.entries(CANTEEN_CATALOGUE).map(([id, item]) => [id, item.price]);
}
