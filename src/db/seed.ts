import { db } from './index';
import { hashPin, generateSalt, generateUUID } from '../utils/id';
import { User, Register, Device, Category, Product, Customer, Store } from '../types';

export const INSPIRATION_PRODUCTS = [
  { name: 'Indomie noodles 70g', sku: 'IND-70G', barcode: '89988662001', category_id: 'cat-gro', cost_price: 180, selling_price: 250, stock_quantity: 15, min_stock_level: 5, tax_rate: 0, unit: 'pack' },
  { name: 'Peak Milk Evaporated 160g', sku: 'PEAK-160G', barcode: '89988662002', category_id: 'cat-dai', cost_price: 420, selling_price: 550, stock_quantity: 20, min_stock_level: 5, tax_rate: 0, unit: 'tin' },
  { name: 'Golden penny Spaghetti 500g', sku: 'GP-SPAG-500', barcode: '89988662003', category_id: 'cat-gro', cost_price: 700, selling_price: 900, stock_quantity: 14, min_stock_level: 5, tax_rate: 0, unit: 'pack' },
  { name: 'Milo Refill 500g', sku: 'MILO-500G', barcode: '89988662004', category_id: 'cat-bev', cost_price: 1900, selling_price: 2500, stock_quantity: 16, min_stock_level: 5, tax_rate: 0, unit: 'pack' },
  { name: 'Power Oil 750ml', sku: 'PWR-OIL-750', barcode: '89988662005', category_id: 'cat-gro', cost_price: 1400, selling_price: 1800, stock_quantity: 12, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Dangote Sugar 1kg', sku: 'DNG-SUG-1KG', barcode: '89988662006', category_id: 'cat-gro', cost_price: 950, selling_price: 1200, stock_quantity: 8, min_stock_level: 5, tax_rate: 0, unit: 'pack' },
  { name: 'Dano Milk Powder 800g', sku: 'DANO-800G', barcode: '89988662007', category_id: 'cat-dai', cost_price: 2500, selling_price: 3200, stock_quantity: 15, min_stock_level: 5, tax_rate: 0, unit: 'tin' },
  { name: 'Gino Tomato Paste 70g', sku: 'GINO-70G', barcode: '89988662008', category_id: 'cat-gro', cost_price: 140, selling_price: 200, stock_quantity: 25, min_stock_level: 5, tax_rate: 0, unit: 'sachet' },
  { name: 'Close Up Toothpaste 140g', sku: 'CLSUP-140G', barcode: '89988662009', category_id: 'cat-per', cost_price: 480, selling_price: 650, stock_quantity: 18, min_stock_level: 5, tax_rate: 0, unit: 'tube' },
  { name: 'Coca-Cola 50cl', sku: 'COKE-50CL', barcode: '89988662010', category_id: 'cat-bev', cost_price: 250, selling_price: 350, stock_quantity: 15, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Fanta 50cl', sku: 'FANTA-50CL', barcode: '89988662011', category_id: 'cat-bev', cost_price: 250, selling_price: 350, stock_quantity: 14, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Sprite 50cl', sku: 'SPRITE-50CL', barcode: '89988662012', category_id: 'cat-bev', cost_price: 250, selling_price: 350, stock_quantity: 15, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Eva Water 75cl', sku: 'EVA-75CL', barcode: '89988662013', category_id: 'cat-bev', cost_price: 180, selling_price: 250, stock_quantity: 10, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Pepsi 50cl', sku: 'PEPSI-50CL', barcode: '89988662014', category_id: 'cat-bev', cost_price: 220, selling_price: 300, stock_quantity: 18, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Nestle Pure Life 60cl', sku: 'NEST-60CL', barcode: '89988662015', category_id: 'cat-bev', cost_price: 140, selling_price: 200, stock_quantity: 12, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Maltina 33cl', sku: 'MALT-33CL', barcode: '89988662016', category_id: 'cat-bev', cost_price: 300, selling_price: 400, stock_quantity: 5, min_stock_level: 5, tax_rate: 0, unit: 'can' },
  { name: 'Hollandia Yoghurt 1L', sku: 'HOLL-1L', barcode: '89988662017', category_id: 'cat-dai', cost_price: 1150, selling_price: 1500, stock_quantity: 16, min_stock_level: 5, tax_rate: 0, unit: 'carton' },
  { name: 'Chivita 100% 1L', sku: 'CHIV-1L', barcode: '89988662018', category_id: 'cat-bev', cost_price: 1050, selling_price: 1400, stock_quantity: 8, min_stock_level: 5, tax_rate: 0, unit: 'carton' },
  { name: '5 Alive Pulpy Orange 85cl', sku: '5ALV-85CL', barcode: '89988662019', category_id: 'cat-bev', cost_price: 850, selling_price: 1100, stock_quantity: 14, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Bigi Cola 50cl', sku: 'BIGI-50CL', barcode: '89988662020', category_id: 'cat-bev', cost_price: 180, selling_price: 250, stock_quantity: 7, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
  { name: 'Titus Sardine 125g', sku: 'TITUS-125G', barcode: '89988662021', category_id: 'cat-gro', cost_price: 720, selling_price: 950, stock_quantity: 11, min_stock_level: 5, tax_rate: 0, unit: 'tin' },
  { name: 'Geisha Mackerel in Tomato Sauce', sku: 'GEISHA-MACK', barcode: '89988662022', category_id: 'cat-gro', cost_price: 850, selling_price: 1100, stock_quantity: 9, min_stock_level: 5, tax_rate: 0, unit: 'tin' },
  { name: 'Honeywell Wheat Meal 1kg', sku: 'HW-WHEAT-1KG', barcode: '89988662023', category_id: 'cat-gro', cost_price: 1000, selling_price: 1300, stock_quantity: 15, min_stock_level: 5, tax_rate: 0, unit: 'pack' },
  { name: 'Ariel Detergent Powder 400g', sku: 'ARIEL-400G', barcode: '89988662024', category_id: 'cat-per', cost_price: 650, selling_price: 850, stock_quantity: 13, min_stock_level: 5, tax_rate: 0, unit: 'pack' },
  { name: 'Sunlight Dishwashing Liquid 500ml', sku: 'SUN-DISH-500', barcode: '89988662025', category_id: 'cat-per', cost_price: 550, selling_price: 750, stock_quantity: 10, min_stock_level: 5, tax_rate: 0, unit: 'bottle' },
];

export async function seedDatabase(force: boolean = false) {
  const userCount = await db.users.count();
  if (userCount > 0 && !force) {
    // Self-healing migration for existing databases: ensure store and primary device enrollment exist
    const storeCount = await db.stores.count();
    if (storeCount === 0) {
      await db.stores.put({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'RichiePOS Flagship Store',
        code: 'KLA-01',
        tagline: 'Smart POS. Growing Businesses.',
        address: 'Plot 12 Kampala Road, Kampala, Uganda',
        phone: '+256 700 000000',
        email: 'info@posbyrichie.online',
        tax_id: 'TAX-UG-100200',
        currency_code: 'UGX',
        currency_symbol: 'UGX',
        currency_decimals: 0,
        loyalty_rate: 100,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Ensure inspiration products exist in existing database
    const existingRefProduct = await db.products.where('sku').equals('IND-70G').first();
    if (!existingRefProduct) {
      const prodsToPut: Product[] = INSPIRATION_PRODUCTS.map(p => ({
        ...p,
        id: generateUUID(),
        description: p.name,
        is_active: true,
        sync_status: 'synced',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      await db.products.bulkPut(prodsToPut);
    }

    const enrolledSetting = await db.settings.get('pos_enrolled_device_id');
    if (!enrolledSetting) {
      const existingDevice = await db.devices.where('is_authorized').equals(1).first() || await db.devices.toCollection().first();
      const deviceId = existingDevice ? existingDevice.id : 'dev-pos-terminal-01';
      await db.settings.put({ key: 'pos_enrolled_device_id', value: deviceId });
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('pos_enrolled_device_id', deviceId);
        } catch {
          // ignore
        }
      }
    }
    return; // Already seeded
  }

  if (force) {
    await db.delete();
    await db.open();
  }

  // 0. Seed Store
  const defaultStore: Store = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'RichiePOS Flagship Store',
    code: 'KLA-01',
    tagline: 'Smart POS. Growing Businesses.',
    address: 'Plot 12 Kampala Road, Kampala, Uganda',
    phone: '+256 700 000000',
    email: 'info@posbyrichie.online',
    tax_id: 'TAX-UG-100200',
    currency_code: 'UGX',
    currency_symbol: 'UGX',
    currency_decimals: 0,
    loyalty_rate: 100,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.stores.put(defaultStore);

  // 1. Seed Roles & Users
  // Cashier PIN: 1234
  // Manager PIN: 5555
  // Admin PIN: 9999
  // Inventory Manager PIN: 7777
  const salt1 = generateSalt();
  const salt2 = generateSalt();
  const salt3 = generateSalt();
  const salt4 = generateSalt();

  const [pinHash1, pinHash2, pinHash3, pinHash4] = await Promise.all([
    hashPin('1234', salt1),
    hashPin('5555', salt2),
    hashPin('9999', salt3),
    hashPin('7777', salt4),
  ]);

  const defaultUsers: User[] = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      username: 'cashier1',
      full_name: 'Grace Nakato (Cashier)',
      role: 'cashier',
      pin_hash: pinHash1,
      salt: salt1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      username: 'manager1',
      full_name: 'David Ochieng (Store Manager)',
      role: 'manager',
      pin_hash: pinHash2,
      salt: salt2,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      username: 'admin1',
      full_name: 'System Administrator',
      role: 'admin',
      pin_hash: pinHash3,
      salt: salt3,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      username: 'inventory1',
      full_name: 'Sarah Akello (Inventory)',
      role: 'inventory_manager',
      pin_hash: pinHash4,
      salt: salt4,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  await db.users.bulkPut(defaultUsers);

  // 2. Seed Register & Device
  const defaultRegister: Register = {
    id: 'reg-001-main',
    register_name: 'Register 01 (Main Counter)',
    branch_name: 'Kampala Flagship Store',
    is_active: true,
  };
  await db.registers.put(defaultRegister);

  const defaultDevice: Device = {
    id: 'dev-pos-terminal-01',
    device_name: 'Counter Terminal 01',
    register_id: defaultRegister.id,
    is_authorized: true,
    enrolled_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  };
  await db.devices.put(defaultDevice);

  // Auto-enroll primary workstation in settings so cashiers can immediately authenticate
  await db.settings.put({ key: 'pos_enrolled_device_id', value: defaultDevice.id });
  await db.settings.put({ key: 'active_register_id', value: defaultRegister.id });
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('pos_enrolled_device_id', defaultDevice.id);
      window.localStorage.setItem('pos_device_fingerprint', 'fp-counter-terminal-01');
    } catch {
      // ignore
    }
  }

  // 3. Seed Categories
  const catBeverages: Category = { id: 'cat-bev', name: 'Beverages', slug: 'beverages', sync_status: 'synced', updated_at: new Date().toISOString() };
  const catBakery: Category = { id: 'cat-bak', name: 'Bakery & Snacks', slug: 'bakery', sync_status: 'synced', updated_at: new Date().toISOString() };
  const catDairy: Category = { id: 'cat-dai', name: 'Dairy & Eggs', slug: 'dairy', sync_status: 'synced', updated_at: new Date().toISOString() };
  const catGroceries: Category = { id: 'cat-gro', name: 'Groceries & Pantry', slug: 'groceries', sync_status: 'synced', updated_at: new Date().toISOString() };
  const catPersonal: Category = { id: 'cat-per', name: 'Personal Care', slug: 'personal-care', sync_status: 'synced', updated_at: new Date().toISOString() };

  await db.categories.bulkPut([catBeverages, catBakery, catDairy, catGroceries, catPersonal]);

  // 4. Seed Products with realistic barcodes, stock levels, and prices (UGX)
  const defaultProducts: Product[] = [
    {
      id: generateUUID(),
      sku: 'BEV-001',
      barcode: '600123450001',
      name: 'Mineral Water 500ml',
      description: 'Refreshing natural mineral spring water',
      category_id: catBeverages.id,
      cost_price: 800,
      selling_price: 1500,
      tax_rate: 18,
      unit: 'bottle',
      stock_quantity: 45,
      min_stock_level: 10,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'BEV-002',
      barcode: '600123450002',
      name: 'Fresh Mango Juice 1L',
      description: '100% freshly pressed tropical mango juice',
      category_id: catBeverages.id,
      cost_price: 4000,
      selling_price: 6500,
      tax_rate: 18,
      unit: 'bottle',
      stock_quantity: 20,
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'BEV-003',
      barcode: '600123450003',
      name: 'Arabica Roasted Coffee Beans 500g',
      description: 'Single-origin premium roasted Ugandan Arabica coffee',
      category_id: catBeverages.id,
      cost_price: 18000,
      selling_price: 28000,
      tax_rate: 18,
      unit: 'pack',
      stock_quantity: 12,
      min_stock_level: 3,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'BAK-001',
      barcode: '600123450004',
      name: 'Fresh Artisanal Bread Loaf',
      description: 'Daily freshly baked golden sourdough bread',
      category_id: catBakery.id,
      cost_price: 3200,
      selling_price: 5000,
      tax_rate: 0, // Tax exempt food
      unit: 'loaf',
      stock_quantity: 25,
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'BAK-002',
      barcode: '600123450005',
      name: 'Butter Croissant (Pack of 2)',
      description: 'Flaky Parisian-style butter croissants',
      category_id: catBakery.id,
      cost_price: 4500,
      selling_price: 7500,
      tax_rate: 18,
      unit: 'pack',
      stock_quantity: 8,
      min_stock_level: 4,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'DAI-001',
      barcode: '600123450006',
      name: 'Whole Pasteurized Milk 1L',
      description: 'Fresh farm-fresh pasteurized cow milk',
      category_id: catDairy.id,
      cost_price: 2500,
      selling_price: 3800,
      tax_rate: 0,
      unit: 'carton',
      stock_quantity: 30,
      min_stock_level: 8,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'DAI-002',
      barcode: '600123450007',
      name: 'Farm Fresh Eggs (Crate of 30)',
      description: 'Grade A organic farm eggs',
      category_id: catDairy.id,
      cost_price: 11000,
      selling_price: 16000,
      tax_rate: 0,
      unit: 'crate',
      stock_quantity: 15,
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'GRO-001',
      barcode: '600123450008',
      name: 'Super White Basmati Rice 5kg',
      description: 'Long grain fragrant Basmati rice',
      category_id: catGroceries.id,
      cost_price: 24000,
      selling_price: 35000,
      tax_rate: 0,
      unit: 'bag',
      stock_quantity: 18,
      min_stock_level: 4,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'GRO-002',
      barcode: '600123450009',
      name: 'Pure Sunflower Cooking Oil 2L',
      description: 'Triple refined healthy sunflower oil',
      category_id: catGroceries.id,
      cost_price: 16000,
      selling_price: 22500,
      tax_rate: 18,
      unit: 'can',
      stock_quantity: 2, // Low stock on purpose for testing alert!
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: generateUUID(),
      sku: 'PER-001',
      barcode: '600123450010',
      name: 'Antibacterial Hand Wash 500ml',
      description: 'Gentle moisturizing antibacterial liquid soap',
      category_id: catPersonal.id,
      cost_price: 5500,
      selling_price: 8900,
      tax_rate: 18,
      unit: 'bottle',
      stock_quantity: 0, // OUT OF STOCK on purpose for testing step 6 branch!
      min_stock_level: 5,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const allProductsToSeed: Product[] = [
    ...INSPIRATION_PRODUCTS.map(p => ({
      ...p,
      id: generateUUID(),
      description: p.name,
      is_active: true,
      sync_status: 'synced' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    ...defaultProducts,
  ];

  await db.products.bulkPut(allProductsToSeed);

  // 5. Seed Customers
  const defaultCustomers: Customer[] = [
    {
      id: 'cust-001',
      name: 'Patrick Mukasa',
      phone: '+256 772 111 222',
      email: 'patrick.m@example.com',
      loyalty_number: 'LOYAL-1001',
      loyalty_points: 340,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'cust-002',
      name: 'Amina Kigozi',
      phone: '+256 701 333 444',
      email: 'amina.k@example.com',
      loyalty_number: 'LOYAL-1002',
      loyalty_points: 85,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  await db.customers.bulkPut(defaultCustomers);

  // 6. Settings
  await db.settings.put({ key: 'is_initialized', value: 'true' });
  await db.settings.put({ key: 'default_register_id', value: defaultRegister.id });
  await db.settings.put({ key: 'default_device_id', value: defaultDevice.id });
}
