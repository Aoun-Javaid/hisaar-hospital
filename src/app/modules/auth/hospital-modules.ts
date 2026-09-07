import { isLaboratoryPlan, readStoredProductEdition, resolveProductEdition } from './product-edition';

export type HospitalModuleKey = 'pharmacy' | 'laboratory' | 'ward' | 'clinical';

export type HospitalEnabledModules = Record<HospitalModuleKey, boolean>;

export const DEFAULT_HOSPITAL_MODULES: HospitalEnabledModules = {
  pharmacy: true,
  laboratory: true,
  ward: true,
  clinical: true,
};

const PHARMACY_ROUTE_PREFIXES = ['/pharmacy', '/pos-reports'];
const LABORATORY_ROUTE_PREFIXES = ['/laboratory'];
const WARD_ROUTE_PREFIXES = ['/ward', '/room-allotment', '/ward-admin'];
const HOSPITAL_SETUP_ROUTE_PREFIXES = ['/hospital-setup'];
const HOSPITAL_PATIENT_ROUTE_PREFIXES = ['/patients'];
const HOSPITAL_BILLING_ROUTE_PREFIXES = ['/payments'];
const CLINICAL_ROUTE_PREFIXES = [
  '/doctor-dashboard',
  '/doctors',
  '/all-doctors',
  '/add-doctors',
  '/doctors-profile',
  '/doctors-schedule',
  '/doctorschedule',
  '/appointments',
  '/prescriptions',
  '/clinical-records',
  '/departments',
  '/dashboard',
];

const PHARMACY_API_PREFIXES = [
  '/products',
  '/customers',
  '/suppliers',
  '/categories',
  '/inventory',
  '/stock-movements',
  '/sales',
  '/returns',
  '/purchases',
  '/transfers',
  '/register-sessions',
  '/reports',
  '/expenses',
  '/payments',
];

const WARD_API_PREFIXES = ['/ward', '/rooms', '/room-allotments', '/hospital-wards'];

const CLINICAL_API_PREFIXES = [
  '/doctors',
  '/appointments',
  '/prescriptions',
  '/departments',
  '/patient-history',
  '/hospital-dashboard',
];

export const normalizeHospitalModules = (
  value?: Partial<HospitalEnabledModules> | null,
  editionSource?: { subscriptionPlan?: string | null; productEdition?: string | null } | null
): HospitalEnabledModules => {
  const edition =
    editionSource?.productEdition ||
    resolveProductEdition({
      subscriptionPlan: editionSource?.subscriptionPlan,
      productEdition: editionSource?.productEdition,
    });

  const defaults =
    edition === 'laboratory'
      ? { pharmacy: false, laboratory: true, ward: false, clinical: false }
      : { ...DEFAULT_HOSPITAL_MODULES };

  return {
    pharmacy: value?.pharmacy ?? defaults.pharmacy,
    laboratory: value?.laboratory ?? defaults.laboratory,
    ward: value?.ward ?? defaults.ward,
    clinical: value?.clinical ?? defaults.clinical,
  };
};

export const readStoredHospitalModuleEnforcement = (): boolean => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as {
      hospital?: { modulesEnforced?: boolean | null } | null;
    } | null;

    return Boolean(user?.hospital?.modulesEnforced);
  } catch {
    return false;
  }
};

export const readStoredHospitalModules = (): HospitalEnabledModules => {
  if (!readStoredHospitalModuleEnforcement()) {
    return { ...DEFAULT_HOSPITAL_MODULES };
  }

  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as {
      subscriptionPlan?: string | null;
      productEdition?: string | null;
      hospital?: {
        subscriptionPlan?: string | null;
        productEdition?: string | null;
        enabledModules?: Partial<HospitalEnabledModules> | null;
        modulesEnforced?: boolean | null;
      } | null;
    } | null;

    if (!user) {
      return { ...DEFAULT_HOSPITAL_MODULES };
    }

    return normalizeHospitalModules(user.hospital?.enabledModules, {
      subscriptionPlan: user.hospital?.subscriptionPlan || user.subscriptionPlan,
      productEdition: user.hospital?.productEdition || user.productEdition || readStoredProductEdition(),
    });
  } catch {
    return { ...DEFAULT_HOSPITAL_MODULES };
  }
};

export const isPharmacyModuleEnabled = (): boolean => readStoredHospitalModules().pharmacy;
export const isLaboratoryModuleEnabled = (): boolean => readStoredHospitalModules().laboratory;
export const isWardModuleEnabled = (): boolean => readStoredHospitalModules().ward;
export const isClinicalModuleEnabled = (): boolean => readStoredHospitalModules().clinical;

/** Departments / wards / rooms / birth-cert config — not for pharmacy-only or lab-only. */
export const isHospitalSetupModuleAllowed = (): boolean => {
  const modules = readStoredHospitalModules();
  return Boolean(modules.clinical || modules.ward);
};

/**
 * Hospital Patients + patient billing menus.
 * Lab needs patients; OPD/ward need patients; pure pharmacy uses Pharmacy Customers instead.
 */
export const isHospitalPatientsModuleAllowed = (): boolean => {
  const modules = readStoredHospitalModules();
  return Boolean(modules.clinical || modules.ward || modules.laboratory);
};

/** Ward Settlements / Ward Requests under Pharmacy — only when ward ops exist. */
export const isPharmacyWardIntegrationAllowed = (): boolean =>
  isPharmacyModuleEnabled() && isWardModuleEnabled();

const normalizeRoleKey = (value: string | null | undefined): string =>
  String(value || '')
    .trim()
    .replace(/[\s_-]/g, '')
    .toLowerCase();

const EXPLICIT_ROLE_MODULE_KEYS: Partial<Record<string, HospitalModuleKey>> = {
  pharmacy: 'pharmacy',
  pathologist: 'laboratory',
  laboratoryadmin: 'laboratory',
  laboratory: 'laboratory',
  labreceptionist: 'laboratory',
  labtechnician: 'laboratory',
  labadmin: 'laboratory',
  wardadmin: 'ward',
  wardreceptionist: 'ward',
  nurse: 'ward',
  doctor: 'clinical',
  receptionist: 'clinical',
};

export const resolveRoleModuleKey = (
  role: { code?: string | null; name?: string | null } | null | undefined,
): HospitalModuleKey | null => {
  if (!role) {
    return null;
  }

  const byCode = EXPLICIT_ROLE_MODULE_KEYS[normalizeRoleKey(role.code)];
  if (byCode) {
    return byCode;
  }

  const byName = EXPLICIT_ROLE_MODULE_KEYS[normalizeRoleKey(role.name)];
  if (byName) {
    return byName;
  }

  // Heuristic for custom role names (e.g. "Senior Ward Clerk", "Lab Desk")
  const key = normalizeRoleKey(role.name) || normalizeRoleKey(role.code);
  if (!key) {
    return null;
  }
  // Shared / admin roles stay unmapped → visible on every module scope
  if (
    key.includes('accountant') ||
    key.includes('hospitaladmin') ||
    key.includes('superadmin') ||
    key === 'owner'
  ) {
    return null;
  }
  if (key.includes('ward') || key.includes('nurse') || key.includes('nursing')) {
    return 'ward';
  }
  if (key.includes('lab') || key.includes('patholog')) {
    return 'laboratory';
  }
  if (key.includes('pharmac') || key.includes('pos')) {
    return 'pharmacy';
  }
  if (key.includes('doctor') || key.includes('physician') || key.includes('opd')) {
    return 'clinical';
  }

  return null;
};

export const isRoleAllowedByHospitalModules = (
  role: { code?: string | null; name?: string | null },
  modules: HospitalEnabledModules = readStoredHospitalModules(),
  modulesEnforced = readStoredHospitalModuleEnforcement(),
): boolean => {
  if (!modulesEnforced) {
    return true;
  }

  const moduleKey = resolveRoleModuleKey(role);
  if (!moduleKey) {
    return true;
  }

  return Boolean(modules[moduleKey]);
};

/** Maps a permission string to a hospital module (null = shared / always allowed). */
export const resolvePermissionModuleKey = (permission: string): HospitalModuleKey | null => {
  const key = String(permission || '').trim().toLowerCase();
  if (!key || key === '*') {
    return null;
  }

  if (key.startsWith('lab_') || key.startsWith('lab.')) {
    return 'laboratory';
  }

  if (
    key.startsWith('ward.') ||
    key.startsWith('rooms.') ||
    key.startsWith('room_allotments.') ||
    key.startsWith('pharmacy.ward_')
  ) {
    return 'ward';
  }

  if (
    /^(products|categories|customers|suppliers|inventory|purchases|purchase_returns|sales|register_sessions|transfers|returns|stock_movements|reports|payments|expenses|stores|warehouses)\./.test(
      key
    )
  ) {
    return 'pharmacy';
  }

  if (
    /^(departments|doctors|appointments|prescriptions|patients_history|hospital_dashboard)\./.test(key)
  ) {
    return 'clinical';
  }

  return null;
};

export const filterPermissionsByHospitalModules = (
  permissions: string[] | null | undefined,
  modules: HospitalEnabledModules = readStoredHospitalModules(),
  modulesEnforced = readStoredHospitalModuleEnforcement(),
): string[] => {
  const list = Array.isArray(permissions) ? permissions.filter(Boolean) : [];
  if (!modulesEnforced) {
    return [...new Set(list)];
  }

  return [...new Set(list)].filter((permission) => {
    if (permission === '*') {
      return true;
    }
    const moduleKey = resolvePermissionModuleKey(permission);
    if (!moduleKey) {
      return true;
    }
    return Boolean(modules[moduleKey]);
  });
};

const pathMatchesPrefix = (path: string, prefixes: string[]): boolean =>
  prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const isRootDashboardPath = (path: string): boolean => path === '' || path === '/';

export const resolveBlockedModuleForRoute = (path: string): HospitalModuleKey | null => {
  if (!readStoredHospitalModuleEnforcement()) {
    return null;
  }

  const modules = readStoredHospitalModules();
  const normalized = String(path || '').split('?')[0] || '/';

  if (!modules.clinical && isRootDashboardPath(normalized)) {
    return 'clinical';
  }

  if (!modules.pharmacy && pathMatchesPrefix(normalized, PHARMACY_ROUTE_PREFIXES)) {
    return 'pharmacy';
  }

  if (!modules.laboratory && pathMatchesPrefix(normalized, LABORATORY_ROUTE_PREFIXES)) {
    return 'laboratory';
  }

  if (!modules.ward && pathMatchesPrefix(normalized, WARD_ROUTE_PREFIXES)) {
    return 'ward';
  }

  if (
    !modules.clinical &&
    !modules.ward &&
    pathMatchesPrefix(normalized, HOSPITAL_SETUP_ROUTE_PREFIXES)
  ) {
    return 'clinical';
  }

  if (
    !modules.clinical &&
    !modules.ward &&
    !modules.laboratory &&
    pathMatchesPrefix(normalized, HOSPITAL_PATIENT_ROUTE_PREFIXES)
  ) {
    return 'clinical';
  }

  if (
    !modules.clinical &&
    !modules.ward &&
    !modules.laboratory &&
    pathMatchesPrefix(normalized, HOSPITAL_BILLING_ROUTE_PREFIXES)
  ) {
    return 'clinical';
  }

  if (!modules.clinical && pathMatchesPrefix(normalized, CLINICAL_ROUTE_PREFIXES)) {
    return 'clinical';
  }

  return null;
};

export const resolveBlockedModuleForApiPath = (path: string): HospitalModuleKey | null => {
  if (!readStoredHospitalModuleEnforcement()) {
    return null;
  }

  const modules = readStoredHospitalModules();
  const normalized = String(path || '').split('?')[0] || '/';

  if (!modules.pharmacy && pathMatchesPrefix(normalized, PHARMACY_API_PREFIXES)) {
    return 'pharmacy';
  }

  if (!modules.laboratory && (normalized === '/laboratory' || normalized.startsWith('/laboratory/'))) {
    return 'laboratory';
  }

  if (!modules.ward && pathMatchesPrefix(normalized, WARD_API_PREFIXES)) {
    return 'ward';
  }

  if (!modules.clinical && pathMatchesPrefix(normalized, CLINICAL_API_PREFIXES)) {
    return 'clinical';
  }

  return null;
};

export const isHospitalModuleRouteAllowed = (path: string): boolean =>
  !resolveBlockedModuleForRoute(path);

const PHARMACY_ONLY_PLAN_ALIASES = new Set(['pharmacy-only', 'pharmacy_only', 'pharmacyonly']);

export const modulesForSubscriptionPlan = (plan: string): HospitalEnabledModules => {
  const key = normalizePlan(plan);

  if (isLaboratoryPlan(plan)) {
    return { pharmacy: false, laboratory: true, ward: false, clinical: false };
  }

  if (PHARMACY_ONLY_PLAN_ALIASES.has(key)) {
    return { pharmacy: true, laboratory: false, ward: false, clinical: false };
  }

  return { ...DEFAULT_HOSPITAL_MODULES };
};

const normalizePlan = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
