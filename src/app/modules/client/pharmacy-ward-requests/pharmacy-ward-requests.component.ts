import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';

@Component({
  selector: 'app-pharmacy-ward-requests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pharmacy-ward-requests.component.html',
  styleUrl: './pharmacy-ward-requests.component.scss',
})
export class PharmacyWardRequestsComponent implements OnInit {
  loading = false;
  items: Array<Record<string, unknown>> = [];
  status = 'PENDING';
  wardLabel = '';
  patientId = '';
  fromDate = '';
  toDate = '';
  storeId = '';
  selected: Record<string, unknown> | null = null;
  issueQty: Record<string, number> = {};

  constructor(private backend: BackendService, private toastr: ToastrService) {}

  ngOnInit(): void {
    this.load();
  }

  get openCount(): number {
    return this.items.filter((row) => {
      const status = String(row['status'] || '');
      return status !== 'ISSUED' && status !== 'CANCELLED';
    }).length;
  }

  get issuedCount(): number {
    return this.items.filter((row) => row['status'] === 'ISSUED').length;
  }

  get lineItemCount(): number {
    return this.items.reduce((sum, row) => sum + this.rowItems(row).length, 0);
  }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { limit: 100 };
    if (this.status) params['status'] = this.status;
    if (this.wardLabel) params['wardLabel'] = this.wardLabel;
    if (this.patientId) params['patientId'] = this.patientId;
    if (this.fromDate) params['from'] = this.fromDate;
    if (this.toDate) params['to'] = this.toDate;

    this.backend.listWardMedicineRequests(params).subscribe({
      next: (result) => {
        this.items = result.items || [];
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.toastr.error(err?.error?.message || 'Unable to load ward medicine requests');
      },
    });
  }

  openIssue(row: Record<string, unknown>): void {
    this.selected = row;
    this.issueQty = {};
    const items = (row['items'] as Array<Record<string, unknown>>) || [];
    items.forEach((item) => {
      const remaining = Number(item['requestedQty'] || 0) - Number(item['issuedQty'] || 0);
      if (remaining > 0) {
        this.issueQty[String(item['_id'])] = remaining;
      }
    });
  }

  issue(): void {
    if (!this.selected) return;
    if (!this.storeId) {
      this.toastr.warning('Pharmacy store ID is required');
      return;
    }
    const items = Object.entries(this.issueQty)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([itemId, issueQty]) => ({ itemId, issueQty: Number(issueQty) }));
    if (!items.length) {
      this.toastr.warning('Enter issue quantity');
      return;
    }

    this.backend.issueWardMedicineRequest(String(this.selected['_id']), { storeId: this.storeId, items }).subscribe({
      next: () => {
        this.toastr.success('Medicine issued');
        this.selected = null;
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to issue medicine'),
    });
  }

  patientName(row: Record<string, unknown>): string {
    const patient = row['patientId'] as Record<string, unknown> | null;
    if (!patient || typeof patient !== 'object') return '—';
    return `${patient['firstName'] || ''} ${patient['lastName'] || ''}`.trim() || String(patient['patientNo'] || '—');
  }

  requesterName(row: Record<string, unknown>): string {
    const user = row['requestedByUserId'] as Record<string, unknown> | null;
    return user?.['name'] ? String(user['name']) : '—';
  }

  remainingQty(item: Record<string, unknown>): number {
    return Math.max(0, Number(item['requestedQty'] || 0) - Number(item['issuedQty'] || 0));
  }

  rowItems(row: Record<string, unknown>): Array<Record<string, unknown>> {
    return (row['items'] as Array<Record<string, unknown>>) || [];
  }

  selectedItems(): Array<Record<string, unknown>> {
    return this.selected ? this.rowItems(this.selected) : [];
  }

  issueQtyFor(item: Record<string, unknown>): number {
    return this.issueQty[this.itemKey(item)] || 0;
  }

  setIssueQty(item: Record<string, unknown>, value: number): void {
    this.issueQty[this.itemKey(item)] = value;
  }

  itemKey(item: Record<string, unknown>): string {
    return String(item['_id'] || '');
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
