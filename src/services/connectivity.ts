import { ConnectivityStatus } from '../types';

type Listener = (status: ConnectivityStatus) => void;

class ConnectivityService {
  private status: ConnectivityStatus = 'online';
  private listeners: Set<Listener> = new Set();
  private simulatedOffline: boolean = false;
  private checkIntervalId: any = null;
  private pingUrl: string = 'https://www.google.com/generate_204'; // or Supabase endpoint

  constructor() {
    this.status = navigator.onLine ? 'online' : 'offline';

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkEvent(true));
      window.addEventListener('offline', () => this.handleNetworkEvent(false));

      // Periodic real probe every 15s
      this.checkIntervalId = setInterval(() => this.probeConnection(), 15000);
    }
  }

  public getStatus(): ConnectivityStatus {
    if (this.simulatedOffline) return 'offline';
    return this.status;
  }

  public isOnline(): boolean {
    return this.getStatus() === 'online' || this.getStatus() === 'syncing';
  }

  public isSimulatedOffline(): boolean {
    return this.simulatedOffline;
  }

  /**
   * Allows the cashier / QA engineer to toggle offline mode directly in the POS UI
   * for stress testing and zero-connectivity simulation
   */
  public setSimulatedOffline(offline: boolean) {
    this.simulatedOffline = offline;
    this.notify(this.getStatus());
  }

  public setStatus(newStatus: ConnectivityStatus) {
    this.status = newStatus;
    this.notify(this.getStatus());
  }

  public setSyncing(syncing: boolean) {
    if (this.simulatedOffline) return;
    if (syncing) {
      this.status = 'syncing';
    } else {
      this.status = navigator.onLine ? 'online' : 'offline';
    }
    this.notify(this.status);
  }

  public setSyncError() {
    if (this.simulatedOffline) return;
    this.status = 'sync_error';
    this.notify(this.status);
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private handleNetworkEvent(isOnline: boolean) {
    if (this.simulatedOffline) return;

    if (!isOnline) {
      this.status = 'offline';
      this.notify(this.status);
    } else {
      this.status = 'reconnecting';
      this.notify(this.status);
      this.probeConnection();
    }
  }

  public async probeConnection(): Promise<boolean> {
    if (this.simulatedOffline) {
      return false;
    }

    if (!navigator.onLine) {
      this.status = 'offline';
      this.notify(this.status);
      return false;
    }

    try {
      // Use HEAD request to ping endpoint with short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      
      await fetch(this.pingUrl, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (this.status !== 'syncing' && this.status !== 'sync_error') {
        this.status = 'online';
        this.notify(this.status);
      }
      return true;
    } catch {
      this.status = 'offline';
      this.notify(this.status);
      return false;
    }
  }

  private notify(status: ConnectivityStatus) {
    this.listeners.forEach(fn => fn(status));
  }

  public destroy() {
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
  }
}

export const connectivityService = new ConnectivityService();
