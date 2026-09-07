import {
  CanActivateFn,
  Router,
} from '@angular/router';
import { inject } from '@angular/core';

import {
  hasRouteAccess,
  isDoctorRole,
  readStoredPermissions,
  readStoredRole,
  resolveDefaultRoute,
} from './access-control';
import type { AccessRequirement } from './access-control';
import {
  isHospitalScopedUser,
} from './hospital-scope';
import {
  isCurrentLaboratoryEdition,
  isLaboratoryEditionRouteAllowed,
} from './product-edition';
import { isHospitalModuleRouteAllowed, isHospitalSetupModuleAllowed } from './hospital-modules';

export const roleGuard = (accessRequirement: AccessRequirement): CanActivateFn => {
  return (_route, state) => {
    const permissions = readStoredPermissions();
    const router = inject(Router);
    const currentPath = state.url.split('?')[0];

    if (
      isCurrentLaboratoryEdition() &&
      !isLaboratoryEditionRouteAllowed(currentPath)
    ) {
      return router.parseUrl(resolveDefaultRoute(permissions));
    }

    if (!isHospitalModuleRouteAllowed(currentPath)) {
      return router.parseUrl(resolveDefaultRoute(permissions));
    }

    if (hasRouteAccess(accessRequirement, permissions)) {
      return true;
    }

    const fallbackRoute = resolveDefaultRoute(permissions);

    if (fallbackRoute !== currentPath) {
      return router.parseUrl(fallbackRoute);
    }

    return router.parseUrl('/login/access');
  };
};

export const doctorRoleGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const permissions = readStoredPermissions();
  const currentPath = state.url.split('?')[0];

  if (isDoctorRole(readStoredRole())) {
    return true;
  }

  const fallbackRoute = resolveDefaultRoute(permissions);
  if (fallbackRoute && fallbackRoute !== currentPath) {
    return router.parseUrl(fallbackRoute);
  }

  return router.parseUrl('/login/access');
};

export const doctorOrPermissionGuard = (accessRequirement: AccessRequirement): CanActivateFn => {
  const permissionGuard = roleGuard(accessRequirement);
  return (route, state) => {
    if (isDoctorRole(readStoredRole())) {
      return true;
    }
    return permissionGuard(route, state);
  };
};

/** Normal hospital users are redirected away from multi-hospital admin screens. */
export const hospitalPlatformListGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const permissions = readStoredPermissions();
  const currentPath = state.url.split('?')[0];

  if (isHospitalScopedUser()) {
    const canSetup =
      isHospitalSetupModuleAllowed() &&
      hasRouteAccess(
        { any: ['departments.create', 'departments.update', 'hospitals.update', '*'] },
        permissions
      );
    const target = canSetup ? '/hospital-setup' : resolveDefaultRoute(permissions);
    if (target !== currentPath) {
      return router.parseUrl(target);
    }
    return router.parseUrl(resolveDefaultRoute(permissions) || '/settings');
  }

  return roleGuard(['hospitals.read'])(_route, state);
};

export const hospitalPlatformManageGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const permissions = readStoredPermissions();

  if (isHospitalScopedUser()) {
    if (isHospitalSetupModuleAllowed()) {
      return router.parseUrl('/hospital-setup');
    }
    return router.parseUrl(resolveDefaultRoute(permissions) || '/settings');
  }

  return roleGuard(['hospitals.create', 'hospitals.update'])(_route, state);
};
