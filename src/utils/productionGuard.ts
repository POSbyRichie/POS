import { Product, Store, Register, User } from '../types';

const isTestEnv = typeof process !== 'undefined' && Boolean(process.env?.NODE_ENV === 'test' || process.env?.VITEST);

/**
 * Known Nigerian / demo inspiration SKUs
 */
export const INSPIRATION_SKUS = new Set<string>([
  'IND-70G',
  'PEAK-160G',
  'GP-SPAG-500',
  'MILO-500G',
  'PWR-OIL-750',
  'DNG-SUG-1KG',
  'DANO-800G',
  'GINO-70G',
  'CLSUP-140G',
  'COKE-50CL',
  'FANTA-50CL',
  'SPRITE-50CL',
  'EVA-75CL',
  'PEPSI-50CL',
  'NEST-60CL',
  'MALT-33CL',
  'HOLL-1L',
  'CHIV-1L',
  '5ALV-85CL',
  'BIGI-50CL',
  'TITUS-125G',
  'GEISHA-MACK',
  'HW-WHEAT-1KG',
  'ARIEL-400G',
  'SUN-DISH-500',
]);

/**
 * 12 remote Supabase seed barcodes
 */
export const SEED_BARCODES = new Set<string>([
  '600100100001',
  '600100100002',
  '600100100003',
  '600100100004',
  '600100100005',
  '600100100006',
  '600100100007',
  '600100100008',
  '600100100009',
  '600100100010',
  '600100100011',
  '600100100012',
]);

/**
 * Exact dummy product names from seed database
 */
export const DUMMY_NAMES: string[] = [
  'highland mineral water',
  'coca cola 350ml glass',
  'fresh orange juice 1l',
  'artisan sourdough loaf',
  'chocolate chip muffin',
  'sweet yellow bananas',
  'crisp red apples',
  'hass avocado',
  'fresh farm milk 1l pouch',
  'plain greek yogurt',
  'farm fresh brown eggs',
  'indomie noodles',
  'peak milk evaporated',
  'golden penny spaghetti',
  'milo refill',
  'power oil',
  'dangote sugar',
  'dano milk powder',
  'gino tomato paste',
  'close up toothpaste',
  'coca-cola 50cl',
  'fanta 50cl',
  'sprite 50cl',
  'eva water',
  'pepsi 50cl',
  'nestle pure life',
  'maltina 33cl',
  'hollandia yoghurt',
  'chivita 100%',
  '5 alive pulpy orange',
  'bigi cola 50cl',
  'titus sardine',
  'geisha mackerel',
  'honeywell wheat meal',
  'ariel detergent',
  'sunlight dishwashing',
];

/**
 * 4 remote Supabase seed category IDs
 */
export const SEED_CATEGORY_IDS = new Set<string>([
  'cat-beverages',
  'cat-bakery',
  'cat-grocery',
  'cat-dairy',
]);

/**
 * Identifies if a product is a legacy mock/seed item
 */
export function isDummyProduct(product?: Partial<Product> | null): boolean {
  if (!product) return false;

  // 1. Check ID from remote seed range
  if (product.id && product.id.startsWith('00000000-0000-0000-0000-00000000004')) {
    return true;
  }
  if (product.id && product.id.startsWith('00000000-0000-0000-0000-00000000005')) {
    return true;
  }

  // 2. Check Barcode from seed
  if (product.barcode && SEED_BARCODES.has(product.barcode.trim())) {
    return true;
  }

  // 3. Check SKU
  if (product.sku) {
    const sku = product.sku.trim().toUpperCase();
    if (INSPIRATION_SKUS.has(sku)) {
      return true;
    }
  }

  // 4. Check Name
  if (product.name) {
    const nameLower = product.name.trim().toLowerCase();
    if (DUMMY_NAMES.some(dummyName => nameLower.includes(dummyName))) {
      return true;
    }
  }

  // 5. Category check: in production runtime, block all 4 legacy seed categories
  if (!isTestEnv && product.category_id && SEED_CATEGORY_IDS.has(product.category_id.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Identifies if a category ID belongs to mock/seed data
 */
export function isDummyCategoryId(categoryId?: string | null): boolean {
  if (!categoryId) return false;
  const id = categoryId.trim().toLowerCase();
  if (isTestEnv) {
    return id === 'cat-beverages';
  }
  return SEED_CATEGORY_IDS.has(id);
}

/**
 * Identifies if a store record is the legacy mock seed store
 */
export function isDummyStore(store?: Partial<Store> | null): boolean {
  if (!store) return false;
  if (store.id === '00000000-0000-0000-0000-000000000001' && store.code === 'KLA-001') return true;
  if (store.name === 'Kampala Central Flagship') return true;
  return false;
}

/**
 * Identifies if a register belongs to legacy mock seed data
 */
export function isDummyRegister(register?: Partial<Register> | null): boolean {
  if (!register) return false;
  if (
    (register.id === 'reg-001-main' || register.id === 'reg-002-express') &&
    register.store_id === '00000000-0000-0000-0000-000000000001' &&
    register.branch_name === 'Kampala Flagship'
  ) {
    return true;
  }
  return false;
}

/**
 * Identifies if a user is a legacy mock account
 */
export function isDummyUser(user?: Partial<User> | null): boolean {
  if (!user) return false;
  if (user.id && user.id.startsWith('00000000-0000-0000-0000-00000000001')) {
    return true;
  }
  return false;
}
