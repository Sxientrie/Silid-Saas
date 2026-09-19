export const ADDON_ITEMS = [
  { id: 'towel',            label: 'Towel',            price_php: 20  },
  { id: 'bed_sheet',        label: 'Bed Sheet',        price_php: 20  },
  { id: 'blanket',          label: 'Blanket',          price_php: 20  },
  { id: 'pillow',           label: 'Pillow',           price_php: 50  },
  { id: 'big_foam',         label: 'Big Foam',         price_php: 300 },
  { id: 'small_foam',       label: 'Small Foam',       price_php: 200 },
  // Extension Charge is NOT cashier-postable: migration 0013's
  // addons_insert_cashier policy rejects client inserts of this item
  // (close_session is its only writer) and posting it here would corrupt
  // the deficit-based block count. Kept in the catalog for display of
  // already-posted rows only — never offer it in an add-on picker.
  { id: 'extension_charge', label: 'Extension Charge', price_php: 150 },
] as const;

export type AddonItemId = typeof ADDON_ITEMS[number]['id'];
