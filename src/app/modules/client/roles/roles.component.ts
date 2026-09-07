import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { AppDialogService } from '../../../core/services/app-dialog.service';
import { BackendService } from '../../../core/services/backend.service';
import {
  DEFAULT_HOSPITAL_MODULES,
  HospitalEnabledModules,
  filterPermissionsByHospitalModules,
  isRoleAllowedByHospitalModules,
  normalizeHospitalModules,
  readStoredHospitalModuleEnforcement,
  readStoredHospitalModules,
} from '../../auth/hospital-modules';
import { Hospital, Role, User } from '../../../shared/models/hospital.model';
import { isCurrentLaboratoryEdition } from '../../auth/product-edition';

interface PermissionGroup {
  title: string;
  permissions: Array<{ key: string; label: string }>;
}

@Component({
  selector: 'app-roles',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.scss',
})
export class RolesComponent implements OnInit {
  readonly roleContext = 'hospital';
  readonly permissionGroups: PermissionGroup[] = [
    {
      title: 'Dashboard',
      permissions: [{ key: 'hospital_dashboard.read', label: 'View Hospital Dashboard' }],
    },
    {
      title: 'Hospitals',
      permissions: [
        { key: 'hospitals.read', label: 'View Hospitals' },
        { key: 'hospitals.update', label: 'Update Hospitals' },
        { key: 'hospitals.delete', label: 'Delete Hospitals' },
      ],
    },
    {
      title: 'Departments',
      permissions: [
        { key: 'departments.create', label: 'Create Departments' },
        { key: 'departments.read', label: 'View Departments' },
        { key: 'departments.update', label: 'Update Departments' },
        { key: 'departments.delete', label: 'Delete Departments' },
      ],
    },
    {
      title: 'Doctors',
      permissions: [
        { key: 'doctors.create', label: 'Create Doctors' },
        { key: 'doctors.read', label: 'View Doctors' },
        { key: 'doctors.update', label: 'Update Doctors' },
        { key: 'doctors.delete', label: 'Delete Doctors' },
      ],
    },
    {
      title: 'Patients',
      permissions: [
        { key: 'patients.create', label: 'Create Patients' },
        { key: 'patients.read', label: 'View Patients' },
        { key: 'patients.update', label: 'Update Patients' },
        { key: 'patients.delete', label: 'Delete Patients' },
      ],
    },
    {
      title: 'Patient History',
      permissions: [
        { key: 'patients_history.create', label: 'Create History Records' },
        { key: 'patients_history.read', label: 'View History Records' },
        { key: 'patients_history.update', label: 'Update History Records' },
        { key: 'patients_history.delete', label: 'Delete History Records' },
      ],
    },
    {
      title: 'Appointments',
      permissions: [
        { key: 'appointments.create', label: 'Create Appointments' },
        { key: 'appointments.read', label: 'View Appointments' },
        { key: 'appointments.update', label: 'Update Appointments' },
        { key: 'appointments.delete', label: 'Delete Appointments' },
        { key: 'appointments.status_update', label: 'Update Appointment Status' },
      ],
    },
    {
      title: 'Prescriptions',
      permissions: [
        { key: 'prescriptions.create', label: 'Create Prescriptions' },
        { key: 'prescriptions.read', label: 'View Prescriptions' },
        { key: 'prescriptions.update', label: 'Update Prescriptions' },
        { key: 'prescriptions.delete', label: 'Delete Prescriptions' },
      ],
    },
    {
      title: 'Pharmacy / POS',
      permissions: [
        { key: 'products.read', label: 'View POS Medicine Catalog' },
        { key: 'products.create', label: 'Add POS Medicines' },
        { key: 'products.update', label: 'Update POS Medicines' },
        { key: 'products.delete', label: 'Delete POS Medicines' },
        { key: 'sales.create', label: 'Dispense Medicines / Create POS Sales' },
        { key: 'sales.read', label: 'View POS Sales' },
        { key: 'stores.read', label: 'View POS Stores' },
        { key: 'customers.read', label: 'View POS Customers' },
        { key: 'categories.create', label: 'Add Medicine Categories' },
        { key: 'categories.read', label: 'View Medicine Categories' },
        { key: 'inventory.read', label: 'View Medicine Stock' },
        { key: 'inventory.adjust', label: 'Adjust Store Stock' },
        { key: 'register_sessions.open', label: 'Open Cash Register' },
        { key: 'register_sessions.read', label: 'View Cash Register' },
        { key: 'register_sessions.close', label: 'Close Cash Register' },
      ],
    },
    {
      title: 'POS Reports',
      permissions: [
        { key: 'reports.read', label: 'View POS Reports' },
      ],
    },
    {
      title: 'Rooms',
      permissions: [
        { key: 'rooms.create', label: 'Create Rooms' },
        { key: 'rooms.read', label: 'View Rooms' },
        { key: 'rooms.update', label: 'Update Rooms' },
        { key: 'rooms.delete', label: 'Delete Rooms' },
      ],
    },
    {
      title: 'Room Allotments',
      permissions: [
        { key: 'room_allotments.create', label: 'Create Room Allotments' },
        { key: 'room_allotments.read', label: 'View Room Allotments' },
        { key: 'room_allotments.update', label: 'Update / Discharge Allotments' },
      ],
    },
    {
      title: 'Billing',
      permissions: [
        { key: 'bills.create', label: 'Create Bills' },
        { key: 'bills.read', label: 'View Bills' },
        { key: 'bills.update_payment', label: 'Update Bill Payments' },
        { key: 'encounters.create', label: 'Create Visit / Encounter' },
        { key: 'encounters.read', label: 'View Visit / Encounter' },
        { key: 'ledger_payments.create', label: 'Collect Ledger Payments' },
        { key: 'ledger_payments.read', label: 'View Ledger Payments' },
      ],
    },
    {
      title: 'Laboratory',
      permissions: [
        { key: 'lab_tests.read', label: 'View Test Catalog' },
        { key: 'lab_tests.create', label: 'Create Tests' },
        { key: 'lab_tests.update', label: 'Update Tests' },
        { key: 'lab_orders.read', label: 'View Lab Orders' },
        { key: 'lab_orders.create', label: 'Create Lab Orders' },
        { key: 'lab_orders.update', label: 'Update Orders / Enter Results / Collect Payment' },
        { key: 'lab_results.verify', label: 'Verify Results (Pathologist)' },
      ],
    },
    {
      title: 'Administration',
      permissions: [
        { key: 'roles.create', label: 'Create Roles' },
        { key: 'roles.read', label: 'View Roles' },
        { key: 'roles.update', label: 'Update Roles' },
        { key: 'roles.delete', label: 'Delete Roles' },
        { key: 'users.create', label: 'Create Users' },
        { key: 'users.read', label: 'View Users' },
        { key: 'users.update', label: 'Update Users' },
        { key: 'users.delete', label: 'Delete Users' },
        { key: 'audit_logs.read', label: 'View Audit Logs' },
      ],
    },
  ];

  readonly roleForm: FormGroup;

  roles: Role[] = [];
  hospitals: Hospital[] = [];
  loading = false;
  saving = false;
  hospitalsLoading = false;
  search = '';
  status = '';
  editingRoleId: string | null = null;
  selectedRoleId: string | null = null;
  mobileTab: 'roles' | 'editor' | 'permissions' = 'roles';
  expandedGroups = new Set<string>();
  openMenuRoleId: string | null = null;
  canSelectHospital = false;
  isHospitalScopedUser = false;
  currentHospitalId = '';
  currentHospitalName = '';
  selectedHospitalId = '';

  private readonly avatarPalette = ['#019c9d', '#7c3aed', '#2563eb', '#ea580c', '#db2777', '#64748b'];

  private readonly groupIcons: Record<string, string> = {
    Dashboard: 'fa-tachometer',
    Hospitals: 'fa-hospital-o',
    Departments: 'fa-sitemap',
    Doctors: 'fa-user-md',
    Patients: 'fa-users',
    'Patient History': 'fa-file-text-o',
    Appointments: 'fa-calendar',
    Prescriptions: 'fa-medkit',
    'Pharmacy / POS': 'fa-shopping-cart',
    'POS Reports': 'fa-bar-chart',
    Rooms: 'fa-bed',
    'Room Allotments': 'fa-exchange',
    Billing: 'fa-credit-card',
    Laboratory: 'fa-flask',
    Administration: 'fa-cog',
  };

  constructor(
    private fb: FormBuilder,
    private backend: BackendService,
    private toastr: ToastrService,
    private dialog: AppDialogService
  ) {
    this.roleForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      isActive: [true],
      permissions: this.fb.array([], [Validators.required]),
    });
  }

  ngOnInit(): void {
    this.setHospitalContext();
    this.loadCurrentHospitalSummary();
    this.loadHospitals();
    this.loadRoles();
  }

  get permissionSelections(): FormArray {
    return this.roleForm.get('permissions') as FormArray;
  }

  can(permission: string): boolean {
    return this.backend.hasPermission(permission);
  }

  get visiblePermissionGroups(): PermissionGroup[] {
    const modules = this.scopedModules();
    const moduleGroupTitles: Record<string, () => boolean> = {
      Dashboard: () => modules.clinical,
      Departments: () => modules.clinical,
      Doctors: () => modules.clinical,
      'Patient History': () => modules.clinical,
      Appointments: () => modules.clinical,
      Prescriptions: () => modules.clinical,
      'Pharmacy / POS': () => modules.pharmacy,
      'POS Reports': () => modules.pharmacy,
      Laboratory: () => modules.laboratory,
      Rooms: () => modules.ward,
      'Room Allotments': () => modules.ward,
      Patients: () => modules.clinical || modules.ward || modules.laboratory,
      Billing: () => modules.clinical || modules.ward || modules.laboratory,
    };

    let groups = this.permissionGroups.filter((group) => {
      const moduleCheck = moduleGroupTitles[group.title];
      return moduleCheck ? moduleCheck() : true;
    });

    if (!isCurrentLaboratoryEdition()) {
      return groups;
    }

    const allowed = new Set(['Patients', 'Laboratory', 'Billing', 'Administration']);
    return groups.filter((group) => allowed.has(group.title));
  }

  loadRoles(): void {
    if (this.canSelectHospital && !this.selectedHospitalId) {
      this.roles = [];
      this.selectedRoleId = null;
      return;
    }

    if (!this.selectedHospitalId && !this.canSelectHospital) {
      this.roles = [];
      this.selectedRoleId = null;
      return;
    }

    this.loading = true;
    const params: Record<string, unknown> = {
      context: this.roleContext,
    };

    if (this.canSelectHospital && this.selectedHospitalId) {
      params['hospitalId'] = this.selectedHospitalId;
    }

    this.backend
      .getRoles(params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (roles) => {
          const search = this.search.trim().toLowerCase();
          this.roles = (roles || []).filter((role) => {
            const matchesSearch = !search
              ? true
              : [role.name, role.description || '', ...(role.permissions || [])]
                  .join(' ')
                  .toLowerCase()
                  .includes(search);
            const matchesStatus =
              !this.status ||
              (this.status === 'active' ? role.isActive !== false : role.isActive === false);

            return matchesSearch && matchesStatus;
          });

          const visible = this.visibleRoles();
          if (this.selectedRoleId && !visible.some((role) => role._id === this.selectedRoleId)) {
            this.selectedRoleId = null;
          }
          if (!this.selectedRoleId && visible.length) {
            this.selectRole(visible[0], false);
          }
        },
        error: (err) => {
          this.roles = [];
          this.selectedRoleId = null;
          this.toastr.error(err?.error?.message || 'Unable to load hospital roles.');
        },
      });
  }

  setPermission(permission: string, checked: boolean): void {
    const index = this.permissionSelections.controls.findIndex(
      (control) => control.value === permission
    );

    if (checked && index === -1) {
      this.permissionSelections.push(this.fb.control(permission));
    }

    if (!checked && index >= 0) {
      this.permissionSelections.removeAt(index);
    }
  }

  togglePermission(permission: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.setPermission(permission, checked);
  }

  hasPermissionSelected(permission: string): boolean {
    return this.permissionSelections.controls.some((control) => control.value === permission);
  }

  permissionCount(role?: Role | null): number {
    return (role?.permissions || []).filter((permission) => permission !== '*').length;
  }

  effectivePermissionCount(role?: Role | null): number {
    const perms = role?.permissions || [];
    if (perms.includes('*')) {
      return this.effectivePermissionCountFromList(
        this.permissionGroups.flatMap((group) => group.permissions.map((item) => item.key))
      );
    }
    return this.effectivePermissionCountFromList(perms);
  }

  selectedPermissionCount(): number {
    return this.permissionSelections.controls.length;
  }

  selectedEffectivePermissionCount(): number {
    const perms = this.permissionSelections.controls.map((control) => String(control.value || ''));
    if (perms.includes('*')) {
      return this.effectivePermissionCountFromList(
        this.permissionGroups.flatMap((group) => group.permissions.map((item) => item.key))
      );
    }
    return this.effectivePermissionCountFromList(perms);
  }

  permissionCountLabel(role: Role): string {
    const stored = this.permissionCount(role);
    if (!this.scopedModulesEnforced() || this.allModulesEnabled()) {
      return `${stored} permissions`;
    }
    const effective = this.effectivePermissionCount(role);
    if (effective >= stored) {
      return `${stored} permissions`;
    }
    return `${effective} effective · ${stored} on role`;
  }

  selectedPermissionCountLabel(): string {
    const stored = this.selectedPermissionCount();
    if (!this.scopedModulesEnforced() || this.allModulesEnabled()) {
      return `${stored} Permissions Assigned`;
    }
    const effective = this.selectedEffectivePermissionCount();
    if (effective >= stored) {
      return `${stored} Permissions Assigned`;
    }
    return `${effective} Effective · ${stored} on Role`;
  }

  get showModuleClipNote(): boolean {
    return this.scopedModulesEnforced() && !this.allModulesEnabled();
  }

  get moduleClipNote(): string {
    const modules = this.scopedModules();
    const off: string[] = [];
    if (!modules.clinical) off.push('Clinical / OPD');
    if (!modules.ward) off.push('Ward');
    if (!modules.laboratory) off.push('Laboratory');
    if (!modules.pharmacy) off.push('Pharmacy');
    const offLabel = off.length ? off.join(', ') : 'disabled modules';
    return `This hospital has modules turned off (${offLabel}). Extra permissions stored on the role stay saved, but they will not apply in the app or APIs until those modules are enabled.`;
  }

  private effectivePermissionCountFromList(permissions: string[]): number {
    return filterPermissionsByHospitalModules(
      permissions.filter((permission) => permission !== '*'),
      this.scopedModules(),
      this.scopedModulesEnforced()
    ).length;
  }

  private allModulesEnabled(): boolean {
    const modules = this.scopedModules();
    return Boolean(modules.pharmacy && modules.laboratory && modules.ward && modules.clinical);
  }

  roleCategories(role: Role): string[] {
    const labels = new Set<string>();
    for (const permission of role.permissions || []) {
      const group = this.visiblePermissionGroups.find((item) =>
        item.permissions.some((entry) => entry.key === permission)
      );
      if (group) {
        labels.add(group.title);
      }
    }
    return Array.from(labels);
  }

  visibleCategories(role: Role): string[] {
    return this.roleCategories(role).slice(0, 2);
  }

  hiddenCategoryCount(role: Role): number {
    return Math.max(0, this.roleCategories(role).length - 2);
  }

  avatarColor(role: Role): string {
    const seed = String(role.name || role._id || '');
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash + seed.charCodeAt(i) * (i + 1)) % this.avatarPalette.length;
    }
    return this.avatarPalette[hash] || this.avatarPalette[0];
  }

  groupIcon(title: string): string {
    return this.groupIcons[title] || 'fa-folder-o';
  }

  groupDescription(title: string): string {
    return `Configure ${title.toLowerCase()} access for this role.`;
  }

  crudKeys(group: PermissionGroup): { view?: string; create?: string; update?: string; delete?: string } {
    const byAction: { view?: string; create?: string; update?: string; delete?: string } = {};
    for (const permission of group.permissions) {
      const key = permission.key;
      if (/\.read$|\.view$/.test(key) && !byAction.view) byAction.view = key;
      else if (/\.create$/.test(key) && !byAction.create) byAction.create = key;
      else if (/\.update$|\.update_payment$|\.status_update$|\.adjust$/.test(key) && !byAction.update) {
        byAction.update = key;
      } else if (/\.delete$|\.cancel$/.test(key) && !byAction.delete) byAction.delete = key;
    }
    return byAction;
  }

  isGroupExpanded(title: string): boolean {
    return this.expandedGroups.has(title);
  }

  toggleGroup(title: string): void {
    if (this.expandedGroups.has(title)) {
      this.expandedGroups.delete(title);
    } else {
      this.expandedGroups.add(title);
    }
  }

  expandAllGroups(): void {
    this.visiblePermissionGroups.forEach((group) => this.expandedGroups.add(group.title));
  }

  collapseAllGroups(): void {
    this.expandedGroups.clear();
  }

  allGroupSelected(group: PermissionGroup): boolean {
    return group.permissions.every((permission) => this.hasPermissionSelected(permission.key));
  }

  toggleGroupSelectAll(group: PermissionGroup, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    group.permissions.forEach((permission) => this.setPermission(permission.key, checked));
  }

  selectRole(role: Role, switchToEditor = true): void {
    this.selectedRoleId = role._id;
    this.openMenuRoleId = null;

    if (this.isProtectedRole(role)) {
      this.editingRoleId = null;
      this.roleForm.reset({
        name: role.name,
        description: role.description || 'Full system access',
        isActive: role.isActive !== false,
      });
      this.permissionSelections.clear();
      (role.permissions || []).forEach((permission) => {
        this.permissionSelections.push(this.fb.control(permission));
      });
      this.roleForm.disable({ emitEvent: false });
      if (switchToEditor) {
        this.mobileTab = 'editor';
      }
      return;
    }

    this.editingRoleId = role._id;
    this.roleForm.enable({ emitEvent: false });
    this.roleForm.patchValue({
      name: role.name,
      description: role.description || '',
      isActive: role.isActive !== false,
    });
    this.permissionSelections.clear();
    (role.permissions || []).forEach((permission) => {
      this.permissionSelections.push(this.fb.control(permission));
    });
    if (!this.can('roles.update')) {
      this.roleForm.disable({ emitEvent: false });
    }
    if (switchToEditor) {
      this.mobileTab = 'editor';
    }
  }

  startCreateRole(): void {
    if (!this.can('roles.create')) {
      return;
    }
    this.resetForm();
    this.selectedRoleId = null;
    this.mobileTab = 'editor';
    this.roleForm.enable({ emitEvent: false });
  }

  discardChanges(): void {
    const selected = this.visibleRoles().find((role) => role._id === this.selectedRoleId);
    if (selected && !this.isProtectedRole(selected)) {
      this.selectRole(selected, false);
      this.toastr.info('Changes discarded.');
      return;
    }
    this.resetForm();
  }

  toggleRoleMenu(roleId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuRoleId = this.openMenuRoleId === roleId ? null : roleId;
  }

  closeRoleMenu(): void {
    this.openMenuRoleId = null;
  }

  setMobileTab(tab: 'roles' | 'editor' | 'permissions'): void {
    this.mobileTab = tab;
  }

  setRoleActive(isActive: boolean): void {
    this.roleForm.patchValue({ isActive });
  }

  get selectedRole(): Role | null {
    return this.visibleRoles().find((role) => role._id === this.selectedRoleId) || null;
  }

  get isEditingExisting(): boolean {
    return Boolean(this.editingRoleId);
  }

  get canEditSelected(): boolean {
    const role = this.selectedRole;
    if (!role) {
      return this.can('roles.create');
    }
    return this.can('roles.update') && !this.isProtectedRole(role);
  }

  submitRole(): void {
    if (!this.editingRoleId && !this.can('roles.create')) {
      return;
    }

    if (this.editingRoleId && !this.can('roles.update')) {
      return;
    }

    if (this.roleForm.invalid || this.permissionSelections.length === 0) {
      this.roleForm.markAllAsTouched();
      this.toastr.error('Role name and at least one permission are required.');
      this.mobileTab = 'editor';
      return;
    }

    const raw = this.roleForm.getRawValue();
    if (!this.selectedHospitalId && this.canSelectHospital) {
      this.toastr.error('Select a hospital before saving a hospital role.');
      return;
    }

    const payload = {
      name: String(raw.name || '').trim(),
      description: String(raw.description || '').trim(),
      isActive: Boolean(raw.isActive),
      context: this.roleContext,
      hospitalId: this.selectedHospitalId || undefined,
      permissions: [...new Set((raw.permissions || []).map((permission: string) => String(permission)))],
    };

    this.saving = true;
    const request$ = this.editingRoleId
      ? this.backend.updateRole(this.editingRoleId, payload, {
          context: this.roleContext,
          hospitalId: this.canSelectHospital ? this.selectedHospitalId || undefined : undefined,
        })
      : this.backend.createRole(payload);

    request$.pipe(finalize(() => (this.saving = false))).subscribe({
      next: (response) => {
        this.toastr.success(response?.message || 'Role saved successfully.');
        const keepName = payload.name;
        this.resetForm(false);
        this.loadRoles();
        // After reload, try to reselect by name if create
        setTimeout(() => {
          const match = this.visibleRoles().find((role) => role.name === keepName);
          if (match) {
            this.selectRole(match, false);
          }
        }, 0);
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Unable to save hospital role.');
      },
    });
  }

  editRole(role: Role): void {
    this.selectRole(role, true);
  }

  async deleteRole(role: Role): Promise<void> {
    if (!this.can('roles.delete')) {
      return;
    }

    if (role.isSystemRole) {
      this.toastr.info('System roles cannot be deleted here.');
      return;
    }

    this.closeRoleMenu();

    const confirmed = await this.dialog.confirm({
      title: 'Delete Role',
      message: `Delete the "${role.name}" role? This action cannot be undone.`,
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    this.backend
      .deleteRole(role._id, {
        context: this.roleContext,
        hospitalId: this.canSelectHospital ? this.selectedHospitalId || undefined : undefined,
      })
      .subscribe({
      next: (response) => {
        this.toastr.success(response?.message || 'Role deleted successfully.');
        if (this.editingRoleId === role._id || this.selectedRoleId === role._id) {
          this.resetForm();
          this.selectedRoleId = null;
        }
        this.loadRoles();
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Unable to delete hospital role.');
      },
      });
  }

  resetForm(clearSelection = true): void {
    this.editingRoleId = null;
    if (clearSelection) {
      this.selectedRoleId = null;
    }
    this.roleForm.reset({
      name: '',
      description: '',
      isActive: true,
    });
    this.permissionSelections.clear();
    this.roleForm.enable({ emitEvent: false });
  }

  visibleRoles(): Role[] {
    const modules = this.scopedModules();
    const enforced = this.scopedModulesEnforced();
    return this.roles.filter((role) => isRoleAllowedByHospitalModules(role, modules, enforced));
  }

  /** Modules for the hospital currently selected in Hospital Scope (or logged-in hospital). */
  private scopedModules(): HospitalEnabledModules {
    const hospital = this.hospitals.find((item) => item._id === this.selectedHospitalId);
    if (hospital) {
      if (!hospital.modulesEnforced) {
        return { ...DEFAULT_HOSPITAL_MODULES };
      }
      return normalizeHospitalModules(hospital.enabledModules, hospital);
    }
    return readStoredHospitalModules();
  }

  private scopedModulesEnforced(): boolean {
    const hospital = this.hospitals.find((item) => item._id === this.selectedHospitalId);
    if (hospital) {
      return Boolean(hospital.modulesEnforced);
    }
    return readStoredHospitalModuleEnforcement();
  }

  onHospitalChange(): void {
    this.resetForm();
    this.loadRoles();
  }

  onSearchChange(): void {
    this.loadRoles();
  }

  private setHospitalContext(): void {
    const currentUser = JSON.parse(localStorage.getItem('user') || 'null') as User | null;
    const permissions = JSON.parse(localStorage.getItem('permissions') || '[]') as string[];
    this.currentHospitalId = this.resolveId(
      currentUser?.hospitalId || currentUser?.hospital || null
    );
    this.isHospitalScopedUser = Boolean(this.currentHospitalId);
    this.canSelectHospital = permissions.includes('*') && !this.isHospitalScopedUser;
    this.currentHospitalName = currentUser?.hospital?.name || '';
    this.selectedHospitalId = this.isHospitalScopedUser ? this.currentHospitalId : '';
  }

  private loadCurrentHospitalSummary(): void {
    if (this.canSelectHospital || !this.currentHospitalId || this.currentHospitalName) {
      return;
    }

    this.backend.getHospital(this.currentHospitalId).subscribe({
      next: (hospital) => {
        this.currentHospitalName = hospital.name || this.currentHospitalName;
      },
      error: () => {
        if (!this.currentHospitalName) {
          this.currentHospitalName = 'Assigned hospital';
        }
      },
    });
  }

  private loadHospitals(): void {
    if (!this.canSelectHospital) {
      return;
    }

    this.hospitalsLoading = true;
    this.backend
      .getHospitals({ limit: 100 })
      .pipe(finalize(() => (this.hospitalsLoading = false)))
      .subscribe({
        next: (result) => {
          this.hospitals = result.items || [];
        },
        error: (err) => {
          this.hospitals = [];
          this.toastr.error(err?.error?.message || 'Unable to load hospitals.');
        },
      });
  }

  private isProtectedRole(role: Role): boolean {
    return Boolean(role.permissions?.includes('*'));
  }

  private resolveId(value: unknown): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'object' && value !== null && '_id' in value) {
      return String((value as { _id?: unknown })._id || '');
    }

    return '';
  }
}
