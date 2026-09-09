import { CONFIG } from '../../../config';
import { hasRouteAccess, readStoredPermissions } from '../modules/auth/access-control';
import { resolveBlockedModuleForApiPath } from '../modules/auth/hospital-modules';

export type EmptyApiShape = 'list' | 'array' | 'null' | 'object' | 'slots';

export type ApiAccessDecision =
  | { action: 'allow' }
  | { action: 'deny'; empty: EmptyApiShape };

type AccessRule = {
  methods: string[];
  pattern: RegExp;
  skip?: boolean;
  any?: string[];
  empty?: EmptyApiShape;
};

const LIST: EmptyApiShape = 'list';
const ARRAY: EmptyApiShape = 'array';
const NONE: EmptyApiShape = 'null';
const OBJECT: EmptyApiShape = 'object';

const RULES: AccessRule[] = [
  { methods: ['*'], pattern: /^\/auth(\/|$)/, skip: true },
  { methods: ['*'], pattern: /^\/media(\/|$)/, skip: true },
  { methods: ['*'], pattern: /^\/doctors\/me(\/|$)/, skip: true },
  { methods: ['GET'], pattern: /^\/companies\/me$/, skip: true },
  { methods: ['PATCH'], pattern: /^\/companies\/me$/, any: ['company.manage'] },

  { methods: ['GET'], pattern: /^\/hospital-dashboard\/summary$/, any: ['hospital_dashboard.read'], empty: OBJECT },
  {
    methods: ['GET'],
    pattern: /^\/hospital-dashboard\/doctor-summary$/,
    any: ['appointments.read', 'hospital_dashboard.read'],
    empty: OBJECT,
  },
  {
    methods: ['POST'],
    pattern: /^\/hospital-dashboard\/doctor-summary\/email$/,
    any: ['prescriptions.read', 'appointments.read', 'hospital_dashboard.read'],
  },

  { methods: ['GET'], pattern: /^\/departments$/, any: ['departments.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/departments\//, any: ['departments.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/departments$/, any: ['departments.create'] },
  { methods: ['PATCH'], pattern: /^\/departments\//, any: ['departments.update'] },
  { methods: ['DELETE'], pattern: /^\/departments\//, any: ['departments.delete'] },
  { methods: ['GET'], pattern: /^\/treatment-catalog$/, any: ['treatment_catalog.read', 'ward.admissions.recommend', 'operations.read', 'hospitals.update', 'departments.update'], empty: LIST },
  { methods: ['GET'], pattern: /^\/treatment-catalog\//, any: ['treatment_catalog.read', 'ward.admissions.recommend', 'operations.read', 'hospitals.update', 'departments.update'], empty: NONE },
  { methods: ['POST'], pattern: /^\/treatment-catalog$/, any: ['treatment_catalog.create', 'hospitals.update'] },
  { methods: ['PATCH'], pattern: /^\/treatment-catalog\//, any: ['treatment_catalog.update', 'hospitals.update'] },
  { methods: ['DELETE'], pattern: /^\/treatment-catalog\//, any: ['treatment_catalog.update', 'hospitals.update'] },
  { methods: ['GET'], pattern: /^\/operation-schedules\/calendar/, any: ['operations.read', 'operations.read_all'], empty: LIST },
  { methods: ['GET'], pattern: /^\/operation-schedules\/kpi/, any: ['operations.read', 'operations.read_all'], empty: OBJECT },
  { methods: ['GET'], pattern: /^\/operation-schedules$/, any: ['operations.read', 'operations.read_all'], empty: LIST },
  { methods: ['GET'], pattern: /^\/operation-schedules\//, any: ['operations.read', 'operations.read_all'], empty: NONE },
  { methods: ['POST'], pattern: /^\/operation-schedules$/, any: ['operations.create'] },
  { methods: ['PATCH'], pattern: /^\/operation-schedules\//, any: ['operations.update', 'operations.assign'] },
  { methods: ['POST'], pattern: /^\/operation-schedules\/[^/]+\/status$/, any: ['operations.update'] },
  { methods: ['POST'], pattern: /^\/operation-schedules\/[^/]+\/complete$/, any: ['operations.complete'] },
  { methods: ['POST'], pattern: /^\/operation-schedules\/[^/]+\/cancel$/, any: ['operations.cancel'] },

  { methods: ['GET'], pattern: /^\/hospitals$/, any: ['hospitals.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/hospitals\//, any: ['hospitals.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/hospitals$/, any: ['hospitals.create'] },
  { methods: ['PATCH'], pattern: /^\/hospitals\//, any: ['hospitals.update'] },
  { methods: ['DELETE'], pattern: /^\/hospitals\//, any: ['hospitals.delete'] },

  { methods: ['GET'], pattern: /^\/doctors\/[^/]+\/patients$/, any: ['patients.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/doctors\/[^/]+\/appointments$/, any: ['appointments.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/doctors$/, any: ['doctors.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/doctors\//, any: ['doctors.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/doctors$/, any: ['doctors.create'] },
  { methods: ['POST'], pattern: /^\/doctors\/[^/]+\/photo$/, any: ['doctors.update'] },
  { methods: ['PATCH'], pattern: /^\/doctors\//, any: ['doctors.update'] },
  { methods: ['DELETE'], pattern: /^\/doctors\/[^/]+\/photo$/, any: ['doctors.update'] },
  { methods: ['DELETE'], pattern: /^\/doctors\//, any: ['doctors.delete'] },

  { methods: ['GET'], pattern: /^\/patients\/[^/]+\/history$/, any: ['patients_history.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/patients\/[^/]+\/prescriptions$/, any: ['prescriptions.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/patients\/[^/]+\/bills$/, any: ['bills.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/patients$/, any: ['patients.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/patients\//, any: ['patients.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/patients$/, any: ['patients.create'] },
  { methods: ['PATCH'], pattern: /^\/patients\//, any: ['patients.update'] },
  { methods: ['DELETE'], pattern: /^\/patients\//, any: ['patients.delete'] },

  { methods: ['GET'], pattern: /^\/patient-history/, any: ['patients_history.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/patient-history$/, any: ['patients_history.create'] },
  { methods: ['PATCH'], pattern: /^\/patient-history\//, any: ['patients_history.update'] },
  { methods: ['DELETE'], pattern: /^\/patient-history\//, any: ['patients_history.delete'] },

  { methods: ['GET'], pattern: /^\/appointments\/calendar$/, any: ['appointments.read'], empty: ARRAY },
  { methods: ['GET'], pattern: /^\/appointments\/available-slots$/, any: ['appointments.read'], empty: 'slots' },
  { methods: ['GET'], pattern: /^\/appointments$/, any: ['appointments.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/appointments\//, any: ['appointments.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/appointments$/, any: ['appointments.create'] },
  { methods: ['PATCH'], pattern: /^\/appointments\/[^/]+\/status$/, any: ['appointments.status_update'] },
  { methods: ['PATCH'], pattern: /^\/appointments\//, any: ['appointments.update'] },
  { methods: ['DELETE'], pattern: /^\/appointments\//, any: ['appointments.delete'] },

  { methods: ['GET'], pattern: /^\/prescriptions$/, any: ['prescriptions.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/prescriptions\//, any: ['prescriptions.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/prescriptions$/, any: ['prescriptions.create'] },
  { methods: ['PATCH'], pattern: /^\/prescriptions\//, any: ['prescriptions.update'] },
  { methods: ['DELETE'], pattern: /^\/prescriptions\//, any: ['prescriptions.delete'] },

  { methods: ['GET'], pattern: /^\/users$/, any: ['users.read'], empty: ARRAY },
  { methods: ['GET'], pattern: /^\/users\//, any: ['users.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/users$/, any: ['users.create'] },
  { methods: ['POST'], pattern: /^\/users\/[^/]+\/photo$/, any: ['users.update'] },
  { methods: ['PATCH'], pattern: /^\/users\//, any: ['users.update'] },
  { methods: ['DELETE'], pattern: /^\/users\/[^/]+\/photo$/, any: ['users.update'] },
  { methods: ['DELETE'], pattern: /^\/users\//, any: ['users.delete'] },

  { methods: ['GET'], pattern: /^\/roles$/, any: ['roles.read'], empty: ARRAY },
  { methods: ['GET'], pattern: /^\/roles\//, any: ['roles.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/roles$/, any: ['roles.create'] },
  { methods: ['PATCH'], pattern: /^\/roles\//, any: ['roles.update'] },
  { methods: ['DELETE'], pattern: /^\/roles\//, any: ['roles.delete'] },

  { methods: ['GET'], pattern: /^\/audit-logs/, any: ['audit_logs.read'], empty: LIST },

  { methods: ['GET'], pattern: /^\/companies$/, any: ['companies.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/companies\//, any: ['companies.read'], empty: NONE },

  { methods: ['GET'], pattern: /^\/rooms$/, any: ['rooms.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/rooms\//, any: ['rooms.read'], empty: NONE },
  { methods: ['POST'], pattern: /^\/rooms$/, any: ['rooms.create'] },
  { methods: ['PATCH'], pattern: /^\/rooms\//, any: ['rooms.update'] },
  { methods: ['DELETE'], pattern: /^\/rooms\//, any: ['rooms.delete'] },

  { methods: ['GET'], pattern: /^\/room-allotments/, any: ['room_allotments.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/room-allotments$/, any: ['room_allotments.create'] },
  { methods: ['PATCH'], pattern: /^\/room-allotments\//, any: ['room_allotments.update'] },

  {
    methods: ['GET'],
    pattern: /^\/hospital-wards/,
    any: ['ward.read', 'rooms.read', 'patients_history.read'],
    empty: LIST,
  },
  { methods: ['GET'], pattern: /^\/hospital-master-data/, any: ['departments.read', 'ward.read', 'rooms.read'] },
  { methods: ['POST'], pattern: /^\/hospital-master-data/, any: ['departments.create', 'ward.create', 'ward.update'] },
  { methods: ['GET'], pattern: /^\/nursery/, any: ['ward.nursery.read', 'ward.read'] },
  { methods: ['POST'], pattern: /^\/nursery/, any: ['ward.nursery.create', 'ward.nursery.update', 'ward.nursery.allocate_bed', 'ward.nursery.discharge', 'ward.nursery.feeding.create', 'ward.nursery.feeding.read'] },

  { methods: ['GET'], pattern: /^\/public\/birth-certificates\/verify\//, skip: true },
  { methods: ['GET'], pattern: /^\/birth-records\/dashboard$/, any: ['ward.nursery.birth_records.read', 'ward.nursery.read', 'ward.read'], empty: OBJECT },
  { methods: ['GET'], pattern: /^\/birth-records\/mother\//, any: ['ward.nursery.birth_records.read', 'ward.nursery.read', 'ward.read'] },
  {
    methods: ['GET'],
    pattern: /^\/birth-records\/certificates\//,
    any: [
      'ward.nursery.birth_certificates.read',
      'ward.nursery.birth_records.read',
      'ward.nursery.read',
      'ward.read',
    ],
    empty: OBJECT,
  },
  { methods: ['GET'], pattern: /^\/birth-records/, any: ['ward.nursery.birth_records.read', 'ward.nursery.read', 'ward.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/birth-records\/[^/]+\/certificates$/, any: ['ward.nursery.birth_certificates.issue', 'hospitals.update'] },
  { methods: ['POST'], pattern: /^\/birth-records\/certificates\/[^/]+\/correct$/, any: ['ward.nursery.birth_certificates.correct', 'hospitals.update'] },
  { methods: ['POST'], pattern: /^\/birth-records\/certificates\/[^/]+\/revoke$/, any: ['ward.nursery.birth_certificates.revoke', 'hospitals.update'] },
  { methods: ['POST'], pattern: /^\/birth-records\/certificates\/[^/]+\/print$/, any: ['ward.nursery.birth_certificates.print', 'ward.nursery.birth_certificates.read'] },
  { methods: ['POST'], pattern: /^\/birth-records/, any: ['ward.nursery.birth_records.create', 'ward.nursery.birth_records.update', 'ward.nursery.birth_records.verify', 'ward.nursery.create'] },
  { methods: ['PATCH'], pattern: /^\/birth-records/, any: ['ward.nursery.birth_records.update', 'ward.nursery.update'] },
  { methods: ['GET', 'PATCH'], pattern: /^\/notifications/, empty: OBJECT },

  // ward-billing must be registered before /^\/ward(\/|$)/ so /ward-billing is not treated as /ward
  { methods: ['GET'], pattern: /^\/ward-billing\/admission-recommendations\/lookups/, any: ['ward.admissions.read', 'ward.admissions.create', 'ward.admissions.recommend'] },
  { methods: ['GET'], pattern: /^\/ward-billing\/admission-recommendations/, any: ['ward.admissions.read', 'ward.admissions.create', 'ward.admissions.recommend'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/admission-recommendations$/, any: ['ward.admissions.recommend', 'ward.admissions.create'] },
  { methods: ['GET'], pattern: /^\/ward-billing\/admission-recommendations\/[^/]+$/, any: ['ward.admissions.read', 'ward.admissions.create', 'ward.admissions.recommend'] },
  { methods: ['PATCH'], pattern: /^\/ward-billing\/admission-recommendations\/[^/]+$/, any: ['ward.admissions.recommend', 'ward.admissions.update'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/admission-recommendations\/[^/]+\/(cancel|acknowledge)$/, any: ['ward.admissions.recommend', 'ward.admissions.update', 'ward.admissions.create'] },
  { methods: ['GET'], pattern: /^\/ward-billing\/admissions\/[^/]+\/bill/, any: ['ward.billing.read'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/admissions\/[^/]+\/charges/, any: ['ward.billing.create'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/admissions\/[^/]+\/payments/, any: ['ward.payments.collect'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/admissions\/[^/]+\/security-deposit/, any: ['ward.payments.collect'] },
  { methods: ['GET'], pattern: /^\/ward-billing\/admissions\/[^/]+\/discharge-statement/, any: ['ward.discharge.read', 'ward.billing.read'] },
  { methods: ['GET'], pattern: /^\/ward-billing\/admissions\/[^/]+\/doctor-visits/, any: ['ward.doctor_visits.read'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/doctor-visits$/, any: ['ward.doctor_visits.create'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/doctor-visits\/[^/]+\/complete/, any: ['ward.doctor_visits.update'] },
  { methods: ['GET'], pattern: /^\/ward-billing\/roster/, any: ['ward.roster.read'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/roster\/copy-week\/preview$/, any: ['ward.roster.read'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/roster\/copy-week$/, any: ['ward.roster.create'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/roster\/bulk\/preview$/, any: ['ward.roster.create'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/roster\/bulk$/, any: ['ward.roster.create'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/roster\/coverage$/, any: ['ward.roster.update'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/roster\/publish$/, any: ['ward.roster.update'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/roster$/, any: ['ward.roster.create'] },
  { methods: ['PATCH'], pattern: /^\/ward-billing\/roster/, any: ['ward.roster.update'] },
  { methods: ['GET'], pattern: /^\/ward-billing\/pharmacy-settlements/, any: ['pharmacy.ward_settlements.read', 'ward.settlements.read'] },
  { methods: ['POST'], pattern: /^\/ward-billing\/pharmacy-settlements\/[^/]+\/verify/, any: ['pharmacy.ward_settlements.verify'] },
  { methods: ['GET'], pattern: /^\/ward-billing/, any: ['ward.admissions.read', 'ward.admissions.recommend', 'ward.billing.read', 'ward.roster.read', 'ward.medicine_requests.read'], empty: OBJECT },
  { methods: ['POST'], pattern: /^\/ward-billing/, any: ['ward.admissions.create', 'ward.admissions.recommend', 'ward.billing.create', 'ward.roster.create'] },
  { methods: ['PATCH'], pattern: /^\/ward-billing/, any: ['ward.admissions.update', 'ward.billing.create', 'ward.roster.update'] },

  { methods: ['GET'], pattern: /^\/ward(\/|$)/, any: ['ward.read', 'ward.assignments.read'], empty: OBJECT },
  { methods: ['POST'], pattern: /^\/ward(\/|$)/, any: ['ward.create', 'ward.assignments.manage', 'rooms.create'] },
  { methods: ['PATCH'], pattern: /^\/ward(\/|$)/, any: ['ward.update', 'ward.assignments.manage', 'rooms.update'] },
  { methods: ['DELETE'], pattern: /^\/ward(\/|$)/, any: ['ward.update', 'rooms.update'] },

  { methods: ['GET'], pattern: /^\/laboratory\/tests/, any: ['lab_tests.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/laboratory\/settings$/, any: ['lab_orders.read', 'lab_tests.read'], empty: OBJECT },
  { methods: ['GET'], pattern: /^\/laboratory/, any: ['lab_orders.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/laboratory\/tests/, any: ['lab_tests.create'] },
  { methods: ['PATCH'], pattern: /^\/laboratory\/tests/, any: ['lab_tests.update'] },
  { methods: ['PATCH'], pattern: /^\/laboratory\/settings$/, any: ['lab_tests.update'] },
  {
    methods: ['POST'],
    pattern: /^\/laboratory\/orders\/[^/]+\/items\/[^/]+\/verify$/,
    any: ['lab_results.verify'],
  },
  {
    methods: ['POST'],
    pattern: /^\/laboratory\/orders\/[^/]+\/collect-payment$/,
    any: ['ledger_payments.create', 'bills.update_payment'],
  },
  { methods: ['POST'], pattern: /^\/laboratory/, any: ['lab_orders.create', 'lab_orders.update'] },
  { methods: ['PATCH'], pattern: /^\/laboratory/, any: ['lab_orders.update', 'lab_results.verify'] },

  { methods: ['GET'], pattern: /^\/bills/, any: ['bills.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/bills$/, any: ['bills.create'] },
  { methods: ['PATCH'], pattern: /^\/bills/, any: ['bills.update_payment'] },

  { methods: ['GET'], pattern: /^\/encounters\/charge-catalog/, any: ['charge_catalog.read'], empty: LIST },
  { methods: ['GET'], pattern: /^\/encounters/, any: ['encounters.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/encounters$/, any: ['encounters.create'] },
  { methods: ['PATCH'], pattern: /^\/encounters/, any: ['encounters.update'] },

  { methods: ['GET'], pattern: /^\/payments/, any: ['payments.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/payments$/, any: ['payments.create'] },

  { methods: ['GET'], pattern: /^\/expenses/, any: ['expenses.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/expenses$/, any: ['expenses.create'] },
  { methods: ['PATCH'], pattern: /^\/expenses\//, any: ['expenses.update'] },
  { methods: ['DELETE'], pattern: /^\/expenses\//, any: ['expenses.delete'] },

  {
    methods: ['GET'],
    pattern: /^\/accounts/,
    any: ['accounts.read', 'accounts.journals.read', 'accounts.reports.read', 'financial_reconciliation.read', 'expenses.read'],
    empty: OBJECT,
  },
  { methods: ['POST'], pattern: /^\/accounts/, any: ['accounts.journals.create', 'expenses.create'] },

  { methods: ['GET'], pattern: /^\/categories/, any: ['categories.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/categories$/, any: ['categories.create'] },
  { methods: ['PATCH'], pattern: /^\/categories\//, any: ['categories.update'] },
  { methods: ['DELETE'], pattern: /^\/categories\//, any: ['categories.delete'] },

  { methods: ['GET'], pattern: /^\/customers/, any: ['customers.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/customers$/, any: ['customers.create'] },
  { methods: ['PATCH'], pattern: /^\/customers\//, any: ['customers.update'] },
  { methods: ['DELETE'], pattern: /^\/customers\//, any: ['customers.delete'] },

  { methods: ['GET'], pattern: /^\/suppliers/, any: ['suppliers.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/suppliers$/, any: ['suppliers.create'] },
  { methods: ['PATCH'], pattern: /^\/suppliers\//, any: ['suppliers.update'] },
  { methods: ['DELETE'], pattern: /^\/suppliers\//, any: ['suppliers.delete'] },

  {
    methods: ['GET'],
    pattern: /^\/products\/prescription-suggestions$/,
    any: ['products.read', 'prescriptions.read', 'prescriptions.create', 'prescriptions.update'],
    empty: LIST,
  },
  { methods: ['GET'], pattern: /^\/products/, any: ['products.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/products$/, any: ['products.create'] },
  { methods: ['PATCH'], pattern: /^\/products\//, any: ['products.update'] },
  { methods: ['DELETE'], pattern: /^\/products\//, any: ['products.delete'] },

  {
    methods: ['GET'],
    pattern: /^\/stores/,
    any: ['stores.read', 'stores.manage', 'sales.create', 'register_sessions.read'],
    empty: LIST,
  },
  { methods: ['POST'], pattern: /^\/stores$/, any: ['stores.manage'] },
  { methods: ['PATCH'], pattern: /^\/stores\//, any: ['stores.manage'] },
  { methods: ['DELETE'], pattern: /^\/stores\//, any: ['stores.manage'] },

  { methods: ['GET'], pattern: /^\/warehouses/, any: ['warehouses.read', 'warehouses.manage'], empty: LIST },
  { methods: ['POST'], pattern: /^\/warehouses$/, any: ['warehouses.manage'] },

  { methods: ['GET'], pattern: /^\/inventory/, any: ['inventory.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/inventory/, any: ['inventory.adjust'] },

  { methods: ['GET'], pattern: /^\/stock-movements/, any: ['stock_movements.read'], empty: LIST },

  { methods: ['GET'], pattern: /^\/sales/, any: ['sales.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/sales/, any: ['sales.create'] },
  { methods: ['PATCH'], pattern: /^\/sales/, any: ['sales.create', 'sales.cancel'] },

  { methods: ['GET'], pattern: /^\/returns/, any: ['returns.read', 'purchase_returns.create'], empty: LIST },
  { methods: ['POST'], pattern: /^\/returns/, any: ['returns.create', 'purchase_returns.create'] },

  { methods: ['GET'], pattern: /^\/purchases/, any: ['purchases.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/purchases/, any: ['purchases.create', 'purchases.receive'] },
  { methods: ['PATCH'], pattern: /^\/purchases/, any: ['purchases.update', 'purchases.cancel', 'purchases.receive'] },

  { methods: ['GET'], pattern: /^\/transfers/, any: ['transfers.read'], empty: LIST },
  { methods: ['POST'], pattern: /^\/transfers/, any: ['transfers.create', 'transfers.approve', 'transfers.dispatch', 'transfers.receive'] },
  { methods: ['PATCH'], pattern: /^\/transfers/, any: ['transfers.approve', 'transfers.dispatch', 'transfers.receive', 'transfers.cancel'] },

  {
    methods: ['GET'],
    pattern: /^\/register-sessions/,
    any: ['register_sessions.read', 'register_sessions.open', 'register_sessions.admin_read'],
    empty: LIST,
  },
  { methods: ['POST'], pattern: /^\/register-sessions/, any: ['register_sessions.open', 'register_sessions.close'] },
  { methods: ['PATCH'], pattern: /^\/register-sessions/, any: ['register_sessions.close'] },

  { methods: ['GET'], pattern: /^\/reports/, any: ['reports.read'], empty: OBJECT },
];

export function toApiPath(url: string): string {
  const raw = String(url || '');
  const withoutQuery = raw.split('?')[0];
  let path = withoutQuery;

  if (withoutQuery.startsWith(CONFIG.baseUrl)) {
    path = withoutQuery.slice(CONFIG.baseUrl.length);
  } else {
    const marker = '/api/v1';
    const index = withoutQuery.indexOf(marker);
    if (index >= 0) {
      path = withoutQuery.slice(index + marker.length);
    }
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path;
}

export function resolveApiAccess(method: string, url: string): ApiAccessDecision {
  const path = toApiPath(url);
  const verb = String(method || 'GET').toUpperCase();

  if (resolveBlockedModuleForApiPath(path)) {
    return { action: 'deny', empty: LIST };
  }

  const permissions = readStoredPermissions();

  for (const rule of RULES) {
    if (!rule.methods.includes(verb) && !rule.methods.includes('*')) {
      continue;
    }
    if (!rule.pattern.test(path)) {
      continue;
    }
    if (rule.skip || !rule.any?.length) {
      return { action: 'allow' };
    }
    if (hasRouteAccess(rule.any, permissions)) {
      return { action: 'allow' };
    }
    return { action: 'deny', empty: rule.empty || LIST };
  }

  return { action: 'allow' };
}

export function emptyApiData(shape: EmptyApiShape): unknown {
  switch (shape) {
    case 'array':
      return [];
    case 'null':
      return null;
    case 'object':
      return {};
    case 'slots':
      return { date: '', durationMinutes: 15, slots: [] };
    case 'list':
    default:
      return {
        items: [],
        pagination: { page: 1, limit: 0, total: 0, totalPages: 0 },
      };
  }
}
