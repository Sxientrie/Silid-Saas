import { describe, expect, it } from "vitest";
import {
  ADDON_CATALOGUE,
  CANTEEN_CATALOGUE,
  OVERSTAY_DEFAULTS,
  STAY_TYPES,
  recomputeWorkedExample,
} from "@silid/db";
import {
  VAULT_GOLDENS,
  VAULT_MONEY_GOLDENS,
  vaultBookingGoldens,
  vaultExtensionBlockGoldens,
  vaultScenarioIds,
} from "../src/vault-goldens.js";

/** spec/legacy-behavior-vault.md is the fixture source; ids are permanent. */
describe("vault parity fixture (spec/legacy-behavior-vault.md)", () => {
  it("carries all twenty scenarios with verbatim ids and provenance marks", () => {
    expect(vaultScenarioIds()).toEqual(
      Array.from({ length: 20 }, (_, i) => `vault-${String(i + 1).padStart(2, "0")}`),
    );
    for (const golden of VAULT_GOLDENS) {
      expect(
        [
          "OBSERVED (unit-test-asserted)",
          "DERIVED",
          "DERIVED (design) + OBSERVED caveat (dead wiring)",
        ],
        `${golden.id} provenance`,
      ).toContain(golden.provenance);
      expect(golden.title.length).toBeGreaterThan(0);
    }
  });

  it("links every database-executable scenario to its pgTAP suite", () => {
    const sqlLinked = VAULT_GOLDENS.filter((g) => g.executableSurface === "sql-suite");
    expect(sqlLinked.map((g) => [g.id, g.suite])).toEqual([
      ["vault-01", "supabase/tests/04_checkout_and_void_test.sql"],
      ["vault-02", "supabase/tests/04_checkout_and_void_test.sql"],
      ["vault-03", "supabase/tests/08_money_fixture_parity_test.sql"],
      ["vault-04", "supabase/tests/03_ledger_append_only_test.sql"],
      ["vault-05", "supabase/tests/05_escalation_idempotence_test.sql"],
      ["vault-06", "supabase/tests/04_checkout_and_void_test.sql"],
      ["vault-07", "supabase/tests/06_rate_merge_test.sql"],
      ["vault-08", "supabase/tests/03_ledger_append_only_test.sql"],
      ["vault-09", "supabase/tests/03_ledger_append_only_test.sql"],
      ["vault-10", "supabase/tests/03_ledger_append_only_test.sql"],
      ["vault-11", "supabase/tests/04_checkout_and_void_test.sql"],
      ["vault-12", "supabase/tests/04_checkout_and_void_test.sql"],
      ["vault-13", "supabase/tests/07_shift_close_test.sql"],
      ["vault-15", "supabase/tests/05_escalation_idempotence_test.sql"],
      ["vault-16", "supabase/tests/03_ledger_append_only_test.sql"],
      ["vault-17", "supabase/tests/03_ledger_append_only_test.sql"],
      ["vault-20", "supabase/tests/06_rate_merge_test.sql"],
    ]);
    // vault-14 (live summary mirror) and vault-18/19 (offline/auth surfaces)
    // are application-layer behavior; their fixtures ride their owning phases.
    for (const id of ["vault-14", "vault-18", "vault-19"]) {
      expect(VAULT_GOLDENS.find((g) => g.id === id)?.executableSurface).toBe("future-phase");
    }
  });

  it("derives every booking golden from the money reference fixture, never re-typed", () => {
    for (const golden of vaultBookingGoldens()) {
      const recomputed = recomputeWorkedExample(golden.booking_type, golden.pax);
      expect(
        recomputed,
        `${golden.id}: ${golden.title}`,
      ).toEqual({ base: golden.base_php, surcharge: golden.surcharge_php, total: golden.total_php });
    }
  });

  it("traces vault-06 block goldens to the fixture's overstay parameters", () => {
    const blocks = vaultExtensionBlockGoldens();
    expect(blocks.map((b) => [b.overdue_minutes_after_grace, b.overdue_blocks, b.total_php])).toEqual([
      [1, 1, 150],
      [60, 1, 150],
      [61, 2, 300],
    ]);
    expect(blocks.every((b) => b.base_php === 0)).toBe(true);
    expect(blocks.every((b) => b.total_php === b.overdue_blocks * OVERSTAY_DEFAULTS.block_charge)).toBe(true);
  });

  it("prices the vault-09 add-on catalogue exactly as the fixture states", () => {
    const addonGolden = VAULT_GOLDENS.find((g) => g.id === "vault-09");
    expect(addonGolden?.catalogue).toEqual(ADDON_CATALOGUE);
  });

  it("prices the vault-08 canteen rows exactly as the fixture states", () => {
    const canteenGolden = VAULT_GOLDENS.find((g) => g.id === "vault-08");
    expect(canteenGolden?.catalogue).toEqual(CANTEEN_CATALOGUE);
  });

  it("fixes the vault-04 window arithmetic to the fixture durations", () => {
    expect(STAY_TYPES.short_time.duration_minutes).toBe(180);
    expect(STAY_TYPES.overnight.duration_minutes).toBe(720);
  });
});
