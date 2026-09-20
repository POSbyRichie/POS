import { db } from '../db';
import { User } from '../types';
import { hashPin, generateSalt, verifyPin } from '../utils/id';
import { authService } from './authService';
import { connectivityService } from './connectivity';
import { getSupabase } from './supabase';
import { logger } from '../utils/logger';

export interface UpdateUserProfileParams {
  userId: string;
  username: string;
  fullName?: string;
  currentPin?: string;
  newPin?: string;
}

export interface UpdateUserProfileResult {
  success: boolean;
  user: User;
  message?: string;
}

class UserService {
  /**
   * Updates an existing user's profile and credentials (username, full name, password/PIN)
   * Enforces validation, uniqueness, current password verification, and updates both
   * the local database and the offline authorization cache.
   */
  public async updateUserProfile(params: UpdateUserProfileParams): Promise<UpdateUserProfileResult> {
    const { userId, username, fullName, currentPin, newPin } = params;

    // 1. Locate user in local database
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`USER_NOT_FOUND: User '${userId}' does not exist.`);
    }

    // 2. Validate and sanitize username
    const trimmedUsername = username.trim();
    if (!trimmedUsername || trimmedUsername.length < 3) {
      throw new Error('INVALID_USERNAME: Username must be at least 3 characters long.');
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      throw new Error('INVALID_USERNAME: Username can only contain letters, numbers, underscores, hyphens, and periods.');
    }

    // 3. Check username uniqueness
    const existingWithSameName = await db.users
      .where('username')
      .equalsIgnoreCase(trimmedUsername)
      .first();

    if (existingWithSameName && existingWithSameName.id !== userId) {
      throw new Error(`USERNAME_ALREADY_TAKEN: The username '${trimmedUsername}' is already in use by another staff member.`);
    }

    // 4. Handle Password / PIN Update
    let newPinHash = user.pin_hash;
    let newSalt = user.salt;
    const isChangingPassword = Boolean(newPin && newPin.trim().length > 0);

    if (isChangingPassword) {
      if (!currentPin) {
        throw new Error('MISSING_CURRENT_PASSWORD: You must enter your current password / PIN to set a new one.');
      }

      // Verify current credentials
      const isCurrentValid = await verifyPin(currentPin, user.salt, user.pin_hash);
      if (!isCurrentValid) {
        throw new Error('INCORRECT_CURRENT_PASSWORD: The current password / PIN you entered is incorrect.');
      }

      const trimmedNewPin = newPin!.trim();
      if (trimmedNewPin.length < 4) {
        throw new Error('PASSWORD_TOO_SHORT: New password / PIN must be at least 4 characters long.');
      }

      // Generate fresh cryptographic salt & hash
      newSalt = generateSalt();
      newPinHash = await hashPin(trimmedNewPin, newSalt);
    }

    // 5. Construct updated user entity
    const updatedUser: User = {
      ...user,
      username: trimmedUsername,
      full_name: fullName !== undefined ? fullName.trim() : user.full_name,
      name: fullName !== undefined ? fullName.trim() : user.name,
      pin_hash: newPinHash,
      salt: newSalt,
      updated_at: new Date().toISOString(),
    };

    // 6. Save to local Dexie database
    await db.users.put(updatedUser);

    // 7. Update offline authorized cache on this workstation
    await authService.updateCachedUserCredentials(updatedUser);

    // 8. Attempt live cloud sync with Supabase profiles table if online
    const supabase = getSupabase();
    if (supabase && connectivityService.isOnline()) {
      try {
        const { error } = await supabase.from('profiles').upsert({
          id: updatedUser.id,
          username: updatedUser.username,
          full_name: updatedUser.full_name,
          role: updatedUser.role,
          pin_hash: updatedUser.pin_hash,
          salt: updatedUser.salt,
          is_active: updatedUser.is_active,
          updated_at: updatedUser.updated_at,
        });

        if (error) {
          logger.warn('UserService', 'Could not sync updated profile to Supabase', error);
        } else {
          logger.info('UserService', `Profile for ${updatedUser.username} synchronized to Supabase cloud.`);
        }
      } catch (cloudErr) {
        logger.warn('UserService', 'Supabase profile sync exception (offline fallback active)', cloudErr);
      }
    }

    // 9. Record security audit log
    try {
      await db.auditLogs.add({
        user_id: user.id,
        action: 'auth:profile_updated',
        entity_type: 'user',
        entity_id: user.id,
        details: JSON.stringify({
          username_changed: trimmedUsername !== user.username,
          name_changed: fullName !== undefined && fullName.trim() !== user.full_name,
          password_changed: isChangingPassword,
          timestamp: updatedUser.updated_at,
        }),
        timestamp: new Date().toISOString(),
        sync_status: 'pending',
      });
    } catch (auditErr) {
      logger.error('UserService', 'Failed to record profile update audit log', auditErr);
    }

    return {
      success: true,
      user: updatedUser,
      message: 'Profile and credentials updated successfully.',
    };
  }
}

export const userService = new UserService();
