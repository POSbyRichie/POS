import Dexie, { type Transaction } from 'dexie';
import { schemaV1 } from '../schemas/v1';
import { logger } from '../../utils/logger';

export interface MigrationStep {
  version: number;
  stores: Record<string, string>;
  upgrade?: (tx: Transaction) => Promise<void>;
}

export const migrations: MigrationStep[] = [
  {
    version: 1,
    stores: schemaV1,
    upgrade: async () => {
      logger.info('Database', 'Database initialized with Schema v1');
    },
  },
];

/**
 * Apply all version declarations and upgrade hooks to a Dexie database instance
 */
export function applyMigrations(db: Dexie): void {
  for (const step of migrations) {
    const v = db.version(step.version).stores(step.stores);
    if (step.upgrade) {
      v.upgrade(step.upgrade);
    }
  }
}
