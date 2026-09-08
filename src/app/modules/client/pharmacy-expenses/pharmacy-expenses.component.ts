import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { AppDialogService } from '../../../core/services/app-dialog.service';
import { BackendService } from '../../../core/services/backend.service';
import { Expense, RegisterSession, SalePaymentMethod, Store } from '../../../shared/models/hospital.model';
import { formatCurrency, formatDate, readAssignedStoreId, toDateInputValue } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pharmacy-expenses.component.html',
  styleUrl: './pharmacy-expenses.component.scss',
})
export class PharmacyExpensesComponent implements OnInit {
  stores: Store[] = [];
  registerSessions: RegisterSession[] = [];
  expenses: Expense[] = [];
  loading = false;
  saving = false;
  modalOpen = false;
  editingExpense: Expense | null = null;
  storeId = readAssignedStoreId();
  category = '';
  fromDate = '';
  toDate = '';
  methods: SalePaymentMethod[] = ['cash', 'card', 'bank', 'online', 'wallet', 'check'];
  form = this.emptyForm();

  constructor(
    private backend: BackendService,
    private dialog: AppDialogService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadStores();
    this.loadRegisterSessions();
    this.loadExpenses();
  }

  get canCreate(): boolean {
    return this.backend.hasPermission('expenses.create');
  }

  get canUpdate(): boolean {
    return this.backend.hasPermission('expenses.update');
  }

  get canDelete(): boolean {
    return this.backend.hasPermission('expenses.delete');
  }

  get totalAmount(): number {
    return this.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }

  get cashAmount(): number {
    return this.expenses
      .filter((expense) => String(expense.paymentMethod || '').toLowerCase() === 'cash')
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }

  get topCategory(): string {
    const totals = new Map<string, number>();
    for (const expense of this.expenses) {
      const key = expense.category || 'Other';
      totals.set(key, (totals.get(key) || 0) + Number(expense.amount || 0));
    }
    let best = '';
    let bestAmount = -1;
    totals.forEach((amount, key) => {
      if (amount > bestAmount) {
        best = key;
        bestAmount = amount;
      }
    });
    return best;
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

  loadRegisterSessions(): void {
    this.backend.getRegisterSessions({ limit: 100, storeId: this.storeId || undefined }).subscribe({
      next: (result) => (this.registerSessions = result.items),
      error: () => (this.registerSessions = []),
    });
  }

  loadExpenses(): void {
    this.loading = true;
    this.backend.getExpenses({
      limit: 100,
      storeId: this.storeId || undefined,
      category: this.category.trim() || undefined,
      fromDate: this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : undefined,
      toDate: this.toDate ? new Date(`${this.toDate}T23:59:59`).toISOString() : undefined,
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.expenses = result.items),
        error: (err) => {
          this.expenses = [];
          this.toastr.error(err?.error?.message || 'Unable to load expenses.');
        },
      });
  }

  reset(): void {
    this.storeId = readAssignedStoreId();
    this.category = '';
    this.fromDate = '';
    this.toDate = '';
    this.loadRegisterSessions();
    this.loadExpenses();
  }

  openCreate(): void {
    this.editingExpense = null;
    this.form = this.emptyForm();
    this.form.storeId = this.storeId;
    this.modalOpen = true;
  }

  openEdit(expense: Expense): void {
    this.editingExpense = expense;
    this.form = {
      title: expense.title,
      category: expense.category,
      amount: String(expense.amount ?? 0),
      expenseDate: toDateInputValue(expense.expenseDate),
      paymentMethod: expense.paymentMethod || '',
      paymentReferenceNo: expense.paymentReferenceNo || '',
      note: expense.note || '',
      storeId: expense.storeId || this.storeId,
      registerSessionId: expense.registerSessionId || '',
    };
    this.modalOpen = true;
  }

  closeModal(): void {
    if (!this.saving) {
      this.modalOpen = false;
    }
  }

  save(): void {
    if (!this.form.title.trim() || !this.form.category.trim()) {
      this.toastr.error('Title and category are required.');
      return;
    }

    const payload = {
      title: this.form.title.trim(),
      category: this.form.category.trim(),
      amount: Number(this.form.amount || 0),
      expenseDate: this.form.expenseDate || toDateInputValue(new Date()),
      paymentMethod: this.form.paymentMethod || undefined,
      paymentReferenceNo: this.form.paymentReferenceNo.trim() || undefined,
      note: this.form.note.trim() || undefined,
      storeId: this.form.storeId || undefined,
      registerSessionId: this.form.registerSessionId || undefined,
    };

    const request = this.editingExpense
      ? this.backend.updateExpense(this.editingExpense._id, payload)
      : this.backend.createExpense(payload);

    this.saving = true;
    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.modalOpen = false;
        this.toastr.success(this.editingExpense ? 'Expense updated.' : 'Expense created.');
        this.loadExpenses();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save expense.'),
    });
  }

  async remove(expense: Expense): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Delete Expense',
      message: `Delete ${expense.title}?`,
      confirmText: 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.backend.deleteExpense(expense._id).subscribe({
      next: () => {
        this.toastr.success('Expense deleted.');
        this.loadExpenses();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to delete expense.'),
    });
  }

  currency(value: string | number | null | undefined): string {
    return formatCurrency(value);
  }

  date(value: string | null | undefined): string {
    return formatDate(value);
  }

  private emptyForm() {
    return {
      title: '',
      category: '',
      amount: '0',
      expenseDate: toDateInputValue(new Date()),
      paymentMethod: '',
      paymentReferenceNo: '',
      note: '',
      storeId: '',
      registerSessionId: '',
    };
  }
}
