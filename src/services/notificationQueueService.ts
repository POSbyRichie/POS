import { PosDatabase, db as defaultDb } from '../db/database';
import { EmailQueueItem, SmsQueueItem, NotificationQueueStatus } from '../types';
import { generateUUID } from '../utils/id';
import { logger } from '../utils/logger';

export class NotificationQueueService {
  /**
   * Enqueue an email digital receipt for offline-first dispatch
   */
  public async queueEmail(
    params: {
      receiptId: string;
      saleId: string;
      receiptNumber: string;
      recipientEmail: string;
      customerName?: string;
      subject?: string;
      htmlBody?: string;
    },
    database: PosDatabase = defaultDb
  ): Promise<EmailQueueItem> {
    const now = new Date().toISOString();
    const item: EmailQueueItem = {
      id: generateUUID(),
      receipt_id: params.receiptId,
      sale_id: params.saleId,
      receipt_number: params.receiptNumber,
      recipient_email: params.recipientEmail.trim().toLowerCase(),
      customer_name: params.customerName,
      subject: params.subject || `Your Receipt from Antigravity POS (${params.receiptNumber})`,
      html_body: params.htmlBody || `<p>Thank you for your purchase! Receipt: <strong>${params.receiptNumber}</strong></p>`,
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      created_at: now,
    };

    await database.emailQueue.put(item);
    logger.info('NotificationQueue', `Email queued for ${item.recipient_email} (Receipt: ${item.receipt_number})`);
    return item;
  }

  /**
   * Enqueue an SMS digital receipt for offline-first dispatch
   */
  public async queueSms(
    params: {
      receiptId: string;
      saleId: string;
      receiptNumber: string;
      phoneNumber: string;
      customerName?: string;
      messageText?: string;
    },
    database: PosDatabase = defaultDb
  ): Promise<SmsQueueItem> {
    const now = new Date().toISOString();
    const item: SmsQueueItem = {
      id: generateUUID(),
      receipt_id: params.receiptId,
      sale_id: params.saleId,
      receipt_number: params.receiptNumber,
      phone_number: params.phoneNumber.trim(),
      customer_name: params.customerName,
      message_text:
        params.messageText ||
        `Antigravity POS: Receipt ${params.receiptNumber} issued. Thank you for your purchase!`,
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      created_at: now,
    };

    await database.smsQueue.put(item);
    logger.info('NotificationQueue', `SMS queued for ${item.phone_number} (Receipt: ${item.receipt_number})`);
    return item;
  }

  /**
   * List email queue entries optionally filtered by status
   */
  public async getEmailQueue(
    status?: NotificationQueueStatus,
    database: PosDatabase = defaultDb
  ): Promise<EmailQueueItem[]> {
    if (status) {
      return database.emailQueue.where('status').equals(status).toArray();
    }
    return database.emailQueue.orderBy('created_at').reverse().toArray();
  }

  /**
   * List SMS queue entries optionally filtered by status
   */
  public async getSmsQueue(
    status?: NotificationQueueStatus,
    database: PosDatabase = defaultDb
  ): Promise<SmsQueueItem[]> {
    if (status) {
      return database.smsQueue.where('status').equals(status).toArray();
    }
    return database.smsQueue.orderBy('created_at').reverse().toArray();
  }

  /**
   * Process all queued emails and SMS messages
   */
  public async processQueues(
    database: PosDatabase = defaultDb
  ): Promise<{
    emailProcessed: number;
    emailFailed: number;
    smsProcessed: number;
    smsFailed: number;
  }> {
    const queuedEmails = await database.emailQueue.where('status').equals('queued').toArray();
    const queuedSms = await database.smsQueue.where('status').equals('queued').toArray();

    let emailProcessed = 0;
    let emailFailed = 0;
    let smsProcessed = 0;
    let smsFailed = 0;

    const now = new Date().toISOString();

    // Process Emails
    for (const item of queuedEmails) {
      try {
        await database.emailQueue.update(item.id, {
          status: 'processing',
          attempts: item.attempts + 1,
          last_attempt_at: now,
        });

        // Simulate network dispatch (or integrate with transactional email provider)
        if (!item.recipient_email.includes('@')) {
          throw new Error('Invalid email address syntax');
        }

        await database.emailQueue.update(item.id, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: undefined,
        });
        emailProcessed++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const newAttempts = item.attempts + 1;
        await database.emailQueue.update(item.id, {
          status: newAttempts >= item.max_attempts ? 'failed' : 'queued',
          attempts: newAttempts,
          error_message: errorMsg,
        });
        emailFailed++;
      }
    }

    // Process SMS
    for (const item of queuedSms) {
      try {
        await database.smsQueue.update(item.id, {
          status: 'processing',
          attempts: item.attempts + 1,
          last_attempt_at: now,
        });

        // Validate phone number
        const digits = item.phone_number.replace(/\D/g, '');
        if (digits.length < 9) {
          throw new Error('Invalid phone number: too short');
        }

        await database.smsQueue.update(item.id, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: undefined,
        });
        smsProcessed++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const newAttempts = item.attempts + 1;
        await database.smsQueue.update(item.id, {
          status: newAttempts >= item.max_attempts ? 'failed' : 'queued',
          attempts: newAttempts,
          error_message: errorMsg,
        });
        smsFailed++;
      }
    }

    logger.info(
      'NotificationQueue',
      `Queues processed: Emails (sent: ${emailProcessed}, failed: ${emailFailed}), SMS (sent: ${smsProcessed}, failed: ${smsFailed})`
    );

    return { emailProcessed, emailFailed, smsProcessed, smsFailed };
  }

  /**
   * Retry a failed queue item
   */
  public async retryQueueItem(
    type: 'email' | 'sms',
    itemId: string,
    database: PosDatabase = defaultDb
  ): Promise<void> {
    if (type === 'email') {
      await database.emailQueue.update(itemId, {
        status: 'queued',
        error_message: undefined,
      });
    } else {
      await database.smsQueue.update(itemId, {
        status: 'queued',
        error_message: undefined,
      });
    }
  }

  /**
   * Delete sent items to clean up storage
   */
  public async clearSentItems(database: PosDatabase = defaultDb): Promise<void> {
    const sentEmails = await database.emailQueue.where('status').equals('sent').toArray();
    const sentSms = await database.smsQueue.where('status').equals('sent').toArray();

    await database.emailQueue.bulkDelete(sentEmails.map(e => e.id));
    await database.smsQueue.bulkDelete(sentSms.map(s => s.id));
  }

  /**
   * Get queue counts summary
   */
  public async getQueueStats(
    database: PosDatabase = defaultDb
  ): Promise<{
    pendingEmails: number;
    sentEmails: number;
    failedEmails: number;
    pendingSms: number;
    sentSms: number;
    failedSms: number;
  }> {
    const allEmails = await database.emailQueue.toArray();
    const allSms = await database.smsQueue.toArray();

    return {
      pendingEmails: allEmails.filter(e => e.status === 'queued' || e.status === 'processing').length,
      sentEmails: allEmails.filter(e => e.status === 'sent').length,
      failedEmails: allEmails.filter(e => e.status === 'failed').length,
      pendingSms: allSms.filter(s => s.status === 'queued' || s.status === 'processing').length,
      sentSms: allSms.filter(s => s.status === 'sent').length,
      failedSms: allSms.filter(s => s.status === 'failed').length,
    };
  }
}

export const notificationQueueService = new NotificationQueueService();
