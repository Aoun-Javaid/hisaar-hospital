import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { BackendService } from '../../../../core/services/backend.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, finalize, of, Subject, switchMap, takeUntil } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Hospital, Role, Store, User } from '../../../../shared/models/hospital.model';
import { ProfilePhotoFieldComponent } from '../../../../shared/components/profile-photo-field/profile-photo-field.component';
import { ImageViewerModalComponent } from '../../../../shared/components/image-viewer-modal/image-viewer-modal.component';
import { resolveAssetUrl } from '../../../../core/utils/asset.util';
import { normalizeEmail } from '../../../../core/utils/email.util';
import { isRoleAllowedByHospitalModules } from '../../../auth/hospital-modules';

@Component({
  selector: 'app-create-user',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ProfilePhotoFieldComponent, ImageViewerModalComponent],
  templateUrl: './create-user.component.html',
  styleUrl: './create-user.component.scss',
})
export class CreateUserComponent implements OnInit, OnDestroy {
  showPassword = false;
  userForm!: FormGroup;
  roles: Role[] = [];
  hospitals: Hospital[] = [];
  stores: Store[] = [];
  hospitalSearchControl = new FormControl('', { nonNullable: true });
  currentUser: User | null = null;
  currentHospitalId: string | null = null;
  currentHospitalName = '';
  canSelectHospital = false;
  canAssignPosStore = false;
  isHospitalAdminUser = false;
  rolesLoading = false;
  rolesError = '';
  hospitalsLoading = false;
  hospitalsError = '';
  storesLoading = false;
  storesError = '';
  saving = false;
  userLoading = false;
  editingUser: User | null = null;
  editingUserId = '';
  pendingPhoto: File | null = null;
  pendingPreviewUrl: string | null = null;
  removeExistingPhoto = false;
  photoUploadFailed = false;
  viewerOpen = false;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private toast: ToastrService,
    private backend: BackendService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const stateUser = (history.state?.user || null) as User | null;
    this.editingUserId = this.route.snapshot.paramMap.get('id') || stateUser?._id || '';
    this.editingUser =
      stateUser && (!this.editingUserId || stateUser._id === this.editingUserId)
        ? stateUser
        : null;
    this.setLoggedInUser();
    this.initForm();
    this.validateEditingScope();

    if (this.editingUserId) {
      this.loadEditingUser(this.editingUserId);
    }

    this.authService
      .me()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.setLoggedInUser();
          if (!this.canSelectHospital) {
            this.userForm
              ?.get('hospitalId')
              ?.setValue(this.currentHospitalId || '', { emitEvent: false });
          }
          this.loadRoles();
          this.loadHospitalContext();
          this.loadStores();
        },
        error: () => {
          this.loadRoles();
          this.loadHospitalContext();
          this.loadStores();
        },
      });
  }

  ngOnDestroy(): void {
    this.revokePendingPreview();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get displayPhotoUrl(): string | null {
    return this.removeExistingPhoto ? null : this.editingUser?.photoUrl || null;
  }

  get viewerSrc(): string {
    return this.pendingPreviewUrl || resolveAssetUrl(this.displayPhotoUrl);
  }

  onPhotoSelected(file: File | null): void {
    this.revokePendingPreview();
    this.pendingPhoto = file;
    this.pendingPreviewUrl = file ? URL.createObjectURL(file) : null;
    this.removeExistingPhoto = false;
    this.photoUploadFailed = false;
  }

  onRemoveCurrentPhoto(): void {
    this.revokePendingPreview();
    this.pendingPhoto = null;
    this.removeExistingPhoto = true;
    this.photoUploadFailed = false;
  }

  retryPhotoUpload(): void {
    const userId = this.editingUser?._id;
    if (!userId || !this.pendingPhoto) {
      return;
    }

    this.saving = true;
    this.backend
      .uploadUserPhoto(userId, this.pendingPhoto, { context: 'hospital' })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (resp) => {
          this.photoUploadFailed = false;
          this.pendingPhoto = null;
          this.revokePendingPreview();
          this.editingUser = resp.data || this.editingUser;
          this.toast.success(resp.message || 'Staff photo uploaded successfully');
          this.router.navigateByUrl('/users');
        },
        error: (err) => {
          this.photoUploadFailed = true;
          this.toast.error(
            err?.error?.message ||
              'User created successfully, but profile image upload failed. You can upload it from Edit User.'
          );
        },
      });
  }

  private revokePendingPreview(): void {
    if (this.pendingPreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(this.pendingPreviewUrl);
    }
    this.pendingPreviewUrl = null;
  }

  togglePasswordVisibility(field: 'password') {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    }
  }

  initForm() {
    const hospitalId = this.canSelectHospital
      ? this.resolveId(this.editingUser?.hospitalId) || ''
      : this.currentHospitalId || '';

    this.userForm = this.fb.group({
      hospitalId: [hospitalId, Validators.required],
      roleId: [this.resolveId(this.editingUser?.roleId) || '', Validators.required],
      name: [this.editingUser?.name || '', Validators.required],
      email: [this.editingUser?.email || '', [Validators.required, Validators.email]],
      password: [
        '',
        this.editingUser
          ? [Validators.minLength(8)]
          : [Validators.required, Validators.minLength(8)],
      ],
      phone: [this.editingUser?.phone || ''],
      storeId: [this.resolveId(this.editingUser?.storeId) || ''],
      status: [this.editingUser?.status || 'active', Validators.required],
      isEmailVerified: [this.editingUser?.isEmailVerified ?? true],
    });

    if (!this.canSelectHospital) {
      this.userForm.get('hospitalId')?.disable({ emitEvent: false });
    }
  }

  submitForm() {
    if (!this.editingUser && !this.backend.hasPermission('users.create')) {
      return;
    }

    if (this.editingUser && !this.backend.hasPermission('users.update')) {
      return;
    }

    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const value = this.userForm.getRawValue();
    const hospitalId = this.getResolvedHospitalId();

    if (!hospitalId) {
      this.userForm.get('hospitalId')?.markAsTouched();
      this.toast.error('A hospital is required before saving this user.');
      return;
    }

    if (!this.canAssignSelectedRole(String(value.roleId || ''))) {
      this.toast.error('You cannot assign the selected role.');
      return;
    }

    const payload: Record<string, unknown> = {
      roleId: value.roleId,
      hospitalId,
      name: value.name,
      email: normalizeEmail(value.email),
      phone: value.phone || undefined,
      storeId: value.storeId || null,
      status: value.status,
      isEmailVerified: value.isEmailVerified,
    };

    if (String(value.password || '').trim()) {
      payload['password'] = value.password;
    }

    this.saving = true;
    const wasCreate = !this.editingUser;
    const request$ = this.editingUser
      ? this.backend.updateUser(this.editingUser._id, payload, { context: 'hospital' })
      : this.backend.createUser(payload);

    request$
      .pipe(
        switchMap((resp) => {
          const user = resp.data;
          if (user) {
            this.editingUser = user;
          }

          if (this.pendingPhoto && user?._id) {
            return this.backend.uploadUserPhoto(user._id, this.pendingPhoto, { context: 'hospital' }).pipe(
              switchMap((photoResp) => of({ resp, photoOk: true as const, photoResp })),
              catchError(() => of({ resp, photoOk: false as const }))
            );
          }

          if (this.removeExistingPhoto && user?._id) {
            return this.backend.deleteUserPhoto(user._id, { context: 'hospital' }).pipe(
              switchMap((photoResp) => of({ resp, photoOk: true as const, photoResp })),
              catchError(() => of({ resp, photoOk: false as const }))
            );
          }

          return of({ resp, photoOk: true as const });
        }),
        finalize(() => (this.saving = false))
      )
      .subscribe({
        next: (result) => {
          if (!result.photoOk && this.pendingPhoto) {
            this.photoUploadFailed = true;
            this.toast.success(result.resp?.message || 'User saved successfully');
            this.toast.error(
              wasCreate
                ? 'User created successfully, but profile image upload failed. You can upload it from Edit User.'
                : 'User updated, but profile image upload failed. You can retry from this page.'
            );
            return;
          }

          this.toast.success(result.resp?.message || 'User saved successfully');
          this.router.navigateByUrl('/users');
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Unable to save user.');
        },
      });
  }

  get isSubmitDisabled(): boolean {
    return (
      !this.userForm ||
      this.userForm.invalid ||
      this.saving ||
      this.userLoading ||
      this.rolesLoading ||
      (this.canAssignPosStore && this.storesLoading) ||
      (this.canSelectHospital && this.hospitalsLoading) ||
      !this.getResolvedHospitalId()
    );
  }

  private setLoggedInUser(): void {
    this.currentUser =
      (this.authService.getCurrentUser() as User | null) ||
      (JSON.parse(localStorage.getItem('user') || 'null') as User | null);

    const permissions =
      this.authService.getUserPermissions(this.currentUser) ||
      (JSON.parse(localStorage.getItem('permissions') || '[]') as string[]);
    const currentRoleName = String(
      this.currentUser?.role?.name || localStorage.getItem('role') || ''
    );

    this.canSelectHospital = permissions.includes('*');
    this.canAssignPosStore =
      this.canSelectHospital ||
      permissions.includes('stores.read') ||
      permissions.includes('stores.manage');
    this.isHospitalAdminUser = this.normalizeRoleName(currentRoleName) === 'hospitaladmin';

    this.currentHospitalId =
      this.currentUser?.hospitalId || this.currentUser?.hospital?._id || null;
    this.currentHospitalName = this.currentUser?.hospital?.name || '';
  }

  private validateEditingScope(): void {
    if (
      this.resolveId(this.editingUser?.hospitalId) &&
      this.currentHospitalId &&
      !this.canSelectHospital &&
      this.resolveId(this.editingUser?.hospitalId) !== this.currentHospitalId
    ) {
      this.toast.error('You cannot edit a user from another hospital.');
      this.router.navigateByUrl('/users');
    }
  }

  private loadRoles(): void {
    const hospitalId = this.getResolvedHospitalId();
    if (this.canSelectHospital && !hospitalId) {
      this.roles = [];
      this.rolesLoading = false;
      this.rolesError = '';
      return;
    }

    this.rolesLoading = true;
    this.rolesError = '';

    this.backend
      .getRoles({
        context: 'hospital',
        hospitalId: hospitalId || undefined,
      })
      .pipe(finalize(() => (this.rolesLoading = false)))
      .subscribe({
        next: (roles) => {
          this.roles = this.filterAssignableRoles(roles || []);
          this.reconcileEditingRole();

          if (
            this.userForm.value.roleId &&
            !this.canAssignSelectedRole(String(this.userForm.value.roleId))
          ) {
            this.userForm.patchValue({ roleId: '' });
          }
        },
        error: (err) => {
          this.roles = [];
          this.rolesError = err?.error?.message || 'Unable to load roles.';
        },
      });
  }

  private loadHospitalContext(): void {
    if (this.canSelectHospital) {
      this.loadHospitals();
      this.hospitalSearchControl.valueChanges
        .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
        .subscribe((search) => this.loadHospitals(search));
      return;
    }

    if (!this.currentHospitalId) {
      this.hospitalsError = 'Your account is not assigned to a hospital.';
      return;
    }

    if (this.currentHospitalName) {
      return;
    }

    this.backend.getHospital(this.currentHospitalId).subscribe({
      next: (hospital) => (this.currentHospitalName = hospital.name),
      error: () => (this.currentHospitalName = 'Assigned hospital'),
    });
  }

  private loadStores(): void {
    if (!this.canAssignPosStore) {
      return;
    }

    const hospitalId = this.getResolvedHospitalId();
    if (this.canSelectHospital && !hospitalId) {
      this.stores = [];
      this.storesLoading = false;
      this.storesError = '';
      return;
    }

    this.storesLoading = true;
    this.storesError = '';

    this.backend
      .getStores({
        limit: 100,
        isActive: true,
        hospitalId: hospitalId || undefined,
      })
      .pipe(finalize(() => (this.storesLoading = false)))
      .subscribe({
        next: (result) => {
          this.stores = result.items || [];
        },
        error: (err) => {
          this.stores = [];
          this.storesError = err?.error?.message || 'Unable to load POS stores.';
        },
      });
  }

  private loadHospitals(search = ''): void {
    this.hospitalsLoading = true;
    this.hospitalsError = '';

    this.backend
      .getHospitals({
        limit: 50,
        search,
      })
      .pipe(finalize(() => (this.hospitalsLoading = false)))
      .subscribe({
        next: (result) => {
          this.hospitals = result.items || [];
          this.includeSelectedHospitalIfMissing();
        },
        error: (err) => {
          this.hospitals = [];
          this.hospitalsError = err?.error?.message || 'Unable to load hospitals.';
        },
      });
  }

  private includeSelectedHospitalIfMissing(): void {
    const selectedHospitalId = String(this.userForm.get('hospitalId')?.value || '');

    if (
      !selectedHospitalId ||
      this.hospitals.some((hospital) => hospital._id === selectedHospitalId)
    ) {
      return;
    }

    this.backend.getHospital(selectedHospitalId).subscribe({
      next: (hospital) => (this.hospitals = [hospital, ...this.hospitals]),
    });
  }

  private filterAssignableRoles(roles: Role[]): Role[] {
    return roles.filter((role) => {
      if (role.isActive === false) {
        return false;
      }

      if (!this.canSelectHospital && this.isWildcardRole(role)) {
        return false;
      }

      if (this.isHospitalAdminUser && this.isHospitalAdminRole(role)) {
        return false;
      }

      if (!isRoleAllowedByHospitalModules(role)) {
        return false;
      }

      return true;
    });
  }

  private canAssignSelectedRole(roleId: string): boolean {
    return this.roles.some((role) => role._id === roleId);
  }

  private isWildcardRole(role: Role): boolean {
    return Boolean(role.permissions?.includes('*'));
  }

  private isHospitalAdminRole(role: Role): boolean {
    return this.normalizeRoleName(role.name) === 'hospitaladmin';
  }

  private normalizeRoleName(value: string | null | undefined): string {
    return String(value || '')
      .trim()
      .replace(/[\s_-]/g, '')
      .toLowerCase();
  }

  private getResolvedHospitalId(): string {
    const formHospitalId = String(this.userForm?.getRawValue()?.hospitalId || '');

    if (this.canSelectHospital) {
      return formHospitalId;
    }

    return this.currentHospitalId || formHospitalId;
  }

  private loadEditingUser(userId: string): void {
    this.userLoading = true;
    this.backend
      .getUser(userId, { context: 'hospital' })
      .pipe(finalize(() => (this.userLoading = false)))
      .subscribe({
        next: (user) => {
          this.editingUser = user;
          this.editingUserId = user._id;
          this.applyEditingUserToForm(user);
          this.validateEditingScope();
          this.loadRoles();
          this.loadStores();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Unable to load user details.');
          this.router.navigateByUrl('/users');
        },
      });
  }

  private applyEditingUserToForm(user: User): void {
    const hospitalId = this.resolveId(user.hospitalId || user.hospital?._id);
    const passwordControl = this.userForm.get('password');
    passwordControl?.setValidators([Validators.minLength(8)]);
    passwordControl?.updateValueAndValidity({ emitEvent: false });

    this.userForm.patchValue(
      {
        hospitalId: hospitalId || this.currentHospitalId || '',
        roleId: this.resolveId(user.roleId),
        name: user.name || '',
        email: user.email || '',
        password: '',
        phone: user.phone || '',
        storeId: this.resolveId(user.storeId),
        status: user.status || 'active',
        isEmailVerified: user.isEmailVerified ?? true,
      },
      { emitEvent: false }
    );

    if (!this.canSelectHospital) {
      this.userForm.get('hospitalId')?.disable({ emitEvent: false });
    }
  }

  private reconcileEditingRole(): void {
    if (!this.editingUser || this.roles.length === 0) {
      return;
    }

    const currentRoleId = this.resolveId(this.editingUser.roleId);
    const exactRole = this.roles.find((role) => role._id === currentRoleId);
    const roleName = this.editingUser.role?.name;
    const equivalentRole = roleName
      ? this.roles.find(
          (role) => this.normalizeRoleName(role.name) === this.normalizeRoleName(roleName)
        )
      : null;
    const selectedRole = exactRole || equivalentRole;

    if (selectedRole) {
      this.userForm.patchValue({ roleId: selectedRole._id }, { emitEvent: false });
    }
  }

  private resolveId(value: unknown): string {
    if (value && typeof value === 'object' && '_id' in value) {
      return String((value as { _id?: unknown })._id || '');
    }
    return value ? String(value) : '';
  }

  onHospitalChange(): void {
    this.userForm.patchValue({
      roleId: '',
      storeId: '',
    });
    this.roles = [];
    this.stores = [];
    this.loadRoles();
    this.loadStores();
  }

  cancel(): void {
    this.router.navigateByUrl('/users');
  }

  get pageTitle(): string {
    return this.editingUser ? 'Edit User' : 'Add User';
  }

  get pageSubtitle(): string {
    return this.editingUser
      ? 'Update this staff account for your hospital.'
      : 'Create a new staff account for your hospital.';
  }

  get submitLabel(): string {
    if (this.saving) {
      return 'Saving...';
    }
    return this.editingUser ? 'Save User' : 'Create User';
  }
}
