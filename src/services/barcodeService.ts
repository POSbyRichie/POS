import { useEffect } from 'react';

export interface BarcodeListenerOptions {
  onScan: (barcode: string) => void;
  maxIntervalMs?: number;
  minLength?: number;
}

/**
 * Global barcode listener for hardware USB/Bluetooth barcode scanners
 * Scanners input characters in rapid bursts followed by 'Enter'
 */
export function useBarcodeScanner({
  onScan,
  maxIntervalMs = 60,
  minLength = 3,
}: BarcodeListenerOptions) {
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const target = event.target as HTMLElement;

      // If user is focused on a standard text input/textarea that is NOT a designated barcode search box,
      // allow normal typing unless it is an ultra-fast scan
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const isDesignatedBarcodeInput = target && target.getAttribute('data-barcode-input') === 'true';

      if (event.key === 'Enter') {
        if (buffer.length >= minLength) {
          event.preventDefault();
          onScan(buffer.trim());
        }
        buffer = '';
        return;
      }

      // Ignore single modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(event.key)) {
        return;
      }

      // If too much time has elapsed between keys, reset buffer (user is human typing)
      if (lastKeyTime > 0 && now - lastKeyTime > maxIntervalMs) {
        if (!isDesignatedBarcodeInput && isInput) {
          buffer = '';
          lastKeyTime = 0;
          return;
        }
        buffer = '';
      }

      if (event.key.length === 1) {
        buffer += event.key;
        lastKeyTime = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, maxIntervalMs, minLength]);
}
