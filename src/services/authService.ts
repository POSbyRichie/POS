import { db } from '../db';
import { User, UserRole, Register, Device } from '../types';
import { verifyPin } from '../utils/id';
import { connectivityService } from './connectivity';
import { deviceService } from './deviceService';
import { logger } from '../utils/logger';

export interface CachedOfflineUser {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  pin_hash: string;
  salt: string;
  device_id: string;
  authorized_register_ids: string[];
  last_authenticated_online_at: string;
  is_active: boolean;
}

export interface AuthResult {
  success: boolean;
  user: User;
  device: Device;
  register: Register;
  isOfflineAuth: boolean;
  cachedAt?: string;
}

const SETTING_CACHED_OFFLINE_USERS = 'pos_cached_offline_users';

class AuthService {
  /**
   * Retrieves all users authorized to work offline on this terminal
   */
  public async getCachedOfflineUsers(deviceId?: string): Promise<CachedOfflineUser[]> {
    const targetDeviceId = deviceId || (await deviceService.getEnrolledDeviceId());
    const setting = await db.settings.get(SETTING_CACHED_OFFLINE_USERS);
    if (!setting || !setting.value) return [];

    try {
      const allCached: CachedOfflineUser[] = JSON.parse(setting.value);
      if (!targetDeviceId) return allCached;
      return allCached.filter(u => u.device_id === targetDeviceId && u.is_active);
    } catch {
      return [];
    }
  }

  /**
   * Checks if a user is explicitly authorized to log in offline on this terminal
   */
  public async isUserCachedForOffline(userIdOrUsername: string, deviceId?: string): Promise<boolean> {
    const cachedUsers = await this.getCachedOfflineUsers(deviceId);
    return cachedUsers.some(
      u => (u.id === userIdOrUsername || u.username.toLowerCase() === userIdOrUsername.toLowerCase()) && u.is_active
    );
  }

  /**
   * Caches an authenticated user for offline authorization on this terminal
   */
  public async cacheUserForOffline(user: User, deviceId: string, registerId: string): Promise<void> {
    const setting = await db.settings.get(SETTING_CACHED_OFFLINE_USERS);
    let allCached: CachedOfflineUser[] = [];
    if (setting && setting.value) {
      try {
        allCached = JSON.parse(setting.value);
      } catch {
        allCached = [];
      }
    }

    const now = new Date().toISOString();
    const existingIndex = allCached.findIndex(u => u.id === user.id && u.device_id === deviceId);

    const cachedEntry: CachedOfflineUser = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      pin_hash: user.pin_hash,
      salt: user.salt,
      device_id: deviceId,
      authorized_register_ids: [registerId],
      last_authenticated_online_at: now,
      is_active: user.is_active,
    };

    if (existingIndex >= 0) {
      allCached[existingIndex] = cachedEntry;
    } else {
      allCached.push(cachedEntry);
    }

    await db.settings.put({
      key: SETTING_CACHED_OFFLINE_USERS,
      value: JSON.stringify(allCached),
    });

    logger.info('AuthService', `User ${user.username} securely cached for offline access on device ${deviceId}`);
  }

  /**
   * Updates cached offline credentials when user updates username, name, or password
   */
  public async updateCachedUserCredentials(user: User): Promise<void> {
    const setting = await db.settings.get(SETTING_CACHED_OFFLINE_USERS);
    if (!setting || !setting.value) return;
    try {
      const allCached: CachedOfflineUser[] = JSON.parse(setting.value);
      let modified = false;
      for (const c of allCached) {
        if (c.id === user.id) {
          c.username = user.username;
          c.full_name = user.full_name;
          c.pin_hash = user.pin_hash;
          c.salt = user.salt;
          c.last_authenticated_online_at = new Date().toISOString();
          modified = true;
        }
      }
      if (modified) {
        await db.settings.put({
          key: SETTING_CACHED_OFFLINE_USERS,
          value: JSON.stringify(allCached),
        });
        logger.info('AuthService', `Updated offline authorization credentials for user ${user.username}`);
      }
    } catch (err) {
      logger.error('AuthService', 'Failed to update cached offline credentials', err);
    }
  }

  /**
   * Main login function implementing:
   * Login -> Role Verification -> Device Verification -> Register Selection -> Offline Auth Capability
   */
  public async login(params: {
    username: string;
    pin: string;
    registerId?: string;
  }): Promise<AuthResult> {
    const isOnline = connectivityService.isOnline();
    const deviceStatus = await deviceService.getDeviceStatus();

    logger.info('AuthService', `Login attempt for '${params.username}', online=${isOnline}, enrolled=${deviceStatus.isEnrolled}`);

    // =========================================================================
    // 1. DEVICE VERIFICATION GATE
    // =========================================================================
    if (!deviceStatus.isEnrolled || !deviceStatus.device) {
      const err = 'DEVICE_NOT_ENROLLED: This terminal is not enrolled. First setup requires an online connection to enroll the hardware device.';
      await this.recordAuditLog('system', 'auth:login_rejected', {
        reason: 'DEVICE_NOT_ENROLLED',
        username: params.username,
        isOnline,
      });
      throw new Error(err);
    }

    const device = deviceStatus.device;

    // =========================================================================
    // 2. OFFLINE AUTHORIZATION PATH
    // =========================================================================
    if (!isOnline) {
      // Offline authorization rule: Cashier must have authenticated online prior to working offline
      const cachedUsers = await this.getCachedOfflineUsers(device.id);
      const cachedUser = cachedUsers.find(
        u => u.username.toLowerCase() === params.username.toLowerCase()
      );

      if (!cachedUser) {
        const err = `USER_NOT_AUTHORIZED_OFFLINE: Cashier '${params.username}' has not previously authenticated online on this terminal. First setup must be performed while online.`;
        await this.recordAuditLog(params.username, 'auth:offline_login_rejected', {
          reason: 'USER_NOT_AUTHORIZED_OFFLINE',
          deviceId: device.id,
        });
        throw new Error(err);
      }

      if (!cachedUser.is_active) {
        throw new Error('ACCOUNT_INACTIVE: This user account has been deactivated.');
      }

      // Verify PIN against cached salt & hash
      const isValid = await verifyPin(params.pin, cachedUser.salt, cachedUser.pin_hash);
      if (!isValid) {
        await this.recordAuditLog(cachedUser.id, 'auth:offline_login_failed_pin', {
          deviceId: device.id,
        });
        throw new Error('INCORRECT_PIN: Invalid credentials entered.');
      }

      // Register Selection
      const registerIdToUse = params.registerId || device.register_id;
      const register = (await db.registers.get(registerIdToUse)) || deviceStatus.register;
      if (!register || !register.is_active) {
        throw new Error('REGISTER_INACTIVE: Selected register is inactive or not found.');
      }

      // Reconstruct User domain model
      const user: User = {
        id: cachedUser.id,
        username: cachedUser.username,
        full_name: cachedUser.full_name,
        role: cachedUser.role,
        pin_hash: cachedUser.pin_hash,
        salt: cachedUser.salt,
        is_active: cachedUser.is_active,
        created_at: cachedUser.last_authenticated_online_at,
        updated_at: cachedUser.last_authenticated_online_at,
      };

      await deviceService.touchDevice(device.id);

      await this.recordAuditLog(user.id, 'auth:offline_login_success', {
        deviceId: device.id,
        registerId: register.id,
        role: user.role,
      });

      return {
        success: true,
        user,
        device,
        register,
        isOfflineAuth: true,
        cachedAt: cachedUser.last_authenticated_online_at,
      };
    }

    // =========================================================================
    // 3. ONLINE AUTHENTICATION PATH
    // =========================================================================
    // Look up user in local DB (synced with Supabase)
    const user = await db.users
      .where('username')
      .equalsIgnoreCase(params.username)
      .first();

    if (!user) {
      throw new Error(`USER_NOT_FOUND: User '${params.username}' does not exist.`);
    }

    if (!user.is_active) {
      throw new Error('ACCOUNT_INACTIVE: This user account has been deactivated.');
    }

    // Verify PIN
    const isValid = await verifyPin(params.pin, user.salt, user.pin_hash);
    if (!isValid) {
      await this.recordAuditLog(user.id, 'auth:online_login_failed_pin', {
        deviceId: device.id,
      });
      throw new Error('INCORRECT_PIN: Invalid credentials entered.');
    }

    // Role Verification
    if (!['admin', 'manager', 'cashier', 'inventory_manager'].includes(user.role)) {
      throw new Error(`INVALID_ROLE: Role '${user.role}' is not authorized to access POS.`);
    }

    // Register Selection
    const registerIdToUse = params.registerId || device.register_id;
    const register = (await db.registers.get(registerIdToUse)) || deviceStatus.register;
    if (!register || !register.is_active) {
      throw new Error('REGISTER_INACTIVE: Selected register is inactive or not found.');
    }

    // Securely cache user for future offline authorization on this terminal
    await this.cacheUserForOffline(user, device.id, register.id);
    await deviceService.touchDevice(device.id);

    await this.recordAuditLog(user.id, 'auth:online_login_and_cache', {
      deviceId: device.id,
      registerId: register.id,
      role: user.role,
    });

    return {
      success: true,
      user,
      device,
      register,
      isOfflineAuth: false,
    };
  }

  private async recordAuditLog(userId: string, action: string, details: Record<string, unknown>) {
    try {
      await db.auditLogs.add({
        user_id: userId,
        action,
        entity_type: 'user',
        entity_id: userId,
        details: JSON.stringify(details),
        timestamp: new Date().toISOString(),
        sync_status: 'pending',
      });
    } catch (e) {
      logger.error('AuthService', 'Failed to record audit log', e);
    }
  }

  /**
   * Clears the offline authorization cache (useful for testing or security revocation)
   */
  public async clearCachedOfflineUsers(): Promise<void> {
    await db.settings.delete(SETTING_CACHED_OFFLINE_USERS);
    logger.info('AuthService', 'Cleared offline authorized users cache');
  }
}

export const authService = new AuthService();
