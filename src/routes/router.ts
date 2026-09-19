import { useState, useEffect } from 'react';

export type RoutePath = '/' | '/dashboard' | '/pos' | '/inventory' | '/reports' | '/settings';

class RouterService {
  private currentPath: RoutePath = '/';
  private listeners: Set<(path: RoutePath) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      const initial = this.getPathFromHash();
      this.currentPath = initial;

      window.addEventListener('hashchange', () => {
        const next = this.getPathFromHash();
        this.currentPath = next;
        this.notify();
      });
    }
  }

  private getPathFromHash(): RoutePath {
    const hash = window.location.hash.replace('#', '') || '/';
    if (['/', '/dashboard', '/pos', '/inventory', '/reports', '/settings'].includes(hash)) {
      return hash as RoutePath;
    }
    return '/';
  }

  public getPath(): RoutePath {
    return this.currentPath;
  }

  public navigate(path: RoutePath) {
    if (this.currentPath === path) return;
    this.currentPath = path;
    if (typeof window !== 'undefined') {
      window.location.hash = path;
    }
    this.notify();
  }

  public subscribe(listener: (path: RoutePath) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentPath);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn(this.currentPath));
  }
}

export const router = new RouterService();

export function useRouter() {
  const [currentPath, setCurrentPath] = useState<RoutePath>(router.getPath());

  useEffect(() => {
    return router.subscribe(path => setCurrentPath(path));
  }, []);

  return {
    currentPath,
    navigate: (path: RoutePath) => router.navigate(path),
  };
}

export { Route } from './Route';
export type { RouteProps } from './Route';
