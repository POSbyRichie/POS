import { Table, UpdateSpec } from 'dexie';

export abstract class BaseRepository<T, Key> {
  constructor(protected readonly table: Table<T, Key>) {}

  async get(key: Key): Promise<T | undefined> {
    return this.table.get(key);
  }

  async getAll(): Promise<T[]> {
    return this.table.toArray();
  }

  async put(item: T): Promise<Key> {
    return this.table.put(item);
  }

  async bulkPut(items: readonly T[]): Promise<Key> {
    return this.table.bulkPut(items);
  }

  async add(item: T): Promise<Key> {
    return this.table.add(item);
  }

  async update(key: Key, changes: UpdateSpec<T>): Promise<number> {
    return this.table.update(key, changes);
  }

  async delete(key: Key): Promise<void> {
    await this.table.delete(key);
  }

  async count(): Promise<number> {
    return this.table.count();
  }

  async clear(): Promise<void> {
    await this.table.clear();
  }

  getTable(): Table<T, Key> {
    return this.table;
  }
}
