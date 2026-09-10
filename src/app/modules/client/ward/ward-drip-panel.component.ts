import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';
import { WardModuleRow } from './ward-module.models';
import { WardActionModalComponent } from './ward-action-modal.component';
import { WardDripActionModalComponent } from './ward-drip-action-modal.component';

@Component({
  selector: 'app-ward-drip-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, WardActionModalComponent, WardDripActionModalComponent],
  templateUrl: './ward-drip-panel.component.html',
  styleUrl: './ward-drip-panel.component.scss',
})
export class WardDripPanelComponent {
  @Input() admissionId = '';
  @Input() patientId = '';
  @Input() patientName = '';
  @Input() rows: WardModuleRow[] = [];
  @Output() refreshed = new EventEmitter<void>();

  addOpen = false;
  actionOpen = false;
  actionType: 'stop' | 'complete' = 'complete';
  search = '';
  statusFilter = 'all';
  activeRow: WardModuleRow | null = null;

  constructor(private backend: BackendService, private toastr: ToastrService) {}

  get filtered(): WardModuleRow[] {
    const q = this.search.trim().toLowerCase();
    return (this.rows || []).filter((row) => {
      const status = String(row.cells['status'] || '').toLowerCase();
      if (this.statusFilter === 'running' && status !== 'running') return false;
      if (this.statusFilter === 'completed' && status !== 'completed') return false;
      if (this.statusFilter === 'planned' && status !== 'planned') return false;
      if (this.statusFilter === 'stopped' && status !== 'stopped') return false;
      if (!q) return true;
      return `${row.cells['fluid']} ${row.cells['rate']} ${row.cells['nurse']}`.toLowerCase().includes(q);
    });
  }

  get runningCount(): number {
    return this.rows.filter((r) => String(r.cells['status']).toLowerCase() === 'running').length;
  }

  get completedCount(): number {
    return this.rows.filter((r) => String(r.cells['status']).toLowerCase() === 'completed').length;
  }

  get dueReviewCount(): number {
    return this.rows.filter((r) => {
      const s = String(r.cells['status']).toLowerCase();
      return s === 'planned' || s === 'due';
    }).length;
  }

  get activeRunning(): WardModuleRow | null {
    return this.rows.find((r) => String(r.cells['status']).toLowerCase() === 'running') || null;
  }

  get addPreset(): Record<string, string | number> {
    return { admissionId: this.admissionId, patientId: this.patientId };
  }

  statusClass(status: unknown): string {
    const value = String(status || '').toLowerCase();
    if (value === 'running') return 'wcs-badge wcs-badge--running';
    if (value === 'completed') return 'wcs-badge wcs-badge--completed';
    if (value === 'stopped') return 'wcs-badge wcs-badge--stopped';
    return 'wcs-badge wcs-badge--planned';
  }

  openAdd(): void {
    this.addOpen = true;
  }

  openAction(row: WardModuleRow): void {
    this.activeRow = row;
    const status = String(row.cells['status'] || '').toLowerCase();
    this.actionType = status === 'running' ? 'stop' : 'complete';
    this.actionOpen = true;
  }

  confirmAction(reason: string): void {
    if (!this.activeRow?.meta?.prescriptionId) {
      this.toastr.warning('Missing drip reference');
      this.actionOpen = false;
      return;
    }
    this.backend
      .wardDripAction({
        action: this.actionType,
        prescriptionId: this.activeRow.meta.prescriptionId,
        fluidIndex: this.activeRow.meta.fluidIndex ?? 0,
        reason: reason || undefined,
      })
      .subscribe({
        next: () => {
          this.toastr.success(this.actionType === 'stop' ? 'Drip stopped' : 'Drip completed');
          this.actionOpen = false;
          this.activeRow = null;
          this.refreshed.emit();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to update drip'),
      });
  }

  onSaved(): void {
    this.addOpen = false;
    this.refreshed.emit();
  }

  cell(row: WardModuleRow | null, key: string): string {
    if (!row) return '—';
    return String(row.cells[key] || '—');
  }
}
