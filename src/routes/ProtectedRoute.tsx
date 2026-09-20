import { ReactNode } from 'react';
import { RoutePath, useRouter } from './router';
import { UserRole } from '../types';
import { usePos } from '../store/posStore';
import { isRouteAllowed } from '../utils/rbac';
import { AccessDeniedView } from '../components/common/AccessDeniedView';

export interface ProtectedRouteProps {
  path: RoutePath;
  allowedRoles?: UserRole[];
  children: ReactNode;
}

/**
 * Route wrapper that verifies whether the active authenticated user role
 * has permission to view the given route. If unauthorized, displays the AccessDeniedView.
 */
export function ProtectedRoute({ path, allowedRoles, children }: ProtectedRouteProps) {
  const { currentPath } = useRouter();
  const { currentUser } = usePos();

  const isCurrent = currentPath === path || (path === '/' && currentPath === '/dashboard');
  if (!isCurrent) {
    return null;
  }

  const role = currentUser?.role;
  const isAuthorized = allowedRoles
    ? (role ? allowedRoles.includes(role) : false)
    : isRouteAllowed(role, path);

  if (!isAuthorized) {
    return <AccessDeniedView path={path} userRole={role} />;
  }

  return <>{children}</>;
}
