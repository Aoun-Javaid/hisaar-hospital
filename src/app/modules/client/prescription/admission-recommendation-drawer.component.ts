import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';
import { initialsFromName, resolveAssetUrl } from '../../../core/utils/asset.util';
import { Appointment, Department, Doctor, Hospital, HospitalWard, Patient } from '../../../shared/models/hospital.model';
import {
  ACTIVITY_OPTIONS,
  ADMISSION_LEVEL_OPTIONS,
  ADMISSION_PRIORITY_OPTIONS,
  ADMISSION_TYPE_OPTIONS,
  ADMISSION_URGENCY_OPTIONS,
  AdmissionRecommendationRecord,
  DIET_OPTIONS,
  EXPECTED_TIMING_OPTIONS,
  VITALS_FREQUENCY_OPTIONS,
  admissionEnumLabel,
  admissionRecommendationStatusLabel,
  admissionSelectOptions,
  buildAdmissionRecommendationForm,
  buildAdmissionRecommendationPayload,
  collectAdmissionRecommendValidationErrors,
  createAdmissionMedicationGroup,
  doctorDisplayName as formatDoctorDisplayName,
  doctorProfileLine as formatDoctorProfileLine,
  isAdmissionRecommendFormValid,
  mapAdmissionRecommendationRecord,
  admissionSnapshotText,
  patchAdmissionRecommendationForm,
} from './admission-recommendation.models';
import { HmsDoctorSelectComponent } from '../../../shared/components/hms-doctor-select/hms-doctor-select.component';
import { HmsDocumentToolbarComponent } from '../../../shared/components/hms-document-toolbar/hms-document-toolbar.component';
import {
  buildAdmissionRecommendationPrintHtml,
} from './admission-recommendation-print.builder';

interface AdmissionTab {
  id: string;
  label: string;
  icon: string;
}

interface MonitoringOption {
  key: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-admission-recommendation-drawer',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, HmsDoctorSelectComponent, HmsDocumentToolbarComponent],
  templateUrl: './admission-recommendation-drawer.component.html',
  styleUrl: './admission-recommendation-drawer.component.scss',
})
export class AdmissionRecommendationDrawerComponent implements OnChanges {
  @Input() open = false;
  @Input() readOnly = false;
  @Input() patient: Patient | null = null;
  @Input() appointment: Appointment | null = null;
  @Input() doctor: Doctor | null = null;
  @Input() doctors: Doctor[] = [];
  @Input() hospital: Hospital | null = null;
  @Input() prescriptionId = '';
  @Input() encounterId = '';
  @Input() encounterLabel = '';
  @Input() record: AdmissionRecommendationRecord | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<AdmissionRecommendationRecord>();

  form: FormGroup;
  saving = false;
  recommendationSuccess: AdmissionRecommendationRecord | null = null;
  lookupsLoading = false;
  lookupsError = '';
  lookupsWarning = '';
  validationErrors: string[] = [];
  activeSection = 'admission';
  wardHintDismissed = false;

  departments: Department[] = [];
  wards: HospitalWard[] = [];
  private lookupsLoaded = false;
  private cachedDoctors: Doctor[] = [];
  private lastAdmissionContextKey = '';

  readonly tabs: AdmissionTab[] = [
    { id: 'admission', label: 'Admission', icon: 'fa-bed' },
    { id: 'clinical', label: 'Clinical Summary', icon: 'fa-stethoscope' },
    { id: 'orders', label: 'Initial Orders', icon: 'fa-list-alt' },
    { id: 'monitoring', label: 'Monitoring & Nursing', icon: 'fa-heartbeat' },
    { id: 'safety', label: 'Safety / Precautions', icon: 'fa-shield' },
    { id: 'handover', label: 'Additional Instructions', icon: 'fa-file-text-o' },
  ];

  readonly monitoringOptions: MonitoringOption[] = [
    { key: 'oxygenSaturation', label: 'SpO2 Monitoring', icon: 'fa-heartbeat' },
    { key: 'neuroObservations', label: 'Neuro Observations', icon: 'fa-eye' },
    { key: 'cardiacMonitoring', label: 'Cardiac Monitoring', icon: 'fa-heart' },
    { key: 'intakeOutput', label: 'Intake / Output', icon: 'fa-tint' },
    { key: 'bloodGlucose', label: 'Blood Glucose', icon: 'fa-medkit' },
  ];

  readonly urgencyOptions = admissionSelectOptions('urgency', ADMISSION_URGENCY_OPTIONS);
  readonly levelOptions = admissionSelectOptions('levelOfCare', ADMISSION_LEVEL_OPTIONS);
  readonly priorityOptions = admissionSelectOptions('priority', ADMISSION_PRIORITY_OPTIONS);
  readonly timingOptions = admissionSelectOptions('expectedTiming', EXPECTED_TIMING_OPTIONS);
  readonly admissionTypeOptions = admissionSelectOptions('admissionType', ADMISSION_TYPE_OPTIONS);
  readonly vitalsFrequencyOptions = admissionSelectOptions('vitalsFrequency', VITALS_FREQUENCY_OPTIONS);
  readonly activityOptions = admissionSelectOptions('activity', ACTIVITY_OPTIONS);
  readonly dietOptions = admissionSelectOptions('diet', DIET_OPTIONS);
  readonly medReconciliationOptions = admissionSelectOptions('medReconciliationStatus', [
    'reviewed',
    'needs_reconciliation',
    'unable_to_verify',
  ] as const);
  readonly isolationTypeOptions = admissionSelectOptions('isolationType', [
    'contact',
    'droplet',
    'airborne',
    'protective',
  ] as const);
  readonly vteOptions = admissionSelectOptions('vteAssessment', [
    'not_assessed',
    'low',
    'moderate',
    'high',
  ] as const);
  readonly bleedingOptions = admissionSelectOptions('bleedingRisk', [
    'none_known',
    'present',
    'requires_review',
  ] as const);
  readonly prophylaxisOptions = admissionSelectOptions('prophylaxisDecision', [
    'not_indicated',
    'mechanical',
    'pharmacological',
    'already_anticoagulated',
    'contraindicated',
  ] as const);

  constructor(
    private fb: FormBuilder,
    private backend: BackendService,
    private toastr: ToastrService,
    private router: Router
  ) {
    this.form = buildAdmissionRecommendationForm(this.fb);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['doctors']?.currentValue?.length) {
      this.cachedDoctors = [...this.doctors];
    }

    const justOpened =
      Boolean(changes['open']?.currentValue) && changes['open']?.previousValue !== true;

    // Parent templates often pass method results that allocate new stub objects each CD cycle.
    // Only reset when the drawer opens or the logical context ids change — never on referential churn.
    const contextKey = this.admissionContextKey();
    const contextChanged = contextKey !== this.lastAdmissionContextKey;
    const relevantInputChanged = Boolean(
      changes['open'] ||
        changes['record'] ||
        changes['patient'] ||
        changes['appointment'] ||
        changes['doctor']
    );
    const shouldReset = this.open && relevantInputChanged && (justOpened || contextChanged);

    if (this.open && (justOpened || contextChanged)) {
      this.lastAdmissionContextKey = contextKey;
    }

    if (!this.open && changes['open']) {
      this.lastAdmissionContextKey = '';
    }

    if (shouldReset) {
      this.validationErrors = [];
      this.recommendationSuccess = null;
      this.wardHintDismissed = false;
      this.loadLookupsIfNeeded();
      this.resetForm();
    } else if (this.open && changes['doctors']?.currentValue?.length) {
      this.applyContextDefaultsForEmptyFields();
    }

    if (this.readOnly) {
      this.form.disable({ emitEvent: false });
    } else if (!this.lookupsLoading) {
      this.form.enable({ emitEvent: false });
    }
  }

  get medications(): FormArray {
    return this.form.get('medications') as FormArray;
  }

  get monitoringGroup(): FormGroup {
    return this.form.get('monitoring') as FormGroup;
  }

  get formReady(): boolean {
    return this.lookupsLoaded && !this.lookupsLoading && !this.lookupsError;
  }

  get canSubmitRecommend(): boolean {
    return this.canRecommend && this.formReady && !this.saving;
  }

  get canRecommend(): boolean {
    return !this.readOnly && (!this.record || ['draft', 'pending', 'acknowledged'].includes(this.record.status));
  }

  get doctorOptions(): Doctor[] {
    return this.cachedDoctors.length ? this.cachedDoctors : this.doctors;
  }

  statusLabel(status?: string): string {
    return admissionRecommendationStatusLabel(status);
  }

  enumLabel(group: Parameters<typeof admissionEnumLabel>[0], value?: string | null): string {
    return admissionEnumLabel(group, value);
  }

  patientDisplayName(): string {
    if (!this.patient) return '—';
    return `${this.patient.firstName || ''} ${this.patient.lastName || ''}`.trim() || '—';
  }

  patientAgeLabel(): string {
    if (!this.patient?.dateOfBirth) return '—';
    const birthDate = new Date(this.patient.dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) return '—';
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    const monthDelta = today.getMonth() - birthDate.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
      years -= 1;
    }
    return `${Math.max(years, 0)} Y`;
  }

  patientGenderLabel(): string {
    switch (this.patient?.gender) {
      case 'male':
        return 'Male';
      case 'female':
        return 'Female';
      default:
        return 'Other';
    }
  }

  doctorDisplayName(doctor?: Doctor | null): string {
    return formatDoctorDisplayName(doctor || this.selectedConsultantDoctor());
  }

  consultantProfileLine(doctor?: Doctor | null): string {
    return formatDoctorProfileLine(doctor || this.selectedConsultantDoctor());
  }

  doctorPhotoUrl(doctor?: Doctor | null): string {
    return resolveAssetUrl((doctor || this.selectedConsultantDoctor())?.photoUrl);
  }

  doctorInitials(doctor?: Doctor | null): string {
    return initialsFromName(this.doctorDisplayName(doctor));
  }

  selectedConsultantDoctor(): Doctor | null {
    const doctorId = String(this.form.get('consultantDoctorId')?.value || '').trim();
    if (doctorId) {
      const match = this.doctorOptions.find((item) => item._id === doctorId);
      if (match) {
        return match;
      }
      if (this.doctor?._id === doctorId) {
        return this.doctor;
      }
      if (String(this.appointment?.doctorId || '') === doctorId && this.appointment?.doctor) {
        return {
          _id: doctorId,
          user: {
            name: this.appointment.doctor.name,
            email: this.appointment.doctor.email,
          },
        } as Doctor;
      }
    }
    return this.doctor;
  }

  departmentName(departmentId?: string | null): string {
    const id = String(departmentId || this.form.get('departmentId')?.value || '').trim();
    if (!id) return '—';
    const match =
      this.departments.find((item) => item._id === id) ||
      this.appointment?.department ||
      this.selectedConsultantDoctor()?.department;
    return match?.name || '—';
  }

  appointmentDateLabel(): string {
    if (!this.appointment?.appointmentDate) return '—';
    const date = new Date(this.appointment.appointmentDate);
    if (Number.isNaN(date.getTime())) return this.appointment.appointmentDate;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  appointmentTimeLabel(): string {
    return this.appointment?.startTime || '—';
  }

  encounterDisplayLabel(): string {
    if (this.encounterLabel) return this.encounterLabel;
    if (this.record?.sourceEncounterId) return String(this.record.sourceEncounterId);
    return '—';
  }

  filteredWards(): HospitalWard[] {
    const departmentId = String(this.form.get('departmentId')?.value || '').trim();
    const levelOfCare = String(this.form.get('levelOfCare')?.value || '').trim();
    const patientGender = this.patient?.gender;

    const ranked = this.wards.filter((ward) => {
      if (departmentId && ward.departmentMode === 'DEPARTMENT_SPECIFIC') {
        const ids = (ward.departmentIds || []).map(String);
        if (ids.length && !ids.includes(departmentId)) {
          return false;
        }
      }

      if (levelOfCare === 'icu' && ward.careLevel && ward.careLevel !== 'icu') {
        return false;
      }
      if (levelOfCare === 'hdu' && ward.careLevel && !['hdu', 'icu'].includes(ward.careLevel)) {
        return false;
      }
      if (levelOfCare === 'isolation' && ward.careLevel && ward.careLevel !== 'isolation') {
        return false;
      }

      if (patientGender === 'male' && ward.genderPolicy === 'female') return false;
      if (patientGender === 'female' && ward.genderPolicy === 'male') return false;

      return true;
    });

    return ranked.length ? ranked : this.wards;
  }

  onConsultantDoctorSelected(doctor: Doctor | null): void {
    const departmentId = doctor?.departmentId || doctor?.department?._id;
    if (departmentId) {
      this.form.patchValue({ departmentId: String(departmentId) });
    }
  }

  filteredDoctors(): Doctor[] {
    return this.doctorOptions;
  }

  setSection(section: string): void {
    this.activeSection = section;
  }

  dismissWardHint(): void {
    this.wardHintDismissed = true;
  }

  charCount(controlName: string): number {
    return String(this.form.get(controlName)?.value || '').length;
  }

  addMedicationRow(): void {
    this.medications.push(createAdmissionMedicationGroup(this.fb));
  }

  removeMedicationRow(index: number): void {
    this.medications.removeAt(index);
  }

  toggleMonitoring(key: string): void {
    if (this.readOnly) return;
    const control = this.monitoringGroup.get(key);
    if (control) {
      control.setValue(!control.value);
    }
  }

  isMonitoringChecked(key: string): boolean {
    return Boolean(this.monitoringGroup.get(key)?.value);
  }

  toggleSwitch(controlName: string): void {
    if (this.readOnly) return;
    const control = this.form.get(controlName);
    if (control) {
      control.setValue(!control.value);
    }
  }

  isSwitchOn(controlName: string): boolean {
    return Boolean(this.form.get(controlName)?.value);
  }

  closeDrawer(): void {
    this.recommendationSuccess = null;
    this.closed.emit();
  }

  openAdmissionGuide(): void {
    void this.router.navigate(['/help'], { queryParams: { article: 'doctor-recommend-admission' } });
  }

  viewAdmissionOrder(): void {
    if (this.recommendationSuccess?._id) {
      this.record = this.recommendationSuccess;
      this.recommendationSuccess = null;
      this.activeSection = 'admission';
      return;
    }
    this.activeSection = 'admission';
  }

  goToPendingAdmissions(): void {
    void this.router.navigate(['/ward/admissions'], { queryParams: { tab: 'pending' } });
    this.closeDrawer();
  }

  get canGoToPendingAdmissions(): boolean {
    return this.backend.hasPermission('room_allotments.create');
  }

  recommendedWardLabel(record: AdmissionRecommendationRecord): string {
    const fromSnapshot = admissionSnapshotText(record.clinicalSnapshot, 'admission', 'recommendedWard');
    if (fromSnapshot !== '—') {
      return fromSnapshot;
    }
    const wardId = String(this.form.get('recommendedWard')?.value || '').trim();
    const ward = this.wards.find((item) => String(item._id) === wardId || item.name === wardId);
    return ward?.name || wardId || '—';
  }

  recommendedByLabel(record: AdmissionRecommendationRecord): string {
    const doctorRef = record.recommendedByDoctorId;
    if (doctorRef && typeof doctorRef === 'object') {
      return formatDoctorDisplayName(doctorRef);
    }
    const doctorId = String(doctorRef || '').trim();
    const doctor = this.doctorOptions.find((item) => String(item._id) === doctorId);
    return doctor ? formatDoctorDisplayName(doctor) : this.doctorDisplayName();
  }

  saveDraft(): void {
    this.persist(false);
  }

  recommendAdmission(): void {
    this.persist(true);
  }

  buildAdmissionRecommendationDocumentHtml = (): string => {
    if (!this.record) return '';
    return buildAdmissionRecommendationPrintHtml({
      hospital: this.hospital,
      patient: this.patient,
      appointment: this.appointment,
      doctor: this.selectedConsultantDoctor() || this.doctor,
      record: this.record,
    });
  };

  cancelRecommendation(): void {
    if (!this.record?._id) {
      return;
    }
    const cancelReason = window.prompt('Cancellation reason (optional):') || '';
    this.saving = true;
    this.backend
      .cancelAdmissionRecommendation(this.record._id, { cancelReason })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (updated) => {
          this.toastr.success('Admission recommendation cancelled.');
          this.saved.emit(mapAdmissionRecommendationRecord(updated));
          this.closeDrawer();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to cancel recommendation.'),
      });
  }

  private loadLookupsIfNeeded(): void {
    if (this.lookupsLoaded || this.lookupsLoading) {
      return;
    }

    this.lookupsLoading = true;
    this.lookupsError = '';
    this.lookupsWarning = '';
    if (!this.readOnly) {
      this.form.disable({ emitEvent: false });
    }
    this.backend
      .getAdmissionRecommendationLookups()
      .pipe(finalize(() => (this.lookupsLoading = false)))
      .subscribe({
        next: (result) => {
          if (!this.cachedDoctors.length) {
            this.cachedDoctors = result.doctors || [];
          }
          if (this.doctor && !this.cachedDoctors.some((item) => item._id === this.doctor?._id)) {
            this.cachedDoctors = [this.doctor, ...this.cachedDoctors];
          }
          this.departments = result.departments || [];
          this.wards = result.wards || [];
          this.lookupsLoaded = true;
          this.applyContextDefaults();
          if (!this.wards.length) {
            this.lookupsWarning = 'No active wards configured. Recommended ward selection is optional.';
          }
          if (!this.readOnly) {
            this.form.enable({ emitEvent: false });
          }
        },
        error: () => {
          this.lookupsError = 'Unable to load admission lookups.';
          if (!this.readOnly) {
            this.form.enable({ emitEvent: false });
          }
        },
      });
  }

  private admissionContextKey(): string {
    return [
      this.record?._id || 'new',
      this.patient?._id || '',
      this.appointment?._id || '',
      this.doctor?._id || '',
      this.prescriptionId || '',
    ].join('|');
  }

  private applyContextDefaults(): void {
    if (!this.open) {
      return;
    }

    patchAdmissionRecommendationForm(this.form, this.fb, this.record, {
      patient: this.patient,
      appointment: this.appointment,
      doctor: this.doctor,
    });

    this.applyContextDefaultsForEmptyFields();
  }

  /** Fill only blank identity fields — never overwrite user edits. */
  private applyContextDefaultsForEmptyFields(): void {
    if (!this.open) {
      return;
    }

    const consultantDoctorId = String(this.form.get('consultantDoctorId')?.value || '').trim();
    if (!consultantDoctorId && this.doctor?._id) {
      this.form.patchValue({ consultantDoctorId: this.doctor._id });
    }

    const departmentId = String(this.form.get('departmentId')?.value || '').trim();
    if (!departmentId) {
      const fallbackDepartmentId =
        this.appointment?.departmentId ||
        this.appointment?.department?._id ||
        this.doctor?.departmentId ||
        this.doctor?.department?._id;
      if (fallbackDepartmentId) {
        this.form.patchValue({ departmentId: String(fallbackDepartmentId) });
      }
    }
  }

  private resetForm(): void {
    patchAdmissionRecommendationForm(this.form, this.fb, this.record, {
      patient: this.patient,
      appointment: this.appointment,
      doctor: this.doctor,
    });
    this.applyContextDefaultsForEmptyFields();
    this.pruneEmptyMedicationRows();
  }

  private pruneEmptyMedicationRows(): void {
    for (let index = this.medications.length - 1; index >= 0; index -= 1) {
      const name = String(this.medications.at(index).get('name')?.value || '').trim();
      if (!name) {
        this.medications.removeAt(index);
      }
    }
  }

  private persist(recommend: boolean): void {
    if (!this.patient?._id) {
      this.toastr.error('Patient is required.');
      return;
    }

    if (!this.formReady) {
      this.toastr.error(this.lookupsError || 'Admission form is still loading. Please wait.');
      return;
    }

    this.pruneEmptyMedicationRows();

    if (recommend && !isAdmissionRecommendFormValid(this.form)) {
      this.form.markAllAsTouched();
      this.validationErrors = collectAdmissionRecommendValidationErrors(this.form);
      this.activeSection = 'admission';
      this.toastr.error(`Complete required fields: ${this.validationErrors.join(', ')}`);
      return;
    }

    this.validationErrors = [];

    const payload = buildAdmissionRecommendationPayload(this.form, {
      patientId: this.patient._id,
      appointmentId: this.appointment?._id,
      encounterId: this.encounterId || undefined,
      prescriptionId: this.prescriptionId || undefined,
      status: recommend ? 'pending' : 'draft',
      recommend,
    });

    this.saving = true;
    const request$ = this.record?._id
      ? this.backend.updateAdmissionRecommendation(this.record._id, payload)
      : this.backend.createAdmissionRecommendation(payload);

    request$.pipe(finalize(() => (this.saving = false))).subscribe({
      next: (saved) => {
        const mapped = mapAdmissionRecommendationRecord(saved);
        this.record = mapped;
        this.toastr.success(recommend ? 'Admission recommended successfully.' : 'Draft saved.');
        this.saved.emit(mapped);
        if (recommend) {
          this.recommendationSuccess = mapped;
        }
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save admission recommendation.'),
    });
  }
}
