import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { authService } from '../services/authService';
import { deviceService } from '../services/deviceService';
import { connectivityService } from '../services/connectivity';
import { hashPin, generateSalt } from '../utils/id';

describe('Login, Role, Device Verification & Offline Authorization Pipeline', () => {
  const testRegisterId = '00000000-0000-0000-0000-000000000020';
  const testStoreId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    // Reset connectivity to online
    connectivityService.setSimulatedOffline(false);

    // Clear devices, settings, users, audit logs
    await db.devices.clear();
    await db.settings.clear();
    await db.users.clear();
    await db.registers.clear();
    await db.auditLogs.clear();
    await authService.clearCachedOfflineUsers();
    await deviceService.resetDeviceEnrollment();

    // Seed register
    await db.registers.add({
      id: testRegisterId,
      register_name: 'Main Counter Register 01',
      branch_name: 'Kampala Central',
      is_active: true,
    });

    // Seed online user 1 (cashier)
    const salt1 = generateSalt();
    const pinHash1 = await hashPin('1234', salt1);
    await db.users.add({
      id: '00000000-0000-0000-0000-000000000012',
      username: 'rcashier',
      full_name: 'Richie Cashier',
      role: 'cashier',
      pin_hash: pinHash1,
      salt: salt1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed online user 2 (manager)
    const salt2 = generateSalt();
    const pinHash2 = await hashPin('5555', salt2);
    await db.users.add({
      id: '00000000-0000-0000-0000-000000000011',
      username: 'smanager',
      full_name: 'Sarah Manager',
      role: 'manager',
      pin_hash: pinHash2,
      salt: salt2,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed online user 3 (never logs in online on this device)
    const salt3 = generateSalt();
    const pinHash3 = await hashPin('4321', salt3);
    await db.users.add({
      id: '00000000-0000-0000-0000-000000000013',
      username: 'gkasule',
      full_name: 'Grace Kasule',
      role: 'cashier',
      pin_hash: pinHash3,
      salt: salt3,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it('strictly blocks login if terminal hardware is not enrolled', async () => {
    // Terminal is NOT enrolled
    const status = await deviceService.getDeviceStatus();
    expect(status.isEnrolled).toBe(false);

    // Attempt login
    await expect(
      authService.login({
        username: 'rcashier',
        pin: '1234',
      })
    ).rejects.toThrow(/DEVICE_NOT_ENROLLED/);

    // Verify rejection audit log
    const logs = await db.auditLogs.toArray();
    expect(logs.some(l => l.action === 'auth:login_rejected')).toBe(true);
  });

  it('enrolls device hardware during first setup while online', async () => {
    expect(connectivityService.isOnline()).toBe(true);

    const enrolled = await deviceService.enrollDevice({
      deviceId: 'dev-pos-terminal-01',
      registerId: testRegisterId,
      deviceName: 'Counter iPad Pro 01',
      storeId: testStoreId,
    });

    expect(enrolled.id).toBe('dev-pos-terminal-01');
    expect(enrolled.is_authorized).toBe(true);

    const status = await deviceService.getDeviceStatus();
    expect(status.isEnrolled).toBe(true);
    expect(status.device?.device_name).toBe('Counter iPad Pro 01');
    expect(status.register?.id).toBe(testRegisterId);
  });

  it('authenticates user online, verifies role & register, and securely caches offline credentials', async () => {
    // 1. Enroll device
    await deviceService.enrollDevice({
      deviceId: 'dev-pos-terminal-01',
      registerId: testRegisterId,
      deviceName: 'Counter iPad Pro 01',
    });

    // 2. User is NOT yet cached for offline
    let isCached = await authService.isUserCachedForOffline('rcashier', 'dev-pos-terminal-01');
    expect(isCached).toBe(false);

    // 3. Authenticate online
    const authResult = await authService.login({
      username: 'rcashier',
      pin: '1234',
      registerId: testRegisterId,
    });

    expect(authResult.success).toBe(true);
    expect(authResult.isOfflineAuth).toBe(false);
    expect(authResult.user.username).toBe('rcashier');
    expect(authResult.user.role).toBe('cashier');
    expect(authResult.register.id).toBe(testRegisterId);

    // 4. Verify user is now securely cached for offline authorization
    isCached = await authService.isUserCachedForOffline('rcashier', 'dev-pos-terminal-01');
    expect(isCached).toBe(true);

    const cachedList = await authService.getCachedOfflineUsers('dev-pos-terminal-01');
    expect(cachedList.length).toBe(1);
    expect(cachedList[0].username).toBe('rcashier');
    expect(cachedList[0].role).toBe('cashier');
  });

  it('blocks cashier who has never authenticated online from logging in when internet goes OFF', async () => {
    // 1. Enroll device online
    await deviceService.enrollDevice({
      deviceId: 'dev-pos-terminal-01',
      registerId: testRegisterId,
      deviceName: 'Counter iPad Pro 01',
    });

    // 2. Cashier 1 (rcashier) authenticates online and gets cached
    await authService.login({
      username: 'rcashier',
      pin: '1234',
    });

    // Cashier 2 (gkasule) NEVER authenticated online on this terminal
    expect(await authService.isUserCachedForOffline('gkasule')).toBe(false);

    // 3. INTERNET GOES OFF!
    connectivityService.setSimulatedOffline(true);
    expect(connectivityService.isOnline()).toBe(false);

    // 4. Cashier 2 attempts to log in offline -> MUST BE REJECTED
    await expect(
      authService.login({
        username: 'gkasule',
        pin: '4321',
      })
    ).rejects.toThrow(/USER_NOT_AUTHORIZED_OFFLINE/);

    // Verify security audit log records offline rejection
    const logs = await db.auditLogs.where('action').equals('auth:offline_login_rejected').toArray();
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('allows previously authorized and cached cashier to log in and work seamlessly when internet is OFF', async () => {
    // 1. Online setup: Enroll device
    await deviceService.enrollDevice({
      deviceId: 'dev-pos-terminal-01',
      registerId: testRegisterId,
      deviceName: 'Counter iPad Pro 01',
    });

    // 2. Online setup: Cashier logs in online and credentials are encrypted/cached
    await authService.login({
      username: 'rcashier',
      pin: '1234',
    });

    // 3. INTERNET GOES OFF!
    connectivityService.setSimulatedOffline(true);
    expect(connectivityService.isOnline()).toBe(false);

    // 4. Cashier logs in offline with valid PIN
    const offlineResult = await authService.login({
      username: 'rcashier',
      pin: '1234',
    });

    expect(offlineResult.success).toBe(true);
    expect(offlineResult.isOfflineAuth).toBe(true);
    expect(offlineResult.user.username).toBe('rcashier');
    expect(offlineResult.user.role).toBe('cashier');
    expect(offlineResult.register.id).toBe(testRegisterId);

    // Verify offline login success audit entry
    const successLogs = await db.auditLogs.where('action').equals('auth:offline_login_success').toArray();
    expect(successLogs.length).toBe(1);
  });

  it('rejects incorrect PIN even when user is cached offline', async () => {
    // 1. Enroll and cache user online
    await deviceService.enrollDevice({
      deviceId: 'dev-pos-terminal-01',
      registerId: testRegisterId,
      deviceName: 'Counter iPad Pro 01',
    });
    await authService.login({
      username: 'rcashier',
      pin: '1234',
    });

    // 2. Internet goes OFF
    connectivityService.setSimulatedOffline(true);

    // 3. Attempt offline login with incorrect PIN
    await expect(
      authService.login({
        username: 'rcashier',
        pin: '9999', // Incorrect PIN
      })
    ).rejects.toThrow(/INCORRECT_PIN/);
  });
});
