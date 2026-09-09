import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { AppDialogService } from '../../../core/services/app-dialog.service';
import { BackendService } from '../../../core/services/backend.service';
import { downloadExcelWorkbook } from '../../../core/utils/excel-export.util';
import { HmsDocumentToolbarComponent } from '../../../shared/components/hms-document-toolbar/hms-document-toolbar.component';
import { Sale, Store } from '../../../shared/models/hospital.model';
import { formatCurrency, formatDateTime, readAssignedStoreId } from '../pharmacy-admin.utils';
import { buildPharmacyReportHtml } from '../pharmacy-export.util';

@Component({
  selector: 'app-pharmacy-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HmsDocumentToolbarComponent],
  templateUrl: './pharmacy-sales.component.html',
  styleUrl: './pharmacy-sales.component.scss',
})
export class PharmacySalesComponent implements OnInit {
  stores: Store[] = [];
  sales: Sale[] = [];
  loading = false;
  storeId = readAssignedStoreId();
  status = '';
  fromDate = '';
  toDate = '';

  readonly getExportHtml = () =>
    buildPharmacyReportHtml(
      'Pharmacy Sales',
      [
        { header: 'Invoice', key: 'invoiceNo' },
        { header: 'Date', key: 'saleDate' },
        { header: 'Status', key: 'status' },
        { header: 'Payment', key: 'paymentStatus' },
        { header: 'Total', key: 'total' },
        { header: 'Paid', key: 'paidAmount' },
        { header: 'Balance', key: 'balance' },
      ],
      this.exportRows(),
    );

  constructor(
    private backend: BackendService,
    private dialog: AppDialogService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadStores();
    this.loadSales();
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

  loadSales(): void {
    this.loading = true;
    this.backend
      .getSales({
        limit: 100,
        storeId: this.storeId || undefined,
        status: this.status || undefined,
        fromDate: this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : undefined,
        toDate: this.toDate ? new Date(`${this.toDate}T23:59:59`).toISOString() : undefined,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.sales = result.items),
        error: (err) => {
          this.sales = [];
          this.toastr.error(err?.error?.message || 'Unable to load sales.');
        },
      });
  }

  reset(): void {
    this.storeId = readAssignedStoreId();
    this.status = '';
    this.fromDate = '';
    this.toDate = '';
    this.loadSales();
  }

  canCancel(sale: Sale): boolean {
    return this.backend.hasPermission('sales.cancel') && sale.status === 'completed';
  }

  get totalSales(): number {
    return this.sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  }

  get totalPaid(): number {
    return this.sales.reduce((sum, sale) => sum + Number(sale.paidAmount || 0), 0);
  }

  get totalItems(): number {
    return this.sales.reduce((sum, sale) => sum + (sale.items?.length || 0), 0);
  }

  get unpaidCount(): number {
    return this.sales.filter((sale) => String(sale.paymentStatus || '').toLowerCase() !== 'paid').length;
  }

  statusClass(status?: string): string {
    return `status-${String(status || 'draft').replace(/_/g, '-')}`;
  }

  paymentStatusClass(status?: string): string {
    const value = String(status || '').toLowerCase();
    if (value === 'paid') {
      return 'status-paid';
    }
    if (value === 'unpaid' || value === 'partial' || value === 'partially_paid') {
      return 'status-unpaid';
    }
    return this.statusClass(status);
  }

  exportExcel(): void {
    downloadExcelWorkbook('pharmacy-sales', [
      {
        name: 'Sales',
        columns: [
          { header: 'Invoice', key: 'invoiceNo' },
          { header: 'Date', key: 'saleDate' },
          { header: 'Status', key: 'status' },
          { header: 'Payment', key: 'paymentStatus' },
          { header: 'Total', key: 'total' },
          { header: 'Paid', key: 'paidAmount' },
          { header: 'Balance', key: 'balance' },
        ],
        rows: this.exportRows(),
      },
    ]);
  }

  async cancel(sale: Sale): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Cancel Sale',
      message: `Cancel ${sale.invoiceNo}? This will reverse stock.`,
      confirmText: 'Cancel Sale',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.backend.cancelSale(sale._id).subscribe({
      next: () => {
        this.toastr.success('Sale cancelled.');
        this.loadSales();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to cancel sale.'),
    });
  }

  currency(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  dateTime(value: string | null | undefined): string {
    return formatDateTime(value);
  }

  private exportRows(): Array<Record<string, unknown>> {
    return this.sales.map((sale) => {
      const total = Number(sale.total || 0);
      const paid = Number(sale.paidAmount || 0);
      return {
        invoiceNo: sale.invoiceNo,
        saleDate: this.dateTime(sale.saleDate),
        status: sale.status,
        paymentStatus: sale.paymentStatus,
        total: this.currency(total),
        paidAmount: this.currency(paid),
        balance: this.currency(Math.max(total - paid, 0)),
      };
    });
  }
}
