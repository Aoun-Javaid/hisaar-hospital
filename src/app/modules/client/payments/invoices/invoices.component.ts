import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../../core/services/backend.service';
import { downloadExcelWorkbook } from '../../../../core/utils/excel-export.util';
import { Bill } from '../../../../shared/models/hospital.model';

@Component({
  selector: 'app-invoices',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.scss',
})
export class InvoicesComponent implements OnInit {
  bills: Bill[] = [];
  loading = false;
  paymentStatus = '';
  dateFrom = '';
  dateTo = '';
  search = '';
  page = 1;
  limit = 10;
  totalPages = 0;
  totalItems = 0;
  filtersOpen = true;
  actionsOpen = false;
  selectedBill: Bill | null = null;

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadBills();
  }

  can(permission: string): boolean {
    return this.backend.hasPermission(permission);
  }

  get kpiTotal(): number {
    return this.totalItems || this.bills.length;
  }

  get kpiUnpaid(): number {
    return this.bills.filter((bill) => bill.paymentStatus === 'unpaid').length;
  }

  get kpiPartial(): number {
    return this.bills.filter((bill) => bill.paymentStatus === 'partial').length;
  }

  get kpiPaid(): number {
    return this.bills.filter((bill) => bill.paymentStatus === 'paid').length;
  }

  get kpiOutstandingDue(): number {
    return this.bills.reduce((sum, bill) => sum + Math.max(bill.dueAmount || 0, 0), 0);
  }

  get visibleBills(): Bill[] {
    const term = this.search.trim().toLowerCase();
    if (!term) {
      return this.bills;
    }
    return this.bills.filter((bill) => {
      const patient = this.patientName(bill).toLowerCase();
      return (
        bill.billNo?.toLowerCase().includes(term) ||
        patient.includes(term) ||
        (bill.sourceNo || '').toLowerCase().includes(term)
      );
    });
  }

  loadBills(): void {
    this.loading = true;
    this.backend
      .getBills({
        page: this.page,
        limit: this.limit,
        paymentStatus: this.paymentStatus,
        dateFrom: this.dateFrom,
        dateTo: this.dateTo,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => {
          this.bills = result.items;
          this.totalPages = result.pagination.totalPages;
          this.totalItems = result.pagination.total;
        },
        error: (err) => {
          this.bills = [];
          this.totalItems = 0;
          this.toastr.error(err?.error?.message || 'Something went wrong');
        },
      });
  }

  applyFilters(): void {
    this.page = 1;
    this.loadBills();
  }

  clearFilters(): void {
    this.paymentStatus = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.search = '';
    this.page = 1;
    this.loadBills();
  }

  updatePayment(bill: Bill): void {
    if (!this.can('bills.update_payment')) {
      return;
    }

    const amount = prompt('Paid amount', String(bill.paidAmount || bill.grandTotal));
    if (amount === null) {
      return;
    }

    const method = prompt('Payment method (cash, card, bank, online, wallet, check)', bill.paymentMethod || 'cash') || 'cash';
    this.backend
      .updateBillPayment(bill._id, {
        paidAmount: Number(amount),
        paymentMethod: method,
      })
      .subscribe({
        next: (response) => {
          this.toastr.success(response.message);
          this.loadBills();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Something went wrong'),
      });
  }

  openActions(bill: Bill, event?: Event): void {
    event?.stopPropagation();
    this.selectedBill = bill;
    this.actionsOpen = true;
  }

  closeActions(): void {
    this.actionsOpen = false;
    this.selectedBill = null;
  }

  viewInvoice(): void {
    if (!this.selectedBill?._id) return;
    const id = this.selectedBill._id;
    this.closeActions();
    void this.router.navigate(['/payments/invoices/invoice-detail', id]);
  }

  payInvoice(): void {
    if (!this.selectedBill) return;
    const bill = this.selectedBill;
    this.closeActions();
    this.updatePayment(bill);
  }

  canShowPayment(bill: Bill | null): boolean {
    return !!bill && this.can('bills.update_payment');
  }

  patientName(bill: Bill): string {
    return bill.patient ? `${bill.patient.firstName} ${bill.patient.lastName}`.trim() : '-';
  }

  statusLabel(status: string): string {
    if (status === 'paid') return 'Paid';
    if (status === 'partial') return 'Partially Paid';
    return 'Unpaid';
  }

  exportInvoices(): void {
    if (!this.visibleBills.length) {
      this.toastr.info('No invoices to export');
      return;
    }

    downloadExcelWorkbook(`invoices-page-${this.page}`, [
      {
        name: 'Invoices',
        columns: [
          { header: 'Bill No', key: 'billNo' },
          { header: 'Patient', key: 'patient' },
          { header: 'Source', key: 'source' },
          { header: 'Bill Date', key: 'billDate' },
          { header: 'Total', key: 'total' },
          { header: 'Paid', key: 'paid' },
          { header: 'Due', key: 'due' },
          { header: 'Status', key: 'status' },
        ],
        rows: this.visibleBills.map((bill) => ({
          billNo: bill.billNo,
          patient: this.patientName(bill),
          source: bill.sourceNo || bill.sourceType || '—',
          billDate: bill.createdAt ? new Date(bill.createdAt).toLocaleDateString() : '—',
          total: bill.grandTotal,
          paid: bill.paidAmount,
          due: bill.dueAmount,
          status: this.statusLabel(bill.paymentStatus),
        })),
      },
    ]);
  }

  printInvoices(): void {
    if (!this.visibleBills.length) {
      this.toastr.info('No invoices to print');
      return;
    }

    const rows = this.visibleBills
      .map(
        (bill) => `
        <tr>
          <td>${bill.billNo}</td>
          <td>${this.patientName(bill)}</td>
          <td>${bill.sourceNo || bill.sourceType || '—'}</td>
          <td>${bill.createdAt ? new Date(bill.createdAt).toLocaleDateString() : '—'}</td>
          <td style="text-align:right">${bill.grandTotal}</td>
          <td style="text-align:right">${bill.paidAmount}</td>
          <td style="text-align:right">${bill.dueAmount}</td>
          <td>${this.statusLabel(bill.paymentStatus)}</td>
        </tr>`
      )
      .join('');

    const html = `
      <html>
        <head>
          <title>Invoices</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; }
            h1 { font-size: 18px; margin: 0 0 12px; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>Invoice Register</h1>
          <table>
            <thead>
              <tr>
                <th>Bill No</th><th>Patient</th><th>Source</th><th>Bill Date</th>
                <th>Total</th><th>Paid</th><th>Due</th><th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;

    const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
    if (!win) {
      this.toastr.error('Unable to open print window');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  changePage(nextPage: number): void {
    if (nextPage < 1 || (this.totalPages && nextPage > this.totalPages)) {
      return;
    }

    this.page = nextPage;
    this.loadBills();
  }

  pageRangeLabel(): string {
    if (!this.visibleBills.length) {
      return '0 invoices';
    }
    const start = (this.page - 1) * this.limit + 1;
    const end = start + this.visibleBills.length - 1;
    return `${start}-${end} of ${this.totalItems || this.visibleBills.length}`;
  }
}
