import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Mock WebCrypto if needed in test environment
if (typeof crypto === 'undefined' || !crypto.subtle) {
  const { webcrypto } = require('crypto');
  (global as any).crypto = webcrypto;
}
