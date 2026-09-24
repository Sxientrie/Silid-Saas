/**
 * Vault parity fixture (roadmap 02 Deliverable 9): the machine-readable form
 * of spec/legacy-behavior-vault.md's goldens. Scenario ids are permanent and
 * referenced verbatim by specs, tests, and the cutover runbook. Every peso
 * figure here equals, or is visibly derived from, the money reference fixture
 * in @silid/db (MONEY REFERENCE RULE) — the parity test proves the crosswalk
 * instead of re-typed numbers.
 *
 * Database-executable scenarios link the pgTAP suite that attacks them; the
 * application-layer scenarios ride their owning phases (06, 07, 08, 09).
 */

// The .ts subpath keeps this module loadable by the money-recompute CLI under
// Node's native type stripping (the main entry's .js-relative imports are a
// vitest-only convenience).
import { ADDON_CATALOGUE, CANTEEN_CATALOGUE } from "@silid/db/src/money-reference.ts";

export type VaultProvenance =
  | "OBSERVED (unit-test-asserted)"
  | "DERIVED"
  | "DERIVED (design) + OBSERVED caveat (dead wiring)";

export type VaultExecutableSurface = "sql-suite" | "future-phase";

export interface VaultGolden {
  id: string;
  title: string;
  provenance: VaultProvenance;
  executableSurface: VaultExecutableSurface;
  /** The pgTAP suite that runs the scenario against the database, when executableSurface is "sql-suite". */
  suite?: string;
  /** The catalogue the scenario prices, when its goldens are price data. */
  catalogue?: unknown;
}

export interface VaultBookingGolden {
  kind: "booking";
  id: "vault-01" | "vault-02" | "vault-03";
  title: string;
  provenance: VaultProvenance;
  booking_type: "short_time" | "overnight";
  pax: number;
  base_php: number;
  surcharge_php: number;
  total_php: number;
  duration_hours: number;
}

export interface VaultExtensionBlockGolden {
  kind: "extension_block";
  id: "vault-06";
  title: string;
  provenance: VaultProvenance;
  overdue_minutes_after_grace: number;
  overdue_blocks: number;
  base_php: 0;
  surcharge_php: number;
  total_php: number;
}

export type VaultMoneyGolden = VaultBookingGolden | VaultExtensionBlockGolden;

const ADDON_CATALOGUE_FROM_FIXTURE = ADDON_CATALOGUE;
const CANTEEN_CATALOGUE_FROM_FIXTURE = CANTEEN_CATALOGUE;

export const VAULT_GOLDENS: VaultGolden[] = [
  { id: "vault-01", title: "Short-time stay, 2 guests, base price only", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/04_checkout_and_void_test.sql", catalogue: undefined },
  { id: "vault-02", title: "Short-time stay, each guest beyond two adds 200", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/04_checkout_and_void_test.sql" },
  { id: "vault-03", title: "Overnight uses tiered base prices for 2/3/4 guests, then 300 per guest beyond four", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/08_money_fixture_parity_test.sql" },
  { id: "vault-04", title: "Check-in stamps the start time server-side and derives booked_end from booking type", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/03_ledger_append_only_test.sql" },
  { id: "vault-05", title: "A session moves booked, grace, overdue as the clock passes booked_end and the grace window", provenance: "OBSERVED (unit-test-asserted)", executableSurface: "sql-suite", suite: "supabase/tests/05_escalation_idempotence_test.sql" },
  { id: "vault-06", title: "Each started block past grace bills one full block", provenance: "OBSERVED (unit-test-asserted)", executableSurface: "sql-suite", suite: "supabase/tests/04_checkout_and_void_test.sql" },
  { id: "vault-07", title: "Branches may override the overstay parameters; invalid values silently fall back to system defaults", provenance: "OBSERVED (unit-test-asserted)", executableSurface: "sql-suite", suite: "supabase/tests/06_rate_merge_test.sql" },
  { id: "vault-08", title: "Canteen sales are standalone line items with per-branch price overrides", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/03_ledger_append_only_test.sql", catalogue: CANTEEN_CATALOGUE_FROM_FIXTURE },
  { id: "vault-09", title: "Chargeable room items post against the guest's active session; the extension charge is never cashier-postable", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/03_ledger_append_only_test.sql", catalogue: ADDON_CATALOGUE_FROM_FIXTURE },
  { id: "vault-10", title: "Check-in creates an immutable session row and occupies the room, all server-side", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/03_ledger_append_only_test.sql" },
  { id: "vault-11", title: "Checkout runs as one server transaction: seal time, post extension deficit, compute total, release room", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/04_checkout_and_void_test.sql" },
  { id: "vault-12", title: "Only the admin may void a session; the reason is mandatory and everything is recorded in one transaction", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/04_checkout_and_void_test.sql" },
  { id: "vault-13", title: "One open shift per branch; closing seals expected cash server-side; the physical count is optional and one-shot", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/07_shift_close_test.sql" },
  { id: "vault-14", title: "The desk's running shift summary is display-only and must match the close-time arithmetic", provenance: "DERIVED", executableSurface: "future-phase" },
  { id: "vault-15", title: "Rooms move vacant, occupied, grace, overdue, vacant without any client write", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/05_escalation_idempotence_test.sql" },
  { id: "vault-16", title: "Concurrent open shifts per branch are refused; double-booking one room is refused — the defect legacy lacked", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/03_ledger_append_only_test.sql" },
  { id: "vault-17", title: "Every state-changing act lands in an append-only trail; the trail has no edit or delete path for any role", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/03_ledger_append_only_test.sql" },
  { id: "vault-18", title: "Offline writes queue locally and replay in order when connectivity returns; replay is idempotent and the server re-seals time", provenance: "DERIVED (design) + OBSERVED caveat (dead wiring)", executableSurface: "future-phase" },
  { id: "vault-19", title: "Roles scope every read and write; scope arrives from server-side claims, not client state", provenance: "DERIVED", executableSurface: "future-phase" },
  { id: "vault-20", title: "Rate configuration changes go through a merge that preserves keys it does not own", provenance: "DERIVED", executableSurface: "sql-suite", suite: "supabase/tests/06_rate_merge_test.sql" },
];

// Golden booking inputs and outputs; each figure recomputes from the money
// reference fixture in the parity test (never re-typed as an authority).
export const VAULT_MONEY_GOLDENS: VaultMoneyGolden[] = [
  { kind: "booking", id: "vault-01", title: "Short-time base charge", provenance: "DERIVED", booking_type: "short_time", pax: 2, base_php: 450, surcharge_php: 0, total_php: 450, duration_hours: 3 },
  { kind: "booking", id: "vault-02", title: "Short-time pax surcharge (four guests)", provenance: "DERIVED", booking_type: "short_time", pax: 4, base_php: 450, surcharge_php: 400, total_php: 850, duration_hours: 3 },
  { kind: "booking", id: "vault-03", title: "Overnight tiered base and surcharge (five guests)", provenance: "DERIVED", booking_type: "overnight", pax: 5, base_php: 1700, surcharge_php: 300, total_php: 2000, duration_hours: 12 },
  { kind: "extension_block", id: "vault-06", title: "One minute past grace bills one full block", provenance: "OBSERVED (unit-test-asserted)", overdue_minutes_after_grace: 1, overdue_blocks: 1, base_php: 0, surcharge_php: 150, total_php: 150 },
  { kind: "extension_block", id: "vault-06", title: "A fully elapsed block still bills one block", provenance: "OBSERVED (unit-test-asserted)", overdue_minutes_after_grace: 60, overdue_blocks: 1, base_php: 0, surcharge_php: 150, total_php: 150 },
  { kind: "extension_block", id: "vault-06", title: "One minute into the second hour bills a second block", provenance: "OBSERVED (unit-test-asserted)", overdue_minutes_after_grace: 61, overdue_blocks: 2, base_php: 0, surcharge_php: 300, total_php: 300 },
];

export function vaultScenarioIds(): string[] {
  return VAULT_GOLDENS.map((g) => g.id);
}

export function vaultBookingGoldens(): VaultBookingGolden[] {
  return VAULT_MONEY_GOLDENS.filter((g): g is VaultBookingGolden => g.kind === "booking");
}

export function vaultExtensionBlockGoldens(): VaultExtensionBlockGolden[] {
  return VAULT_MONEY_GOLDENS.filter((g): g is VaultExtensionBlockGolden => g.kind === "extension_block");
}
