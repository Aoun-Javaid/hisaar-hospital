import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';
import { buildMarDocumentHtml } from '../../../core/documents/mar-document.builder';
import { readCurrentUserName, readStoredHospitalDocumentInfo } from '../../../core/utils/hms-document-context.util';
import { HmsDocumentToolbarComponent } from '../../../shared/components/hms-document-toolbar/hms-document-toolbar.component';
import { Prescription } from '../../../shared/models/hospital.model';
import { WardActivityRecord } from './services/ward-api.mapper';
import { MarDoseSlot, MarMedicineCard } from './ward-mar.models';
import { buildMarMedicineCards } from './ward-mar.utils';

@Component({
  selector: 'app-ward-mar-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, HmsDocumentToolbarComponent],
  templateUrl: './ward-mar-panel.component.html',
  styleUrl: './ward-mar-panel.component.scss',
})
export class WardMarPanelComponent implements OnChanges {
  @Input() prescriptions: Prescription[] = [];
  @Input() marActivities: WardActivityRecord[] = [];
  @Input() admissionId = '';
  @Input() patientId = '';
  @Input() patientMr = '';
  @Input() patientFirstName = '';
  @Input() patientLastName = '';
  @Input() admissionNo = '';
  @Input() wardLabel = '';
  @Input() roomBed = '';
  @Input() consultantName = '';
  @Output() refreshed = new EventEmitter<void>();

  cards: MarMedicineCard[] = [];
  recordOpen = false;
  recordSaving = false;
  activeCard: MarMedicineCard | null = null;
  activeSlot: MarDoseSlot | null = null;
  recordForm = {
    marStatus: 'given',
    administeredAt: '',
    dose: '',
    notes: '',
  };

  get dueNowCount(): number {
    return this.cards.reduce(
      (sum, card) => sum + card.slots.filter((slot) => slot.status === 'Due' || slot.status === 'Late').length,
      0
    );
  }

  get administeredTodayCount(): number {
    const today = new Date().toDateString();
    return this.cards.reduce(
      (sum, card) =>
        sum +
        card.slots.filter(
          (slot) => slot.status === 'Given' && slot.administeredAt && new Date(slot.administeredAt).toDateString() === today
        ).length,
      0
    );
  }

  get pendingPharmacyCount(): number {
    return this.cards.filter((card) => /pending|awaiting|requested/i.test(String(card.pharmacyStatus || ''))).length;
  }

  get historyRows(): Array<{ at: string; medicine: string; status: string; by: string }> {
    const rows: Array<{ at: string; medicine: string; status: string; by: string }> = [];
    for (const card of this.cards) {
      for (const slot of card.slots) {
        if (slot.status !== 'Given' || !slot.administeredAt) continue;
        rows.push({
          at: slot.administeredAt,
          medicine: card.medicine,
          status: 'Administered',
          by: slot.administeredBy || '',
        });
      }
    }
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);
  }

  constructor(
    private backend: BackendService,
    private toastr: ToastrService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['prescriptions'] || changes['marActivities']) {
      this.cards = buildMarMedicineCards({
        prescriptions: this.prescriptions,
        marActivities: this.marActivities,
        admissionId: this.admissionId,
        patientId: this.patientId,
      });
    }
  }

  buildMarDocument = (): string =>
    buildMarDocumentHtml({
      patient: {
        firstName: this.patientFirstName,
        lastName: this.patientLastName,
        patientNo: this.patientMr,
      },
      admissionNo: this.admissionNo,
      wardLabel: this.wardLabel,
      roomBed: this.roomBed,
      consultantName: this.consultantName,
      cards: this.cards,
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
    });

  slotClass(status: string): string {
    return `ward-mar-slot ward-mar-slot--${status.toLowerCase().replace(/\s+/g, '-')}`;
  }

  openRecord(card: MarMedicineCard, slot: MarDoseSlot): void {
    if (slot.status === 'Given') return;
    this.activeCard = card;
    this.activeSlot = slot;
    this.recordForm = {
      marStatus: slot.status === 'Late' ? 'late' : 'given',
      administeredAt: new Date().toISOString().slice(0, 16),
      dose: card.dose,
      notes: '',
    };
    this.recordOpen = true;
  }

  closeRecord(): void {
    this.recordOpen = false;
    this.activeCard = null;
    this.activeSlot = null;
  }

  submitRecord(): void {
    if (!this.activeCard || !this.activeSlot || !this.patientId) return;
    this.recordSaving = true;
    this.backend
      .recordWardDose({
        patientId: this.patientId,
        admissionId: this.admissionId || undefined,
        prescriptionId: this.activeCard.prescriptionId,
        medicineName: this.activeCard.medicine,
        dose: this.recordForm.dose,
        route: this.activeCard.route,
        notes: this.recordForm.notes,
        marStatus: this.recordForm.marStatus,
        scheduledAt: this.activeSlot.scheduledAt,
        administeredAt: this.recordForm.administeredAt
          ? new Date(this.recordForm.administeredAt).toISOString()
          : undefined,
      })
      .subscribe({
        next: () => {
          this.recordSaving = false;
          this.toastr.success('Dose recorded.', 'MAR');
          this.closeRecord();
          this.refreshed.emit();
        },
        error: (err: { error?: { message?: string } }) => {
          this.recordSaving = false;
          this.toastr.error(err?.error?.message || 'Unable to record dose.', 'MAR');
        },
      });
  }
}
