/**
 * The catalogue module (roadmap 04 Deliverable 6): exposes the add-on and
 * canteen catalogues from the MONEY REFERENCE FIXTURE (@silid/db) through
 * typed views, so no client ever hard-codes a price
 * (spec/domain-rules.md §1, §5–§7). Every peso figure here is imported
 * from the fixture — re-typing one anywhere else is a defect proven by the
 * no-re-typed-pesos test.
 */
import { ADDON_CATALOGUE, CANTEEN_CATALOGUE, CANTEEN_CATEGORY_ORDER } from "@silid/db";

export interface AddonCatalogueItem {
  id: string;
  price: number;
  /** Render-only item; only the checkout transaction posts it (vault-09). */
  cashierPostable: boolean;
}

export interface CanteenCatalogueItem {
  id: string;
  label: string;
  price: number;
  category: string;
}

/** The catalogue default prices; a branch's stored overrides take precedence at the database. */
export function defaultAddonCatalogue(): AddonCatalogueItem[] {
  return Object.entries(ADDON_CATALOGUE).map(([id, price]) => ({
    id,
    price,
    cashierPostable: id !== "extension_charge",
  }));
}

/** The full normalized canteen catalogue, ordered by the fixture's category order. */
export function defaultCanteenCatalogue(): CanteenCatalogueItem[] {
  const items = Object.entries(CANTEEN_CATALOGUE).map(([id, item]) => ({
    id,
    label: item.label,
    price: item.price,
    category: item.category,
  }));
  return items.sort(
    (a, b) =>
      CANTEEN_CATEGORY_ORDER.indexOf(a.category as (typeof CANTEEN_CATEGORY_ORDER)[number]) -
        CANTEEN_CATEGORY_ORDER.indexOf(b.category as (typeof CANTEEN_CATEGORY_ORDER)[number]) ||
      a.label.localeCompare(b.label),
  );
}
