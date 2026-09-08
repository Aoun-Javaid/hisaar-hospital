import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { AppDialogService } from '../../../core/services/app-dialog.service';
import { BackendService } from '../../../core/services/backend.service';
import { ProductCatalogItem, Supplier, Warehouse } from '../../../shared/models/hospital.model';
import { formatCurrency, formatDate } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-purchases',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pharmacy-purchases.component.html',
  styleUrl: './pharmacy-purchases.component.scss',
})
export class PharmacyPurchasesComponent implements OnInit {
  view: 'list' | 'create' | 'detail' | 'returns' = 'list';
  loading = false;
  saving = false;
  purchases: Array<Record<string, unknown>> = [];
  purchase: Record<string, unknown> | null = null;
  returns: Array<Record<string, unknown>> = [];
  suppliers: Supplier[] = [];
  warehouses: Warehouse[] = [];
  products: ProductCatalogItem[] = [];
  status = '';
  form = this.emptyForm();
  warehouseCreateOpen = false;
  creatingWarehouse = false;
  warehouseForm = { name: '', code: '' };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private backend: BackendService,
    private dialog: AppDialogService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.view = (data['purchasesView'] as typeof this.view) || 'list';
      this.refresh();
    });
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.view = 'detail';
        this.loadPurchase(id);
      }
    });
    this.backend.getSuppliers({ limit: 100 }).subscribe({
      next: (result) => (this.suppliers = result.items),
      error: () => (this.suppliers = []),
    });
    this.loadWarehouses();
    this.backend.getProducts({ limit: 100, isActive: true }).subscribe({
      next: (result) => (this.products = result.items),
      error: () => (this.products = []),
    });
  }

  get canCreate(): boolean {
    return this.backend.hasPermission('purchases.create');
  }

  get canReceive(): boolean {
    return this.backend.hasPermission('purchases.receive');
  }

  get canCancel(): boolean {
    return this.backend.hasPermission('purchases.cancel');
  }

  get canManageWarehouses(): boolean {
    return this.backend.hasPermission('warehouses.manage');
  }

  get purchaseTotal(): number {
    return this.purchases.reduce((sum, item) => sum + Number(item['total'] || 0), 0);
  }

  get purchasePaid(): number {
    return this.purchases.reduce((sum, item) => sum + Number(item['paidAmount'] || 0), 0);
  }

  get purchasePending(): number {
    return Math.max(this.purchaseTotal - this.purchasePaid, 0);
  }

  get returnTotal(): number {
    return this.returns.reduce((sum, item) => sum + Number(item['total'] || 0), 0);
  }

  get returnPendingCount(): number {
    return this.returns.filter((item) => {
      const status = String(item['status'] || '').toLowerCase();
      return status === 'draft' || status === 'pending';
    }).length;
  }

  get returnCompletedCount(): number {
    return this.returns.filter((item) => {
      const status = String(item['status'] || '').toLowerCase();
      return status === 'completed' || status === 'posted' || status === 'received';
    }).length;
  }

  loadWarehouses(): void {
    this.backend.getWarehouses({ limit: 100, isActive: true }).subscribe({
      next: (result) => (this.warehouses = result.items || []),
      error: () => (this.warehouses = []),
    });
  }

  openWarehouseCreate(): void {
    this.warehouseCreateOpen = true;
    this.warehouseForm = { name: '', code: '' };
  }

  createWarehouse(): void {
    const name = this.warehouseForm.name.trim();
    const code = this.warehouseForm.code.trim().toUpperCase();
    if (name.length < 2 || code.length < 2) {
      this.toastr.error('Warehouse name and code must be at least 2 characters');
      return;
    }
    this.creatingWarehouse = true;
    this.backend
      .createWarehouse({ name, code })
      .pipe(finalize(() => (this.creatingWarehouse = false)))
      .subscribe({
        next: (response) => {
          const warehouse = response.data;
          this.toastr.success('Warehouse created');
          this.warehouseCreateOpen = false;
          this.warehouseForm = { name: '', code: '' };
          if (warehouse?._id) {
            this.warehouses = [warehouse, ...this.warehouses.filter((item) => item._id !== warehouse._id)];
            this.form.warehouseId = warehouse._id;
          } else {
            this.loadWarehouses();
          }
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to create warehouse'),
      });
  }

  refresh(): void {
    if (this.view === 'returns') {
      this.loadReturns();
      return;
    }
    if (this.view === 'create') {
      return;
    }
    if (this.view !== 'detail') {
      this.loadPurchases();
    }
  }

  loadPurchases(): void {
    this.loading = true;
    this.backend
      .getPurchases({ limit: 100, status: this.status || undefined })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.purchases = result.items),
        error: (err) => {
          this.purchases = [];
          this.toastr.error(err?.error?.message || 'Unable to load purchases');
        },
      });
  }

  loadPurchase(id: string): void {
    this.loading = true;
    this.backend
      .getPurchaseById(id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (item) => (this.purchase = item),
        error: (err) => this.toastr.error(err?.error?.message || 'Purchase not found'),
      });
  }

  loadReturns(): void {
    this.loading = true;
    this.backend
      .getPurchaseReturns({ limit: 100 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.returns = result.items || []),
        error: () => (this.returns = []),
      });
  }

  addLine(): void {
    this.form.items.push({ productId: '', qty: 1, unitCost: 0, discount: 0, tax: 0, batchNumber: '', expiryDate: '' });
  }

  removeLine(index: number): void {
    this.form.items.splice(index, 1);
  }

  save(): void {
    if (this.saving) {
      return;
    }
    if (!this.form.warehouseId || !this.form.supplierId || !this.form.items.length) {
      this.toastr.error('Supplier, warehouse, and at least one item are required');
      return;
    }
    this.saving = true;
    this.backend
      .createPurchase({
        warehouseId: this.form.warehouseId,
        supplierId: this.form.supplierId,
        purchaseDate: this.form.purchaseDate,
        note: this.form.note,
        status: this.form.status,
        paidAmount: this.form.paidAmount || 0,
        paymentMethod: this.form.paymentMethod || undefined,
        items: this.form.items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          unitCost: item.unitCost,
          discount: item.discount || 0,
          tax: item.tax || 0,
          batchNumber: item.batchNumber || undefined,
          expiryDate: item.expiryDate || undefined,
        })),
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (response) => {
          this.toastr.success('Purchase saved');
          const data = (response.data || {}) as Record<string, unknown>;
          const created = (data['purchase'] as Record<string, unknown> | undefined) || data;
          const id = String(created['_id'] || '');
          if (id) {
            void this.router.navigate(['/pharmacy/purchases', id]);
          } else {
            void this.router.navigate(['/pharmacy/purchases']);
          }
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to save purchase'),
      });
  }

  receive(id: string): void {
    if (this.saving) {
      return;
    }
    this.dialog
      .confirm({
        title: 'Receive purchase',
        message: 'Receive this purchase into inventory and post accounts payable?',
        confirmText: 'Receive',
      })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.saving = true;
        this.backend
          .receivePurchase(id)
          .pipe(finalize(() => (this.saving = false)))
          .subscribe({
            next: () => {
              this.toastr.success('Purchase received');
              this.loadPurchase(id);
            },
            error: (err) => this.toastr.error(err?.error?.message || 'Unable to receive purchase'),
          });
      });
  }

  cancel(id: string): void {
    if (this.saving) {
      return;
    }
    this.dialog
      .confirm({
        title: 'Cancel purchase',
        message: 'Cancel this purchase? Posted stock must be reversed with a purchase return.',
        confirmText: 'Cancel',
      })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.saving = true;
        this.backend
          .cancelPurchase(id)
          .pipe(finalize(() => (this.saving = false)))
          .subscribe({
            next: () => {
              this.toastr.success('Purchase cancelled');
              this.loadPurchase(id);
            },
            error: (err) => this.toastr.error(err?.error?.message || 'Unable to cancel purchase'),
          });
      });
  }

  text(value: unknown): string {
    return value == null ? '' : String(value);
  }

  currency(value: unknown): string {
    return formatCurrency(value as string | number | null | undefined);
  }

  date(value: unknown): string {
    return formatDate(this.text(value) || null);
  }

  statusClass(status?: string): string {
    return `status-${String(status || 'draft').replace(/_/g, '-')}`;
  }

  balance(record: Record<string, unknown> | null = this.purchase): number {
    const total = Number(record?.['total'] || 0);
    const paid = Number(record?.['paidAmount'] || 0);
    return Math.max(total - paid, 0);
  }

  paymentStatusLabel(record: Record<string, unknown> | null = this.purchase): string {
    const status = this.text(record?.['paymentStatus']) || 'unpaid';
    return status.replace(/_/g, ' ');
  }

  supplierName(record: Record<string, unknown> | null = this.purchase): string {
    const id = this.text(record?.['supplierId']);
    return this.suppliers.find((supplier) => supplier._id === id)?.name || id || '—';
  }

  warehouseName(record: Record<string, unknown> | null = this.purchase): string {
    const id = this.text(record?.['warehouseId']);
    return this.warehouses.find((warehouse) => warehouse._id === id)?.name || id || '—';
  }

  purchaseLines(): Array<Record<string, unknown>> {
    const items = this.purchase?.['items'];
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  }

  private emptyForm() {
    return {
      warehouseId: '',
      supplierId: '',
      purchaseDate: new Date().toISOString().slice(0, 10),
      note: '',
      status: 'draft',
      paidAmount: 0,
      paymentMethod: '',
      items: [{ productId: '', qty: 1, unitCost: 0, discount: 0, tax: 0, batchNumber: '', expiryDate: '' }],
    };
  }
}
