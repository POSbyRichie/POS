import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { seedDatabase } from '../db/seed';
import { verifyPin } from '../utils/id';

describe('IndexedDB Offline Database & Seed', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await seedDatabase(true);
  });

  it('initializes and seeds users with offline hashed PINs', async () => {
    const users = await db.users.toArray();
    expect(users.length).toBe(4);

    const cashier = await db.users.where('username').equals('cashier1').first();
    expect(cashier).toBeDefined();
    expect(cashier?.role).toBe('cashier');

    // Verify PIN '1234' matches
    const isPinValid = await verifyPin('1234', cashier!.salt, cashier!.pin_hash);
    expect(isPinValid).toBe(true);

    const isWrongPinValid = await verifyPin('9999', cashier!.salt, cashier!.pin_hash);
    expect(isWrongPinValid).toBe(false);
  });

  it('seeds products and allows barcode and SKU indexed lookup', async () => {
    const products = await db.products.toArray();
    expect(products.length).toBeGreaterThanOrEqual(10);

    // Search by barcode
    const water = await db.products.where('barcode').equals('600123450001').first();
    expect(water).toBeDefined();
    expect(water?.name).toContain('Mineral Water');
    expect(water?.stock_quantity).toBe(45);

    // Search out of stock item
    const soap = await db.products.where('barcode').equals('600123450010').first();
    expect(soap).toBeDefined();
    expect(soap?.stock_quantity).toBe(0);
  });

  it('seeds default register and device', async () => {
    const register = await db.registers.get('reg-001-main');
    expect(register).toBeDefined();
    expect(register?.is_active).toBe(true);

    const device = await db.devices.get('dev-pos-terminal-01');
    expect(device).toBeDefined();
    expect(device?.is_authorized).toBe(true);
  });
});
