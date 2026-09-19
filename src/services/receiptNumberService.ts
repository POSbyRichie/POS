import { PosDatabase, db as defaultDb } from '../db/database';
import { ReceiptNumberOptions } from '../types';
import { logger } from '../utils/logger';

export class ReceiptNumberService {
  /**
   * Derives a deterministic 2-character register partition code.
   * e.g. 'reg-001-main' -> '01'
   *      'Register 2' -> '02'
   *      'terminal-03' -> '03'
   */
  public getRegisterCode(registerId?: string, registerName?: string): string {
    if (!registerId && !registerName) return '01';

    const source = (registerId || '') + ' ' + (registerName || '');

    // Match explicit numeric sequences like '001', '02', '1', 'reg-001'
    const numMatch = source.match(/(?:reg(?:ister)?|station|term(?:inal)?|pos)?[-_\s]*0*(\d{1,4})/i);
    if (numMatch && numMatch[1]) {
      const num = parseInt(numMatch[1], 10);
      if (!isNaN(num) && num > 0 && num < 100) {
        return String(num).padStart(2, '0');
      }
    }

    // Fallback: deterministic 2-char hex from string hash
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
      hash = (hash << 5) - hash + source.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash % 99 + 1);
    return String(hex).padStart(2, '0');
  }

  /**
   * Format date as YYYYMMDD string
   */
  public formatDateKey(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  /**
   * Formats receipt number string
   * Default: 'CR-01-20260919-000001'
   * Partitioned 6-digit: 'CR-20260919-010001'
   * Compact: 'CR01-20260919-000001'
   */
  public formatReceiptNumber(
    regCode: string,
    dateKey: string,
    sequence: number,
    format: 'standard' | 'compact' | 'partitioned' = 'standard',
    prefix: string = 'CR'
  ): string {
    if (format === 'partitioned') {
      // Combines 2-digit register partition with 4-digit sequence (e.g. 010001 -> 6 digits)
      const seq4 = String(sequence % 10000).padStart(4, '0');
      return `${prefix}-${dateKey}-${regCode}${seq4}`;
    }

    const seq6 = String(sequence).padStart(6, '0');
    if (format === 'compact') {
      return `${prefix}${regCode}-${dateKey}-${seq6}`;
    }

    // Standard default format: CR-01-20260919-000001
    return `${prefix}-${regCode}-${dateKey}-${seq6}`;
  }

  /**
   * Extracts the numeric sequence from an existing receipt number if matching the date & register
   */
  public parseSequenceFromReceiptNumber(receiptNumber: string, regCode: string, dateKey: string): number | null {
    // Check standard format: CR-01-20260919-000001
    const stdRegex = new RegExp(`^CR-${regCode}-${dateKey}-(\\d+)$`);
    const stdMatch = receiptNumber.match(stdRegex);
    if (stdMatch) return parseInt(stdMatch[1], 10);

    // Check partitioned format: CR-20260919-010001
    const partRegex = new RegExp(`^CR-${dateKey}-${regCode}(\\d{4})$`);
    const partMatch = receiptNumber.match(partRegex);
    if (partMatch) return parseInt(partMatch[1], 10);

    // Check compact format: CR01-20260919-000001
    const compRegex = new RegExp(`^CR${regCode}-${dateKey}-(\\d+)$`);
    const compMatch = receiptNumber.match(compRegex);
    if (compMatch) return parseInt(compMatch[1], 10);

    return null;
  }

  /**
   * Obtains the next sequence number for a register and date, with high-water mark recovery
   */
  public async getNextSequence(
    database: PosDatabase,
    registerId: string,
    regCode: string,
    dateKey: string
  ): Promise<number> {
    const settingKey = `receipt_seq_${regCode}_${dateKey}`;

    // 1. Read existing counter from settings table
    const existingSetting = await database.settings.get(settingKey);
    let currentSeq = existingSetting ? parseInt(existingSetting.value, 10) : 0;
    if (isNaN(currentSeq)) currentSeq = 0;

    // 2. High-water mark recovery scan: inspect existing sales in IndexedDB
    // to protect against storage loss or out-of-order counter resets
    try {
      const recentSales = await database.sales
        .where('register_id')
        .equals(registerId)
        .toArray();

      let highestFound = 0;
      for (const sale of recentSales) {
        if (sale.receipt_number) {
          const parsed = this.parseSequenceFromReceiptNumber(sale.receipt_number, regCode, dateKey);
          if (parsed !== null && parsed > highestFound) {
            highestFound = parsed;
          }
        }
      }

      if (highestFound > currentSeq) {
        logger.warn(
          'ReceiptNumberService',
          `High-water mark adjusted: setting was ${currentSeq}, found highest sale sequence ${highestFound}`
        );
        currentSeq = highestFound;
      }
    } catch (err) {
      logger.debug('ReceiptNumberService', `High-water mark scan skipped: ${String(err)}`);
    }

    const nextSeq = currentSeq + 1;

    // 3. Persist new sequence
    await database.settings.put({
      key: settingKey,
      value: String(nextSeq),
    });

    return nextSeq;
  }

  /**
   * Generates a guaranteed offline-safe receipt number
   */
  public async generateReceiptNumber(
    database: PosDatabase = defaultDb,
    options: ReceiptNumberOptions = {}
  ): Promise<{ receiptNumber: string; sequence: number; regCode: string; dateKey: string }> {
    const registerId = options.registerId || 'reg-001-main';
    let regCode = options.registerCode;

    if (!regCode) {
      // Try to find register name from database
      const reg = await database.registers.get(registerId);
      regCode = this.getRegisterCode(registerId, reg?.register_name);
    }

    const date = options.date || new Date();
    const dateKey = this.formatDateKey(date);
    const format = options.format || 'standard';
    const prefix = options.prefix || 'CR';

    const sequence = await this.getNextSequence(database, registerId, regCode, dateKey);
    const receiptNumber = this.formatReceiptNumber(regCode, dateKey, sequence, format, prefix);

    return {
      receiptNumber,
      sequence,
      regCode,
      dateKey,
    };
  }

  /**
   * Synchronous helper for offline tests or quick mock generation
   */
  public generateOfflineReceiptNumberSync(
    options: ReceiptNumberOptions & { sequence?: number } = {}
  ): string {
    const regCode = options.registerCode || this.getRegisterCode(options.registerId || 'reg-001');
    const dateKey = this.formatDateKey(options.date || new Date());
    const seq = options.sequence !== undefined ? options.sequence : Math.floor(Math.random() * 90000) + 10000;
    const format = options.format || 'standard';
    const prefix = options.prefix || 'CR';

    return this.formatReceiptNumber(regCode, dateKey, seq, format, prefix);
  }
}

export const receiptNumberService = new ReceiptNumberService();
