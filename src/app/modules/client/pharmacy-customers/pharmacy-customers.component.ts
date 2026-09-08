import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { BackendService } from '../../../core/services/backend.service';
import { AppDialogService } from '../../../core/services/app-dialog.service';
import { Customer } from '../../../shared/models/hospital.model';
import { formatCurrency } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pharmacy-customers.component.html',
  styleUrl: './pharmacy-customers.component.scss',
})
export class PharmacyCustomersComponent implements OnInit {
  customers: Customer[] = [];
  loading = false;
  saving = false;
  modalOpen = false;
  search = '';
  statusFilter = '';
  editingCustomer: Customer | null = null;
  form = this.emptyForm();

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
    private dialog: AppDialogService,
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
  }

  get canCreate(): boolean {
    return this.backend.hasPermission('customers.create');
  }

  get canUpdate(): boolean {
    return this.backend.hasPermission('customers.update');
  }

  get canDelete(): boolean {
    return this.backend.hasPermission('customers.delete');
  }

  get totalCount(): number {
    return this.customers.length;
  }

  get activeCount(): number {
    return this.customers.filter((customer) => customer.isActive).length;
  }

  get inactiveCount(): number {
    return this.customers.filter((customer) => !customer.isActive).length;
  }

  get creditCount(): number {
    return this.customers.filter((customer) => Number(customer.creditLimit || 0) > 0).length;
  }

  shortId(id: string | null | undefined): string {
    const value = String(id || '');
    return value ? `#${value.slice(-6).toUpperCase()}` : '-';
  }

  loadCustomers(): void {
    this.loading = true;
    this.backend.getCustomers({
      limit: 100,
      search: this.search.trim() || undefined,
      isActive: this.statusFilter === '' ? undefined : this.statusFilter,
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.customers = result.items),
        error: (err) => {
          this.customers = [];
          this.toastr.error(err?.error?.message || 'Unable to load customers.');
        },
      });
  }

  resetFilters(): void {
    this.search = '';
    this.statusFilter = '';
    this.loadCustomers();
  }

  openCreate(): void {
    this.editingCustomer = null;
    this.form = this.emptyForm();
    this.modalOpen = true;
  }

  openEdit(customer: Customer): void {
    this.editingCustomer = customer;
    this.form = {
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      city: customer.city || '',
      openingBalance: String(customer.openingBalance ?? 0),
      creditLimit: String(customer.creditLimit ?? 0),
      notes: customer.notes || '',
      isActive: customer.isActive,
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
      this.toastr.error('Customer name is required.');
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
      notes: this.form.notes.trim() || undefined,
      isActive: this.form.isActive,
    };

    const request = this.editingCustomer
      ? this.backend.updateCustomer(this.editingCustomer._id, payload)
      : this.backend.createCustomer(payload);

    this.saving = true;
    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.modalOpen = false;
        this.toastr.success(this.editingCustomer ? 'Customer updated.' : 'Customer created.');
        this.loadCustomers();
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Unable to save customer.');
      },
    });
  }

  async remove(customer: Customer): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Delete Customer',
      message: `Delete ${customer.name}?`,
      confirmText: 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.backend.deleteCustomer(customer._id).subscribe({
      next: () => {
        this.toastr.success('Customer deleted.');
        this.loadCustomers();
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Unable to delete customer.');
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
      notes: '',
      isActive: true,
    };
  }
}
