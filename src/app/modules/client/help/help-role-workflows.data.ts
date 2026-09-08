import { HelpArticle } from './help-content.data';

export type HelpRoleKey =
  | ''
  | 'owner'
  | 'receptionist'
  | 'doctor'
  | 'ward'
  | 'laboratory'
  | 'pharmacy'
  | 'accountant';

export interface HelpWorkflowStep {
  id: string;
  number?: string;
  label: string;
  helpSlug?: string;
  route?: string;
  module?: HelpArticle['module'];
  accent?: boolean;
  muted?: boolean;
  branch?: boolean;
}

export type HelpWorkflowBlock =
  | { type: 'row'; items: HelpWorkflowStep[] }
  | { type: 'branch'; label?: string; items: HelpWorkflowStep[] }
  | { type: 'parallel'; items: HelpWorkflowStep[] }
  | { type: 'note'; text: string }
  | { type: 'heading'; text: string };

export interface HelpRoleWorkflowConfig {
  id: HelpRoleKey;
  title: string;
  description: string;
  commonTaskSlugs: string[];
  quickTaskSlugs: string[];
  moduleGuideKeys: string[];
  preferredGuideSlugs: string[];
  desktopBlocks: HelpWorkflowBlock[];
  mobileSteps: HelpWorkflowStep[];
}

const step = (
  id: string,
  number: string,
  label: string,
  helpSlug?: string,
  extra: Partial<HelpWorkflowStep> = {}
): HelpWorkflowStep => ({ id, number, label, helpSlug, ...extra });

const HELP_QUICK_TASK_SLUGS_ALL = [
  'how-to-register-patient',
  'how-to-create-appointment',
  'add-doctor-guide',
  'doctor-recommend-admission',
  'how-to-admit-patient',
  'room-bed-hierarchy',
  'ward-nursing-care',
  'mar-medicine-guide',
  'lab-order-from-ward',
  'radiology-imaging-guide',
  'pharmacy-ward-medicine',
  'receive-patient-payment',
  'how-to-discharge-patient',
  'register-newborn',
  'birth-certificate-issue',
  'accounts-rules-guide',
  'how-to-create-duty-roster',
  'assign-nurse-duty',
];

export const HELP_ROLE_WORKFLOWS: Record<HelpRoleKey, HelpRoleWorkflowConfig> = {
  '': {
    id: '',
    title: 'Main Hospital Workflow',
    description: 'Doctor recommends admission — Ward Reception completes actual admission.',
    commonTaskSlugs: [
      'how-to-register-patient',
      'how-to-create-appointment',
      'how-to-admit-patient',
      'mar-medicine-guide',
      'receive-patient-payment',
    ],
    quickTaskSlugs: HELP_QUICK_TASK_SLUGS_ALL,
    moduleGuideKeys: ['clinical', 'ward', 'laboratory', 'pharmacy', 'accounts', 'nursery', 'setup', 'roles'],
    preferredGuideSlugs: [],
    desktopBlocks: [
      {
        type: 'row',
        items: [
          step('reg', '1', 'Patient Registration', 'how-to-register-patient'),
          step('appt', '2', 'Appointment', 'how-to-create-appointment'),
          step('consult', '3', 'Doctor Consultation', 'doctor-consultation-flow'),
        ],
      },
      {
        type: 'branch',
        label: 'OR',
        items: [
          step('opd', '4A', 'OPD Complete', 'doctor-consultation-flow', { muted: true }),
          step('recommend', '4B', 'Admission Recommended', 'doctor-recommend-admission', { accent: true, module: 'clinical' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('ward-rec', '5', 'Ward Reception', 'how-to-admit-patient', { module: 'ward' }),
          step('bed', '6', 'Ward / Room / Bed', 'room-bed-hierarchy', { module: 'ward' }),
          step('enc', '7', 'Admission Encounter', 'how-to-admit-patient', { module: 'ward' }),
          step('panel', '8', 'Patient Control Panel', 'ward-control-panel', { module: 'ward' }),
        ],
      },
      {
        type: 'parallel',
        items: [
          step('mar', '9A', 'Nursing / Vitals / MAR', 'mar-medicine-guide', { module: 'ward', branch: true }),
          step('lab', '9B', 'Laboratory', 'laboratory-orders', { module: 'laboratory', branch: true }),
          step('rx', '9C', 'Pharmacy', 'pharmacy-ward-medicine', { module: 'pharmacy', branch: true }),
        ],
      },
      {
        type: 'row',
        items: [
          step('bill', '10', 'Final Billing', 'how-to-discharge-patient', { module: 'accounts' }),
          step('pay', '11', 'Payment', 'receive-patient-payment', { module: 'accounts' }),
          step('dis', '12', 'Discharge', 'how-to-discharge-patient', { module: 'ward' }),
        ],
      },
    ],
    mobileSteps: [],
  },
  owner: {
    id: 'owner',
    title: 'Owner / Admin Workflow',
    description: 'Configure the hospital, assign access, and monitor operations and finance.',
    commonTaskSlugs: [
      'hospital-setup-guide',
      'create-rooms-beds',
      'birth-certificate-issue',
      'add-doctor-guide',
      'roles-permissions',
      'how-to-create-duty-roster',
      'accounts-overview',
      'accounts-rules-guide',
    ],
    quickTaskSlugs: [
      'hospital-setup-guide',
      'create-rooms-beds',
      'birth-certificate-issue',
      'add-doctor-guide',
      'roles-permissions',
      'accounts-overview',
      'accounts-rules-guide',
      'department-performance-report',
      'how-to-register-patient',
    ],
    moduleGuideKeys: ['setup', 'roles', 'clinical', 'ward', 'laboratory', 'pharmacy', 'accounts', 'nursery'],
    preferredGuideSlugs: [
      'hospital-setup-guide',
      'birth-certificate-issue',
      'create-rooms-beds',
      'roles-permissions',
      'accounts-overview',
      'accounts-rules-guide',
      'department-performance-report',
    ],
    desktopBlocks: [
      {
        type: 'row',
        items: [
          step('setup', '1', 'Hospital Setup', 'hospital-setup-guide', { module: 'setup' }),
          step('dept', '2', 'Departments', 'hospital-setup-guide', { module: 'setup' }),
          step('wards', '3', 'Wards / Rooms / Beds', 'create-rooms-beds', { module: 'setup' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('birth', '4', 'Birth Cert Setup', 'birth-certificate-issue', { module: 'nursery' }),
          step('docs', '5', 'Doctors', 'add-doctor-guide', { module: 'clinical' }),
          step('users', '6', 'Users & Roles', 'roles-permissions', { module: 'setup' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('modules', '7', 'Lab / Pharmacy Setup', 'hospital-setup-guide'),
          step('ops', '8', 'Hospital Operations', 'getting-started-overview'),
          step('accounts', '9', 'Accounts & Reports', 'accounts-overview', { module: 'accounts' }),
        ],
      },
    ],
    mobileSteps: [],
  },
  receptionist: {
    id: 'receptionist',
    title: 'Receptionist Workflow',
    description: 'Register patients, book appointments, and collect OPD payments — not ward admission.',
    commonTaskSlugs: [
      'how-to-register-patient',
      'how-to-create-appointment',
      'receive-patient-payment',
    ],
    quickTaskSlugs: [
      'how-to-register-patient',
      'how-to-create-appointment',
      'receive-patient-payment',
      'doctor-consultation-flow',
    ],
    moduleGuideKeys: ['clinical'],
    preferredGuideSlugs: [
      'how-to-register-patient',
      'how-to-create-appointment',
      'receive-patient-payment',
      'doctor-consultation-flow',
    ],
    desktopBlocks: [
      {
        type: 'row',
        items: [
          step('search', '1', 'Search / Register Patient', 'how-to-register-patient', { module: 'clinical' }),
          step('appt', '2', 'Create Appointment', 'how-to-create-appointment', { module: 'clinical' }),
          step('slot', '3', 'Assign Doctor / Department / Slot', 'how-to-create-appointment', { module: 'clinical' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('confirm', '4', 'Appointment Confirmed', 'how-to-create-appointment', { module: 'clinical' }),
          step('consult', '5', 'Doctor Consultation', 'doctor-consultation-flow', { module: 'clinical' }),
        ],
      },
      {
        type: 'branch',
        label: 'OR',
        items: [
          step('opd-pay', '6A', 'OPD Payment', 'receive-patient-payment', { module: 'accounts' }),
          step('follow', '6B', 'Follow-up Appointment', 'how-to-create-appointment', { module: 'clinical', muted: true }),
        ],
      },
      {
        type: 'note',
        text: 'Ward admission is completed by Ward Reception after a doctor recommendation — not at the appointment desk.',
      },
    ],
    mobileSteps: [],
  },
  doctor: {
    id: 'doctor',
    title: 'Doctor Workflow',
    description: 'Consult, prescribe, recommend admission, and manage inpatient orders — doctors do not allocate beds.',
    commonTaskSlugs: [
      'doctor-consultation-flow',
      'doctor-recommend-admission',
      'add-doctor-order',
      'lab-order-from-ward',
      'admission-history-guide',
    ],
    quickTaskSlugs: [
      'doctor-consultation-flow',
      'doctor-recommend-admission',
      'add-doctor-order',
      'lab-order-from-ward',
      'radiology-imaging-guide',
      'admission-history-guide',
      'mar-medicine-guide',
    ],
    moduleGuideKeys: ['clinical', 'ward', 'laboratory'],
    preferredGuideSlugs: [
      'doctor-consultation-flow',
      'doctor-recommend-admission',
      'add-doctor-order',
      'lab-order-from-ward',
      'radiology-imaging-guide',
      'admission-history-guide',
    ],
    desktopBlocks: [
      {
        type: 'row',
        items: [
          step('dash', '1', 'Doctor Dashboard', 'doctor-consultation-flow', { module: 'clinical' }),
          step('appt', '2', 'Open Appointment', 'doctor-consultation-flow', { module: 'clinical' }),
          step('hist', '3', 'Review Patient History', 'admission-history-guide', { module: 'ward' }),
        ],
      },
      {
        type: 'row',
        items: [step('consult', '4', 'Consultation', 'doctor-consultation-flow', { module: 'clinical' })],
      },
      {
        type: 'row',
        items: [step('notes', '5', 'Clinical Notes / Prescription', 'doctor-consultation-flow', { module: 'clinical' })],
      },
      {
        type: 'branch',
        label: 'OR',
        items: [
          step('opd', '5A', 'OPD Complete / Follow-up', 'doctor-consultation-flow', { muted: true, module: 'clinical' }),
          step('rec', '5B', 'Recommend Admission', 'doctor-recommend-admission', { accent: true, module: 'clinical' }),
        ],
      },
      {
        type: 'note',
        text: 'Next: Ward Reception completes actual admission with ward, room, and bed.',
      },
      {
        type: 'row',
        items: [
          step('admitted', '6', 'Open Admitted Patient', 'ward-control-panel', { module: 'ward' }),
          step('orders', '7', 'Doctor Orders', 'add-doctor-order', { module: 'ward' }),
          step('review', '8', 'Review Results / Plan Discharge', 'how-to-discharge-patient', { module: 'ward' }),
        ],
      },
    ],
    mobileSteps: [],
  },
  ward: {
    id: 'ward',
    title: 'Ward Receptionist / Nurse Workflow',
    description: 'Ward Reception completes admissions; nurses execute care, MAR, and on-behalf orders with doctor attribution.',
    commonTaskSlugs: [
      'how-to-admit-patient',
      'ward-control-panel',
      'how-to-create-duty-roster',
      'assign-nurse-duty',
      'mar-medicine-guide',
      'ward-nursing-care',
      'lab-order-from-ward',
    ],
    quickTaskSlugs: [
      'how-to-admit-patient',
      'room-bed-hierarchy',
      'ward-control-panel',
      'mar-medicine-guide',
      'ward-nursing-care',
      'lab-order-from-ward',
      'radiology-imaging-guide',
      'how-to-discharge-patient',
    ],
    moduleGuideKeys: ['ward', 'laboratory', 'pharmacy'],
    preferredGuideSlugs: [
      'how-to-admit-patient',
      'ward-control-panel',
      'mar-medicine-guide',
      'ward-nursing-care',
      'nurse-enter-doctor-order',
    ],
    desktopBlocks: [
      { type: 'heading', text: 'Ward Reception' },
      {
        type: 'row',
        items: [
          step('notif', '1', 'Admission Notification', 'ward-notifications-guide', { module: 'ward' }),
          step('pending', '2', 'Pending Admissions', 'how-to-admit-patient', { module: 'ward' }),
          step('review', '3', 'Review Doctor Recommendation', 'how-to-admit-patient', { module: 'ward' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('ward', '4', 'Select Ward', 'how-to-admit-patient', { module: 'ward' }),
          step('bed', '5', 'Select Room / Bed', 'room-bed-hierarchy', { module: 'ward' }),
          step('admit', '6', 'Admit Patient', 'how-to-admit-patient', { module: 'ward', accent: true }),
        ],
      },
      {
        type: 'row',
        items: [
          step('enc', '7', 'Admission Encounter', 'how-to-admit-patient', { module: 'ward' }),
          step('panel', '8', 'Open Patient Control Panel', 'ward-control-panel', { module: 'ward' }),
        ],
      },
      { type: 'heading', text: 'Nurse Care' },
      {
        type: 'row',
        items: [step('orders', '1', 'Review Doctor Orders', 'add-doctor-order', { module: 'ward' })],
      },
      {
        type: 'parallel',
        items: [
          step('vitals', '2A', 'Vitals', 'ward-nursing-care', { module: 'ward', branch: true }),
          step('mar', '2B', 'MAR / Medicine', 'mar-medicine-guide', { module: 'ward', branch: true }),
          step('iv', '2C', 'Drips / IV', 'ward-nursing-care', { module: 'ward', branch: true }),
          step('lab', '2D', 'Lab Order (on behalf)', 'nurse-enter-doctor-order', { module: 'ward', branch: true }),
          step('img', '2E', 'Imaging Order (on behalf)', 'nurse-enter-doctor-order', { module: 'ward', branch: true }),
        ],
      },
      {
        type: 'row',
        items: [
          step('monitor', '3', 'Monitor Patient', 'ward-control-panel', { module: 'ward' }),
          step('dis', '4', 'Ready for Discharge Workflow', 'how-to-discharge-patient', { module: 'ward' }),
        ],
      },
      {
        type: 'note',
        text: 'Nurse-entered orders must record Recommended By doctor for audit.',
      },
    ],
    mobileSteps: [],
  },
  laboratory: {
    id: 'laboratory',
    title: 'Laboratory Workflow',
    description: 'Process incoming orders, enter verified results, and notify clinical staff.',
    commonTaskSlugs: [
      'laboratory-orders',
      'lab-order-from-ward',
    ],
    quickTaskSlugs: ['laboratory-orders', 'lab-order-from-ward'],
    moduleGuideKeys: ['laboratory'],
    preferredGuideSlugs: ['laboratory-orders', 'lab-order-from-ward'],
    desktopBlocks: [
      {
        type: 'row',
        items: [
          step('incoming', '1', 'Incoming Lab Orders', 'laboratory-orders', { module: 'laboratory' }),
          step('open', '2', 'Open Patient Order', 'lab-order-from-ward', { module: 'laboratory' }),
          step('sample', '3', 'Collect Sample', 'laboratory-orders', { module: 'laboratory' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('process', '4', 'Process / Enter Result', 'laboratory-orders', { module: 'laboratory' }),
          step('verify', '5', 'Verify Result', 'laboratory-orders', { module: 'laboratory' }),
          step('ready', '6', 'Report Ready', 'laboratory-orders', { module: 'laboratory' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('notify', '7', 'Ward / Doctor Notified', 'ward-notifications-guide', { module: 'laboratory' }),
          step('print', '8', 'Preview / PDF / Print / Invoice Auth Code', 'laboratory-orders', {
            module: 'laboratory',
          }),
          step('public', '9', 'Public Lab Reports Page', 'laboratory-orders', { module: 'laboratory' }),
        ],
      },
    ],
    mobileSteps: [],
  },
  pharmacy: {
    id: 'pharmacy',
    title: 'Pharmacy Workflow',
    description: 'Issue ward medicines and complete counter sales with stock updates.',
    commonTaskSlugs: ['bulk-add-medicines', 'pharmacy-pos-sale', 'pharmacy-ward-medicine'],
    quickTaskSlugs: ['bulk-add-medicines', 'pharmacy-pos-sale', 'pharmacy-ward-medicine'],
    moduleGuideKeys: ['pharmacy'],
    preferredGuideSlugs: ['bulk-add-medicines', 'pharmacy-pos-sale', 'pharmacy-ward-medicine'],
    desktopBlocks: [
      { type: 'heading', text: 'Medicine Catalog' },
      {
        type: 'row',
        items: [
          step('catalog', '1', 'Bulk Add Medicines', 'bulk-add-medicines', { module: 'pharmacy' }),
        ],
      },
      { type: 'heading', text: 'Ward Medicine' },
      {
        type: 'row',
        items: [
          step('req', '1', 'Ward Medicine Request', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
          step('review', '2', 'Review Request', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
          step('stock', '3', 'Check Stock', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('issue', '4', 'Partial / Full Issue', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
          step('move', '5', 'Stock Movement', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
          step('notify', '6', 'Ward Notified', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
        ],
      },
      { type: 'note', text: 'Nurse administers issued medicine through MAR.' },
      { type: 'heading', text: 'Counter Sale' },
      {
        type: 'row',
        items: [
          step('pos', '1', 'Open Register / POS', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
          step('products', '2', 'Select Products', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
          step('pay', '3', 'Payment & Complete Sale', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('invoice', '4', 'Invoice', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
          step('stock2', '5', 'Stock Updated', 'pharmacy-ward-medicine', { module: 'pharmacy' }),
        ],
      },
    ],
    mobileSteps: [],
  },
  accountant: {
    id: 'accountant',
    title: 'Accounts Workflow',
    description: 'Track patient transactions, ledger entries, payments, GL, and financial reports — no clinical actions.',
    commonTaskSlugs: [
      'receive-patient-payment',
      'patient-ledger-payments',
      'accounts-overview',
      'accounts-rules-guide',
      'department-performance-report',
    ],
    quickTaskSlugs: [
      'receive-patient-payment',
      'patient-ledger-payments',
      'accounts-overview',
      'accounts-rules-guide',
      'department-performance-report',
      'how-to-discharge-patient',
    ],
    moduleGuideKeys: ['accounts'],
    preferredGuideSlugs: [
      'accounts-rules-guide',
      'receive-patient-payment',
      'patient-ledger-payments',
      'accounts-overview',
      'department-performance-report',
      'how-to-discharge-patient',
    ],
    desktopBlocks: [
      {
        type: 'row',
        items: [
          step('txn', '1', 'Patient / Service Transactions', 'patient-ledger-payments', { module: 'accounts' }),
          step('ledger', '2', 'Encounter Ledger', 'patient-ledger-payments', { module: 'accounts' }),
          step('pay', '3', 'Patient Payments', 'receive-patient-payment', { module: 'accounts' }),
        ],
      },
      {
        type: 'row',
        items: [
          step('rules', '4', 'Accounts Rules (Easy Guide)', 'accounts-rules-guide', { module: 'accounts', accent: true }),
          step('cash', '5', 'Cash / Bank', 'accounts-rules-guide', { module: 'accounts' }),
          step('gl', '6', 'General Ledger', 'accounts-overview', { module: 'accounts' }),
          step('tb', '7', 'Trial Balance', 'accounts-overview', { module: 'accounts' }),
        ],
      },
      {
        type: 'parallel',
        items: [
          step('daily', '8A', 'Daily Collections', 'accounts-overview', { module: 'accounts', branch: true }),
          step('dept', '8B', 'Department Performance', 'department-performance-report', { module: 'accounts', branch: true }),
          step('doc', '8C', 'Doctor Performance', 'department-performance-report', { module: 'accounts', branch: true }),
          step('pl', '8D', 'Profit & Loss', 'accounts-overview', { module: 'accounts', branch: true }),
        ],
      },
      {
        type: 'row',
        items: [
          step('recon', '9', 'Reconciliation / Post missing journals', 'accounts-rules-guide', {
            module: 'accounts',
            accent: true,
          }),
          step('reports', '10', 'Preview / PDF / Excel / Print', 'accounts-overview', { module: 'accounts' }),
        ],
      },
    ],
    mobileSteps: [],
  },
};

function buildMobileSteps(blocks: HelpWorkflowBlock[]): HelpWorkflowStep[] {
  const steps: HelpWorkflowStep[] = [];
  for (const block of blocks) {
    if (block.type === 'row' || block.type === 'parallel') {
      block.items.forEach((item) => steps.push(item));
    } else if (block.type === 'branch') {
      block.items.forEach((item) => steps.push(item));
    } else if (block.type === 'note') {
      steps.push({
        id: `note-${steps.length}`,
        label: block.text,
        muted: true,
      });
    } else if (block.type === 'heading') {
      steps.push({
        id: `heading-${steps.length}`,
        label: block.text,
        accent: true,
      });
    }
  }
  return steps;
}

export const VALID_HELP_ROLE_KEYS = new Set<HelpRoleKey>([
  '',
  'owner',
  'receptionist',
  'doctor',
  'ward',
  'laboratory',
  'pharmacy',
  'accountant',
]);

for (const roleKey of VALID_HELP_ROLE_KEYS) {
  HELP_ROLE_WORKFLOWS[roleKey].mobileSteps = buildMobileSteps(HELP_ROLE_WORKFLOWS[roleKey].desktopBlocks);
}
