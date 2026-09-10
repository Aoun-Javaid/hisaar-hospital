import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';
import { Doctor } from '../../../shared/models/hospital.model';
import { isLaboratoryModuleEnabled, isPharmacyModuleEnabled } from '../../auth/hospital-modules';
import { hasPermission, readStoredPermissions, isDoctorRole, readStoredRole } from '../../auth/access-control';

export type DoctorOrderType =
  | 'medicine'
  | 'lab'
  | 'imaging'
  | 'procedure'
  | 'nursing'
  | 'diet'
  | 'activity'
  | 'other';

@Component({
  selector: 'app-ward-doctor-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ward-doctor-order-modal.component.html',
  styleUrl: './ward-doctor-order-modal.component.scss',
})
export class WardDoctorOrderModalComponent {
  @Input() open = false;
  @Input() admissionId = '';
  @Input() patientId = '';
  @Input() patientName = '';
  @Input() patientMrn = '';
  @Input() consultantName = '';
  @Input() visitStatus = '';
  @Input() patientMeta = '';
  @Input() doctors: Doctor[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  saving = false;
  orderType: DoctorOrderType = 'lab';
  form = {
    medicineName: '',
    dose: '',
    unit: '',
    route: 'PO',
    frequency: '',
    duration: '',
    instructions: '',
    orderName: '',
    tests: '',
    modality: 'xray',
    study: '',
    bodyPart: '',
    views: '',
    clinicalIndication: '',
    priority: 'normal',
    notes: '',
    recommendedByDoctorId: '',
  };

  readonly orderTypes: Array<{ key: DoctorOrderType; label: string; enabled: boolean }> = [];

  constructor(
    private backend: BackendService,
    private toastr: ToastrService
  ) {
    const permissions = readStoredPermissions();
    const isDoctor = isDoctorRole(readStoredRole());
    this.orderTypes.push(
      { key: 'medicine', label: 'Medicine', enabled: hasPermission('ward.medicine_requests.create', permissions) || isDoctor },
      { key: 'lab', label: 'Laboratory', enabled: isLaboratoryModuleEnabled() && (hasPermission('lab_orders.create', permissions) || isDoctor) },
      { key: 'imaging', label: 'Imaging / X-Ray', enabled: hasPermission('ward.create', permissions) || isDoctor },
      { key: 'procedure', label: 'Procedure', enabled: hasPermission('ward.procedures.create', permissions) || isDoctor },
      { key: 'nursing', label: 'Nursing Instruction', enabled: hasPermission('ward.create', permissions) },
      { key: 'diet', label: 'Diet', enabled: hasPermission('ward.create', permissions) },
      { key: 'activity', label: 'Activity', enabled: hasPermission('ward.create', permissions) },
      { key: 'other', label: 'Other', enabled: hasPermission('ward.create', permissions) }
    );
  }

  get visibleOrderTypes() {
    return this.orderTypes.filter((item) => item.enabled);
  }

  get requiresDoctorAttribution(): boolean {
    return !isDoctorRole(readStoredRole());
  }

  close(): void {
    this.closed.emit();
  }

  submit(keepOpen = false): void {
    if (!this.admissionId || !this.patientId) {
      this.toastr.warning('Missing patient context.', 'Doctor Order');
      return;
    }
    if (this.requiresDoctorAttribution && !this.form.recommendedByDoctorId) {
      this.toastr.warning('Recommended By Doctor is required.', 'Doctor Order');
      return;
    }

    this.saving = true;
    const doctorId = this.form.recommendedByDoctorId || undefined;
    let request$;

    if (this.orderType === 'lab') {
      const testName = this.form.orderName.trim() || this.form.tests.split(',')[0]?.trim();
      request$ = this.backend.createWardOrder({
        patientId: this.patientId,
        admissionId: this.admissionId,
        orderType: 'lab',
        orderName: testName,
        tests: this.form.tests.split(',').map((item) => item.trim()).filter(Boolean),
        doctorId,
        recommendedByDoctorId: doctorId,
        priority: this.form.priority,
        notes: this.form.notes || this.form.clinicalIndication,
        clinicalNotes: this.form.notes,
      });
    } else if (this.orderType === 'imaging') {
      request$ = this.backend.createWardOrder({
        patientId: this.patientId,
        admissionId: this.admissionId,
        orderType: 'imaging',
        orderName: this.form.study || 'Imaging Study',
        study: this.form.study,
        modality: this.form.modality,
        bodyPart: this.form.bodyPart,
        views: this.form.views,
        doctorId,
        recommendedByDoctorId: doctorId,
        priority: this.form.priority,
        clinicalIndication: this.form.clinicalIndication,
        notes: this.form.notes,
      });
    } else {
      const label =
        this.orderType === 'medicine'
          ? `${this.form.medicineName} ${this.form.dose} ${this.form.unit}`.trim()
          : this.form.orderName || this.orderType;
      request$ = this.backend.createWardOrder({
        patientId: this.patientId,
        admissionId: this.admissionId,
        orderType: 'service',
        orderName: label,
        doctorId,
        recommendedByDoctorId: doctorId,
        priority: this.form.priority,
        notes: this.buildServiceNotes(),
      });
    }

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.toastr.success('Doctor order saved.', 'Doctor Order');
        this.saved.emit();
        if (keepOpen) {
          this.resetOrderFields();
          return;
        }
        this.close();
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving = false;
        this.toastr.error(err?.error?.message || 'Failed to save order.', 'Doctor Order');
      },
    });
  }

  private resetOrderFields(): void {
    const recommendedByDoctorId = this.form.recommendedByDoctorId;
    this.form = {
      medicineName: '',
      dose: '',
      unit: '',
      route: 'PO',
      frequency: '',
      duration: '',
      instructions: '',
      orderName: '',
      tests: '',
      modality: 'xray',
      study: '',
      bodyPart: '',
      views: '',
      clinicalIndication: '',
      priority: 'normal',
      notes: '',
      recommendedByDoctorId,
    };
  }

  private buildServiceNotes(): string {
    if (this.orderType === 'medicine') {
      return [
        `Medicine: ${this.form.medicineName}`,
        `Dose: ${this.form.dose} ${this.form.unit}`,
        `Route: ${this.form.route}`,
        `Frequency: ${this.form.frequency}`,
        `Duration: ${this.form.duration}`,
        this.form.instructions,
      ]
        .filter(Boolean)
        .join(' | ');
    }
    return this.form.notes;
  }
}
