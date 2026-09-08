import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { BackendService } from '../../../core/services/backend.service';
import { AppDialogService } from '../../../core/services/app-dialog.service';
import { Supplier } from '../../../shared/models/hospital.model';
import { formatCurrency } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-suppliers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pharmacy-suppliers.component.html',
  styleUrl: './pharmacy-suppliers.component.scss',
})
export class PharmacySuppliersComponent implements OnInit {
  suppliers: Supplier[] = [];
  loading = false;
  saving = false;
  modalOpen = false;
  search = '';
  statusFilter = '';
  editingSupplier: Supplier | null = null;
  form = this.emptyForm();

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
    private dialog: AppDialogService,
  ) {}

  ngOnInit(): void {
    this.loadSuppliers();
  }

  get canCreate(): boolean {
    return this.backend.hasPermission('suppliers.create');
  }

  get canUpdate(): boolean {
    return this.backend.hasPermission('suppliers.update');
  }

  get canDelete(): boolean {
    return this.backend.hasPermission('suppliers.delete');
  }

  get totalCount(): number {
    return this.suppliers.length;
  }

  get activeCount(): number {
    return this.suppliers.filter((supplier) => supplier.isActive).length;
  }

  get inactiveCount(): number {
    return this.suppliers.filter((supplier) => !supplier.isActive).length;
  }

  get totalOpeningBalance(): number {
    return this.suppliers.reduce((sum, supplier) => sum + Number(supplier.openingBalance || 0), 0);
  }

  loadSuppliers(): void {
    this.loading = true;
    this.backend.getSuppliers({
      limit: 100,
      search: this.search.trim() || undefined,
      isActive: this.statusFilter === '' ? undefined : this.statusFilter,
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.suppliers = result.items),
        error: (err) => {
          this.suppliers = [];
          this.toastr.error(err?.error?.message || 'Unable to load suppliers.');
        },
      });
  }

  resetFilters(): void {
    this.search = '';
    this.statusFilter = '';
    this.loadSuppliers();
  }

  openCreate(): void {
    this.editingSupplier = null;
    this.form = this.emptyForm();
    this.modalOpen = true;
  }

  openEdit(supplier: Supplier): void {
    this.editingSupplier = supplier;
    this.form = {
      name: supplier.name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      city: supplier.city || '',
      openingBalance: String(supplier.openingBalance ?? 0),
      creditLimit: String(supplier.creditLimit ?? 0),
      taxNumber: supplier.taxNumber || '',
      notes: supplier.notes || '',
      isActive: supplier.isActive,
    };
    this.modalOpen = true;
  }

  closeModal(): void {
    if (!this.saving) {
      this.modalOpen = false;
    }
  }

  save(): void {
    if (!this.form.name.trim()) {
      this.toastr.error('Supplier name is required.');
      return;
    }

    const payload = {
      name: this.form.name.trim(),
      phone: this.form.phone.trim() || undefined,
      email: this.form.email.trim() || undefined,
      address: this.form.address.trim() || undefined,
      city: this.form.city.trim() || undefined,
      openingBalance: this.form.openingBalance || '0',
      creditLimit: this.form.creditLimit || '0',
      taxNumber: this.form.taxNumber.trim() || undefined,
      notes: this.form.notes.trim() || undefined,
      isActive: this.form.isActive,
    };

    const request = this.editingSupplier
      ? this.backend.updateSupplier(this.editingSupplier._id, payload)
      : this.backend.createSupplier(payload);

    this.saving = true;
    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.modalOpen = false;
        this.toastr.success(this.editingSupplier ? 'Supplier updated.' : 'Supplier created.');
        this.loadSuppliers();
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Unable to save supplier.');
      },
    });
  }

  async remove(supplier: Supplier): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Delete Supplier',
      message: `Delete ${supplier.name}?`,
      confirmText: 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.backend.deleteSupplier(supplier._id).subscribe({
      next: () => {
        this.toastr.success('Supplier deleted.');
        this.loadSuppliers();
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Unable to delete supplier.');
      },
    });
  }

  currency(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  private emptyForm() {
    return {
      name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      openingBalance: '0',
      creditLimit: '0',
      taxNumber: '',
      notes: '',
      isActive: true,
    };
  }
}
