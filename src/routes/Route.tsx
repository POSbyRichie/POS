import { ReactNode } from 'react';
import { RoutePath, useRouter } from './router';

export interface RouteProps {
  path: RoutePath;
  children: ReactNode;
}

export function Route({ path, children }: RouteProps) {
  const { currentPath } = useRouter();
  if (currentPath === path || (path === '/' && currentPath === '/dashboard')) {
    return <>{children}</>;
  }
  return null;
}
