/**
 * Rate-configuration domain schemas (spec/domain-rules.md §1.5, §3.3;
 * vault-07, vault-20). The validation semantics below MIRROR the
 * gate-accepted database behavior:
 *
 *   - the strict save path (public.merge_rate_config, migration
 *     20260924163000) refuses what the runtime reader would ignore, and
 *   - the runtime overstay reader (app.overstay_params, migration
 *     20260924160000) silently falls back for any corrupted stored value.
 *
 * §3.3: "The rate editor blocks saving any value the server would ignore."
 * These schemas are that editor-side block, expressed so the service
 * refuses exactly the values whose stored form the database would not
 * honor: fractional/signed/exponent/overflow minutes, zero block length,
 * zero or negative block price, trailing-dot money, unknown catalogue
 * items, unknown extension keys. Accepted money text is normalized the
 * way the vault records it: "150.50" is accepted as "150.5".
 */
import { z } from "zod";
import { CANTEEN_CATALOGUE } from "@silid/db";

/**
 * The database reads override values as jsonb TEXT (`->>`); these patterns
 * are the database's own acceptance regexes (migrations 20260924163000 and
 * 20260924160000), mirrored character for character.
 */
const MINUTES_TEXT_PATTERN = /^[0-9]{1,9}$/;
const MONEY_TEXT_PATTERN = /^[0-9]{1,12}(\.[0-9]+)?$/;

/** spec/domain-rules.md §3.3: money text is "up to 12 characters". */
const MAX_MONEY_TEXT_LENGTH = 12;

export type OverrideText = string | number;

/** The jsonb text form the database function extracts from the merge payload. */
function overrideToText(value: OverrideText): string {
  return typeof value === "number" ? String(value) : value;
}

/** vault-07: "150.50 is accepted as 150.5" — trailing decimal zeros drop. */
export function normalizeMoneyText(text: string): string {
  if (!text.includes(".")) {
    return text;
  }
  const trimmed = text.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" ? "0" : trimmed;
}

function parseStoredInteger(text: string): number {
  return Number.parseInt(text, 10);
}

/**
 * Whole-minute override text: digit-only, at most 9 digits (so the server's
 * integer cast cannot overflow). `allowZero` distinguishes grace (zero is
 * legal) from block length (zero would charge per-minute and is refused).
 */
function minutesSchema(options: { allowZero: boolean }) {
  const base = z
    .union([z.string(), z.number()])
    .transform(overrideToText)
    .pipe(z.string().regex(MINUTES_TEXT_PATTERN, "must be digit-only text of at most 9 digits"));
  if (options.allowZero) {
    return base;
  }
  return base.refine((text) => parseStoredInteger(text) > 0, {
    message: "must be greater than zero (a zero-length block is never saved)",
  });
}

/**
 * Money override text: digits with optional decimals, at most 12 characters,
 * with the range rule of the caller. Accepted text is normalized
 * (trailing decimal zeros dropped) before it reaches the merge payload.
 */
function moneySchema(range: "positive" | "nonnegative") {
  return z
    .union([z.string(), z.number()])
    .transform(overrideToText)
    .pipe(
      z
        .string()
        .regex(MONEY_TEXT_PATTERN, "must be digits with optional decimals")
        .refine((text) => text.length <= MAX_MONEY_TEXT_LENGTH, {
          message: "must be at most 12 characters",
        })
        .refine((text) => (range === "positive" ? Number.parseFloat(text) > 0 : Number.parseFloat(text) >= 0), {
          message: range === "positive" ? "must be strictly positive" : "must not be negative",
        }),
    )
    .transform(normalizeMoneyText);
}

/**
 * The extension (overstay parameter) section of a rate-config merge. Keys
 * match the database function's vocabulary exactly; unknown keys are
 * refused (strictObject) just as the database refuses them.
 */
export const extensionOverridesSchema = z.strictObject({
  grace_minutes: minutesSchema({ allowZero: true }).optional(),
  block_minutes: minutesSchema({ allowZero: false }).optional(),
  block_charge: moneySchema("positive").optional(),
});
export type ExtensionOverridesInput = z.input<typeof extensionOverridesSchema>;
export type ExtensionOverrides = z.output<typeof extensionOverridesSchema>;

/** The catalogue item ids, verbatim from the money reference fixture. */
export const CANTEEN_ITEM_IDS = Object.keys(CANTEEN_CATALOGUE) as unknown as readonly [
  keyof typeof CANTEEN_CATALOGUE,
  ...Array<keyof typeof CANTEEN_CATALOGUE>,
];
export type CanteenItemId = (typeof CANTEEN_ITEM_IDS)[number];

const canteenItemIdSchema = z.enum(CANTEEN_ITEM_IDS);

/**
 * Canteen price overrides keyed by catalogue item. A zero price is legal
 * here (vault-08 boundary: the database accepts it, negative is refused);
 * unknown item ids are refused.
 */
export const canteenOverridesSchema = z.partialRecord(canteenItemIdSchema, moneySchema("nonnegative"));
export type CanteenOverridesInput = z.input<typeof canteenOverridesSchema>;
export type CanteenOverrides = z.output<typeof canteenOverridesSchema>;

/**
 * The rate-configuration merge input. The branch id is a TARGET selector
 * validated against the caller's claims-derived scope — org/branch scope
 * itself never comes from the client (spec/multi-tenancy.md §2).
 */
export const updateRateConfigInputSchema = z.strictObject({
  branchId: z.uuid(),
  canteenOverrides: canteenOverridesSchema.optional(),
  extensionOverrides: extensionOverridesSchema.optional(),
});
export type UpdateRateConfigInput = z.output<typeof updateRateConfigInputSchema>;

/**
 * Tolerant leaf for stored scalar overrides: the seeded default mixes text
 * and number forms, and a corrupted value must not fail the whole read
 * (§3.4 — the display degrades; readOverstayTriple falls back per §3.3).
 */
const storedScalarSchema = z.union([z.string(), z.number()]).optional().catch(undefined);

/**
 * Tolerant view of the STORED per-branch rate card. Unknown keys pass
 * through untouched (vault-20: the merge preserves keys it does not own,
 * so the read must preserve them too), and scalar leaves accept both text
 * and number forms (the seeded default mixes them; every reader extracts
 * text). A corrupted card still parses — §3.4: the display degrades, it
 * never lies, and the server seals the real money from the ledger.
 */
export const rateConfigSchema = z.looseObject({
  stay_types: z.looseObject({}).optional(),
  extension: z
    .looseObject({
      grace_minutes: storedScalarSchema,
      block_minutes: storedScalarSchema,
      block_charge: storedScalarSchema,
    })
    .optional(),
  addons: z.record(z.string(), storedScalarSchema).optional(),
  canteen: z
    .looseObject({
      catalogue: z
        .record(z.string(), z.looseObject({ label: z.string().optional(), price: storedScalarSchema, category: z.string().optional() }))
        .optional(),
      overrides: z.record(z.string(), storedScalarSchema).optional(),
    })
    .optional(),
});
export type RateConfig = z.output<typeof rateConfigSchema>;

/** The §3.3 default triple, from the money reference fixture. */
export type OverstayTriple = { graceMinutes: number; blockMinutes: number; blockCharge: number };

/**
 * The effective overstay parameters of a stored card — the TypeScript
 * parity of app.overstay_params (display purposes only; authoritative
 * money is always sealed server-side from the database). Garbage values
 * fall back exactly per §3.3; they never error.
 */
export function readOverstayTriple(config: RateConfig | null | undefined): OverstayTriple {
  const extension = config?.extension;
  const grace = extension?.grace_minutes;
  const block = extension?.block_minutes;
  const charge = extension?.block_charge;
  const graceText = typeof grace === "number" ? String(grace) : grace;
  const blockText = typeof block === "number" ? String(block) : block;
  const chargeText = typeof charge === "number" ? String(charge) : charge;
  return {
    graceMinutes: graceText !== undefined && MINUTES_TEXT_PATTERN.test(graceText) ? parseStoredInteger(graceText) : 25,
    blockMinutes:
      blockText !== undefined && MINUTES_TEXT_PATTERN.test(blockText) && parseStoredInteger(blockText) > 0
        ? parseStoredInteger(blockText)
        : 60,
    blockCharge:
      chargeText !== undefined && MONEY_TEXT_PATTERN.test(chargeText) && Number.parseFloat(chargeText) > 0
        ? Number.parseFloat(chargeText)
        : 150,
  };
}
