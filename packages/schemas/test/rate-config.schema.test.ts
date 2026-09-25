import { describe, expect, it } from "vitest";
import {
  CANTEEN_ITEM_IDS,
  extensionOverridesSchema,
  canteenOverridesSchema,
  updateRateConfigInputSchema,
  rateConfigSchema,
  readOverstayTriple,
  type ExtensionOverridesInput,
} from "../src/index.js";

/**
 * Vault-07 / spec/domain-rules.md §3.3 validation semantics, mirrored in
 * Zod so the service refuses what the database runtime reader would
 * silently fall back from. Every accepted/normalized value below mirrors
 * the gate-accepted Phase 02 SQL behavior (suites 06 + the
 * app.overstay_params reader).
 */
describe("extension override validation (vault-07, §3.3)", () => {
  describe("grace_minutes — digit-only text, up to 9 digits; zero is legal", () => {
    it("accepts zero (a legitimate grace of zero)", () => {
      const result = extensionOverridesSchema.parse({ grace_minutes: "0" });
      expect(result.grace_minutes).toBe("0");
    });

    it("accepts a whole-minute default value", () => {
      const result = extensionOverridesSchema.parse({ grace_minutes: "25" });
      expect(result.grace_minutes).toBe("25");
    });

    it("accepts the full 9-digit length", () => {
      const result = extensionOverridesSchema.parse({ grace_minutes: "123456789" });
      expect(result.grace_minutes).toBe("123456789");
    });

    it("refuses fractional minutes (the runtime would silently fall back)", () => {
      expect(extensionOverridesSchema.safeParse({ grace_minutes: "25.0" }).success).toBe(false);
      expect(extensionOverridesSchema.safeParse({ grace_minutes: "0.5" }).success).toBe(false);
    });

    it("refuses signed values", () => {
      expect(extensionOverridesSchema.safeParse({ grace_minutes: "-5" }).success).toBe(false);
      expect(extensionOverridesSchema.safeParse({ grace_minutes: "+5" }).success).toBe(false);
    });

    it("refuses exponent notation", () => {
      expect(extensionOverridesSchema.safeParse({ grace_minutes: "1e2" }).success).toBe(false);
    });

    it("refuses overflow-length values (one digit past 9)", () => {
      expect(extensionOverridesSchema.safeParse({ grace_minutes: "1234567890" }).success).toBe(false);
    });

    it("refuses empty and non-digit text", () => {
      expect(extensionOverridesSchema.safeParse({ grace_minutes: "" }).success).toBe(false);
      expect(extensionOverridesSchema.safeParse({ grace_minutes: " 25" }).success).toBe(false);
      expect(extensionOverridesSchema.safeParse({ grace_minutes: "abc" }).success).toBe(false);
    });

    it("accepts a number input by its canonical text form (the jsonb text the database reads)", () => {
      const result = extensionOverridesSchema.parse({ grace_minutes: 30 });
      expect(result.grace_minutes).toBe("30");
    });
  });

  describe("block_minutes — zero and negatives are illegal (never per-minute charging)", () => {
    it("accepts a positive whole-minute block", () => {
      const result = extensionOverridesSchema.parse({ block_minutes: "90" });
      expect(result.block_minutes).toBe("90");
    });

    it("refuses zero block length", () => {
      expect(extensionOverridesSchema.safeParse({ block_minutes: "0" }).success).toBe(false);
    });

    it("refuses negative and fractional block lengths", () => {
      expect(extensionOverridesSchema.safeParse({ block_minutes: "-60" }).success).toBe(false);
      expect(extensionOverridesSchema.safeParse({ block_minutes: "60.5" }).success).toBe(false);
    });

    it("refuses overflow-length values", () => {
      expect(extensionOverridesSchema.safeParse({ block_minutes: "1234567890" }).success).toBe(false);
    });
  });

  describe("block_charge — strictly positive money text, at most 12 characters", () => {
    it("accepts a whole-peso charge", () => {
      const result = extensionOverridesSchema.parse({ block_charge: "150" });
      expect(result.block_charge).toBe("150");
    });

    it("refuses zero price including the 0.00 form", () => {
      expect(extensionOverridesSchema.safeParse({ block_charge: "0" }).success).toBe(false);
      expect(extensionOverridesSchema.safeParse({ block_charge: "0.00" }).success).toBe(false);
      expect(extensionOverridesSchema.safeParse({ block_charge: 0 }).success).toBe(false);
    });

    it("refuses negative charges", () => {
      expect(extensionOverridesSchema.safeParse({ block_charge: "-1" }).success).toBe(false);
    });

    it("refuses trailing-dot money", () => {
      expect(extensionOverridesSchema.safeParse({ block_charge: "150." }).success).toBe(false);
    });

    it("accepts 150.50 and normalizes it to 150.5 (vault-07)", () => {
      const result = extensionOverridesSchema.parse({ block_charge: "150.50" });
      expect(result.block_charge).toBe("150.5");
    });

    it("normalizes trailing decimal zeros (150.0 becomes 150)", () => {
      const result = extensionOverridesSchema.parse({ block_charge: "150.0" });
      expect(result.block_charge).toBe("150");
    });

    it("accepts sub-peso charges", () => {
      const result = extensionOverridesSchema.parse({ block_charge: "0.5" });
      expect(result.block_charge).toBe("0.5");
    });

    it("accepts exactly 12 characters and refuses 13", () => {
      expect(extensionOverridesSchema.safeParse({ block_charge: "123456789012" }).success).toBe(true);
      expect(extensionOverridesSchema.safeParse({ block_charge: "1234567890.1" }).success).toBe(true);
      expect(extensionOverridesSchema.safeParse({ block_charge: "1234567890123" }).success).toBe(false);
      expect(extensionOverridesSchema.safeParse({ block_charge: "1234567890.12" }).success).toBe(false);
    });

    it("accepts a decimal number input in normalized text form", () => {
      const result = extensionOverridesSchema.parse({ block_charge: 175.5 });
      expect(result.block_charge).toBe("175.5");
    });
  });

  describe("unknown keys and empty merges", () => {
    it("refuses unknown extension keys (the database refuses them)", () => {
      expect(extensionOverridesSchema.safeParse({ unknown_key: "1" }).success).toBe(false);
    });

    it("accepts an empty override set (a no-op merge is legal)", () => {
      expect(extensionOverridesSchema.parse({})).toEqual({});
    });

    it("round-trips the vault-07 default triple as accepted values", () => {
      const result = extensionOverridesSchema.parse({
        grace_minutes: "25",
        block_minutes: "60",
        block_charge: "150",
      });
      expect(result).toEqual({ grace_minutes: "25", block_minutes: "60", block_charge: "150" });
    });
  });
});

describe("canteen override validation (vault-08/20)", () => {
  it("accepts an override for a known catalogue item", () => {
    const result = canteenOverridesSchema.parse({ bottled_water: "35" });
    expect(result).toEqual({ bottled_water: "35" });
  });

  it("refuses an unknown catalogue item (the database refuses it)", () => {
    expect(canteenOverridesSchema.safeParse({ unknown_item: "1" }).success).toBe(false);
  });

  it("refuses negative prices", () => {
    expect(canteenOverridesSchema.safeParse({ bottled_water: "-1" }).success).toBe(false);
  });

  it("accepts zero (the database accepts a zero canteen price; vault-08 boundary)", () => {
    const result = canteenOverridesSchema.parse({ bottled_water: "0" });
    expect(result.bottled_water).toBe("0");
  });

  it("normalizes decimal overrides", () => {
    const result = canteenOverridesSchema.parse({ red_horse_1l: "170.00" });
    expect(result.red_horse_1l).toBe("170");
  });

  it("exposes the catalogue item ids from the money reference fixture", () => {
    expect(CANTEEN_ITEM_IDS).toContain("bottled_water");
    expect(CANTEEN_ITEM_IDS).toContain("marlboro_pack");
    expect(CANTEEN_ITEM_IDS).toHaveLength(26);
  });
});

describe("updateRateConfigInputSchema", () => {
  const branchId = "24000000-0000-4000-8000-000000000001";

  it("requires a branch id (the merge target) and rejects non-uuid targets", () => {
    expect(updateRateConfigInputSchema.safeParse({ branchId }).success).toBe(true);
    expect(updateRateConfigInputSchema.safeParse({ branchId: "not-a-uuid" }).success).toBe(false);
    expect(updateRateConfigInputSchema.safeParse({}).success).toBe(false);
  });

  it("refuses a forged org_id — tenant identifiers are not client inputs", () => {
    const result = updateRateConfigInputSchema.safeParse({
      branchId,
      // a forged tenant identifier is refused, never honored
      orgId: "14000000-0000-4000-8000-000000000009",
    } as unknown as Record<string, unknown>);
    expect(result.success).toBe(false);
  });

  it("refuses forged attribution fields (actor/time are server facts, not inputs)", () => {
    const result = updateRateConfigInputSchema.safeParse({
      branchId,
      extensionOverrides: { block_charge: "175" },
      actor_id: "99999999-9999-4999-8999-999999999999",
      ts: "1999-01-01T00:00:00Z",
    } as unknown as Record<string, unknown>);
    expect(result.success).toBe(false);
  });

  it("parses both override sections through the strict schemas", () => {
    const parsed = updateRateConfigInputSchema.parse({
      branchId,
      canteenOverrides: { bottled_water: "35" },
      extensionOverrides: { grace_minutes: "0", block_charge: "175.50" },
    });
    expect(parsed).toEqual({
      branchId,
      canteenOverrides: { bottled_water: "35" },
      extensionOverrides: { grace_minutes: "0", block_charge: "175.5" },
    });
  });

  it("types the extension input without a branch-owning concept (compile-time shape)", () => {
    const probe: ExtensionOverridesInput = { block_minutes: "90" };
    expect(probe.block_minutes).toBe("90");
  });
});

describe("stored rate-config card schema (read path, vault-20 unknown-key preservation)", () => {
  const storedCard = {
    stay_types: {
      short_time: { duration_minutes: "180", base_pax: "2", flat_base: "450", extra_pax_charge: "200" },
      overnight: { duration_minutes: "720", tiers: { "2": "1100" }, surcharge_base_pax: "4", extra_pax_charge: "300" },
    },
    extension: { grace_minutes: "0", block_minutes: "90", block_charge: "175.5" },
    addons: { towel: "20", pillow: "50" },
    canteen: {
      catalogue: { bottled_water: { label: "Bottled Water", price: "30", category: "Drinks & Beers" } },
      overrides: { bottled_water: "35" },
    },
    unknown_top: { keep: "yes" },
  };

  it("parses a stored card and preserves keys the merge does not own (vault-20)", () => {
    const parsed = rateConfigSchema.parse(storedCard);
    expect((parsed as Record<string, unknown>).unknown_top).toEqual({ keep: "yes" });
    expect(parsed.extension.grace_minutes).toBe("0");
    expect(parsed.canteen.overrides.bottled_water).toBe("35");
  });

  it("tolerates numeric forms of stored scalars (the live default mixes both)", () => {
    const parsed = rateConfigSchema.parse({
      ...storedCard,
      extension: { grace_minutes: 25, block_minutes: 60, block_charge: 150 },
    });
    expect(parsed.extension.grace_minutes).toBe(25);
  });

  it("does not crash on a corrupted card (§3.4 — the display degrades, never lies)", () => {
    const parsed = rateConfigSchema.safeParse({ extension: { grace_minutes: { broken: true } } });
    expect(parsed.success).toBe(true);
  });
});

describe("readOverstayTriple — effective §3.3 fallback semantics (display parity with app.overstay_params)", () => {
  it("derives the fixture default triple when the card carries none", () => {
    expect(readOverstayTriple({})).toEqual({ graceMinutes: 25, blockMinutes: 60, blockCharge: 150 });
  });

  it("honors valid stored overrides", () => {
    expect(readOverstayTriple({ extension: { grace_minutes: "0", block_minutes: "90", block_charge: "175.5" } })).toEqual({
      graceMinutes: 0,
      blockMinutes: 90,
      blockCharge: 175.5,
    });
  });

  it("falls back per §3.3 for values the runtime would ignore", () => {
    expect(
      readOverstayTriple({ extension: { grace_minutes: "25.0", block_minutes: "0", block_charge: "0.00" } }),
    ).toEqual({ graceMinutes: 25, blockMinutes: 60, blockCharge: 150 });
  });

  it("never charges per-minute (a zero block length falls back to 60)", () => {
    expect(readOverstayTriple({ extension: { block_minutes: "0" } }).blockMinutes).toBe(60);
  });
});
