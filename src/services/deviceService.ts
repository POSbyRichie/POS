import { db } from '../db';
import { Device, Register, Store } from '../types';
import { generateUUID } from '../utils/id';
import { logger } from '../utils/logger';

export interface DeviceStatus {
  isEnrolled: boolean;
  device: Device | null;
  register: Register | null;
  store: Store | null;
  fingerprint: string;
}

const SETTING_DEVICE_ID = 'pos_enrolled_device_id';
const SETTING_FINGERPRINT = 'pos_device_fingerprint';

class DeviceService {
  private currentDeviceId: string | null = null;
  private currentFingerprint: string | null = null;

  constructor() {
    this.initFingerprint();
  }

  private initFingerprint(): string {
    if (this.currentFingerprint) return this.currentFingerprint;

    let fp = '';
    if (typeof window !== 'undefined' && window.localStorage) {
      fp = window.localStorage.getItem(SETTING_FINGERPRINT) || '';
    }

    if (!fp) {
      const navInfo = typeof navigator !== 'undefined' ? `${navigator.userAgent}-${navigator.platform}` : 'node-pos';
      fp = `fp-${btoa(navInfo).slice(0, 16)}-${Math.random().toString(36).slice(2, 8)}`;
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SETTING_FINGERPRINT, fp);
      }
    }

    this.currentFingerprint = fp;
    return fp;
  }

  public getFingerprint(): string {
    return this.initFingerprint();
  }

  /**
   * Retrieves current enrolled device ID from persistent storage
   */
  public async getEnrolledDeviceId(): Promise<string | null> {
    if (this.currentDeviceId) return this.currentDeviceId;

    let id: string | null = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      id = window.localStorage.getItem(SETTING_DEVICE_ID);
    }

    if (!id) {
      const setting = await db.settings.get(SETTING_DEVICE_ID);
      if (setting) id = setting.value;
    }

    this.currentDeviceId = id;
    return id;
  }

  /**
   * Returns complete device enrollment status and associated register / store
   */
  public async getDeviceStatus(): Promise<DeviceStatus> {
    const deviceId = await this.getEnrolledDeviceId();
    const fingerprint = this.getFingerprint();

    if (!deviceId) {
      return {
        isEnrolled: false,
        device: null,
        register: null,
        store: null,
        fingerprint,
      };
    }

    const device = (await db.devices.get(deviceId)) || null;
    if (!device || !device.is_authorized) {
      return {
        isEnrolled: false,
        device,
        register: null,
        store: null,
        fingerprint,
      };
    }

    const register = (await db.registers.get(device.register_id)) || null;
    let store: Store | null = null;
    if (register) {
      store = (await db.stores.get('00000000-0000-0000-0000-000000000001')) || (await db.stores.toCollection().first()) || null;
    }

    return {
      isEnrolled: true,
      device,
      register,
      store,
      fingerprint,
    };
  }

  /**
   * Enrolls this terminal while online, binding it to a register and store
   */
  public async enrollDevice(params: {
    deviceId?: string;
    registerId: string;
    deviceName: string;
    storeId?: string;
  }): Promise<Device> {
    const id = params.deviceId || `dev-pos-${generateUUID().slice(0, 8)}`;
    const fingerprint = this.getFingerprint();
    const now = new Date().toISOString();

    const deviceRecord: Device = {
      id,
      device_name: params.deviceName,
      register_id: params.registerId,
      is_authorized: true,
      enrolled_at: now,
      last_active_at: now,
    };

    // Save locally
    await db.devices.put(deviceRecord);

    // Save persistent settings
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SETTING_DEVICE_ID, id);
    }
    await db.settings.put({ key: SETTING_DEVICE_ID, value: id });
    this.currentDeviceId = id;

    // Record audit log
    await db.auditLogs.add({
      user_id: 'system',
      action: 'device:enrolled',
      entity_type: 'device',
      entity_id: id,
      details: JSON.stringify({
        deviceName: params.deviceName,
        registerId: params.registerId,
        fingerprint,
      }),
      timestamp: now,
      sync_status: 'pending',
    });

    logger.info('DeviceService', `Device enrolled successfully: ${id} (${params.deviceName})`);
    return deviceRecord;
  }

  /**
   * Updates device heartbeat / last active timestamp
   */
  public async touchDevice(deviceId: string): Promise<void> {
    const now = new Date().toISOString();
    await db.devices.update(deviceId, { last_active_at: now });
  }

  /**
   * Resets device enrollment (for admin setup or device transfer)
   */
  public async resetDeviceEnrollment(): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SETTING_DEVICE_ID);
    }
    await db.settings.delete(SETTING_DEVICE_ID);
    this.currentDeviceId = null;
    logger.info('DeviceService', 'Device enrollment reset');
  }
}

export const deviceService = new DeviceService();
