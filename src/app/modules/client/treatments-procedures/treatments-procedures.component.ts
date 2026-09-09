import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { BackendService } from '../../../core/services/backend.service';
import { Department, TreatmentCatalogItem, TreatmentCatalogType } from '../../../shared/models/hospital.model';

@Component({
  selector: 'app-treatments-procedures',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './treatments-procedures.component.html',
  styleUrl: './treatments-procedures.component.scss',
})
export class TreatmentsProceduresComponent implements OnInit {
  items: TreatmentCatalogItem[] = [];
  departments: Department[] = [];
  loading = false;
  saving = false;
  showModal = false;
  editingId: string | null = null;
  search = '';
  departmentFilter = '';
  typeFilter = '';
  statusFilter = 'true';
  form: FormGroup;
  includedItemDraft = '';

  readonly types: TreatmentCatalogType[] = ['treatment', 'procedure', 'operation', 'surgery', 'package'];

  kpis = {
    total: 0,
    active: 0,
    operations: 0,
    procedures: 0,
    packages: 0,
  };

  constructor(
    private backend: BackendService,
    private fb: FormBuilder,
    private toastr: ToastrService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      code: ['', [Validators.required, Validators.minLength(1)]],
      type: ['treatment', Validators.required],
      departmentId: [''],
      baseRate: [0, [Validators.required, Validators.min(0)]],
      defaultDurationMinutes: [0, [Validators.min(0)]],
      requiresOperationSchedule: [false],
      description: [''],
      packageNotes: [''],
      includedItems: [[] as string[]],
      isActive: [true],
    });
  }

  ngOnInit(): void {
    this.loadDepartments();
    this.loadItems();
  }

  can(permission: string): boolean {
    return this.backend.hasPermission(permission);
  }

  get canManage(): boolean {
    return (
      this.can('treatment_catalog.create') ||
      this.can('treatment_catalog.update') ||
      this.can('hospitals.update') ||
      this.can('*')
    );
  }

  loadDepartments(): void {
    this.backend.getDepartments({ limit: 100, status: 'active' }).subscribe({
      next: (result) => {
        this.departments = result.items || [];
      },
      error: () => {
        this.departments = [];
      },
    });
  }

  loadItems(): void {
    this.loading = true;
    const params: Record<string, unknown> = {
      limit: 100,
      search: this.search.trim() || undefined,
      departmentId: this.departmentFilter || undefined,
      type: this.typeFilter || undefined,
      isActive: this.statusFilter === 'all' ? 'all' : this.statusFilter,
    };

    this.backend
      .getTreatmentCatalog(params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => {
          this.items = result.items || [];
          const kpis = (result as { kpis?: Record<string, number> }).kpis;
          if (kpis) {
            this.kpis = {
              total: Number(kpis['total'] || 0),
              active: Number(kpis['active'] || 0),
              operations: Number(kpis['operations'] || 0),
              procedures: Number(kpis['procedures'] || 0),
              packages: Number(kpis['packages'] || 0),
            };
          } else {
            this.recomputeLocalKpis();
          }
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to load treatments.'),
      });
  }

  private recomputeLocalKpis(): void {
    this.kpis = {
      total: this.items.length,
      active: this.items.filter((item) => item.isActive !== false).length,
      operations: this.items.filter((item) => item.type === 'operation' || item.type === 'surgery').length,
      procedures: this.items.filter((item) => item.type === 'procedure' || item.type === 'treatment').length,
      packages: this.items.filter((item) => item.type === 'package').length,
    };
  }

  departmentName(item: TreatmentCatalogItem): string {
    if (item.department && typeof item.department === 'object') {
      return item.department.name || '—';
    }
    if (typeof item.departmentId === 'object' && item.departmentId) {
      return item.departmentId.name || '—';
    }
    const id = typeof item.departmentId === 'string' ? item.departmentId : '';
    return this.departments.find((dept) => dept._id === id)?.name || '—';
  }

  typeLabel(type?: string): string {
    return String(type || 'treatment').replace(/_/g, ' ');
  }

  openModal(item?: TreatmentCatalogItem): void {
    if (item) {
      if (!this.can('treatment_catalog.update') && !this.can('*')) return;
      this.editingId = item._id;
      this.form.reset({
        name: item.name,
        code: item.code,
        type: item.type || 'treatment',
        departmentId:
          typeof item.departmentId === 'object' && item.departmentId
            ? item.departmentId._id
            : item.departmentId || '',
        baseRate: item.baseRate || 0,
        defaultDurationMinutes: item.defaultDurationMinutes || 0,
        requiresOperationSchedule: Boolean(item.requiresOperationSchedule),
        description: item.description || '',
        packageNotes: item.packageNotes || '',
        includedItems: [...(item.includedItems || [])],
        isActive: item.isActive !== false,
      });
    } else {
      if (!this.can('treatment_catalog.create') && !this.can('*')) return;
      this.editingId = null;
      this.form.reset({
        name: '',
        code: '',
        type: 'treatment',
        departmentId: '',
        baseRate: 0,
        defaultDurationMinutes: 0,
        requiresOperationSchedule: false,
        description: '',
        packageNotes: '',
        includedItems: [],
        isActive: true,
      });
    }
    this.includedItemDraft = '';
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingId = null;
  }

  get includedItems(): string[] {
    return (this.form.get('includedItems')?.value as string[]) || [];
  }

  addIncludedItem(): void {
    const value = this.includedItemDraft.trim();
    if (!value) return;
    const current = [...this.includedItems];
    if (!current.includes(value)) {
      current.push(value);
      this.form.patchValue({ includedItems: current });
    }
    this.includedItemDraft = '';
  }

  removeIncludedItem(item: string): void {
    this.form.patchValue({ includedItems: this.includedItems.filter((entry) => entry !== item) });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: Partial<TreatmentCatalogItem> = {
      name: String(value.name || '').trim(),
      code: String(value.code || '').trim().toUpperCase(),
      type: value.type,
      departmentId: value.departmentId || null,
      baseRate: Number(value.baseRate || 0),
      defaultDurationMinutes: Number(value.defaultDurationMinutes || 0),
      requiresOperationSchedule: Boolean(value.requiresOperationSchedule),
      description: String(value.description || '').trim(),
      packageNotes: String(value.packageNotes || '').trim(),
      includedItems: this.includedItems,
      isActive: value.isActive !== false,
    };

    this.saving = true;
    const request$ = this.editingId
      ? this.backend.updateTreatmentCatalogItem(this.editingId, payload)
      : this.backend.createTreatmentCatalogItem(payload);

    request$.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.toastr.success(this.editingId ? 'Treatment updated.' : 'Treatment added.');
        this.closeModal();
        this.loadItems();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save treatment.'),
    });
  }

  deactivate(item: TreatmentCatalogItem): void {
    if (!this.can('treatment_catalog.update') && !this.can('*')) return;
    this.backend.deactivateTreatmentCatalogItem(item._id).subscribe({
      next: () => {
        this.toastr.success('Treatment deactivated.');
        this.loadItems();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to deactivate treatment.'),
    });
  }
}
