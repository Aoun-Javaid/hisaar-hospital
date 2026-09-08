import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { BackendService } from '../../../core/services/backend.service';
import { AppDialogService } from '../../../core/services/app-dialog.service';
import { RegisterSession, Store } from '../../../shared/models/hospital.model';
import { formatCurrency, formatDate, formatDateTime, readAssignedStoreId } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-register-sessions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pharmacy-register-sessions.component.html',
  styleUrl: './pharmacy-register-sessions.component.scss',
})
export class PharmacyRegisterSessionsComponent implements OnInit {
  stores: Store[] = [];
  sessions: RegisterSession[] = [];
  loading = false;
  storeId = readAssignedStoreId();
  status = '';
  fromDate = '';
  toDate = '';
  closeModalOpen = false;
  closingSession: RegisterSession | null = null;
  closingAmount = 0;
  closing = false;

  constructor(
    private backend: BackendService,
    private dialog: AppDialogService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadStores();
    this.loadSessions();
  }

  get openCount(): number {
    return this.sessions.filter((session) => session.status === 'open').length;
  }

  get closedCount(): number {
    return this.sessions.filter((session) => session.status === 'closed').length;
  }

  get expectedCashTotal(): number {
    return this.sessions.reduce(
      (sum, session) => sum + Number(session.expectedCashAmount || session.summary?.expectedCashInDrawer || 0),
      0,
    );
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

  loadSessions(): void {
    this.loading = true;
    this.backend.getRegisterSessions({
      limit: 100,
      storeId: this.storeId || undefined,
      status: this.status || undefined,
      fromDate: this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : undefined,
      toDate: this.toDate ? new Date(`${this.toDate}T23:59:59`).toISOString() : undefined,
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.sessions = result.items),
        error: (err) => {
          this.sessions = [];
          this.toastr.error(err?.error?.message || 'Unable to load register sessions.');
        },
      });
  }

  reset(): void {
    this.storeId = readAssignedStoreId();
    this.status = '';
    this.fromDate = '';
    this.toDate = '';
    this.loadSessions();
  }

  canClose(session: RegisterSession): boolean {
    return this.backend.hasPermission('register_sessions.close') && session.status === 'open';
  }

  async close(session: RegisterSession): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'Close Register',
      message: `Close this session? Expected cash is ${formatCurrency(session.expectedCashAmount || session.summary?.expectedCashInDrawer)}.`,
      confirmText: 'Continue',
      tone: 'danger',
    });

    if (!ok) {
      return;
    }

    this.closingSession = session;
    this.closingAmount = Number(session.expectedCashAmount || session.summary?.expectedCashInDrawer || 0);
    this.closeModalOpen = true;
  }

  dismissCloseModal(): void {
    if (!this.closing) {
      this.closeModalOpen = false;
      this.closingSession = null;
    }
  }

  submitClose(): void {
    if (!this.closingSession) {
      return;
    }

    const amount = Number(this.closingAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      this.toastr.error('Enter a valid closing amount.');
      return;
    }

    this.closing = true;
    this.backend
      .closeRegister(this.closingSession._id, { closingAmount: amount })
      .pipe(finalize(() => (this.closing = false)))
      .subscribe({
        next: () => {
          this.toastr.success('Register closed.');
          this.closeModalOpen = false;
          this.closingSession = null;
          this.loadSessions();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to close register.'),
      });
  }

  currency(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  date(value: string | null | undefined): string {
    return formatDate(value);
  }

  dateTime(value: string | null | undefined): string {
    return formatDateTime(value);
  }

  statusClass(status?: string): string {
    return `pharmacy-status-pill status-${String(status || 'draft').replace(/_/g, '-')}`;
  }
}
