import { logger } from '../utils/logger';

let deferredPrompt: any = null;

export function initPwa() {
  if (typeof window === 'undefined') return;

  // Capture PWA install prompt
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e;
    logger.info('PWA', 'Install prompt captured and ready');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    logger.info('PWA', 'Application successfully installed to home screen / desktop');
  });
}

export function canInstallPwa(): boolean {
  return deferredPrompt !== null;
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    logger.debug('PWA', 'Prompt requested but no deferred prompt available');
    return false;
  }

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  logger.info('PWA', `User install choice: ${choice.outcome}`);
  deferredPrompt = null;
  return choice.outcome === 'accepted';
}
