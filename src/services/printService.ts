import { Receipt, StoreInfo } from '../types';
import { formatMoney } from '../utils/money';

export interface ThermalReceiptOptions {
  isReprint?: boolean;
  reprintCount?: number;
  reprintedAt?: string;
  reprintedBy?: string;
  width?: 32 | 48; // 32 for 58mm paper, 48 for 80mm paper
}

export class PrintService {
  /**
   * Triggers native browser print dialog targeting the thermal receipt stylesheet
   */
  public printReceipt(elementId: string = 'printable-receipt'): void {
    if (typeof window !== 'undefined') {
      const el = document.getElementById(elementId);
      if (el) {
        // Tag body with printing class to isolate receipt in print media
        document.body.classList.add('pos-printing-receipt');
        window.print();
        setTimeout(() => {
          document.body.classList.remove('pos-printing-receipt');
        }, 1000);
      } else {
        window.print();
      }
    }
  }

  /**
   * Formats receipt data into ESC/POS compatible fixed-width thermal string
   * Default width 48 columns (80mm) or 32 columns (58mm)
   */
  public generateRawThermalReceipt(
    receipt: Receipt,
    store: StoreInfo,
    options: ThermalReceiptOptions = {}
  ): string {
    const data = JSON.parse(receipt.content_json);
    const sale = data.sale;
    const items = data.items || [];
    const payments = data.payments || [];
    const width = options.width || 48;

    const center = (text: string) => {
      const pad = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(pad) + text;
    };

    const row = (left: string, right: string) => {
      const space = Math.max(1, width - left.length - right.length);
      return left + ' '.repeat(space) + right;
    };

    const divider = '='.repeat(width);
    const dashDivider = '-'.repeat(width);

    const lines: string[] = [];

    // Duplicate / Reprint Banner
    const isReprint = options.isReprint || receipt.is_reprint || (receipt.reprint_count && receipt.reprint_count > 0);
    if (isReprint) {
      lines.push(divider);
      lines.push(center('*** DUPLICATE / REPRINT ***'));
      const count = options.reprintCount || receipt.reprint_count || 1;
      lines.push(center(`REPRINT #${count}`));
      if (options.reprintedAt || receipt.reprinted_at) {
        const timeStr = new Date(options.reprintedAt || receipt.reprinted_at!).toLocaleString();
        lines.push(center(`REPRINTED: ${timeStr}`));
      }
      if (options.reprintedBy) {
        lines.push(center(`BY: ${options.reprintedBy}`));
      }
      lines.push(divider);
    }

    lines.push(center(store.name.toUpperCase()));
    lines.push(center(store.tagline));
    lines.push(center(store.address));
    lines.push(center(`TEL: ${store.phone}`));
    lines.push(center(`TAX ID: ${store.tax_id}`));
    lines.push(divider);
    lines.push(row(`RECEIPT: ${sale.receipt_number}`, ''));
    lines.push(row(`DATE: ${new Date(sale.created_at).toLocaleString()}`, ''));
    lines.push(row(`CASHIER ID: ${sale.cashier_id.slice(0, 8)}`, `REG: ${sale.register_id}`));
    if (data.customer) {
      lines.push(row(`CUSTOMER: ${data.customer.name}`, `PTS: ${data.customer.loyalty_points || 0}`));
    }
    lines.push(dashDivider);
    lines.push(row('ITEM', 'TOTAL'));
    lines.push(dashDivider);

    for (const it of items) {
      lines.push(it.product_name);
      const detail = `  ${it.quantity} x ${formatMoney(it.unit_price, store)}`;
      const total = formatMoney(it.total_price, store);
      lines.push(row(detail, total));
    }

    lines.push(dashDivider);
    lines.push(row('SUBTOTAL:', formatMoney(sale.subtotal, store)));
    if (sale.discount_amount > 0) {
      lines.push(row('DISCOUNT:', `-${formatMoney(sale.discount_amount, store)}`));
    }
    lines.push(row('TAX (VAT):', formatMoney(sale.tax_amount, store)));
    lines.push(divider);
    lines.push(row('TOTAL DUE:', formatMoney(sale.total_amount, store)));
    lines.push(divider);

    for (const p of payments) {
      lines.push(row(`PAID (${p.method.toUpperCase()}):`, formatMoney(p.amount_paid, store)));
    }
    if (sale.change_amount > 0) {
      lines.push(row('CHANGE GIVEN:', formatMoney(sale.change_amount, store)));
    }

    lines.push(divider);
    lines.push(center('THANK YOU FOR YOUR BUSINESS!'));
    lines.push(center('PLEASE RETAIN YOUR RECEIPT'));
    if (isReprint) {
      lines.push(center('COPY VERIFIED BY SYSTEM AUDIT'));
    }
    lines.push('\n\n\n');

    return lines.join('\n');
  }

  /**
   * Generates standard binary ESC/POS buffer for direct thermal printer hardware (USB, Serial, Bluetooth)
   */
  public generateEscPosBytes(receipt: Receipt, store: StoreInfo, options: ThermalReceiptOptions = {}): Uint8Array {
    const text = this.generateRawThermalReceipt(receipt, store, options);
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text);

    // ESC/POS Commands:
    // ESC @ (Initialize printer): 0x1B, 0x40
    // GS V 66 0 (Cut paper): 0x1D, 0x56, 0x42, 0x00
    const initCmd = new Uint8Array([0x1b, 0x40]);
    const cutCmd = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);

    const combined = new Uint8Array(initCmd.length + textBytes.length + cutCmd.length);
    combined.set(initCmd, 0);
    combined.set(textBytes, initCmd.length);
    combined.set(cutCmd, initCmd.length + textBytes.length);

    return combined;
  }
}

export const printService = new PrintService();
