import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { BackendService } from '../../../core/services/backend.service';
import { RegisterSessionDetail } from '../../../shared/models/hospital.model';
import { formatCurrency, formatDate, formatDateTime } from '../pharmacy-admin.utils';

@Component({
  selector: 'app-pharmacy-register-session-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pharmacy-register-session-detail.component.html',
  styleUrl: './pharmacy-register-session-detail.component.scss',
})
export class PharmacyRegisterSessionDetailComponent implements OnInit {
  detail: RegisterSessionDetail | null = null;
  loading = false;
  loadError = '';

  constructor(
    private route: ActivatedRoute,
    private backend: BackendService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    if (!id) {
      this.loadError = 'Register session ID is missing.';
      return;
    }

    this.loading = true;
    this.backend
      .getRegisterSessionById(id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (detail) => {
          this.detail = detail;
          this.loadError = detail ? '' : 'Register session not found.';
        },
        error: (err) => {
          this.detail = null;
          this.loadError = err?.error?.message || 'Unable to load register session detail.';
          this.toastr.error(this.loadError);
        },
      });
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

  cashierName(detail: RegisterSessionDetail): string {
    const cashier = detail.registerSession.cashier;
    return cashier?.name || cashier?.email || 'Unknown cashier';
  }

  statusClass(status?: string): string {
    return `pharmacy-status-pill status-${String(status || 'draft').replace(/_/g, '-')}`;
  }
}
