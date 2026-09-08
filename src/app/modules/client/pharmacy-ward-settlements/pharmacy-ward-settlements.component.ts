import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';

@Component({
  selector: 'app-pharmacy-ward-settlements',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pharmacy-ward-settlements.component.html',
  styleUrl: './pharmacy-ward-settlements.component.scss',
})
export class PharmacyWardSettlementsComponent implements OnInit {
  loading = false;
  items: Array<Record<string, unknown>> = [];
  settlementStatus = 'PENDING_SETTLEMENT';
  wardLabel = '';
  fromDate = '';
  toDate = '';

  constructor(private backend: BackendService, private toastr: ToastrService) {}

  ngOnInit(): void {
    this.load();
  }

  get pendingCount(): number {
    return this.items.filter((row) => row['settlementStatus'] === 'PENDING_SETTLEMENT').length;
  }

  get settledCount(): number {
    return this.items.filter((row) => row['settlementStatus'] === 'SETTLED').length;
  }

  get amountTotal(): number {
    return this.items.reduce((sum, row) => sum + Number(row['pharmacyAmount'] || 0), 0);
  }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { limit: 100 };
    if (this.settlementStatus) params['settlementStatus'] = this.settlementStatus;
    if (this.wardLabel) params['wardLabel'] = this.wardLabel;
    if (this.fromDate) params['from'] = this.fromDate;
    if (this.toDate) params['to'] = this.toDate;

    this.backend.listPharmacyWardSettlements(params).subscribe({
      next: (result) => {
        this.items = result.items || [];
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.toastr.error(err?.error?.message || 'Unable to load ward settlements');
      },
    });
  }

  verify(row: Record<string, unknown>): void {
    const id = String(row['_id'] || '');
    if (!id) return;
    this.backend.verifyPharmacyWardSettlement(id).subscribe({
      next: () => {
        this.toastr.success('Settlement verified');
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to verify settlement'),
    });
  }

  patientName(row: Record<string, unknown>): string {
    const patient = row['patient'] as Record<string, unknown> | null;
    if (!patient) return '—';
    return `${patient['firstName'] || ''} ${patient['lastName'] || ''}`.trim() || String(patient['patientNo'] || '—');
  }

  money(value: unknown): string {
    return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  asDate(value: unknown): string | number | Date | null {
    if (value == null) return null;
    return value as string | number | Date;
  }

  statusClass(status: unknown): string {
    return `pharmacy-status-pill status-${String(status || 'draft').toLowerCase().replace(/_/g, '-')}`;
  }
}
