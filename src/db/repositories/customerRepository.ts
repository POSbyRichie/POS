import { PosDatabase } from '../database';
import { BaseRepository } from './baseRepository';
import { Customer } from '../../types';
import { generateUUID } from '../../utils/id';

export class CustomerRepository extends BaseRepository<Customer, string> {
  constructor(private readonly db: PosDatabase) {
    super(db.customers);
  }

  async search(query: string): Promise<Customer[]> {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll();

    return this.db.customers
      .filter(c => {
        return (
          c.name.toLowerCase().includes(q) ||
          Boolean(c.phone && c.phone.includes(q)) ||
          Boolean(c.loyalty_number && c.loyalty_number.toLowerCase().includes(q))
        );
      })
      .toArray();
  }

  async getByPhone(phone: string): Promise<Customer | undefined> {
    return this.db.customers.where('phone').equals(phone).first();
  }

  async getByLoyaltyNumber(loyaltyNumber: string): Promise<Customer | undefined> {
    return this.db.customers.where('loyalty_number').equals(loyaltyNumber).first();
  }

  async createCustomer(data: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Promise<Customer> {
    const now = new Date().toISOString();
    const customer: Customer = {
      ...data,
      id: generateUUID(),
      created_at: now,
      updated_at: now,
    };

    await this.db.transaction('rw', [this.db.customers, this.db.syncQueue], async () => {
      await this.db.customers.put(customer);

      await this.db.syncQueue.add({
        entity_type: 'customer',
        entity_id: customer.id,
        operation: 'INSERT',
        payload: JSON.stringify(customer),
        idempotency_key: `cust-${customer.id}`,
        attempts: 0,
        max_attempts: 10,
        status: 'pending',
        created_at: now,
      });
    });

    return customer;
  }

  async updatePoints(customerId: string, pointsDelta: number): Promise<number> {
    const customer = await this.get(customerId);
    if (!customer) throw new Error('Customer not found');

    const newPoints = Math.max(0, (customer.loyalty_points || 0) + pointsDelta);
    await this.update(customerId, {
      loyalty_points: newPoints,
      updated_at: new Date().toISOString(),
    });

    return newPoints;
  }
}
