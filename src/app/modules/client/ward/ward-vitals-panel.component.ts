import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WardModuleRow } from './ward-module.models';
import { WardActionModalComponent } from './ward-action-modal.component';

@Component({
  selector: 'app-ward-vitals-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, WardActionModalComponent],
  templateUrl: './ward-vitals-panel.component.html',
  styleUrl: './ward-vitals-panel.component.scss',
})
export class WardVitalsPanelComponent implements OnChanges {
  @Input() admissionId = '';
  @Input() patientId = '';
  @Input() rows: WardModuleRow[] = [];
  @Output() refreshed = new EventEmitter<void>();

  addOpen = false;
  dateFrom = '';
  dateTo = '';
  vitalType = 'all';
  appliedFrom = '';
  appliedTo = '';
  appliedType = 'all';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows'] && !this.appliedFrom && !this.appliedTo) {
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - 7);
      this.dateTo = this.toInputDate(to);
      this.dateFrom = this.toInputDate(from);
      this.appliedFrom = this.dateFrom;
      this.appliedTo = this.dateTo;
    }
  }

  get latest(): WardModuleRow | null {
    return this.filtered[0] || null;
  }

  get filtered(): WardModuleRow[] {
    return (this.rows || []).filter((row) => {
      const recorded = String(row.cells['recordedAt'] || '');
      // recordedAt is display formatted; prefer sorting by id order already newest first
      if (this.appliedType === 'bp' && (!row.cells['bp'] || row.cells['bp'] === '—')) return false;
      if (this.appliedType === 'pulse' && (!row.cells['pulse'] || row.cells['pulse'] === '—')) return false;
      if (this.appliedType === 'temp' && (!row.cells['temp'] || row.cells['temp'] === '—')) return false;
      if (this.appliedType === 'spo2' && (!row.cells['spo2'] || row.cells['spo2'] === '—')) return false;
      return true;
    });
  }

  get addPreset(): Record<string, string | number> {
    return { admissionId: this.admissionId, patientId: this.patientId };
  }

  cell(row: WardModuleRow | null, key: string): string {
    if (!row) return '—';
    return String(row.cells[key] || '—');
  }

  statusFor(row: WardModuleRow): { label: string; tone: string } {
    const bp = String(row.cells['bp'] || '');
    const temp = Number(String(row.cells['temp'] || '').replace(/[^\d.]/g, ''));
    const spo2 = Number(String(row.cells['spo2'] || '').replace(/[^\d.]/g, ''));
    const pulse = Number(String(row.cells['pulse'] || '').replace(/[^\d.]/g, ''));
    const sys = Number(bp.split('/')[0] || 0);

    if ((spo2 && spo2 < 92) || (sys && sys >= 160) || (temp && temp >= 39) || (pulse && pulse >= 120)) {
      return { label: 'High', tone: 'high' };
    }
    if ((spo2 && spo2 < 95) || (sys && sys >= 140) || (temp && temp >= 37.5) || (pulse && pulse >= 100)) {
      return { label: 'Elevated', tone: 'elevated' };
    }
    return { label: 'Normal', tone: 'normal' };
  }

  applyFilters(): void {
    this.appliedFrom = this.dateFrom;
    this.appliedTo = this.dateTo;
    this.appliedType = this.vitalType;
  }

  resetFilters(): void {
    this.vitalType = 'all';
    this.appliedType = 'all';
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 7);
    this.dateTo = this.toInputDate(to);
    this.dateFrom = this.toInputDate(from);
    this.appliedFrom = this.dateFrom;
    this.appliedTo = this.dateTo;
  }

  openAdd(): void {
    this.addOpen = true;
  }

  onSaved(): void {
    this.addOpen = false;
    this.refreshed.emit();
  }

  private toInputDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
