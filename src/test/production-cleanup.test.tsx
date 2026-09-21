import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { db } from '../db';
import { initializeProductionSystem } from '../db/init';
import { LoginModal } from '../components/auth/LoginModal';
import { authService } from '../services/authService';
import { deviceService } from '../services/deviceService';
import { connectivityService } from '../services/connectivity';
import { posStore } from '../store/posStore';
import { productRepository, categoryRepository, customerRepository } from '../db/repositories';

describe('POS Production Data Cleanup & First-Run Verification', () => {
  beforeEach(async () => {
    connectivityService.setSimulatedOffline(false);

    // Completely clear all tables to test zero-data fresh installation state
    await db.delete();
    await db.open();

    await authService.clearCachedOfflineUsers();
    await deviceService.resetDeviceEnrollment();

    posStore.setState({
      currentUser: null,
      activeShift: null,
      activeRegister: null,
      activeDevice: null,
      cartItems: [],
      selectedCustomer: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes production system baseline with zero mock business entities', async () => {
    // Run production initialization
    await initializeProductionSystem();

    // 1. Verify essential system lookup configurations are provisioned
    const rolesCount = await db.roles.count();
    const permissionsCount = await db.permissions.count();
    const rolePermissionsCount = await db.rolePermissions.count();

    expect(rolesCount).toBe(4); // admin, manager, cashier, inventory_manager
    expect(permissionsCount).toBe(10);
    expect(rolePermissionsCount).toBeGreaterThan(15);

    const setting = await db.settings.get('system_initialized');
    expect(setting?.value).toBe('true');

    // 2. Strictly verify zero mock business data exists
    const [productsCount, categoriesCount, customersCount, usersCount, salesCount, shiftsCount, movementsCount] =
      await Promise.all([
        db.products.count(),
        db.categories.count(),
        db.customers.count(),
        db.users.count(),
        db.sales.count(),
        db.shifts.count(),
        db.inventoryMovements.count(),
      ]);

    expect(productsCount).toBe(0);
    expect(categoriesCount).toBe(0);
    expect(customersCount).toBe(0);
    expect(usersCount).toBe(0);
    expect(salesCount).toBe(0);
    expect(shiftsCount).toBe(0);
    expect(movementsCount).toBe(0);
  });

  it('renders First-Run InitialSetupModal when database has 0 users', async () => {
    await initializeProductionSystem();

    render(<LoginModal />);

    // Should detect 0 users and display setup onboarding wizard
    await waitFor(() => {
      expect(screen.getByText(/RichiePOS Installation Setup/i)).toBeInTheDocument();
      expect(screen.getByText(/FIRST RUN/i)).toBeInTheDocument();
      expect(screen.getByText(/1. Business & Station/i)).toBeInTheDocument();
    });
  });

  it('completes first-run onboarding end-to-end, creating real store and admin credentials', async () => {
    await initializeProductionSystem();

    render(<LoginModal />);

    // Wait for setup wizard
    await waitFor(() => {
      expect(screen.getByText(/RichiePOS Installation Setup/i)).toBeInTheDocument();
    });

    // Step 1: Fill Store & Workstation Details
    const storeNameInput = screen.getByPlaceholderText(/e\.g\. Darwin Supermarket & Retail/i);
    const currencyInput = screen.getByPlaceholderText(/UGX/i);
    const registerInput = screen.getByPlaceholderText(/e\.g\. Register 01 \(Main Counter\)/i);

    fireEvent.change(storeNameInput, { target: { value: 'Horizon Retail Ltd' } });
    fireEvent.change(currencyInput, { target: { value: 'USD' } });
    fireEvent.change(registerInput, { target: { value: 'Counter Station 01' } });

    // Click Next Step
    const nextBtn = screen.getByRole('button', { name: /Continue to Admin Setup/i });
    fireEvent.click(nextBtn);

    // Step 2: Fill Administrator Account Details
    await waitFor(() => {
      expect(screen.getByText(/2. Administrator Account/i)).toBeInTheDocument();
    });

    const adminNameInput = screen.getByPlaceholderText(/e\.g\. Alex M\. \(Store Owner\)/i);
    const adminUsernameInput = screen.getByPlaceholderText(/e\.g\. admin/i);
    const pinInput = screen.getByPlaceholderText(/e\.g\. 9999/i);
    const confirmPinInput = screen.getByPlaceholderText(/Repeat PIN/i);

    fireEvent.change(adminNameInput, { target: { value: 'Michael Scott' } });
    fireEvent.change(adminUsernameInput, { target: { value: 'mscott' } });
    fireEvent.change(pinInput, { target: { value: '7890' } });
    fireEvent.change(confirmPinInput, { target: { value: '7890' } });

    // Submit Complete Setup
    const submitBtn = screen.getByRole('button', { name: /Complete Setup & Enter POS/i });
    fireEvent.click(submitBtn);

    // Verify Database Persistence
    await waitFor(async () => {
      const users = await db.users.toArray();
      expect(users.length).toBe(1);
      expect(users[0].username).toBe('mscott');
      expect(users[0].full_name).toBe('Michael Scott');
      expect(users[0].role).toBe('admin');
      expect(users[0].pin_hash).toBeTruthy();
      expect(users[0].pin_hash).not.toBe('7890'); // securely hashed
    });

    const stores = await db.stores.toArray();
    expect(stores.length).toBe(1);
    expect(stores[0].name).toBe('Horizon Retail Ltd');
    expect(stores[0].currency_symbol).toBe('USD');

    const registers = await db.registers.toArray();
    expect(registers.length).toBe(1);
    expect(registers[0].register_name).toBe('Counter Station 01');

    // Verify Active User State in POS Store
    const state = posStore.getState();
    expect(state.currentUser).not.toBeNull();
    expect(state.currentUser?.username).toBe('mscott');
    expect(state.currentUser?.role).toBe('admin');
  });

  it('allows adding real categories, real products, and processing real transactions in clean database', async () => {
    await initializeProductionSystem();

    // 1. Create a legitimate category
    const cat = await categoryRepository.createCategory({
      name: 'Organic Fruits',
      slug: 'organic-fruits',
      color: '#16a34a',
    });
    expect(cat.id).toBeTruthy();

    // 2. Create a legitimate product
    const prod = await productRepository.createProduct({
      name: 'Organic Fuji Apples (1kg)',
      sku: 'APP-FUJI-1KG',
      barcode: '998877660001',
      category_id: cat.id,
      cost_price: 300,
      selling_price: 550,
      tax_rate: 0,
      unit: 'kg',
      stock_quantity: 50,
      min_stock_level: 10,
      is_active: true,
    });
    expect(prod.id).toBeTruthy();
    expect(prod.stock_quantity).toBe(50);

    // 3. Create a legitimate customer
    const cust = await customerRepository.createCustomer({
      name: 'Sarah Connor',
      phone: '+1 555 0199',
      email: 'sarah@example.com',
      loyalty_points: 0,
      sync_status: 'synced',
    });
    expect(cust.id).toBeTruthy();

    // Verify clean counts
    expect(await db.categories.count()).toBe(1);
    expect(await db.products.count()).toBe(1);
    expect(await db.customers.count()).toBe(1);
    expect(await db.sales.count()).toBe(0);
  });

  it('detects and purges legacy dummy products, categories, and stores automatically on boot', async () => {
    // Inject legacy dummy products and categories
    await db.products.bulkPut([
      {
        id: '00000000-0000-0000-0000-000000000040',
        sku: 'BEV-001',
        barcode: '600100100001',
        name: 'Highland Mineral Water 500ml',
        category_id: 'cat-beverages',
        cost_price: 800,
        selling_price: 1500,
        tax_rate: 18,
        unit: 'pcs',
        stock_quantity: 100,
        min_stock_level: 20,
        is_active: true,
        sync_status: 'synced',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000041',
        sku: 'BEV-002',
        barcode: '600100100002',
        name: 'Coca Cola 350ml Glass',
        category_id: 'cat-beverages',
        cost_price: 1400,
        selling_price: 2500,
        tax_rate: 18,
        unit: 'pcs',
        stock_quantity: 80,
        min_stock_level: 15,
        is_active: true,
        sync_status: 'synced',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    await db.categories.put({
      id: 'cat-beverages',
      name: 'Beverages & Drinks',
      slug: 'beverages',
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Mark initial wipe as having previously run
    await db.settings.put({ key: 'production_clean_v4', value: 'true' });

    // Also add a legitimate product and category
    await db.categories.put({
      id: 'cat-legit-groceries',
      name: 'Real Groceries',
      slug: 'real-groceries',
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await db.products.put({
      id: 'real-prod-12345',
      sku: 'REAL-RICE-25KG',
      barcode: '1234567890123',
      name: 'Super Basmati Rice 25kg',
      category_id: 'cat-legit-groceries',
      cost_price: 85000,
      selling_price: 110000,
      tax_rate: 0,
      unit: 'bag',
      stock_quantity: 15,
      min_stock_level: 3,
      is_active: true,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Before init, verify productRepository filters out dummy products even if in db
    const activeBeforeInit = await productRepository.getActiveProducts();
    expect(activeBeforeInit.length).toBe(1);
    expect(activeBeforeInit[0].sku).toBe('REAL-RICE-25KG');

    // Run system init
    await initializeProductionSystem();

    // Verify dummy items are purged from db while legitimate product remains
    const prodsInDb = await db.products.toArray();
    expect(prodsInDb.length).toBe(1);
    expect(prodsInDb[0].sku).toBe('REAL-RICE-25KG');

    const catsInDb = await db.categories.toArray();
    expect(catsInDb.length).toBe(1);
    expect(catsInDb[0].id).toBe('cat-legit-groceries');
  });
});
