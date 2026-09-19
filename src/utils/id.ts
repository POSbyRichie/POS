/**
 * UUID generator compliant with RFC4122
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback if randomUUID is not available
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate human-readable invoice / receipt numbers
 * Format: CR-01-YYYYMMDD-000001
 */
export function generateReceiptNumber(sequence: number = Math.floor(Math.random() * 90000) + 10000, registerCode: string = '01'): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seqStr = String(sequence).padStart(6, '0');
  return `CR-${registerCode}-${dateStr}-${seqStr}`;
}

/**
 * Generate cryptographic salt for PIN hashing
 */
export function generateSalt(length: number = 16): string {
  const array = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) array[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a user PIN with salt using SHA-256 (WebCrypto API)
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${pin}:antigravity-pos-secure-seed`);
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback simple hash for environments without WebCrypto subtle
  let hash = 0;
  const str = `${salt}:${pin}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Verify a PIN against a salted hash
 */
export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const calculated = await hashPin(pin, salt);
  return calculated === expectedHash;
}
