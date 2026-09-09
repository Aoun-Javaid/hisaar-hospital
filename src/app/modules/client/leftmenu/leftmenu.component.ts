import {
  AfterViewInit,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { trigger, style, animate, transition } from '@angular/animations';
import { CommonModule } from '@angular/common';
import {
  hasPermission,
  hasRouteAccess,
  readStoredPermissions,
  resolveDefaultRoute,
} from '../../auth/access-control';
import { isCurrentLaboratoryEdition } from '../../auth/product-edition';
import {
  isClinicalModuleEnabled,
  isHospitalPatientsModuleAllowed,
  isHospitalSetupModuleAllowed,
  isLaboratoryModuleEnabled,
  isPharmacyModuleEnabled,
  isPharmacyWardIntegrationAllowed,
  isWardModuleEnabled,
} from '../../auth/hospital-modules';
import { canAccessHospitalSetup } from '../../auth/hospital-scope';
import { AuthService } from '../../../core/services/auth.service';
import { resolveAssetUrl } from '../../../core/utils/asset.util';
import { User } from '../../../shared/models/hospital.model';
@Component({
  selector: 'app-leftmenu',
  animations: [
    trigger('collapseExpand', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('200ms ease-out', style({ height: '*', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ height: 0, opacity: 0 })),
      ]),
    ]),
  ],
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './leftmenu.component.html',
  styleUrl: './leftmenu.component.scss',
})
export class LeftmenuComponent implements OnInit, AfterViewInit {
  isCollapsed = true;
  Pagecollapse = true;
  PaymentCollapsed = true;
  RoomCollapsed = true;
  PatientCollapsed = true;
  PharmacyCollapsed = true;
  PrescriptionCollapsed = true;
  LaboratoryCollapsed = true;
  WardCollapsed = true;
  SetupCollapsed = true;
  AccountsCollapsed = true;
  private router = inject(Router);
  private authService = inject(AuthService);
  role = localStorage.getItem('role') || '';
  permissions = readStoredPermissions();

  get isLaboratoryEdition(): boolean {
    return isCurrentLaboratoryEdition();
  }

  get isDoctor(): boolean {
    return this.normalizeRole(this.role) === 'doctor';
  }

  get isOwner(): boolean {
    return this.normalizeRole(this.role) === 'owner';
  }

  get isSuperAdmin(): boolean {
    return this.normalizeRole(this.role) === 'superadmin';
  }

  get canViewAllRoutes(): boolean {
    return this.hasWildcardPermission && !this.isLaboratoryEdition;
  }

  get canViewUsers(): boolean {
    return this.canViewAllRoutes || this.hasPermission('users.read');
  }

  get canViewHospitals(): boolean {
    return this.canViewAllRoutes || this.hasPermission('hospitals.read');
  }

  get canViewRoles(): boolean {
    return this.canViewAllRoutes || this.hasPermission('roles.read');
  }

  get canViewAuditLogs(): boolean {
    return this.canViewAllRoutes || this.hasPermission('audit_logs.read');
  }

  get canViewDashboard(): boolean {
    if (this.isLaboratoryEdition) {
      return false;
    }

    return this.canViewHospitalDashboard || this.canViewClinicalDashboard;
  }

  get canViewHospitalDashboard(): boolean {
    if (!isClinicalModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('hospital_dashboard.read');
  }

  get canViewClinicalDashboard(): boolean {
    if (!isClinicalModuleEnabled()) {
      return false;
    }

    return (
      this.isDoctor &&
      !this.canViewHospitalDashboard &&
      this.hasPermission('appointments.read') &&
      this.hasPermission('prescriptions.read')
    );
  }

  get dashboardRoute(): string {
    if (this.canViewHospitalDashboard) {
      return '/';
    }

    if (this.canViewClinicalDashboard) {
      return '/doctor-dashboard';
    }

    return this.homeRoute;
  }

  get homeRoute(): string {
    return resolveDefaultRoute(this.permissions, this.role);
  }

  get currentUser(): User | null {
    return (this.authService.currentUser() as User | null) || null;
  }

  get displayName(): string {
    return String(this.currentUser?.name || this.currentUser?.email || '').trim();
  }

  get roleLabel(): string {
    return String(this.currentUser?.role?.name || this.role || 'Staff').trim();
  }

  get photoUrl(): string {
    return resolveAssetUrl(this.currentUser?.photoUrl);
  }

  get canViewDoctors(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }
    return this.canViewAllRoutes || this.hasPermission('doctors.read');
  }

  get canViewOwnSchedule(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }
    return this.isDoctor;
  }

  get canManageDoctors(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      this.hasPermission('doctors.create') ||
      this.hasPermission('doctors.update')
    );
  }

  get canViewAppointments(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('appointments.read');
  }

  get canViewClinicalRecords(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('patients_history.read');
  }

  get canManageClinicalRecords(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      this.hasPermission('patients_history.create') ||
      this.hasPermission('patients_history.update')
    );
  }

  get canViewPrescriptions(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('prescriptions.read');
  }

  get canManagePrescriptions(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      this.hasPermission('prescriptions.create') ||
      this.hasPermission('prescriptions.update')
    );
  }

  get canViewPharmacy(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('products.read');
  }

  get canOpenPharmacyPos(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      (this.hasPermission('sales.create') &&
        this.hasPermission('sales.read') &&
        this.hasPermission('products.read') &&
        this.hasPermission('register_sessions.open') &&
        this.hasPermission('register_sessions.read') &&
        this.hasPermission('register_sessions.close'))
    );
  }

  get canViewPosReports(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      this.hasPermission('reports.read') ||
      this.hasPermission('sales.read') ||
      this.hasPermission('products.read') ||
      this.hasPermission('register_sessions.read')
    );
  }

  get canViewPharmacyCustomers(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('customers.read');
  }

  get canViewPharmacySuppliers(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('suppliers.read');
  }

  get canViewPharmacyInventory(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('inventory.read');
  }

  get canViewPharmacyStockMovements(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('stock_movements.read');
  }

  get canViewPharmacySales(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('sales.read');
  }

  get canViewPharmacyTransfers(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('transfers.read');
  }

  get canViewPharmacyReturns(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('returns.read');
  }

  get canViewPharmacyPayments(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('payments.read');
  }

  get canViewPharmacyRegisterSessions(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      this.hasPermission('register_sessions.read') ||
      this.hasPermission('register_sessions.admin_read')
    );
  }

  get canViewPharmacyExpenses(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('expenses.read');
  }

  get canViewPurchases(): boolean {
    if (this.isLaboratoryEdition || !isPharmacyModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('purchases.read');
  }

  get canViewAccounts(): boolean {
    return (
      this.canViewAllRoutes ||
      this.hasPermission('accounts.read') ||
      this.hasPermission('accounts.reports.read') ||
      this.hasPermission('accounts.journals.read')
    );
  }

  get canViewLaboratory(): boolean {
    if (!isLaboratoryModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      this.hasPermission('lab_orders.read') ||
      this.hasPermission('lab_tests.read')
    );
  }

  get canViewLabOrders(): boolean {
    return this.canViewAllRoutes || this.hasPermission('lab_orders.read');
  }

  get canViewLabCatalog(): boolean {
    return (
      this.canViewAllRoutes ||
      this.hasPermission('lab_tests.create') ||
      this.hasPermission('lab_tests.update') ||
      (this.hasPermission('lab_tests.read') && this.hasPermission('lab_orders.create'))
    );
  }

  get canCreateLaboratoryOrder(): boolean {
    return this.canViewAllRoutes || this.hasPermission('lab_orders.create');
  }

  get canManageLaboratorySettings(): boolean {
    return this.canViewAllRoutes || this.hasPermission('lab_tests.update');
  }

  get canViewWardAdmin(): boolean {
    if (this.isLaboratoryEdition || !isWardModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('ward.read');
  }

  get canViewPatients(): boolean {
    if (!isHospitalPatientsModuleAllowed()) {
      return false;
    }
    return this.canViewAllRoutes || this.hasPermission('patients.read');
  }

  get canManagePatients(): boolean {
    if (!isHospitalPatientsModuleAllowed()) {
      return false;
    }
    return (
      this.canViewAllRoutes ||
      this.hasPermission('patients.create') ||
      this.hasPermission('patients.update')
    );
  }

  get canViewRooms(): boolean {
    if (this.isLaboratoryEdition || !isWardModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('rooms.read');
  }

  get canManageRooms(): boolean {
    if (this.isLaboratoryEdition || !isWardModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      this.hasPermission('rooms.create') ||
      this.hasPermission('rooms.update')
    );
  }

  get canViewRoomAllotments(): boolean {
    if (this.isLaboratoryEdition || !isWardModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('room_allotments.read');
  }

  get canManageRoomAllotments(): boolean {
    if (this.isLaboratoryEdition || !isWardModuleEnabled()) {
      return false;
    }

    return (
      this.canViewAllRoutes ||
      (this.hasPermission('room_allotments.create') &&
        this.hasPermission('rooms.read') &&
        this.hasPermission('patients.read'))
    );
  }

  get canViewHospitalSetup(): boolean {
    if (this.isLaboratoryEdition || !isHospitalSetupModuleAllowed()) {
      return false;
    }
    return this.canViewAllRoutes || canAccessHospitalSetup();
  }

  get canViewTreatments(): boolean {
    if (this.isLaboratoryEdition || !isHospitalSetupModuleAllowed()) {
      return false;
    }
    return (
      this.canViewAllRoutes ||
      this.hasPermission('treatment_catalog.read') ||
      this.hasPermission('treatment_catalog.create') ||
      this.hasPermission('treatment_catalog.update') ||
      // Hospital admins who already manage setup — rates live under Setup
      this.hasPermission('hospitals.update') ||
      this.hasPermission('departments.update')
    );
  }

  get canViewOperations(): boolean {
    if (this.isLaboratoryEdition || !isWardModuleEnabled()) {
      return false;
    }
    return (
      this.canViewAllRoutes ||
      this.hasPermission('operations.read') ||
      this.hasPermission('operations.read_all')
    );
  }

  /** Doctors may have operations without ward.read — show a top-level Ops entry. */
  get canViewOperationsStandalone(): boolean {
    return this.canViewOperations && !this.canViewWardAdmin;
  }

  get canViewDepartments(): boolean {
    if (this.isLaboratoryEdition || !isClinicalModuleEnabled()) {
      return false;
    }

    return this.canViewAllRoutes || this.hasPermission('departments.read');
  }

  get canViewBilling(): boolean {
    if (!isHospitalPatientsModuleAllowed()) {
      return false;
    }
    return (
      this.canViewAllRoutes ||
      this.hasPermission('encounters.read') ||
      this.hasPermission('ledger_payments.read') ||
      this.hasPermission('bills.read')
    );
  }

  get canViewSettings(): boolean {
    return true;
  }

  get canManageBilling(): boolean {
    if (!isHospitalPatientsModuleAllowed()) {
      return false;
    }
    return (
      this.canViewAllRoutes ||
      this.hasPermission('ledger_payments.create') ||
      this.hasPermission('bills.create') ||
      this.hasPermission('bills.update_payment')
    );
  }

  get canViewPharmacyWardSettlements(): boolean {
    if (!isPharmacyWardIntegrationAllowed()) {
      return false;
    }
    return this.canViewAllRoutes || this.hasPermission('pharmacy.ward_settlements.read');
  }

  get canViewPharmacyWardRequests(): boolean {
    if (!isPharmacyWardIntegrationAllowed()) {
      return false;
    }
    return this.canViewAllRoutes || this.hasPermission('pharmacy.ward_requests.read');
  }

  get canViewHospitalAdministration(): boolean {
    return this.canViewHospitals || this.canViewUsers || this.canViewRoles || this.canViewAuditLogs;
  }

  get hasWildcardPermission(): boolean {
    return this.permissions.includes('*');
  }

  constructor() {
    this.initializeCollapsedStates();
  }

  ngOnInit(): void {
    this.authService.me({ force: true }).subscribe({
      next: () => this.refreshAccess(),
      error: () => this.refreshAccess(),
    });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.refreshAccess();
        this.closeSidebarOnMobile();
      }
    });
  }

  ngAfterViewInit() {
    this.applyThemeAndStyles();
  }

  private initializeCollapsedStates(): void {
    const url = this.router.url;
    this.isCollapsed = !url.includes('doctors');
    this.Pagecollapse = !url.includes('pages');
    this.PaymentCollapsed = !url.includes('payments');
    this.RoomCollapsed = !url.includes('room-allotment');
    this.PatientCollapsed = !url.includes('patients');
    this.PharmacyCollapsed = !(
      url.includes('pharmacy') || url.includes('pos-reports')
    );
    this.LaboratoryCollapsed = !url.includes('laboratory');
    this.WardCollapsed = !(url.includes('/ward') || url.includes('ward-admin') || url.includes('/operations'));
    this.SetupCollapsed = !url.includes('hospital-setup');
    this.AccountsCollapsed = !url.includes('/accounts');
  }

  private normalizeRole(role: string): string {
    return role
      .trim()
      .replace(/[\s_-]/g, '')
      .toLowerCase();
  }

  private refreshAccess(): void {
    this.role = localStorage.getItem('role') || '';
    this.permissions = readStoredPermissions();
  }

  private hasPermission(permission: string): boolean {
    return hasPermission(permission, this.permissions);
  }

  hasNavAccess(access: string | string[]): boolean {
    const requirement = Array.isArray(access) ? access : [access];
    return this.canViewAllRoutes || hasRouteAccess(requirement, this.permissions);
  }

  private applyThemeAndStyles(): void {
    setTimeout(() => {
      this.setThemeColor();
      this.applySidebarClass();
      this.applyGradientClasses();
    });
  }

  private setThemeColor(): void {
    document.getElementById('body')?.classList.add('theme-green');
  }

  private applySidebarClass(): void {
    const sidebar = document.getElementById('left-sidebar');
    const sidebarPref = sessionStorage.getItem('Sidebar');

    if (sidebarPref) {
      sidebar?.classList.add(sidebarPref);
    } else {
      sidebar?.classList.remove('light_active');
    }
  }

  private applyGradientClasses(): void {
    const colorElements = document.getElementsByClassName('theme-bg');
    const gradientPref = sessionStorage.getItem('GradientColor');

    Array.from(colorElements).forEach((element) => {
      if (gradientPref) {
        element.classList.add('gradient');
      } else {
        element.classList.remove('gradient');
      }
    });
  }

  showDropDown(): void {
    document.getElementById('drp')?.classList.toggle('ShowDiv');
  }

  logout(): void {
    this.authService.logout();
  }

  toggleMenu(): void {
    document.body.classList.toggle('toggle_menu_active');
  }

  cToggoleMenu(): void {
    document.body.classList.remove('offcanvas-active');
    document.querySelector('.overlay')?.classList.remove('open');
  }

  private closeSidebarOnMobile(): void {
    if (window.innerWidth < 768) {
      document.body.classList.remove('offcanvas-active');
      document.querySelector('.overlay')?.classList.remove('open');
    }
  }
}
