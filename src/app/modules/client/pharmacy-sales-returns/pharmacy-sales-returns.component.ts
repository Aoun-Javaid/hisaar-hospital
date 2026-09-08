import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { BackendService } from '../../../core/services/backend.service';
import { Sale, SalesReturn, Store } from '../../../shared/models/hospital.model';
import { formatCurrency, formatDate, readAssignedStoreId, toDateInputValue } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-sales-returns',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pharmacy-sales-returns.component.html',
  styleUrl: './pharmacy-sales-returns.component.scss',
})
export class PharmacySalesReturnsComponent implements OnInit {
  stores: Store[] = [];
  returns: SalesReturn[] = [];
  sales: Sale[] = [];
  loading = false;
  saving = false;
  modalOpen = false;
  storeId = readAssignedStoreId();
  fromDate = '';
  toDate = '';
  selectedSaleId = '';
  selectedSale: Sale | null = null;
  returnDate = toDateInputValue(new Date());
  refundAmount = 0;
  returnLines: Array<{ productId: string; name?: string; soldQty: number; qty: number; reason: string }> = [];

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadStores();
    this.loadReturns();
  }

  get refundTotal(): number {
    return this.returns.reduce((sum, item) => sum + Number(item.refundAmount || 0), 0);
  }

  get itemTotal(): number {
    return this.returns.reduce((sum, item) => sum + (item.items?.length || 0), 0);
  }

  get completedCount(): number {
    return this.returns.filter((item) => String(item.status || '').toLowerCase() === 'completed').length;
  }

  loadStores(): void {
    if (!this.backend.hasPermission('stores.read')) {
      return;
    }

    this.backend.getStores({ limit: 100, isActive: true }).subscribe({
      next: (result) => (this.stores = result.items),
      error: () => (this.stores = []),
    });
  }

  loadReturns(): void {
    this.loading = true;
    this.backend.listSalesReturns({
      limit: 100,
      storeId: this.storeId || undefined,
      fromDate: this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : undefined,
      toDate: this.toDate ? new Date(`${this.toDate}T23:59:59`).toISOString() : undefined,
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.returns = result.items),
        error: (err) => {
          this.returns = [];
          this.toastr.error(err?.error?.message || 'Unable to load sales returns.');
        },
      });
  }

  reset(): void {
    this.storeId = readAssignedStoreId();
    this.fromDate = '';
    this.toDate = '';
    this.loadReturns();
  }

  openCreate(): void {
    this.modalOpen = true;
    this.selectedSaleId = '';
    this.selectedSale = null;
    this.returnDate = toDateInputValue(new Date());
    this.refundAmount = 0;
    this.returnLines = [];
    this.backend.getSales({ limit: 100, storeId: this.storeId || undefined, status: 'completed' }).subscribe({
      next: (result) => (this.sales = result.items),
      error: () => (this.sales = []),
    });
  }

  closeModal(): void {
    if (!this.saving) {
      this.modalOpen = false;
    }
  }

  selectSale(): void {
    this.selectedSale = this.sales.find((sale) => sale._id === this.selectedSaleId) || null;
    this.returnLines = (this.selectedSale?.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      soldQty: Number(item.qty || 0),
      qty: 0,
      reason: '',
    }));
    this.refundAmount = 0;
  }

  save(): void {
    if (!this.selectedSale) {
      this.toastr.error('Choose a sale first.');
      return;
    }

    const items = this.returnLines
      .filter((line) => Number(line.qty) > 0)
      .map((line) => ({
        productId: line.productId,
        qty: Number(line.qty),
        reason: line.reason.trim() || undefined,
      }));

    if (!items.length) {
      this.toastr.error('Add at least one return quantity.');
      return;
    }

    this.saving = true;
    this.backend.createSalesReturn({
      saleId: this.selectedSale._id,
      returnDate: this.returnDate,
      items,
      refundAmount: Number(this.refundAmount || 0),
      paymentMethod: 'cash',
    }).subscribe({
      next: () => {
        this.saving = false;
        this.modalOpen = false;
        this.toastr.success('Sales return created.');
        this.loadReturns();
      },
      error: (err) => {
        this.saving = false;
        this.toastr.error(err?.error?.message || 'Unable to create sales return.');
      },
    });
  }

  saleLabel(item: SalesReturn): string {
    return item.invoiceNo || '-';
  }

  statusClass(status?: string): string {
    return `pharmacy-status-pill status-${String(status || 'draft').replace(/_/g, '-')}`;
  }

  currency(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  date(value: string | null | undefined): string {
    return formatDate(value);
  }
}
