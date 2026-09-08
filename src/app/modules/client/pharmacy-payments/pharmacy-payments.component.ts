import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { BackendService } from '../../../core/services/backend.service';
import {
  Expense,
  Payment,
  Sale,
  SalePaymentMethod,
  SalesReturn,
  Store,
} from '../../../shared/models/hospital.model';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  readAssignedStoreId,
  toDateInputValue,
} from '../pharmacy-admin.utils';

type PaymentSortKey = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc';

interface MethodHighlight {
  key: 'cash' | 'card' | 'bank' | 'credit';
  label: string;
  amount: number;
  count: number;
  percent: number;
  icon: string;
}

@Component({
  selector: 'app-pharmacy-payments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pharmacy-payments.component.html',
  styleUrl: './pharmacy-payments.component.scss',
})
export class PharmacyPaymentsComponent implements OnInit {
  stores: Store[] = [];
  payments: Payment[] = [];
  creditSales: Sale[] = [];
  sales: Sale[] = [];
  salesReturns: SalesReturn[] = [];
  expenses: Expense[] = [];
  loading = false;
  saving = false;
  modalOpen = false;
  detailOpen = false;
  selectedPayment: Payment | null = null;
  storeId = readAssignedStoreId();
  method = '';
  fromDate = '';
  toDate = '';
  searchQuery = '';
  sortKey: PaymentSortKey = 'dateDesc';
  pageSize = 10;
  page = 1;
  methods: SalePaymentMethod[] = [
    'cash',
    'card',
    'bank',
    'online',
    'wallet',
    'check',
  ];
  form = this.emptyForm();

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.applyDefaultDateRange();
    this.loadStores();
    this.loadPayments();
  }

  get canCreate(): boolean {
    return this.backend.hasPermission('payments.create');
  }

  get visiblePayments(): Payment[] {
    const query = this.searchQuery.trim().toLowerCase();
    let rows = [...this.payments];

    if (query) {
      rows = rows.filter((payment) => {
        const haystack = [
          this.referenceTypeLabel(payment.referenceType),
          this.referenceDocLabel(payment),
          this.storeName(payment.storeId),
          payment.method,
          payment.note,
          payment.bankName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    rows.sort((a, b) => {
      const amountA = Number(a.amount || 0);
      const amountB = Number(b.amount || 0);
      const dateA = new Date(a.paymentDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.paymentDate || b.createdAt || 0).getTime();

      switch (this.sortKey) {
        case 'dateAsc':
          return dateA - dateB;
        case 'amountDesc':
          return amountB - amountA;
        case 'amountAsc':
          return amountA - amountB;
        case 'dateDesc':
        default:
          return dateB - dateA;
      }
    });

    return rows;
  }

  get pagedPayments(): Payment[] {
    if (this.pageSize <= 0) {
      return this.visiblePayments;
    }
    const start = (this.page - 1) * this.pageSize;
    return this.visiblePayments.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    if (this.pageSize <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.visiblePayments.length / this.pageSize));
  }

  get totalAmount(): number {
    return this.visiblePayments.reduce(
      (sum, payment) => sum + (Number(payment.amount || 0) || 0),
      0,
    );
  }

  get creditOutstandingAmount(): number {
    return this.creditSales.reduce((sum, sale) => {
      const balance = Math.max(
        (Number(sale.total || 0) || 0) - (Number(sale.paidAmount || 0) || 0),
        0,
      );
      return sum + balance;
    }, 0);
  }

  get creditOutstandingCount(): number {
    return this.creditSales.filter((sale) => {
      const balance =
        (Number(sale.total || 0) || 0) - (Number(sale.paidAmount || 0) || 0);
      return balance > 0.0001;
    }).length;
  }

  get methodHighlights(): MethodHighlight[] {
    const paymentTotal = this.totalAmount || 0;
    const creditAmount = this.creditOutstandingAmount;
    const base = paymentTotal + creditAmount;
    const build = (
      key: MethodHighlight['key'],
      label: string,
      icon: string,
      amount: number,
      count: number,
    ): MethodHighlight => ({
      key,
      label,
      amount,
      count,
      percent: base > 0 ? (amount / base) * 100 : 0,
      icon,
    });

    const byMethod = (key: 'cash' | 'card' | 'bank') => {
      const matched = this.visiblePayments.filter(
        (payment) => String(payment.method || '').toLowerCase() === key,
      );
      const amount = matched.reduce(
        (sum, payment) => sum + (Number(payment.amount || 0) || 0),
        0,
      );
      return { amount, count: matched.length };
    };

    const cash = byMethod('cash');
    const card = byMethod('card');
    const bank = byMethod('bank');

    return [
      build('cash', 'Cash', 'fa-money', cash.amount, cash.count),
      build('card', 'Card', 'fa-credit-card', card.amount, card.count),
      build('bank', 'Bank', 'fa-university', bank.amount, bank.count),
      build(
        'credit',
        'Credit',
        'fa-handshake-o',
        creditAmount,
        this.creditOutstandingCount,
      ),
    ];
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

  loadPayments(): void {
    this.loading = true;
    this.page = 1;
    const fromDate = this.fromDate
      ? new Date(`${this.fromDate}T00:00:00`).toISOString()
      : undefined;
    const toDate = this.toDate
      ? new Date(`${this.toDate}T23:59:59`).toISOString()
      : undefined;
    const storeId = this.storeId || undefined;

    this.backend
      .getPayments({
        limit: 100,
        storeId,
        method: this.method || undefined,
        fromDate,
        toDate,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.payments = result.items),
        error: (err) => {
          this.payments = [];
          this.toastr.error(err?.error?.message || 'Unable to load payments.');
        },
      });

    this.loadCreditSales({ storeId, fromDate, toDate });
  }

  private loadCreditSales(filters: {
    storeId?: string;
    fromDate?: string;
    toDate?: string;
  }): void {
    if (!this.backend.hasPermission('sales.read')) {
      this.creditSales = [];
      return;
    }

    this.backend
      .getSales({
        limit: 100,
        storeId: filters.storeId,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        status: 'completed',
      })
      .subscribe({
        next: (result) => {
          this.creditSales = (result.items || []).filter((sale) => {
            const balance =
              (Number(sale.total || 0) || 0) - (Number(sale.paidAmount || 0) || 0);
            return balance > 0.0001;
          });
        },
        error: () => {
          this.creditSales = [];
        },
      });
  }

  reset(): void {
    this.storeId = readAssignedStoreId();
    this.method = '';
    this.searchQuery = '';
    this.sortKey = 'dateDesc';
    this.pageSize = 10;
    this.page = 1;
    this.applyDefaultDateRange();
    this.loadPayments();
  }

  onSortOrPageChange(): void {
    this.page = 1;
  }

  goToPage(page: number): void {
    this.page = Math.min(Math.max(1, page), this.totalPages);
  }

  openCreate(): void {
    this.form = this.emptyForm();
    this.form.storeId = this.storeId;
    this.modalOpen = true;
    this.loadReferenceOptions();
  }

  closeModal(): void {
    if (!this.saving) {
      this.modalOpen = false;
    }
  }

  openDetail(payment: Payment): void {
    this.selectedPayment = payment;
    this.detailOpen = true;
  }

  closeDetail(): void {
    this.detailOpen = false;
    this.selectedPayment = null;
  }

  onReferenceTypeChange(): void {
    this.form.referenceId = '';
  }

  currentReferenceOptions(): Array<Sale | SalesReturn | Expense> {
    if (this.form.referenceType === 'sales_return') {
      return this.salesReturns;
    }
    if (this.form.referenceType === 'expense') {
      return this.expenses;
    }
    return this.sales;
  }

  referenceLabel(item: Sale | SalesReturn | Expense): string {
    if ('invoiceNo' in item) {
      return item.invoiceNo || item._id;
    }
    if ('returnNo' in item) {
      return item.returnNo || item._id;
    }
    return item.title || item._id;
  }

  referenceTypeLabel(type: string | null | undefined): string {
    if (type === 'sale') {
      return 'Sale';
    }
    if (type === 'sales_return') {
      return 'Sales return';
    }
    if (type === 'expense') {
      return 'Expense';
    }
    return type || '-';
  }

  referenceDocLabel(payment: Payment): string {
    const note = String(payment.note || '');
    const match = note.match(/\b(?:SAL|SRET|PUR|EXP|WRQ|TRF)-[A-Z0-9-]+\b/i);
    return match ? match[0] : '';
  }

  displayNote(payment: Payment): string {
    const note = String(payment.note || '').trim();
    if (!note) {
      return '-';
    }
    return note.replace(/\b(?:PAY|T)-[A-Z0-9-]+\b/gi, '').replace(/\s{2,}/g, ' ').trim() || note;
  }

  methodLabel(method: string | null | undefined): string {
    const value = String(method || '').trim();
    if (!value) {
      return '-';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  methodClass(method: string | null | undefined): string {
    const value = String(method || '').toLowerCase();
    if (
      value === 'cash' ||
      value === 'card' ||
      value === 'bank' ||
      value === 'credit'
    ) {
      return value;
    }
    return 'other';
  }

  methodIcon(method: string | null | undefined): string {
    switch (String(method || '').toLowerCase()) {
      case 'cash':
        return 'fa-money';
      case 'card':
        return 'fa-credit-card';
      case 'bank':
        return 'fa-university';
      case 'credit':
        return 'fa-handshake-o';
      case 'online':
        return 'fa-globe';
      case 'wallet':
        return 'fa-google-wallet';
      case 'check':
        return 'fa-pencil-square-o';
      default:
        return 'fa-money';
    }
  }

  methodDetail(payment: Payment): string {
    const method = String(payment.method || '').toLowerCase();
    if (method === 'bank' && payment.bankName) {
      return String(payment.bankName);
    }
    return '';
  }

  save(): void {
    if (!this.form.referenceId || Number(this.form.amount || 0) <= 0) {
      this.toastr.error('Reference and valid amount are required.');
      return;
    }

    this.saving = true;
    this.backend
      .createPayment({
        referenceType: this.form.referenceType,
        referenceId: this.form.referenceId,
        amount: Number(this.form.amount || 0),
        method: this.form.method,
        paymentDate: new Date(`${this.form.paymentDate}T12:00:00`).toISOString(),
        storeId: this.form.storeId || undefined,
        referenceNo: this.form.referenceNo.trim() || undefined,
        note: this.form.note.trim() || undefined,
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.modalOpen = false;
          this.toastr.success('Payment created.');
          this.loadPayments();
        },
        error: (err) => {
          this.toastr.error(err?.error?.message || 'Unable to create payment.');
        },
      });
  }

  storeName(id: string | null | undefined): string {
    return id ? this.stores.find((item) => item._id === id)?.name || id : '-';
  }

  currency(value: string | number | null | undefined): string {
    return formatCurrency(value);
  }

  date(value: string | null | undefined): string {
    return formatDate(value);
  }

  dateTime(value: string | null | undefined): string {
    return formatDateTime(value);
  }

  printRegister(): void {
    this.openPrintDocument(this.visiblePayments, 'Pharmacy Payment Statement');
  }

  exportPdf(): void {
    this.openPrintDocument(
      this.visiblePayments,
      'Pharmacy Payment Statement',
      true,
    );
  }

  printSingle(payment: Payment): void {
    this.openPrintDocument([payment], 'Pharmacy Payment Advice');
  }

  exportSinglePdf(payment: Payment): void {
    this.openPrintDocument([payment], 'Pharmacy Payment Advice', true);
  }

  private openPrintDocument(
    rows: Payment[],
    title: string,
    preferPdf = false,
  ): void {
    if (!rows.length) {
      this.toastr.info('No payments available to print.');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const printWindow = iframe.contentWindow;
    const printDocument = iframe.contentDocument || printWindow?.document;
    if (!printWindow || !printDocument) {
      iframe.remove();
      this.toastr.error('Unable to open print preview.');
      return;
    }

    printDocument.open();
    printDocument.write(this.buildBankingDocumentHtml(rows, title, preferPdf));
    printDocument.close();

    const finish = () => iframe.remove();
    printWindow.onafterprint = finish;
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      window.setTimeout(finish, 1500);
    }, 250);
  }

  private buildBankingDocumentHtml(
    rows: Payment[],
    title: string,
    preferPdf: boolean,
  ): string {
    const storeLabel = this.storeId
      ? this.storeName(this.storeId)
      : 'All stores';
    const rangeLabel =
      this.fromDate || this.toDate
        ? `${this.fromDate || '…'} → ${this.toDate || '…'}`
        : 'All dates';
    const total = rows.reduce(
      (sum, payment) => sum + (Number(payment.amount || 0) || 0),
      0,
    );
    const generatedAt = formatDateTime(new Date().toISOString());

    const methodTotals = (['cash', 'card', 'bank', 'credit'] as const)
      .map((key) => {
        const highlight = this.methodHighlights.find((item) => item.key === key);
        const amount = highlight?.amount || 0;
        return `<div class="pill ${key}"><strong>${this.methodLabel(key)}</strong><span>${this.currency(amount)}</span></div>`;
      })
      .join('');

    const bodyRows = rows
      .map((payment, index) => {
        const bank = this.methodDetail(payment);
        return `
          <tr>
            <td>${index + 1}</td>
            <td>
              <div class="primary">${this.dateTime(payment.paymentDate)}</div>
            </td>
            <td>
              <div class="primary">${this.referenceTypeLabel(payment.referenceType)}</div>
              <div class="muted">${this.referenceDocLabel(payment) || '—'}</div>
            </td>
            <td>${this.escapeHtml(this.storeName(payment.storeId))}</td>
            <td>
              <div class="primary">${this.methodLabel(payment.method)}</div>
              <div class="muted">${bank ? this.escapeHtml(bank) : '—'}</div>
            </td>
            <td class="amount">${this.currency(payment.amount)}</td>
            <td>${this.escapeHtml(this.displayNote(payment))}</td>
          </tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      background: #fff;
    }
    .sheet {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
    }
    .masthead {
      background: linear-gradient(135deg, #003e86 0%, #0ea5e9 100%);
      color: #fff;
      padding: 22px 24px 18px;
    }
    .brand {
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      opacity: 0.9;
      margin-bottom: 6px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 16px;
      font-size: 12px;
    }
    .meta div {
      background: rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 10px 12px;
    }
    .meta span {
      display: block;
      opacity: 0.8;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 14px 18px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
      border: 1px solid #e2e8f0;
      background: #fff;
    }
    .pill.cash { color: #047857; border-color: #a7f3d0; background: #ecfdf5; }
    .pill.card { color: #6d28d9; border-color: #ddd6fe; background: #f5f3ff; }
    .pill.bank { color: #1d4ed8; border-color: #bfdbfe; background: #eff6ff; }
    .pill.credit { color: #c2410c; border-color: #fed7aa; background: #fff7ed; }
    .pill strong { font-weight: 800; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .primary { font-weight: 700; color: #0f172a; }
    .muted { color: #64748b; margin-top: 2px; font-size: 11px; }
    .amount { font-weight: 800; white-space: nowrap; text-align: right; }
    tfoot td {
      background: #eff6ff;
      font-weight: 800;
      border-bottom: 0;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px 18px;
      color: #64748b;
      font-size: 11px;
    }
    .hint {
      padding: 0 18px 14px;
      color: #64748b;
      font-size: 11px;
    }
    @media print {
      .sheet { border: 0; border-radius: 0; }
      ${preferPdf ? 'body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }' : ''}
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="masthead">
      <div class="brand">Hisaar360 HMS · Pharmacy Ledger</div>
      <h1>${this.escapeHtml(title)}</h1>
      <div class="meta">
        <div><span>Store</span><strong>${this.escapeHtml(storeLabel)}</strong></div>
        <div><span>Period</span><strong>${this.escapeHtml(rangeLabel)}</strong></div>
        <div><span>Generated</span><strong>${this.escapeHtml(generatedAt)}</strong></div>
      </div>
    </div>
    <div class="summary">${methodTotals}</div>
    <p class="hint">Official payment advice. Document reference numbers are shown where available. Internal transaction IDs are omitted.</p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Date &amp; Time</th>
          <th>Reference</th>
          <th>Store</th>
          <th>Method</th>
          <th style="text-align:right">Amount</th>
          <th>Narration</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="5">Total (${rows.length} payment${rows.length === 1 ? '' : 's'})</td>
          <td class="amount">${this.currency(total)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <div class="footer">
      <div>Prepared for pharmacy reconciliation</div>
      <div>Page 1 of 1</div>
    </div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private applyDefaultDateRange(): void {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 6);
    this.fromDate = toDateInputValue(from);
    this.toDate = toDateInputValue(to);
  }

  private loadReferenceOptions(): void {
    this.backend
      .getSales({
        limit: 50,
        storeId: this.storeId || undefined,
        status: 'completed',
      })
      .subscribe({
        next: (result) => (this.sales = result.items),
        error: () => (this.sales = []),
      });
    this.backend
      .listSalesReturns({ limit: 50, storeId: this.storeId || undefined })
      .subscribe({
        next: (result) => (this.salesReturns = result.items),
        error: () => (this.salesReturns = []),
      });
    this.backend
      .getExpenses({ limit: 50, storeId: this.storeId || undefined })
      .subscribe({
        next: (result) => (this.expenses = result.items),
        error: () => (this.expenses = []),
      });
  }

  private emptyForm() {
    return {
      referenceType: 'sale',
      referenceId: '',
      amount: '0',
      method: 'cash' as SalePaymentMethod,
      paymentDate: toDateInputValue(new Date()),
      storeId: readAssignedStoreId(),
      referenceNo: '',
      note: '',
    };
  }
}
