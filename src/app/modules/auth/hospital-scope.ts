import { hasRouteAccess, readStoredPermissions } from './access-control';
import type { AccessRequirement } from './access-control';

/** Active hospital from authenticated session (single-hospital user context). */
export function readStoredHospitalId(): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as {
      hospitalId?: string | null;
      hospital?: { _id?: string | null } | null;
    } | null;
    return String(user?.hospitalId || user?.hospital?._id || '').trim();
  } catch {
    return '';
  }
}

/** User operates within one assigned hospital (normal HMS staff / owner). */
export function isHospitalScopedUser(): boolean {
  return Boolean(readStoredHospitalId());
}

/** Platform-level multi-hospital list (no assigned hospitalId). */
export function canAccessPlatformHospitalList(): boolean {
  const permissions = readStoredPermissions();
  if (isHospitalScopedUser()) {
    return false;
  }
  return hasRouteAccess(['hospitals.read'], permissions) || permissions.includes('*');
}

export const HOSPITAL_SETUP_ACCESS: AccessRequirement = {
  any: [
    'departments.create',
    'departments.update',
    'ward.create',
    'ward.update',
    'hospitals.update',
    'treatment_catalog.read',
    'treatment_catalog.create',
    'treatment_catalog.update',
    '*',
  ],
};

export function canAccessHospitalSetup(): boolean {
  return hasRouteAccess(HOSPITAL_SETUP_ACCESS, readStoredPermissions());
}
