import { describe, it, expect, beforeEach } from 'vitest';
import { logger } from '../utils/logger';
import { router } from '../routes/router';
import { loadEnv } from '../config/env';
import { testSupabaseConnection } from '../services/supabase';

describe('Phase 1 Foundational Architecture', () => {
  beforeEach(() => {
    logger.clearLogs();
  });

  it('provides structured logging across all log levels with JSON export', () => {
    logger.info('TestContext', 'Informational event', { user: 'cashier1' });
    logger.warn('TestContext', 'Warning event');
    logger.error('TestContext', 'Error event', new Error('Simulated failure'));

    const logs = logger.getRecentLogs();
    expect(logs.length).toBe(3);
    expect(logs[0].level).toBe('INFO');
    expect(logs[1].level).toBe('WARN');
    expect(logs[2].level).toBe('ERROR');

    const jsonExport = logger.exportLogsAsJson();
    expect(jsonExport).toContain('Informational event');
    expect(jsonExport).toContain('Warning event');
    expect(jsonExport).toContain('Simulated failure');
  });

  it('manages typed client routing and reactive route subscriptions', () => {
    let observedPath = '';
    const unsubscribe = router.subscribe(path => {
      observedPath = path;
    });

    router.navigate('/pos');
    expect(router.getPath()).toBe('/pos');
    expect(observedPath).toBe('/pos');

    router.navigate('/settings');
    expect(router.getPath()).toBe('/settings');
    expect(observedPath).toBe('/settings');

    unsubscribe();
  });

  it('loads typed environment variables with safe offline defaults', () => {
    const config = loadEnv();
    expect(config).toBeDefined();
    expect(config.appTitle).toBeDefined();
    expect(typeof config.isSupabaseConfigured).toBe('boolean');
  });

  it('handles unconfigured Supabase gracefully in local-first offline mode', async () => {
    const probe = await testSupabaseConnection();
    expect(probe).toBeDefined();
    expect(probe.ok).toBe(false);
    expect(probe.message).toContain('offline');
  });
});
