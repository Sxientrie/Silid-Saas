export const CANTEEN_CATEGORIES = {
  DRINKS:  'Drinks & Beers',
  SNACKS:  'Snacks',
  NOODLES: 'Cup Noodles',
  CIGARS:  'Cigars',
  OTHERS:  'Others',
} as const;

export const CANTEEN_ITEMS = [
  { id: 'bottled_water',     label: 'Bottled Water',        category: 'DRINKS',  price_php: 30  },
  { id: 'bottled_softdrink', label: 'Bottled Soft Drinks',  category: 'DRINKS',  price_php: 40  },
  { id: 'coffee',            label: 'Coffee',               category: 'DRINKS',  price_php: 30  },
  { id: 'juice_can',         label: 'Juice in Can',         category: 'DRINKS',  price_php: 70  },
  { id: 'red_bull',          label: 'Red Bull',             category: 'DRINKS',  price_php: 80  },
  { id: 'gatorade_500',      label: 'Gatorade 500ml',       category: 'DRINKS',  price_php: 80  },
  { id: 'pale_pilsen',       label: 'Pale Pilsen Bottled',  category: 'DRINKS',  price_php: 80  },
  { id: 'san_mig_light',     label: 'San Mig Light',        category: 'DRINKS',  price_php: 80  },
  { id: 'red_horse_500',     label: 'Red Horse 500ml',      category: 'DRINKS',  price_php: 90  },
  { id: 'red_horse_1l',      label: 'Red Horse 1L',         category: 'DRINKS',  price_php: 170 },
  { id: 'big_curls',         label: 'Big Curls',            category: 'SNACKS',  price_php: 60  },
  { id: 'biscuits',          label: 'Biscuits',             category: 'SNACKS',  price_php: 20  },
  { id: 'fudge_bar',         label: 'Fudge Bar',            category: 'SNACKS',  price_php: 20  },
  { id: 'spicy_bulalo',      label: 'Spicy Bulalo / Bulalo',category: 'NOODLES', price_php: 75  },
  { id: 'jiampong',          label: 'Jiampong',             category: 'NOODLES', price_php: 75  },
  { id: 'sotanghon',         label: 'Sotanghon',            category: 'NOODLES', price_php: 60  },
  { id: 'marlboro',          label: 'Marlboro',             category: 'CIGARS',  price_php: 250 },
  { id: 'trust_condom',      label: 'Trust Condom',         category: 'OTHERS',  price_php: 70  },
  { id: 'lighter',           label: 'Lighter',              category: 'OTHERS',  price_php: 20  },
  { id: 'safeguard',         label: 'Safeguard',            category: 'OTHERS',  price_php: 25  },
  { id: 'shampoo',           label: 'Shampoo / Conditioner',category: 'OTHERS',  price_php: 25  },
  { id: 'toothbrush',        label: 'Toothbrush',           category: 'OTHERS',  price_php: 30  },
  { id: 'toothpaste',        label: 'Toothpaste',           category: 'OTHERS',  price_php: 20  },
  { id: 'napkin',            label: 'Napkin',               category: 'OTHERS',  price_php: 20  },
  { id: 'drivemax_coffee',   label: 'Drivemax Coffee',      category: 'OTHERS',  price_php: 120 },
  { id: 'drivemax_capsule',  label: 'Drivemax Capsule',     category: 'OTHERS',  price_php: 170 },
] as const;

export type CanteenItemId = typeof CANTEEN_ITEMS[number]['id'];
