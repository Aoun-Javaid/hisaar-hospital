import { Routes } from '@angular/router';
import { LayoutComponent } from '../../layout/layout.component';
import { SignupComponent } from './pages/signup/signup.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DoctorDashboardComponent } from './doctor-dashboard/doctor-dashboard.component';
import { SettingsComponent } from './settings/settings.component';
import { ChangePasswordComponent } from './change-password/change-password.component';
import { InvoicesComponent } from './payments/invoices/invoices.component';
import { InvoiceDetailComponent } from './payments/invoices/invoice-detail/invoice-detail.component';
import { PaymentsComponent } from './payments/payments.component';
import { AddpaymentsComponent } from './payments/addpayments/addpayments.component';
import { EncounterLedgerComponent } from './payments/encounter-ledger/encounter-ledger.component';
import { DepartmentComponent } from './department/department.component';
import { OurStaffComponent } from './our-staff/our-staff.component';
import { AllotedRoomsComponent } from './room-allotment/alloted-rooms/alloted-rooms.component';
import { AddAllotmentComponent } from './room-allotment/add-allotment/add-allotment.component';
import { RoomAllotmentComponent } from './room-allotment/room-allotment.component';
import { AllPatientsComponent } from './patients/all-patients/all-patients.component';
import { AddPatientComponent } from './patients/add-patient/add-patient.component';
import { PatientProfileComponent } from './patients/patient-profile/patient-profile.component';
import { PatientInvoicesComponent } from './patients/patient-invoices/patient-invoices.component';
import { AppointmentComponent } from './appointment/appointment.component';
import { AllDoctorsComponent } from './doctors/all-doctors/all-doctors.component';
import { AddDoctorsComponent } from './doctors/add-doctors/add-doctors.component';
import { DoctorsProfileComponent } from './doctors/doctors-profile/doctors-profile.component';
import { DoctorsScheduleComponent } from './doctors/doctors-schedule/doctors-schedule.component';
import { authGuard } from '../auth/auth.guard';
import { doctorOrPermissionGuard, doctorRoleGuard, hospitalPlatformListGuard, hospitalPlatformManageGuard, roleGuard } from '../auth/role.guard';
import type { AccessRequirement } from '../auth/access-control';
import { HOSPITAL_SETUP_ACCESS } from '../auth/hospital-scope';
import { UsersComponent } from './User/users/users.component';
import { CreateUserComponent } from './User/create-user/create-user.component';
import { HospitalsComponent } from './hospitals/hospitals.component';
import { CreateHospitalComponent } from './create-hospital/create-hospital.component';
import { RolesComponent } from './roles/roles.component';
import { CareRecordsComponent } from './care-records/care-records.component';
import { PrescriptionComponent } from './prescription/prescription.component';
import { PhysiotherapyTreatmentPlanComponent } from './prescription/physiotherapy-treatment-plan.component';
import { CreatedPrescriptionsComponent } from './prescription/created-prescriptions.component';
import { AuditLogsComponent } from './audit-logs/audit-logs.component';
import { AccountsPageComponent } from './accounts/accounts-page.component';
import { DoctorPerformancePageComponent } from './accounts/doctor-performance-page.component';
import { DepartmentPerformancePageComponent } from './accounts/department-performance-page.component';
import { HelpCenterComponent } from './help/help-center.component';
import { NotificationsPageComponent } from './notifications/notifications-page.component';

const HOSPITAL_DASHBOARD_ACCESS = ['hospital_dashboard.read'];
const DOCTOR_READ_ACCESS = ['doctors.read'];
const DOCTOR_MANAGE_ACCESS = ['doctors.create', 'doctors.update'];
const APPOINTMENT_ACCESS = ['appointments.read'];
const PATIENT_READ_ACCESS = ['patients.read'];
const PATIENT_MANAGE_ACCESS = ['patients.create', 'patients.update'];
const BILL_READ_ACCESS: AccessRequirement = {
  any: ['encounters.read', 'ledger_payments.read', 'bills.read'],
};
const BILL_MANAGE_ACCESS: AccessRequirement = {
  any: ['ledger_payments.create', 'bills.create', 'bills.update_payment'],
};
const ACCOUNTS_ACCESS: AccessRequirement = {
  any: ['accounts.read', 'accounts.reports.read', 'accounts.journals.read'],
};
const ACCOUNTS_JOURNAL_ACCESS = ['accounts.journals.read', 'accounts.journals.create'];
const ACCOUNTS_RECONCILIATION_ACCESS = ['financial_reconciliation.read'];
const ACCOUNTS_PATIENT_PROFITABILITY_ACCESS = ['accounts.patient_profitability.read'];
const PURCHASE_ACCESS = ['purchases.read'];
const DEPARTMENT_ACCESS = ['departments.read'];
const ROOM_ACCESS = ['rooms.read', 'rooms.create', 'rooms.update'];
const ROOM_ALLOTMENT_READ_ACCESS = ['room_allotments.read'];
const ROOM_ALLOTMENT_MANAGE_ACCESS = {
  all: ['room_allotments.create', 'rooms.read', 'patients.read'],
};
const USER_READ_ACCESS = ['users.read'];
const USER_MANAGE_ACCESS = ['users.create', 'users.update'];
const HOSPITAL_READ_ACCESS = ['hospitals.read'];
const HOSPITAL_MANAGE_ACCESS = ['hospitals.create', 'hospitals.update'];
const ROLE_READ_ACCESS = ['roles.read'];
const AUDIT_LOGS_ACCESS = ['audit_logs.read'];
const HISTORY_ACCESS = ['patients_history.read', 'patients_history.create'];
const PRESCRIPTION_ACCESS = ['prescriptions.read', 'prescriptions.create'];
const PRESCRIPTION_READ_ACCESS = ['prescriptions.read'];
const PHARMACY_ACCESS = ['products.read'];
const PHARMACY_CUSTOMERS_ACCESS = ['customers.read'];
const PHARMACY_SUPPLIERS_ACCESS = ['suppliers.read'];
const PHARMACY_INVENTORY_ACCESS = ['inventory.read'];
const PHARMACY_STOCK_MOVEMENTS_ACCESS = ['stock_movements.read'];
const PHARMACY_SALES_ACCESS = ['sales.read'];
const PHARMACY_TRANSFERS_ACCESS = ['transfers.read'];
const PHARMACY_RETURNS_ACCESS = ['returns.read'];
const PHARMACY_PAYMENTS_ACCESS = ['payments.read'];
const PHARMACY_REGISTER_ACCESS = {
  any: ['register_sessions.read', 'register_sessions.admin_read'],
};
const PHARMACY_EXPENSES_ACCESS = ['expenses.read'];
const REPORT_ACCESS = {
  any: ['reports.read', 'sales.read', 'products.read', 'register_sessions.read'],
};
const PHARMACY_POS_ACCESS = {
  all: [
    'sales.create',
    'sales.read',
    'products.read',
    'register_sessions.open',
    'register_sessions.read',
    'register_sessions.close',
  ],
};
const LAB_ORDER_READ_ACCESS = ['lab_orders.read'];
const LAB_ORDER_CREATE_ACCESS = ['lab_orders.create'];
const LAB_ORDER_UPDATE_ACCESS = ['lab_orders.update'];
const LAB_CATALOG_READ_ACCESS = ['lab_tests.read'];
const LAB_SETTINGS_ACCESS: AccessRequirement = {
  any: ['lab_tests.update'],
};
const LAB_ACCESS = LAB_ORDER_READ_ACCESS;
const WARD_ADMIN_ACCESS = ['ward.read'];

const wardModuleRoute = (path: string, title: string, wardModuleKey: string) => ({
  path,
  loadComponent: () =>
    import('./ward/ward-module-page.component').then((m) => m.WardModulePageComponent),
  data: { title: `Hisaar360 Hospital Management System | ${title}`, wardModuleKey },
  canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
});

export const clientRoutes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        component: DashboardComponent,
        data: { title: 'Hisaar360 Hospital Management System | Dashboard' },
        canActivate: [roleGuard(HOSPITAL_DASHBOARD_ACCESS)],
      },
      {
        path: 'help',
        component: HelpCenterComponent,
        data: { title: 'Hisaar360 HMS Help Center' },
      },
      {
        path: 'help/:slug',
        component: HelpCenterComponent,
        data: { title: 'Hisaar360 HMS Help Center' },
      },
      {
        path: 'notifications',
        component: NotificationsPageComponent,
        data: { title: 'Hisaar360 Hospital Management System | Notifications' },
      },
      {
        path: 'doctor-dashboard',
        component: DoctorDashboardComponent,
        data: { title: 'Hisaar360 Hospital Management System | Doctor Dashboard' },
        canActivate: [doctorRoleGuard],
      },
      {
        path: 'app-inbox',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'app-chat',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'chartelement',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'todolist',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'filemanager',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'contacts',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'blog',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'social',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'settings',
        component: SettingsComponent,
        data: { title: 'Hisaar360 Hospital Management System | Settings' },
      },
      {
        path: 'change-password',
        component: ChangePasswordComponent,
        data: { title: 'Hisaar360 Hospital Management System | Change Password' },
      },
      {
        path: 'composeemail',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'composeemail/composeemail-details',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'doctorschedule/events',
        pathMatch: 'full',
        redirectTo: 'doctors-schedule',
      },
      {
        path: 'accounts',
        pathMatch: 'full',
        redirectTo: 'accounts/dashboard',
      },
      ...[
        'dashboard',
        'chart-of-accounts',
        'general-ledger',
        'journal',
        'cash-book',
        'bank-book',
        'expenses',
        'receivables',
        'payables',
        'trial-balance',
        'profit-loss',
        'daily-collections',
        'patient-profitability',
        'audit',
        'reconciliation',
      ].map((accountsView) => ({
        path: `accounts/${accountsView}`,
        component: AccountsPageComponent,
        data: {
          title: `Hisaar360 Hospital Management System | Accounts`,
          accountsView,
        },
        canActivate: [
          roleGuard(
            accountsView === 'journal'
              ? ACCOUNTS_JOURNAL_ACCESS
              : accountsView === 'reconciliation'
                ? ACCOUNTS_RECONCILIATION_ACCESS
                : accountsView === 'patient-profitability'
                  ? ACCOUNTS_PATIENT_PROFITABILITY_ACCESS
                  : ACCOUNTS_ACCESS
          ),
        ],
      })),
      {
        path: 'accounts/doctor-performance',
        component: DoctorPerformancePageComponent,
        data: {
          title: 'Hisaar360 Hospital Management System | Accounts',
        },
        canActivate: [roleGuard(ACCOUNTS_ACCESS)],
      },
      {
        path: 'accounts/department-performance',
        component: DepartmentPerformancePageComponent,
        data: {
          title: 'Hisaar360 Hospital Management System | Department Performance',
        },
        canActivate: [roleGuard(ACCOUNTS_ACCESS)],
      },
      {
        path: 'payments',
        component: PaymentsComponent,
        data: { title: 'Hisaar360 Hospital Management System | Patient Payments' },
        canActivate: [roleGuard(BILL_READ_ACCESS)],
      },
      {
        path: 'payments/addpayment',
        component: AddpaymentsComponent,
        data: { title: 'Hisaar360 Hospital Management System | AddPayments' },
        canActivate: [roleGuard(BILL_MANAGE_ACCESS)],
      },
      {
        path: 'payments/ledger',
        component: EncounterLedgerComponent,
        data: { title: 'Hisaar360 Hospital Management System | Patient Ledger' },
        canActivate: [roleGuard(BILL_READ_ACCESS)],
      },
      {
        path: 'payments/invoices',
        component: InvoicesComponent,
        data: { title: 'Hisaar360 Hospital Management System | Invoices' },
        canActivate: [roleGuard(BILL_READ_ACCESS)],
      },
      {
        path: 'payments/invoices/invoice-detail/:id',
        component: InvoiceDetailComponent,
        data: { title: 'Hisaar360 Hospital Management System | InvoiceDetail' },
        canActivate: [roleGuard(BILL_READ_ACCESS)],
      },
      {
        path: 'payments/invoices/invoice-detail',
        pathMatch: 'full',
        redirectTo: 'payments/invoices',
      },

      {
        path: 'departments',
        component: DepartmentComponent,
        data: { title: 'Hisaar360 Hospital Management System | Departments' },
        canActivate: [roleGuard(DEPARTMENT_ACCESS)],
      },
      {
        path: 'hospital-setup',
        loadComponent: () =>
          import('./hospital-setup/hospital-setup.component').then((m) => m.HospitalSetupComponent),
        data: { title: 'Hisaar360 Hospital Management System | Hospital Setup' },
        canActivate: [roleGuard(HOSPITAL_SETUP_ACCESS)],
      },
      {
        path: 'hospital-setup/treatments-procedures',
        loadComponent: () =>
          import('./treatments-procedures/treatments-procedures.component').then(
            (m) => m.TreatmentsProceduresComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Treatments & Procedures' },
        canActivate: [
          roleGuard({
            any: [
              'treatment_catalog.read',
              'treatment_catalog.create',
              'treatment_catalog.update',
              'hospitals.update',
              'departments.update',
              '*',
            ],
          }),
        ],
      },
      {
        path: 'operations',
        loadComponent: () =>
          import('./operations/operation-calendar.component').then((m) => m.OperationCalendarComponent),
        data: { title: 'Hisaar360 Hospital Management System | Operation Calendar' },
        canActivate: [roleGuard({ any: ['operations.read', 'operations.read_all', '*'] })],
      },
      {
        path: 'operations/calendar',
        pathMatch: 'full',
        redirectTo: 'operations',
      },
      {
        path: 'our-centers',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'our-staff',
        pathMatch: 'full',
        redirectTo: 'ward/nurses-staff',
      },
      {
        path: 'room-allotment',
        component: RoomAllotmentComponent,
        data: { title: 'Hisaar360 Hospital Management System | RoomAllotment' },
        canActivate: [roleGuard(ROOM_ACCESS)],
      },
      {
        path: 'room-allotment/alloted-rooms',
        component: AllotedRoomsComponent,
        data: { title: 'Hisaar360 Hospital Management System | AllotedRooms' },
        canActivate: [roleGuard(ROOM_ALLOTMENT_READ_ACCESS)],
      },
      {
        path: 'room-allotment/add-alloted-rooms',
        component: AddAllotmentComponent,
        data: { title: 'Hisaar360 Hospital Management System | Add-Allotment-Rooms' },
        canActivate: [roleGuard(ROOM_ALLOTMENT_MANAGE_ACCESS)],
      },
      {
        path: 'patients',
        pathMatch: 'full',
        redirectTo: 'patients/all-patients',
      },
      {
        path: 'patients/all-patients',
        component: AllPatientsComponent,
        data: { title: 'Hisaar360 Hospital Management System | AllPatients' },
        canActivate: [roleGuard(PATIENT_READ_ACCESS)],
      },
      {
        path: 'patients/add-patient',
        component: AddPatientComponent,
        data: { title: 'Hisaar360 Hospital Management System | AddPatient' },
        canActivate: [roleGuard(PATIENT_MANAGE_ACCESS)],
      },
      {
        path: 'patients/patient-profile/:id',
        component: PatientProfileComponent,
        data: { title: 'Hisaar360 Hospital Management System | PatientProfile' },
        canActivate: [roleGuard(PATIENT_READ_ACCESS)],
      },
      {
        path: 'patients/patient-profile',
        pathMatch: 'full',
        redirectTo: 'patients/all-patients',
      },
      {
        path: 'patients/patient-invoices/:id',
        component: PatientInvoicesComponent,
        data: { title: 'Hisaar360 Hospital Management System | PatientInvoices' },
        canActivate: [roleGuard(BILL_READ_ACCESS)],
      },
      {
        path: 'patients/patient-invoices',
        pathMatch: 'full',
        redirectTo: 'patients/all-patients',
      },
      {
        path: 'appointments',
        component: AppointmentComponent,
        data: { title: 'Hisaar360 Hospital Management System | Appointment' },
        canActivate: [roleGuard(APPOINTMENT_ACCESS)],
      },
      {
        path: 'clinical-records',
        component: CareRecordsComponent,
        data: {
          title: 'Hisaar360 Hospital Management System | Clinical Records',
          pageTitle: 'Clinical Records',
          pageSubtitle: 'Doctor diagnosis, old notes, and follow-up entries',
          recordType: 'clinical',
        },
        canActivate: [roleGuard(HISTORY_ACCESS)],
      },
      {
        path: 'laboratory',
        loadComponent: () =>
          import('./laboratory/lab-dashboard.component').then((m) => m.LabDashboardComponent),
        data: { title: 'Hisaar360 Hospital Management System | Laboratory' },
        canActivate: [roleGuard(LAB_ACCESS)],
      },
      {
        path: 'laboratory/create-order',
        loadComponent: () =>
          import('./laboratory/lab-order-create.component').then((m) => m.LabOrderCreateComponent),
        data: { title: 'Hisaar360 Hospital Management System | Create Lab Order' },
        canActivate: [roleGuard(LAB_ORDER_CREATE_ACCESS)],
      },
      {
        path: 'laboratory/catalog',
        loadComponent: () =>
          import('./laboratory/lab-test-catalog.component').then((m) => m.LabTestCatalogComponent),
        data: { title: 'Hisaar360 Hospital Management System | Test Catalog' },
        canActivate: [roleGuard(LAB_CATALOG_READ_ACCESS)],
      },
      {
        path: 'laboratory/settings',
        loadComponent: () =>
          import('./laboratory/lab-settings.component').then((m) => m.LabSettingsComponent),
        data: { title: 'Hisaar360 Hospital Management System | Laboratory Settings' },
        canActivate: [roleGuard(LAB_SETTINGS_ACCESS)],
      },
      {
        path: 'laboratory/orders/:id/edit',
        loadComponent: () =>
          import('./laboratory/lab-order-create.component').then((m) => m.LabOrderCreateComponent),
        data: { title: 'Hisaar360 Hospital Management System | Edit Lab Order' },
        canActivate: [roleGuard(LAB_ORDER_UPDATE_ACCESS)],
      },
      {
        path: 'laboratory/orders/:id',
        loadComponent: () =>
          import('./laboratory/lab-order-detail.component').then((m) => m.LabOrderDetailComponent),
        data: { title: 'Hisaar360 Hospital Management System | Lab Order' },
        canActivate: [roleGuard(LAB_ORDER_READ_ACCESS)],
      },
      {
        path: 'laboratory/created-reports',
        loadComponent: () =>
          import('./laboratory/created-lab-reports.component').then((m) => m.CreatedLabReportsComponent),
        data: { title: 'Hisaar360 Hospital Management System | Created Lab Reports' },
        canActivate: [roleGuard(LAB_ORDER_READ_ACCESS)],
      },
      {
        path: 'laboratory/records',
        component: CareRecordsComponent,
        data: {
          title: 'Hisaar360 Hospital Management System | Laboratory Records',
          pageTitle: 'Laboratory Records',
          pageSubtitle: 'Legacy free-text laboratory notes',
          recordType: 'laboratory',
        },
        canActivate: [roleGuard(LAB_ORDER_READ_ACCESS)],
      },
      {
        path: 'ward',
        redirectTo: 'ward/dashboard',
        pathMatch: 'full',
      },
      {
        path: 'ward/dashboard',
        loadComponent: () =>
          import('./ward/ward-dashboard.component').then((m) => m.WardDashboardComponent),
        data: { title: 'Hisaar360 Hospital Management System | Ward Admin Dashboard' },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      {
        path: 'ward/patient-detail/:admissionId',
        loadComponent: () =>
          import('./ward/ward-patient-detail.component').then((m) => m.WardPatientDetailComponent),
        data: { title: 'Hisaar360 Hospital Management System | Patient Detail' },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      {
        path: 'ward/bed-management',
        loadComponent: () =>
          import('./ward/ward-bed-management.component').then((m) => m.WardBedManagementComponent),
        data: { title: 'Hisaar360 Hospital Management System | Bed Management' },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      {
        path: 'ward/patient-list',
        loadComponent: () =>
          import('./ward/ward-patient-list.component').then((m) => m.WardPatientListComponent),
        data: { title: 'Hisaar360 Hospital Management System | Patient List' },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      wardModuleRoute('ward/admissions', 'Admissions', 'admissions'),
      wardModuleRoute('ward/nursing-care', 'Nursing Care', 'nursing-care'),
      wardModuleRoute('ward/mar', 'MAR / Medications', 'mar'),
      wardModuleRoute('ward/drips-iv', 'Drips / IV Fluids', 'drips-iv'),
      wardModuleRoute('ward/vitals', 'Vitals & Observations', 'vitals'),
      wardModuleRoute('ward/io-chart', 'I/O Chart', 'io-chart'),
      wardModuleRoute('ward/orders-services', 'Orders & Services', 'orders-services'),
      wardModuleRoute('ward/shift-handover', 'Shift Handover', 'shift-handover'),
      {
        path: 'ward/nurses-staff',
        component: OurStaffComponent,
        data: { title: 'Hisaar360 Hospital Management System | Nurses & Staff' },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      wardModuleRoute('ward/inventory', 'Ward Inventory', 'inventory'),
      wardModuleRoute('ward/reports', 'Ward Reports', 'reports'),
      {
        path: 'ward/duty-roster',
        loadComponent: () =>
          import('./ward/ward-duty-roster.component').then((m) => m.WardDutyRosterComponent),
        data: { title: 'Hisaar360 Hospital Management System | Ward Duty Roster' },
        canActivate: [roleGuard(['ward.roster.read'])],
      },
      {
        path: 'ward/nursery',
        loadComponent: () =>
          import('./ward/nursery-dashboard.component').then((m) => m.NurseryDashboardComponent),
        data: { title: 'Hisaar360 Hospital Management System | Nursery / Newborn' },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      {
        path: 'ward/nursery/birth-records',
        loadComponent: () =>
          import('./ward/birth-records-dashboard.component').then((m) => m.BirthRecordsDashboardComponent),
        data: { title: 'Hisaar360 Hospital Management System | Birth Records' },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      {
        path: 'ward/nursery/:id',
        loadComponent: () =>
          import('./ward/nursery-newborn-detail.component').then((m) => m.NurseryNewbornDetailComponent),
        data: { title: 'Hisaar360 Hospital Management System | Newborn Profile' },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      {
        path: 'ward-admin',
        component: CareRecordsComponent,
        data: {
          title: 'Hisaar360 Hospital Management System | Ward Admin Notes',
          pageTitle: 'Ward Admin Notes',
          pageSubtitle: 'Admitted patients, drip notes, and ward treatment updates',
          recordType: 'ward',
        },
        canActivate: [roleGuard(WARD_ADMIN_ACCESS)],
      },
      {
        path: 'prescriptions/physiotherapy',
        component: PhysiotherapyTreatmentPlanComponent,
        data: { title: 'Hisaar360 Hospital Management System | Physiotherapy Treatment Plan' },
        canActivate: [roleGuard(PRESCRIPTION_ACCESS)],
      },
      {
        path: 'prescriptions/created',
        component: CreatedPrescriptionsComponent,
        data: { title: 'Hisaar360 Hospital Management System | Created Prescriptions' },
        canActivate: [roleGuard(PRESCRIPTION_READ_ACCESS)],
      },
      {
        path: 'prescriptions',
        component: PrescriptionComponent,
        data: { title: 'Hisaar360 Hospital Management System | Prescriptions' },
        canActivate: [roleGuard(PRESCRIPTION_ACCESS)],
      },
      {
        path: 'pharmacy/products',
        loadComponent: () =>
          import('./pharmacy-products/pharmacy-products.component').then(
            (m) => m.PharmacyProductsComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Product Management' },
        canActivate: [roleGuard(PHARMACY_ACCESS)],
      },
      {
        path: 'pharmacy/products/bulk',
        loadComponent: () =>
          import('./bulk-product-import/bulk-product-import.component').then(
            (m) => m.BulkProductImportComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Add Bulk Medicines' },
        canActivate: [roleGuard(['products.create'])],
      },
      {
        path: 'pharmacy/customers',
        loadComponent: () =>
          import('./pharmacy-customers/pharmacy-customers.component').then(
            (m) => m.PharmacyCustomersComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Customers' },
        canActivate: [roleGuard(PHARMACY_CUSTOMERS_ACCESS)],
      },
      {
        path: 'pharmacy/suppliers',
        loadComponent: () =>
          import('./pharmacy-suppliers/pharmacy-suppliers.component').then(
            (m) => m.PharmacySuppliersComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Suppliers' },
        canActivate: [roleGuard(PHARMACY_SUPPLIERS_ACCESS)],
      },
      {
        path: 'pharmacy/inventory',
        loadComponent: () =>
          import('./pharmacy-inventory/pharmacy-inventory.component').then(
            (m) => m.PharmacyInventoryComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Inventory' },
        canActivate: [roleGuard(PHARMACY_INVENTORY_ACCESS)],
      },
      {
        path: 'pharmacy/stock-movements',
        loadComponent: () =>
          import('./pharmacy-stock-movements/pharmacy-stock-movements.component').then(
            (m) => m.PharmacyStockMovementsComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Stock Movements' },
        canActivate: [roleGuard(PHARMACY_STOCK_MOVEMENTS_ACCESS)],
      },
      {
        path: 'pharmacy/transfers',
        loadComponent: () =>
          import('./pharmacy-transfers/pharmacy-transfers.component').then(
            (m) => m.PharmacyTransfersComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Transfers' },
        canActivate: [roleGuard(PHARMACY_TRANSFERS_ACCESS)],
      },
      {
        path: 'pharmacy/sales',
        loadComponent: () =>
          import('./pharmacy-sales/pharmacy-sales.component').then((m) => m.PharmacySalesComponent),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Sales' },
        canActivate: [roleGuard(PHARMACY_SALES_ACCESS)],
      },
      {
        path: 'pharmacy/sales/:id',
        loadComponent: () =>
          import('./pharmacy-sale-detail/pharmacy-sale-detail.component').then(
            (m) => m.PharmacySaleDetailComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Sale Detail' },
        canActivate: [roleGuard(PHARMACY_SALES_ACCESS)],
      },
      {
        path: 'pharmacy/pos',
        loadComponent: () =>
          import('./pharmacy-pos/pharmacy-pos.component').then((m) => m.PharmacyPosComponent),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy POS' },
        canActivate: [roleGuard(PHARMACY_POS_ACCESS)],
      },
      {
        path: 'pharmacy/returns/sales',
        loadComponent: () =>
          import('./pharmacy-sales-returns/pharmacy-sales-returns.component').then(
            (m) => m.PharmacySalesReturnsComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Sales Returns' },
        canActivate: [roleGuard(PHARMACY_RETURNS_ACCESS)],
      },
      {
        path: 'pharmacy/sales-returns',
        pathMatch: 'full',
        redirectTo: 'pharmacy/returns/sales',
      },
      {
        path: 'pharmacy/payments',
        loadComponent: () =>
          import('./pharmacy-payments/pharmacy-payments.component').then(
            (m) => m.PharmacyPaymentsComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Payments' },
        canActivate: [roleGuard(PHARMACY_PAYMENTS_ACCESS)],
      },
      {
        path: 'pharmacy/register-sessions',
        loadComponent: () =>
          import('./pharmacy-register-sessions/pharmacy-register-sessions.component').then(
            (m) => m.PharmacyRegisterSessionsComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Register Sessions' },
        canActivate: [roleGuard(PHARMACY_REGISTER_ACCESS)],
      },
      {
        path: 'pharmacy/register-sessions/:id',
        loadComponent: () =>
          import('./pharmacy-register-session-detail/pharmacy-register-session-detail.component').then(
            (m) => m.PharmacyRegisterSessionDetailComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Register Session Detail' },
        canActivate: [roleGuard(PHARMACY_REGISTER_ACCESS)],
      },
      {
        path: 'pharmacy/purchases/create',
        loadComponent: () =>
          import('./pharmacy-purchases/pharmacy-purchases.component').then(
            (m) => m.PharmacyPurchasesComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Create Purchase', purchasesView: 'create' },
        canActivate: [roleGuard(PURCHASE_ACCESS)],
      },
      {
        path: 'pharmacy/purchases/:id',
        loadComponent: () =>
          import('./pharmacy-purchases/pharmacy-purchases.component').then(
            (m) => m.PharmacyPurchasesComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Purchase Detail', purchasesView: 'detail' },
        canActivate: [roleGuard(PURCHASE_ACCESS)],
      },
      {
        path: 'pharmacy/purchases',
        loadComponent: () =>
          import('./pharmacy-purchases/pharmacy-purchases.component').then(
            (m) => m.PharmacyPurchasesComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Purchases', purchasesView: 'list' },
        canActivate: [roleGuard(PURCHASE_ACCESS)],
      },
      {
        path: 'pharmacy/purchase-returns',
        loadComponent: () =>
          import('./pharmacy-purchases/pharmacy-purchases.component').then(
            (m) => m.PharmacyPurchasesComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Purchase Returns', purchasesView: 'returns' },
        canActivate: [roleGuard(PURCHASE_ACCESS)],
      },
      {
        path: 'pharmacy/expenses',
        loadComponent: () =>
          import('./pharmacy-expenses/pharmacy-expenses.component').then(
            (m) => m.PharmacyExpensesComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Expenses' },
        canActivate: [roleGuard(PHARMACY_EXPENSES_ACCESS)],
      },
      {
        path: 'pharmacy/reports',
        loadComponent: () =>
          import('./pos-reports/pos-reports.component').then((m) => m.PosReportsComponent),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy Reports' },
        canActivate: [roleGuard(REPORT_ACCESS)],
      },
      {
        path: 'pharmacy/ward-settlements',
        loadComponent: () =>
          import('./pharmacy-ward-settlements/pharmacy-ward-settlements.component').then(
            (m) => m.PharmacyWardSettlementsComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Ward Settlements' },
        canActivate: [roleGuard(['pharmacy.ward_settlements.read'])],
      },
      {
        path: 'pharmacy/ward-requests',
        loadComponent: () =>
          import('./pharmacy-ward-requests/pharmacy-ward-requests.component').then(
            (m) => m.PharmacyWardRequestsComponent
          ),
        data: { title: 'Hisaar360 Hospital Management System | Ward Requests' },
        canActivate: [roleGuard(['pharmacy.ward_requests.read'])],
      },
      {
        path: 'pos-reports',
        loadComponent: () =>
          import('./pos-reports/pos-reports.component').then((m) => m.PosReportsComponent),
        data: { title: 'Hisaar360 Hospital Management System | POS Reports' },
        canActivate: [roleGuard(REPORT_ACCESS)],
      },
      {
        path: 'pharmacy',
        loadComponent: () =>
          import('./pharmacy/pharmacy.component').then((m) => m.PharmacyComponent),
        data: { title: 'Hisaar360 Hospital Management System | Pharmacy' },
        canActivate: [roleGuard(PHARMACY_ACCESS)],
      },
      {
        path: 'doctors',
        pathMatch: 'full',
        redirectTo: 'all-doctors',
      },
      {
        path: 'all-doctors',
        component: AllDoctorsComponent,
        data: { title: 'Hisaar360 Hospital Management System | AllDoctors' },
        canActivate: [roleGuard(DOCTOR_READ_ACCESS)],
      },
      {
        path: 'add-doctors',
        component: AddDoctorsComponent,
        data: { title: 'Hisaar360 Hospital Management System | AddDoctors' },
        canActivate: [roleGuard(DOCTOR_MANAGE_ACCESS)],
      },
      {
        path: 'doctors-profile/:id',
        component: DoctorsProfileComponent,
        data: { title: 'Hisaar360 Hospital Management System | DoctorsProfile' },
        canActivate: [roleGuard(DOCTOR_READ_ACCESS)],
      },
      {
        path: 'doctors-profile',
        pathMatch: 'full',
        redirectTo: 'all-doctors',
      },
      {
        path: 'doctors-schedule',
        component: DoctorsScheduleComponent,
        data: { title: 'Hisaar360 Hospital Management System | DoctorsSchedule' },
        canActivate: [doctorOrPermissionGuard(DOCTOR_READ_ACCESS)],
      },
      {
        path: 'covid-19',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },

      {
        path: 'users',
        component: UsersComponent,
        data: { title: 'Hisaar360 Hospital Management System | Users' },
        canActivate: [roleGuard(USER_READ_ACCESS)],
      },

      {
        path: 'create-user',
        component: CreateUserComponent,
        data: { title: 'Hisaar360 Hospital Management System | Add Users' },
        canActivate: [roleGuard(USER_MANAGE_ACCESS)],
      },
      {
        path: 'users/:id/edit',
        component: CreateUserComponent,
        data: { title: 'Hisaar360 Hospital Management System | Edit User' },
        canActivate: [roleGuard(USER_MANAGE_ACCESS)],
      },
      {
        path: 'hospitals',
        component: HospitalsComponent,
        data: { title: 'Hisaar360 Hospital Management System | Hospitals' },
        canActivate: [hospitalPlatformListGuard],
      },
      {
        path: 'create-hospital',
        component: CreateHospitalComponent,
        data: { title: 'Hisaar360 Hospital Management System | Add Hospital' },
        canActivate: [hospitalPlatformManageGuard],
      },
      {
        path: 'roles',
        component: RolesComponent,
        data: { title: 'Hisaar360 Hospital Management System | Hospital Roles' },
        canActivate: [roleGuard(ROLE_READ_ACCESS)],
      },
      {
        path: 'audit-logs',
        component: AuditLogsComponent,
        data: { title: 'Hisaar360 Hospital Management System | Audit Logs' },
        canActivate: [roleGuard(AUDIT_LOGS_ACCESS)],
      },
    ],
  },

  {
    path: 'signup',
    component: SignupComponent,
    data: { title: 'Hisaar360 Hospital Management System | Signup' },
  },
];
