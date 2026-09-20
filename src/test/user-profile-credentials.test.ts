import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { userService } from '../services/userService';
import { authService } from '../services/authService';
import { hashPin, generateSalt, generateUUID } from '../utils/id';
import { User, Register, Device } from '../types';
import { connectivityService } from '../services/connectivity';

describe('User Profile & Credential Management (Online & Offline)', () => {
  let testUser1: User;
  let testUser2: User;
  let testDevice: Device;
  let testRegister: Register;

  beforeEach(async () => {
    await db.delete();
    await db.open();

    testRegister = {
      id: generateUUID(),
      register_name: 'Test Terminal 1',
      branch_name: 'Main Store',
      is_active: true,
    };
    await db.registers.put(testRegister);

    testDevice = {
      id: 'dev-terminal-01',
      device_name: 'Counter Device',
      register_id: testRegister.id,
      is_authorized: true,
      enrolled_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    };
    await db.devices.put(testDevice);

    await db.settings.put({ key: 'pos_enrolled_device_id', value: testDevice.id });

    // Create test user 1 (cashier) - initial PIN 1234
    const salt1 = generateSalt();
    const hash1 = await hashPin('1234', salt1);
    testUser1 = {
      id: generateUUID(),
      username: 'cashier_alice',
      full_name: 'Alice Nansubuga',
      role: 'cashier',
      pin_hash: hash1,
      salt: salt1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.users.put(testUser1);

    // Create test user 2 (manager) - initial PIN 5555
    const salt2 = generateSalt();
    const hash2 = await hashPin('5555', salt2);
    testUser2 = {
      id: generateUUID(),
      username: 'manager_bob',
      full_name: 'Bob Okello',
      role: 'manager',
      pin_hash: hash2,
      salt: salt2,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.users.put(testUser2);

    // Ensure online
    connectivityService.setSimulatedOffline(false);

    // Pre-cache testUser1 on device
    await authService.cacheUserForOffline(testUser1, testDevice.id, testRegister.id);
  });

  it('allows a user to update their full name and username successfully', async () => {
    const result = await userService.updateUserProfile({
      userId: testUser1.id,
      username: 'alice_senior',
      fullName: 'Alice Nansubuga (Lead Cashier)',
    });

    expect(result.success).toBe(true);
    expect(result.user.username).toBe('alice_senior');
    expect(result.user.full_name).toBe('Alice Nansubuga (Lead Cashier)');

    // Verify in database
    const dbRecord = await db.users.get(testUser1.id);
    expect(dbRecord?.username).toBe('alice_senior');
    expect(dbRecord?.full_name).toBe('Alice Nansubuga (Lead Cashier)');

    // Verify login works with new username
    const loginResult = await authService.login({
      username: 'alice_senior',
      pin: '1234',
    });
    expect(loginResult.success).toBe(true);
    expect(loginResult.user.username).toBe('alice_senior');
  });

  it('enforces username uniqueness and rejects taking another user\'s username', async () => {
    await expect(
      userService.updateUserProfile({
        userId: testUser1.id,
        username: 'manager_bob', // already used by testUser2
      })
    ).rejects.toThrow(/USERNAME_ALREADY_TAKEN/);
  });

  it('rejects password change if current password is incorrect', async () => {
    await expect(
      userService.updateUserProfile({
        userId: testUser1.id,
        username: 'cashier_alice',
        currentPin: '0000', // wrong PIN
        newPin: '9876',
      })
    ).rejects.toThrow(/INCORRECT_CURRENT_PASSWORD/);

    // Old PIN still works
    const loginResult = await authService.login({
      username: 'cashier_alice',
      pin: '1234',
    });
    expect(loginResult.success).toBe(true);
  });

  it('allows user to change their password with valid current credentials', async () => {
    const result = await userService.updateUserProfile({
      userId: testUser1.id,
      username: 'cashier_alice',
      currentPin: '1234',
      newPin: '8899',
    });

    expect(result.success).toBe(true);

    // Old PIN must fail
    await expect(
      authService.login({
        username: 'cashier_alice',
        pin: '1234',
      })
    ).rejects.toThrow(/INCORRECT_PIN/);

    // New PIN must succeed
    const newLogin = await authService.login({
      username: 'cashier_alice',
      pin: '8899',
    });
    expect(newLogin.success).toBe(true);
    expect(newLogin.user.id).toBe(testUser1.id);
  });

  it('synchronizes credential updates to the offline authorization cache for offline work', async () => {
    // 1. Update username and PIN
    await userService.updateUserProfile({
      userId: testUser1.id,
      username: 'alice_offline_ready',
      fullName: 'Alice Offline',
      currentPin: '1234',
      newPin: '7788',
    });

    // 2. Simulate internet going down
    connectivityService.setSimulatedOffline(true);

    // 3. Login offline with the NEW username and NEW PIN
    const offlineLogin = await authService.login({
      username: 'alice_offline_ready',
      pin: '7788',
    });

    expect(offlineLogin.success).toBe(true);
    expect(offlineLogin.isOfflineAuth).toBe(true);
    expect(offlineLogin.user.username).toBe('alice_offline_ready');

    // 4. Verify old credentials fail offline
    await expect(
      authService.login({
        username: 'cashier_alice',
        pin: '1234',
      })
    ).rejects.toThrow();
  });
});
