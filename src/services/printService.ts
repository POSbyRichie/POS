import { Receipt, StoreInfo } from '../types';
import { formatMoney } from '../utils/money';

export class PrintService {
  /**
   * Triggers native browser print dialog targeting the thermal receipt stylesheet
   */
  public printReceipt(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  /**
   * Formats receipt data into ESC/POS compatible fixed-width thermal string (48 columns)
   * Suitable for serial, Bluetooth, and raw thermal network printers
   */
  public generateRawThermalReceipt(receipt: Receipt, store: StoreInfo): string {
    const data = JSON.parse(receipt.content_json);
    const sale = data.sale;
    const items = data.items || [];
    const payments = data.payments || [];
    const width = 48;

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

    let lines: string[] = [];
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
    lines.push('\n\n\n');

    return lines.join('\n');
  }
}

export const printService = new PrintService();
