import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';
import { AuthService } from '../../../core/services/auth.service';
import { resolveAssetUrl } from '../../../core/utils/asset.util';
import { toCalendarYmd, todayYmd } from '../../../core/utils/calendar-date';
import {
  ageYearsFromIsoDate,
  isoDateFromAgeYears,
  todayIsoDate,
} from '../../../core/utils/dob-age.util';
import { AppDialogService } from '../../../core/services/app-dialog.service';
import { MooliOfflineService, MooliQueuedWork } from '../../../core/services/mooli-offline.service';
import {
  Appointment,
  Doctor,
  Hospital,
  Patient,
  PatientLastVisit,
} from '../../../shared/models/hospital.model';
import {
  buildVitalDisplayItems,
  buildVitalTrendVisits,
  getPatientAgeYears,
  isArbitraryCustomVitalKey,
  VitalDisplayItem,
  VitalStatus,
  VitalTrendVisit,
} from '../prescription/vitals-analytics';

interface AppointmentToken {
  appointmentNo: string;
  clinicName: string;
  clinicSubtitle: string;
  logoUrl: string;
  patientName: string;
  doctorName: string;
  departmentName: string;
  appointmentDate: string;
  timeRange: string;
  consultationFee: string;
  discount: string;
  netFee: string;
  paymentStatus: string;
  status: string;
  printedAt: string;
}

@Component({
  selector: 'app-appointment',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './appointment.component.html',
  styleUrl: './appointment.component.scss',
})
export class AppointmentComponent implements OnInit {
  appointments: Appointment[] = [];
  patients: Patient[] = [];
  doctors: Doctor[] = [];
  appointmentForm: FormGroup;
  patientForm: FormGroup;
  vitalsModalForm: FormGroup;
  loading = false;
  saving = false;
  patientSaving = false;
  exportingAppointments = false;
  status = '';
  dateFrom = this.todayValue();
  dateTo = this.todayValue();
  page = 1;
  limit = 10;
  totalPages = 0;
  updatingAppointmentIds = new Set<string>();
  readonly appointmentStatusOptions: Array<Appointment['status']> = [
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'no_show',
  ];
  readonly appointmentPaymentOptions: Array<NonNullable<Appointment['paymentStatus']>> = ['unpaid', 'paid'];
  editingId: string | null = null;
  currentHospitalId: string | null = null;
  hospitalProfile: Hospital | null = null;
  patientPhone = '';
  phoneLookupLoading = false;
  phoneLookupPerformed = false;
  phoneMatchedPatients: Patient[] = [];
  phoneMatchedTotal = 0;
  /** Fast DOB entry for operators — years only; syncs with dateOfBirth. */
  patientAgeYears: number | null = null;
  readonly maxDateOfBirth = todayIsoDate();
  selectedPatient: Patient | null = null;
  patientLastVisit: PatientLastVisit | null = null;
  lastVisitLoading = false;
  addPatientModalOpen = false;
  bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  visitType = 'Consultation';
  submitAttempted = false;
  serverAppointmentErrors: string[] = [];
  vitalsModalOpen = false;
  vitalsTrendModalOpen = false;
  vitalDisplayItems: VitalDisplayItem[] = [];
  vitalTrendVisits: VitalTrendVisit[] = [];
  availableSlotOptions: Array<{ startTime: string; endTime: string; durationMinutes: number }> = [];
  slotsLoading = false;
  slotDurationMinutes = 15;
  readonly defaultVitalKeys = new Set(['bp', 'pulse', 'weight', 'temperature', 'spo2']);
  readonly defaultVitalLabels: Record<string, string> = {
    bp: 'BP',
    pulse: 'Pulse',
    weight: 'Weight',
    temperature: 'Temperature',
    spo2: 'SpO2',
  };
  readonly vitalTrendKeys = ['weight', 'bp', 'temperature', 'pulse', 'spo2'];

  constructor(
    private fb: FormBuilder,
    private backend: BackendService,
    private authService: AuthService,
    readonly offline: MooliOfflineService,
    private toastr: ToastrService,
    private router: Router,
    private dialog: AppDialogService
  ) {
    this.appointmentForm = this.fb.group({
      patientId: ['', Validators.required],
      doctorId: ['', Validators.required],
      departmentId: [''],
      appointmentDate: [this.todayValue(), Validators.required],
      startTime: [''],
      endTime: [''],
      reason: [''],
      consultationFee: [0],
      discount: [0],
      discountReason: [''],
      paymentStatus: ['unpaid', Validators.required],
      status: ['pending', Validators.required],
      notes: [''],
      vitals: this.fb.group({
        bp: [''],
        pulse: [''],
        weight: [''],
        temperature: [''],
        spo2: [''],
      }),
      customVitals: this.fb.array([]),
    });

    this.vitalsModalForm = this.fb.group({
      bp: [''],
      pulse: [''],
      weight: [''],
      height: [''],
      temperature: [''],
      spo2: [''],
      respiratoryRate: [''],
      bloodSugar: [''],
      notes: [''],
      customRows: this.fb.array([]),
    });

    this.patientForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', Validators.email],
      phone: [''],
      gender: ['male', Validators.required],
      dateOfBirth: [''],
      bloodGroup: [''],
      address: [''],
      emergencyContactName: [''],
      emergencyContactPhone: [''],
      allergies: [''],
      chronicDiseases: [''],
      currentMedications: [''],
    });
  }

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('user') || 'null') as { hospitalId?: string | null } | null;
    this.currentHospitalId = currentUser?.hospitalId || null;
    this.loadHospitalProfile();
    this.loadLookups();
    this.loadAppointments();
    void this.syncOfflineWork(false);

    this.vitalsGroup.valueChanges.subscribe(() => this.refreshVitalAnalytics());
    this.customVitals.valueChanges.subscribe(() => this.refreshVitalAnalytics());
    this.appointmentForm.get('appointmentDate')?.valueChanges.subscribe(() => this.refreshAvailableSlots());
    this.appointmentForm.get('startTime')?.valueChanges.subscribe((startTime: string) => {
      if (!startTime) {
        return;
      }
      if (this.editingId && this.appointmentForm.value.endTime) {
        return;
      }
      this.appointmentForm.patchValue(
        { endTime: this.addMinutesToTime(startTime, this.selectedSlotDurationMinutes) },
        { emitEvent: false }
      );
    });
  }

  get vitalsGroup(): FormGroup {
    return this.appointmentForm.get('vitals') as FormGroup;
  }

  get customVitals(): FormArray {
    return this.appointmentForm.get('customVitals') as FormArray;
  }

  get vitalsModalCustomVitals(): FormArray {
    return this.vitalsModalForm.get('customRows') as FormArray;
  }

  createCustomVitalGroup(key = '', value = ''): FormGroup {
    return this.fb.group({
      key: [key],
      value: [value],
    });
  }

  openVitalsModal(): void {
    const vitals = this.vitalsGroup.getRawValue() as Record<string, string>;
    const customMap = this.customVitalsToMap();

    this.vitalsModalForm.reset({
      bp: vitals['bp'] || '',
      pulse: vitals['pulse'] || '',
      weight: vitals['weight'] || '',
      height: customMap['height'] || '',
      temperature: vitals['temperature'] || '',
      spo2: vitals['spo2'] || '',
      respiratoryRate: customMap['respiratoryRate'] || customMap['respiratory_rate'] || '',
      bloodSugar: customMap['bloodSugar'] || customMap['blood_sugar'] || '',
      notes: customMap['notes'] || '',
    });
    this.loadVitalsModalCustomRows();
    this.vitalsModalOpen = true;
  }

  openVitalsModalWithCustomRow(): void {
    this.openVitalsModal();
    this.addVitalsModalCustomRow();
  }

  addVitalsModalCustomRow(): void {
    this.vitalsModalCustomVitals.push(this.createCustomVitalGroup());
  }

  removeVitalsModalCustomRow(index: number): void {
    this.vitalsModalCustomVitals.removeAt(index);
  }

  arbitraryCustomVitals(): Array<{ key: string; value: string; index: number }> {
    return this.customVitals.controls
      .map((control, index) => ({
        key: String(control.get('key')?.value || '').trim(),
        value: String(control.get('value')?.value || '').trim(),
        index,
      }))
      .filter((item) => isArbitraryCustomVitalKey(item.key));
  }

  formatCustomVitalLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  closeVitalsModal(): void {
    this.vitalsModalOpen = false;
  }

  saveVitalsModal(): void {
    const value = this.vitalsModalForm.getRawValue() as Record<string, string>;

    this.vitalsGroup.patchValue({
      bp: value['bp'] || '',
      pulse: value['pulse'] || '',
      weight: value['weight'] || '',
      temperature: value['temperature'] || '',
      spo2: value['spo2'] || '',
    });

    this.rebuildCustomVitalsFromModal(value);

    this.vitalsModalOpen = false;
    this.refreshVitalAnalytics();
  }

  openVitalsTrendsModal(): void {
    this.vitalTrendVisits = buildVitalTrendVisits(this.patientVitalHistory());
    this.vitalsTrendModalOpen = true;
  }

  closeVitalsTrendsModal(): void {
    this.vitalsTrendModalOpen = false;
  }

  vitalStatusClass(status: VitalStatus): string {
    return `vital-status-${status}`;
  }

  trendClass(item: VitalDisplayItem): string {
    if (!item.trendText) {
      return 'unknown';
    }

    if (item.status === 'critical') {
      return 'critical';
    }

    if (item.status === 'warning') {
      return 'warning';
    }

    if (item.status === 'watch') {
      return 'watch';
    }

    if (item.trendDirection === 'up') {
      return 'normal';
    }

    if (item.trendDirection === 'down') {
      return item.key === 'weight' ? 'warning' : 'watch';
    }

    return 'normal';
  }

  hasRecordedVitals(): boolean {
    return this.vitalDisplayItems.some((item) => Boolean(item.value));
  }

  hasVitalTrendData(): boolean {
    return this.vitalTrendVisits.length > 0;
  }

  trendVitalValue(visit: VitalTrendVisit, key: string): string {
    const value = String(visit.vitals[key] || '').trim();
    return value || '—';
  }

  trendSectionHasData(key: string): boolean {
    return this.vitalTrendVisits.some((visit) => Boolean(String(visit.vitals[key] || '').trim()));
  }

  vitalTrendSectionLabel(key: string): string {
    return this.defaultVitalLabels[key] || key;
  }

  refreshVitalAnalytics(): void {
    const current = this.buildVitalsPayload(
      this.vitalsGroup.getRawValue() as Record<string, unknown>,
      this.customVitals.getRawValue() as Array<Record<string, unknown>>
    );
    const previous = this.getPreviousVisitVitals();

    this.vitalDisplayItems = buildVitalDisplayItems(
      current,
      previous,
      getPatientAgeYears(this.selectedPatient?.dateOfBirth || null)
    );
    this.vitalTrendVisits = buildVitalTrendVisits(this.patientVitalHistory());
  }

  loadHospitalProfile(): void {
    const storedHospital = this.authService.currentUser()?.hospital || null;
    if (storedHospital) {
      this.hospitalProfile = storedHospital as Hospital;
    }

    if (!this.currentHospitalId || !this.backend.hasPermission('hospitals.read')) {
      return;
    }

    this.backend.getHospital(this.currentHospitalId).subscribe({
      next: (hospital) => {
        this.hospitalProfile = hospital;
      },
      error: () => {},
    });
  }

  get selectedDoctor(): Doctor | undefined {
    return this.findDoctorByUserId(this.appointmentForm.value.doctorId);
  }

  get selectedDoctorConsultationFee(): number {
    return Number(this.selectedDoctor?.consultationFee || 0);
  }

  get selectedDoctorAvailableDaysLabel(): string {
    const days = this.selectedDoctor?.availableDays || [];
    if (!days.length) {
      return 'Any day';
    }
    return days.map((day) => this.titleCase(String(day))).join(', ');
  }

  isSelectedDateAvailable(): boolean {
    const ymd = this.selectedAppointmentYmd();
    if (!ymd) {
      return true;
    }

    const unavailable = (this.selectedDoctor?.unavailableDates || []).some(
      (item) => String(item || '').slice(0, 10) === ymd
    );
    if (unavailable) {
      return false;
    }

    const days = (this.selectedDoctor?.availableDays || []).map((day) => String(day).toLowerCase());
    if (!days.length) {
      return true;
    }
    const weekday = this.selectedAppointmentWeekdayKey();
    return Boolean(weekday && days.includes(weekday));
  }

  get selectedAppointmentWeekdayLabel(): string {
    const weekday = this.selectedAppointmentWeekdayKey();
    return weekday ? this.titleCase(weekday) : '';
  }

  get appointmentSubmitErrors(): string[] {
    if (!this.submitAttempted) {
      return this.serverAppointmentErrors;
    }
    return [...this.collectAppointmentBlockingErrors(), ...this.serverAppointmentErrors];
  }

  showAppointmentError(controlName: string): boolean {
    const control = this.appointmentForm.get(controlName);
    return Boolean((this.submitAttempted || control?.touched) && control?.invalid);
  }

  showDateUnavailableError(): boolean {
    return Boolean(
      this.appointmentForm.value.doctorId &&
        this.appointmentForm.value.appointmentDate &&
        !this.isSelectedDateAvailable()
    );
  }

  showTimeSlotError(): boolean {
    return this.submitAttempted && this.isTimeSlotMissing();
  }

  showDiscountReasonError(): boolean {
    const discount = Number(this.appointmentForm.value.discount || 0);
    const reason = String(this.appointmentForm.value.discountReason || '').trim();
    const control = this.appointmentForm.get('discountReason');
    return discount > 0 && !reason && Boolean(this.submitAttempted || control?.touched);
  }

  isTimeSlotMissing(): boolean {
    if (this.slotsLoading || !this.appointmentForm.value.doctorId || !this.isSelectedDateAvailable()) {
      return false;
    }
    return this.timeSlots.length > 0 && !this.normalizeClockTime(this.appointmentForm.value.startTime);
  }

  private selectedAppointmentWeekdayKey(): string {
    const ymd = this.selectedAppointmentYmd();
    if (!ymd) {
      return '';
    }
    return (
      ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
        new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))).getDay()
      ] || ''
    );
  }

  private selectedAppointmentYmd(): string {
    const raw = String(this.appointmentForm.value.appointmentDate || '');
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  get netConsultationFee(): number {
    const fee = Number(this.appointmentForm.value.consultationFee || this.selectedDoctorConsultationFee || 0);
    const discount = Number(this.appointmentForm.value.discount || 0);
    return Math.max(fee - discount, 0);
  }

  get canCreateAppointment(): boolean {
    return this.backend.hasPermission('appointments.create');
  }

  get canUpdateAppointment(): boolean {
    return this.backend.hasPermission('appointments.update');
  }

  get canDeleteAppointment(): boolean {
    return this.backend.hasPermission('appointments.delete');
  }

  get canUpdateAppointmentStatus(): boolean {
    return this.backend.hasPermission('appointments.status_update');
  }

  get canReadPatients(): boolean {
    return this.backend.hasPermission('patients.read');
  }

  get canCreatePatients(): boolean {
    return this.backend.hasPermission('patients.create');
  }

  loadLookups(): void {
    this.backend.getAccessibleDoctors({ limit: 100, status: 'active' }).subscribe({
      next: (result) => {
        this.doctors = result.items;
        void this.offline.cacheValue(this.doctorsCacheKey(), this.doctors);
        if (this.doctors.length === 1 && !this.appointmentForm.value.doctorId) {
          this.appointmentForm.patchValue({ doctorId: this.doctorBindingId(this.doctors[0]) });
        }
        this.onDoctorChange();
      },
      error: () => {
        void this.loadCachedDoctors();
      },
    });
  }

  loadAppointments(): void {
    this.loading = true;
    this.backend
      .getAppointments({
        page: this.page,
        limit: this.limit,
        status: this.status,
        dateFrom: this.dateFrom,
        dateTo: this.dateTo,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => {
          void this.offline.cacheValue(this.appointmentsCacheKey(), {
            items: result.items,
            totalPages: result.pagination.totalPages,
          });
          void this.applyAppointmentList(result.items, result.pagination.totalPages);
          this.totalPages = result.pagination.totalPages;
        },
        error: (err) => {
          void this.loadCachedAppointments(err);
        },
      });
  }

  applyAppointmentFilters(): void {
    this.page = 1;
    this.loadAppointments();
  }

  exportAppointments(): void {
    if (this.exportingAppointments) {
      return;
    }

    if (this.appointments.length === 0) {
      this.toastr.info('No appointments available to export.');
      return;
    }

    this.exportingAppointments = true;
    try {
      const csvContent = this.buildAppointmentsCsv(this.appointments);
      this.downloadCsv(csvContent, this.appointmentsExportFileName());
      this.toastr.success('Appointments exported successfully.');
    } finally {
      this.exportingAppointments = false;
    }
  }

  submitAppointment(): void {
    this.submitAttempted = true;
    this.serverAppointmentErrors = [];
    this.appointmentForm.markAllAsTouched();

    const blockingErrors = this.collectAppointmentBlockingErrors();
    if (blockingErrors.length) {
      this.scrollToAppointmentErrors();
      this.toastr.error(blockingErrors[0]);
      return;
    }

    const value = this.appointmentForm.value;
    const startTime = this.normalizeClockTime(value.startTime);
    const endTime =
      this.normalizeClockTime(value.endTime) ||
      (startTime ? this.addMinutesToTime(startTime, this.selectedSlotDurationMinutes) : '');
    const selectedDoctor = this.findDoctorByUserId(value.doctorId);
    const paymentStatus = value.paymentStatus || 'unpaid';
    const consultationFee = Number(value.consultationFee || selectedDoctor?.consultationFee || 0);
    const discount = Number(value.discount || 0);
    const discountReason = String(value.discountReason || '').trim();

    const vitals = this.buildVitalsPayload(
      value.vitals as Record<string, unknown>,
      value.customVitals as Array<Record<string, unknown>>
    );
    const payload: Record<string, unknown> = {
      patientId: value.patientId,
      doctorId: value.doctorId,
      departmentId: selectedDoctor?.departmentId || value.departmentId || undefined,
      appointmentDate: value.appointmentDate,
      startTime,
      endTime,
      reason: value.reason,
      consultationFee,
      discount,
      discountReason: discount > 0 ? discountReason : undefined,
      paymentStatus,
      visitType: this.visitType || 'Consultation',
      status: paymentStatus === 'paid' ? 'confirmed' : value.status || 'pending',
      notes: value.notes,
    };
    const isEditing = Boolean(this.editingId);
    if (isEditing || Object.keys(vitals).length > 0) {
      payload['vitals'] = vitals;
    }

    this.removeEmptyTimeFields(payload);
    if (!isEditing) {
      this.removeEmptyOptionalTextFields(payload, ['reason', 'notes', 'discountReason']);
    }

    if (!this.editingId && this.currentHospitalId) {
      payload['hospitalId'] = this.currentHospitalId;
    }

    const selectedPatient = this.selectedPatient;
    const selectedDoctorForToken = selectedDoctor;

    if (!this.offline.online() && !isEditing) {
      void this.queueAppointment(payload, selectedPatient, selectedDoctorForToken);
      return;
    }

    this.saving = true;
    const request$ = this.editingId
      ? this.backend.updateAppointment(this.editingId, payload)
      : this.backend.createAppointment(payload);

    request$.pipe(finalize(() => (this.saving = false))).subscribe({
      next: (response) => {
        this.toastr.success(response.message);
        if (!isEditing && response.data) {
          const appointmentToken = this.buildAppointmentToken(
            response.data,
            selectedPatient,
            selectedDoctorForToken
          );
          this.printAppointmentToken(appointmentToken);
        }
        this.resetForm();
        this.loadAppointments();
      },
      error: (err) => {
        if (!isEditing && this.offline.shouldQueue(err)) {
          void this.queueAppointment(payload, selectedPatient, selectedDoctorForToken);
          return;
        }

        const apiErrors = this.appointmentApiErrorMessages(err);
        this.serverAppointmentErrors = apiErrors;
        this.scrollToAppointmentErrors();
        this.toastr.error(apiErrors[0] || 'Unable to save appointment');
      },
    });
  }

  editAppointment(appointment: Appointment): void {
    if (!this.canUpdateAppointment) {
      return;
    }

    this.editingId = appointment._id;
    this.submitAttempted = false;
    this.serverAppointmentErrors = [];
    this.selectedPatient = appointment.patient || null;
    this.patientPhone = appointment.patient?.phone || '';
    this.phoneMatchedPatients = appointment.patient ? [appointment.patient] : [];
    this.patients = this.phoneMatchedPatients;
    this.phoneMatchedTotal = this.phoneMatchedPatients.length;
    this.phoneLookupPerformed = Boolean(appointment.patient);
    this.visitType = appointment.visitType || 'Consultation';
    this.appointmentForm.patchValue({
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      departmentId: appointment.departmentId || '',
      appointmentDate: appointment.appointmentDate.slice(0, 10),
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      reason: appointment.reason || '',
      consultationFee: appointment.consultationFee ?? this.selectedDoctorConsultationFee,
      discount: appointment.discount ?? 0,
      discountReason: appointment.discountReason || '',
      paymentStatus: appointment.paymentStatus || 'unpaid',
      status: appointment.status,
      notes: appointment.notes || '',
      vitals: this.extractDefaultVitals(appointment.vitals || {}),
    });
    this.customVitals.clear();
    this.extractCustomVitals(appointment.vitals || {}).forEach((entry) =>
      this.customVitals.push(this.createCustomVitalGroup(entry.key, entry.value))
    );
    this.refreshVitalAnalytics();
    if (appointment.patientId) {
      this.loadPatientLastVisit(appointment.patientId);
    }
  }

  updateStatus(appointment: Appointment, status: string): void {
    this.changeAppointmentStatus(appointment, status as Appointment['status']);
  }

  isAppointmentUpdating(id: string): boolean {
    return this.updatingAppointmentIds.has(id);
  }

  changeAppointmentStatus(appointment: Appointment, status: Appointment['status']): void {
    if (!this.canUpdateAppointmentStatus) {
      return;
    }

    if (appointment.status === status) {
      return;
    }

    const previousStatus = appointment.status;
    appointment.status = status;
    this.setAppointmentUpdating(appointment._id, true);

    this.backend
      .updateAppointmentStatus(appointment._id, { status, notes: appointment.notes || '' })
      .pipe(finalize(() => this.setAppointmentUpdating(appointment._id, false)))
      .subscribe({
        next: (response) => {
          this.toastr.success(response.message);
          this.patchAppointmentRow(appointment, response.data);
        },
        error: (err) => {
          appointment.status = previousStatus;
          this.toastr.error(err?.error?.message || 'Unable to update appointment status');
        },
      });
  }

  changeAppointmentPaymentStatus(
    appointment: Appointment,
    paymentStatus: NonNullable<Appointment['paymentStatus']>,
  ): void {
    if (!this.canUpdateAppointment) {
      return;
    }

    const previousPaymentStatus = appointment.paymentStatus || 'unpaid';
    const previousStatus = appointment.status;

    if (previousPaymentStatus === paymentStatus) {
      return;
    }

    appointment.paymentStatus = paymentStatus;
    if (paymentStatus === 'paid') {
      appointment.status = 'confirmed';
    }

    this.setAppointmentUpdating(appointment._id, true);

    this.backend
      .updateAppointment(appointment._id, { paymentStatus })
      .pipe(finalize(() => this.setAppointmentUpdating(appointment._id, false)))
      .subscribe({
        next: (response) => {
          this.toastr.success(response.message);
          this.patchAppointmentRow(appointment, response.data);
        },
        error: (err) => {
          appointment.paymentStatus = previousPaymentStatus;
          appointment.status = previousStatus;
          this.toastr.error(err?.error?.message || 'Unable to update payment status');
        },
      });
  }

  private setAppointmentUpdating(id: string, updating: boolean): void {
    if (updating) {
      this.updatingAppointmentIds.add(id);
      return;
    }

    this.updatingAppointmentIds.delete(id);
  }

  private patchAppointmentRow(target: Appointment, source?: Appointment | null): void {
    if (!source) {
      return;
    }

    Object.assign(target, source);
  }

  async deleteAppointment(id: string): Promise<void> {
    if (!this.canDeleteAppointment) {
      return;
    }

    const confirmed = await this.dialog.confirm({
      title: 'Delete Appointment',
      message: 'Delete this appointment? This action cannot be undone.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    this.backend.deleteAppointment(id).subscribe({
      next: (response) => {
        this.toastr.success(response.message);
        this.loadAppointments();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Something went wrong'),
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.submitAttempted = false;
    this.serverAppointmentErrors = [];
    this.appointmentForm.reset({
      appointmentDate: this.todayValue(),
      consultationFee: 0,
      discount: 0,
      discountReason: '',
      paymentStatus: 'unpaid',
      status: 'pending',
    });
    this.patientPhone = '';
    this.phoneLookupLoading = false;
    this.phoneLookupPerformed = false;
    this.phoneMatchedPatients = [];
    this.phoneMatchedTotal = 0;
    this.selectedPatient = null;
    this.patientLastVisit = null;
    this.patients = [];
    this.customVitals.clear();
    this.vitalsGroup.reset({
      bp: '',
      pulse: '',
      weight: '',
      temperature: '',
      spo2: '',
    });
    this.vitalDisplayItems = [];
    this.vitalTrendVisits = [];
  }

  patientName(patient?: Patient | null): string {
    return patient ? `${patient.firstName} ${patient.lastName}`.trim() : '-';
  }

  get totalAppointmentsToday(): number {
    const today = this.dateOnly(new Date());
    return this.appointments.filter(
      (appointment) => this.dateOnly(appointment.appointmentDate) === today
    ).length;
  }

  get pendingCheckIns(): number {
    return this.appointments.filter((appointment) => appointment.status === 'pending').length;
  }

  get availableDoctors(): number {
    return this.doctors.length;
  }

  get walkIns(): number {
    return this.appointments.filter((appointment) =>
      `${appointment.reason || ''} ${appointment.notes || ''}`.toLowerCase().includes('walk')
    ).length;
  }

  get selectedSlotDurationMinutes(): number {
    const minutes = Number(this.selectedDoctor?.slotDurationMinutes || this.slotDurationMinutes || 15);
    return [5, 10, 15, 20, 30].includes(minutes) ? minutes : 15;
  }

  get expectedVisitLabel(): string {
    const start = this.formatClockTime(this.appointmentForm.value.startTime);
    const end = this.formatClockTime(this.appointmentForm.value.endTime);
    if (start === '-' || end === '-') {
      return '';
    }
    return `${start} – ${end} (${this.selectedSlotDurationMinutes} min)`;
  }

  get timeSlots(): Array<{ startTime: string; endTime: string; durationMinutes: number }> {
    return this.availableSlotOptions;
  }

  canSearchPatientPhone(): boolean {
    return this.canReadPatients && this.normalizePhone(this.patientPhone).length >= 4 && !this.phoneLookupLoading;
  }

  lookupPatientsByPhone(): void {
    const phone = this.patientPhone.trim();
    const normalizedPhone = this.normalizePhone(phone);

    if (normalizedPhone.length < 4) {
      this.toastr.error('Enter at least 4 digits of phone number');
      return;
    }

    this.phoneLookupLoading = true;
    this.phoneLookupPerformed = false;
    this.phoneMatchedPatients = [];
    this.phoneMatchedTotal = 0;
    this.selectedPatient = null;
    this.patientLastVisit = null;
    this.patients = [];
    this.appointmentForm.patchValue({ patientId: '' });

    this.backend
      .getPatients({ limit: 100, status: 'active', search: phone })
      .pipe(finalize(() => (this.phoneLookupLoading = false)))
      .subscribe({
        next: (result) => {
          const matchedPatients = (result.items || []).filter((patient) =>
            this.normalizePhone(patient.phone || '').includes(normalizedPhone)
          );

          this.phoneMatchedPatients = matchedPatients;
          this.patients = matchedPatients;
          void this.offline.mergeCachedList(this.patientsCacheKey(), matchedPatients);
          this.phoneMatchedTotal = matchedPatients.length;
          this.phoneLookupPerformed = true;

          if (matchedPatients.length === 0) {
            this.toastr.info('No patient found against this phone number');
          }
        },
        error: (err) => {
          void this.loadCachedPatientsByPhone(normalizedPhone, err);
        },
      });
  }

  selectPatient(patient: Patient): void {
    this.selectedPatient = patient;
    this.appointmentForm.patchValue({ patientId: patient._id });

    if (patient.phone) {
      this.patientPhone = patient.phone;
    }

    if (patient.assignedDoctorId) {
      this.appointmentForm.patchValue({ doctorId: patient.assignedDoctorId });
      this.onDoctorChange();
    }

    this.refreshVitalAnalytics();
    this.loadPatientLastVisit(patient._id);
  }

  loadPatientLastVisit(patientId: string): void {
    if (!patientId) {
      this.patientLastVisit = null;
      return;
    }

    this.lastVisitLoading = true;
    this.backend
      .getPatientLastVisit(patientId, this.editingId ? { excludeAppointmentId: this.editingId } : undefined)
      .pipe(finalize(() => (this.lastVisitLoading = false)))
      .subscribe({
        next: (lastVisit) => {
          this.patientLastVisit = lastVisit;
        },
        error: () => {
          this.patientLastVisit = null;
        },
      });
  }

  lastVisitSummary(): string {
    if (this.lastVisitLoading) {
      return 'Checking previous visits...';
    }

    if (!this.patientLastVisit?.hasPreviousVisit || !this.patientLastVisit.lastVisitDate) {
      return 'No previous visit found. This looks like a new visit for this patient.';
    }

    const parts = [
      `Last visit: ${this.shortDate(this.patientLastVisit.lastVisitDate)}`,
      this.patientLastVisit.lastVisitType ? this.patientLastVisit.lastVisitType : '',
      this.patientLastVisit.lastDoctorName ? `Dr ${this.patientLastVisit.lastDoctorName}` : '',
    ].filter(Boolean);

    return parts.join(' · ');
  }

  onDoctorChange(): void {
    this.patchDepartmentFromDoctor(this.appointmentForm.value.doctorId);
    const doctor = this.selectedDoctor;
    const consultationFee = Number(doctor?.consultationFee || 0);
    this.slotDurationMinutes = this.selectedSlotDurationMinutes;
    this.appointmentForm.patchValue({ consultationFee });
    this.refreshAvailableSlots();
  }

  onPaymentStatusChange(): void {
    const paymentStatus = this.appointmentForm.value.paymentStatus;

    if (paymentStatus === 'paid') {
      this.appointmentForm.patchValue({ status: 'confirmed' });
      return;
    }

    if (!this.editingId) {
      this.appointmentForm.patchValue({ status: 'pending' });
    }
  }

  formatConsultationFee(value?: number | null, discount?: number | null): string {
    const amount = Number(value || 0);
    return amount > 0 ? `PKR ${amount.toLocaleString('en-PK')}` : 'Not set';
  }

  formatAppointmentFee(appointment: Appointment): string {
    const fee = Number(appointment.consultationFee || 0);
    const discount = Number(appointment.discount || 0);
    const net = Number(appointment.netFee ?? Math.max(fee - discount, 0));

    if (discount > 0) {
      return `PKR ${net.toLocaleString('en-PK')} (-${discount.toLocaleString('en-PK')})`;
    }

    return this.formatConsultationFee(fee);
  }

  discountReasonLabel(appointment: Appointment): string {
    const discount = Number(appointment.discount || 0);
    if (discount <= 0) {
      return '-';
    }

    return String(appointment.discountReason || '').trim() || '-';
  }

  paymentStatusLabel(value?: string | null): string {
    return value === 'paid' ? 'Paid' : 'Unpaid';
  }

  visitTypeLabel(value?: string | null): string {
    return value || 'Consultation';
  }

  doctorBindingId(doctor: Doctor): string {
    return String(doctor.userId || doctor.user?._id || '').trim();
  }

  doctorOptionLabel(doctor: Doctor): string {
    const doctorName = doctor.user?.name || doctor.specialization || 'Doctor';
    const departmentName = doctor.department?.name || '';

    return departmentName ? `${doctorName} - ${departmentName}` : doctorName;
  }

  selectTimeSlot(slot: { startTime: string; endTime: string; durationMinutes: number } | string): void {
    const startTime = typeof slot === 'string' ? slot : slot.startTime;
    const endTime =
      typeof slot === 'string'
        ? this.addMinutesToTime(slot, this.selectedSlotDurationMinutes)
        : slot.endTime;
    this.appointmentForm.get('endTime')?.markAsPristine();
    this.appointmentForm.patchValue({
      startTime,
      endTime,
    });
  }

  isSelectedTimeSlot(slot: { startTime: string } | string): boolean {
    const startTime = typeof slot === 'string' ? slot : slot.startTime;
    return this.appointmentForm.value.startTime === startTime;
  }

  patientMeta(patient?: Patient | null): string {
    if (!patient) {
      return '-';
    }

    const parts = [patient.gender ? this.titleCase(patient.gender) : null];
    const age = this.ageLabel(patient.dateOfBirth || null);

    if (age) {
      parts.push(age);
    }

    return parts.filter(Boolean).join(' - ');
  }

  appointmentStatusClass(status: string): string {
    return `status-${status.replace(/_/g, '-')}`;
  }

  appointmentStatusLabel(status: string): string {
    return status
      .split('_')
      .map((part) => this.titleCase(part))
      .join(' ');
  }

  appointmentTimeRange(appointment: Appointment): string {
    const start = this.formatClockTime(appointment.startTime);
    const end = this.formatClockTime(appointment.endTime);

    if (start === '-' && end === '-') {
      return 'No time set';
    }

    if (start === '-') {
      return end;
    }

    if (end === '-') {
      return start;
    }

    return `${start} - ${end}`;
  }

  initials(value?: string | null): string {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      return 'NA';
    }

    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  shortDate(value: string | Date): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  formatClockTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const [hourText, minuteText] = value.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return value;
    }

    const normalizedHour = hour % 12 || 12;
    const meridiem = hour >= 12 ? 'PM' : 'AM';
    return `${normalizedHour}:${String(minute).padStart(2, '0')} ${meridiem}`;
  }

  reprintAppointmentToken(appointment: Appointment): void {
    const doctor = this.findDoctorByUserId(appointment.doctorId);
    this.printAppointmentToken(
      this.buildAppointmentToken(appointment, appointment.patient, doctor)
    );
  }

  printAppointmentToken(token: AppointmentToken): void {
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(printFrame);

    const printWindow = printFrame.contentWindow;
    const printDocument = printWindow?.document;

    if (!printWindow || !printDocument) {
      printFrame.remove();
      this.toastr.error('Unable to open print window');
      return;
    }

    const tokenHtml = this.buildAppointmentTokenPrintHtml(token);

    printDocument.open();
    printDocument.write(tokenHtml);
    printDocument.close();

    printWindow.onafterprint = () => printFrame.remove();

    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => {
        if (document.body.contains(printFrame)) {
          printFrame.remove();
        }
      }, 15000);
    }, 200);
  }

  openAddPatientModal(): void {
    if (!this.canCreatePatients) {
      return;
    }

    this.patientForm.reset({
      firstName: '',
      lastName: '',
      email: '',
      phone: this.patientPhone || '',
      gender: 'male',
      dateOfBirth: '',
      bloodGroup: '',
      address: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      allergies: '',
      chronicDiseases: '',
      currentMedications: '',
    });
    this.patientAgeYears = null;
    this.addPatientModalOpen = true;
  }

  onPatientAgeYearsInput(): void {
    const nextDob = isoDateFromAgeYears(
      Number(this.patientAgeYears),
      this.patientForm.get('dateOfBirth')?.value || ''
    );
    if (!nextDob) {
      return;
    }
    this.patientForm.patchValue({ dateOfBirth: nextDob }, { emitEvent: false });
  }

  onPatientDateOfBirthInput(): void {
    this.patientAgeYears = ageYearsFromIsoDate(this.patientForm.get('dateOfBirth')?.value || '');
  }

  closeAddPatientModal(): void {
    if (this.patientSaving) {
      return;
    }

    this.addPatientModalOpen = false;
  }

  submitPatientFromModal(): void {
    if (!this.canCreatePatients) {
      return;
    }

    if (this.patientForm.invalid) {
      this.patientForm.markAllAsTouched();
      return;
    }

    const value = this.patientForm.value;
    const payload: Record<string, unknown> = {
      firstName: value.firstName,
      lastName: value.lastName,
      email: value.email || undefined,
      phone: value.phone || undefined,
      gender: value.gender,
      dateOfBirth: value.dateOfBirth || undefined,
      bloodGroup: value.bloodGroup || undefined,
      address: value.address || undefined,
      emergencyContactName: value.emergencyContactName || undefined,
      emergencyContactPhone: value.emergencyContactPhone || undefined,
      allergies: this.toArray(value.allergies),
      chronicDiseases: this.toArray(value.chronicDiseases),
      currentMedications: this.toArray(value.currentMedications),
    };

    if (this.currentHospitalId) {
      payload['hospitalId'] = this.currentHospitalId;
    }

    if (!this.offline.online()) {
      void this.queuePatientFromModal(payload);
      return;
    }

    this.patientSaving = true;
    this.backend
      .createPatient(payload)
      .pipe(finalize(() => (this.patientSaving = false)))
      .subscribe({
        next: (response) => {
          const patient = response.data;
          this.toastr.success(response.message);
          this.addPatientModalOpen = false;
          this.patientPhone = patient.phone || this.patientPhone;
          this.phoneLookupPerformed = true;
          this.phoneMatchedPatients = [patient, ...this.phoneMatchedPatients];
          void this.offline.mergeCachedList(this.patientsCacheKey(), [patient]);
          this.patients = this.phoneMatchedPatients;
          this.phoneMatchedTotal = this.phoneMatchedPatients.length;
          this.selectPatient(patient);
        },
        error: (err) => {
          if (this.offline.shouldQueue(err)) {
            void this.queuePatientFromModal(payload);
            return;
          }

          this.toastr.error(err?.error?.message || 'Unable to add patient');
        },
      });
  }

  clearSelectedPatient(): void {
    this.selectedPatient = null;
    this.patientLastVisit = null;
    this.appointmentForm.patchValue({ patientId: '' });
  }

  async syncOfflineWork(showToast = true): Promise<void> {
    if (!this.offline.online()) {
      if (showToast) {
        this.toastr.info('Appointments will sync when internet is back.');
      }
      return;
    }

    const result = await this.offline.syncQueuedWork();
    if (result.syncedCount > 0) {
      this.loadLookups();
      this.loadAppointments();
      if (showToast) {
        this.toastr.success(`${result.syncedCount} offline item(s) synced.`);
      }
    } else if (showToast) {
      this.toastr.info('No offline appointments are waiting to sync.');
    }
  }

  private toArray(value: string): string[] {
    return value
      ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      : [];
  }

  private buildAppointmentsCsv(appointments: Appointment[]): string {
    const headers = [
      'Appointment ID',
      'Patient',
      'Patient No',
      'Doctor',
      'Department',
      'Date',
      'Time',
      'Status',
      'Reason',
      'Notes',
    ];

    const rows = appointments.map((appointment) => [
      appointment.appointmentNo,
      this.patientName(appointment.patient),
      appointment.patient?.patientNo || appointment.patientId,
      appointment.doctor?.name || '-',
      appointment.department?.name || '-',
      this.shortDate(appointment.appointmentDate),
      this.appointmentTimeRange(appointment),
      this.appointmentStatusLabel(appointment.status),
      appointment.reason || '',
      appointment.notes || '',
    ]);

    return [headers, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');
  }

  private csvCell(value: string): string {
    const normalizedValue = String(value || '').replace(/\r?\n|\r/g, ' ').trim();
    const safeValue = /^[=+\-@]/.test(normalizedValue) ? `'${normalizedValue}` : normalizedValue;

    return `"${safeValue.replace(/"/g, '""')}"`;
  }

  private downloadCsv(csvContent: string, fileName: string): void {
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private appointmentsExportFileName(): string {
    const statusPart = this.status || 'all';
    const fromPart = this.dateFrom || 'from';
    const toPart = this.dateTo || 'to';

    return `appointments-${statusPart}-${fromPart}-${toPart}.csv`;
  }

  private async loadCachedDoctors(): Promise<void> {
    this.doctors = await this.offline.readCachedValue<Doctor[]>(this.doctorsCacheKey(), []);
    this.onDoctorChange();
  }

  private async loadCachedAppointments(error: unknown): Promise<void> {
    const cached = await this.offline.readCachedValue<{ items: Appointment[]; totalPages: number }>(
      this.appointmentsCacheKey(),
      { items: [], totalPages: 0 },
    );
    await this.applyAppointmentList(cached.items, cached.totalPages);
    if (!this.offline.shouldQueue(error) && cached.items.length === 0) {
      this.toastr.error((error as { error?: { message?: string } })?.error?.message || 'Something went wrong');
    }
  }

  private async applyAppointmentList(items: Appointment[], totalPages: number): Promise<void> {
    this.appointments = this.mergeAppointments([...(await this.localQueuedAppointments()), ...items])
      .filter((appointment) => this.appointmentMatchesFilters(appointment));
    this.totalPages = totalPages;
    this.refreshVitalAnalytics();
  }

  private patientVitalHistory(): Array<{ createdAt?: string; vitals?: Record<string, string> | null }> {
    const patientId = this.appointmentForm.value.patientId || this.selectedPatient?._id;
    if (!patientId) {
      return [];
    }

    return [...this.appointments]
      .filter(
        (appointment) =>
          appointment.patientId === patientId &&
          appointment._id !== this.editingId &&
          appointment.vitals &&
          Object.values(appointment.vitals).some((value) => String(value || '').trim())
      )
      .sort(
        (first, second) =>
          new Date(second.appointmentDate || second.createdAt || 0).getTime() -
          new Date(first.appointmentDate || first.createdAt || 0).getTime()
      )
      .map((appointment) => ({
        createdAt: appointment.appointmentDate || appointment.createdAt,
        vitals: appointment.vitals || {},
      }));
  }

  private getPreviousVisitVitals(): Record<string, string> {
    return this.patientVitalHistory()[0]?.vitals || {};
  }

  private buildVitalsPayload(
    vitals: Record<string, unknown>,
    customVitals: Array<Record<string, unknown>>
  ): Record<string, string> {
    const payload: Record<string, string> = {};

    Object.entries(vitals || {}).forEach(([key, value]) => {
      const normalized = String(value || '').trim();
      if (normalized) {
        payload[key] = normalized;
      }
    });

    (customVitals || []).forEach((entry) => {
      const key = String(entry['key'] || '').trim();
      const value = String(entry['value'] || '').trim();
      if (key && value) {
        payload[key] = value;
      }
    });

    return payload;
  }

  private extractDefaultVitals(vitals: Record<string, string>): Record<string, string> {
    return {
      bp: String(vitals['bp'] || ''),
      pulse: String(vitals['pulse'] || ''),
      weight: String(vitals['weight'] || ''),
      temperature: String(vitals['temperature'] || ''),
      spo2: String(vitals['spo2'] || ''),
    };
  }

  private extractCustomVitals(vitals: Record<string, string>): Array<{ key: string; value: string }> {
    return Object.entries(vitals || {})
      .filter(([key]) => !this.defaultVitalKeys.has(key))
      .map(([key, value]) => ({
        key,
        value: String(value || ''),
      }));
  }

  private customVitalsToMap(): Record<string, string> {
    return (this.customVitals.getRawValue() as Array<Record<string, string>>).reduce(
      (map, entry) => {
        const key = String(entry['key'] || '').trim();
        if (key) {
          map[key] = String(entry['value'] || '').trim();
        }
        return map;
      },
      {} as Record<string, string>
    );
  }

  private loadVitalsModalCustomRows(): void {
    this.vitalsModalCustomVitals.clear();

    (this.customVitals.getRawValue() as Array<Record<string, string>>).forEach((entry) => {
      const key = String(entry['key'] || '').trim();
      const value = String(entry['value'] || '').trim();
      if (isArbitraryCustomVitalKey(key)) {
        this.vitalsModalCustomVitals.push(this.createCustomVitalGroup(key, value));
      }
    });
  }

  private rebuildCustomVitalsFromModal(modalValue: Record<string, string>): void {
    this.customVitals.clear();

    const entries: Array<{ key: string; value: string }> = [];
    const addEntry = (key: string, value: string): void => {
      const normalizedKey = key.trim();
      const normalizedValue = String(value || '').trim();
      if (normalizedKey && normalizedValue) {
        entries.push({ key: normalizedKey, value: normalizedValue });
      }
    };

    addEntry('height', modalValue['height'] || '');
    addEntry('respiratoryRate', modalValue['respiratoryRate'] || '');
    addEntry('bloodSugar', modalValue['bloodSugar'] || '');
    addEntry('notes', modalValue['notes'] || '');

    (this.vitalsModalCustomVitals.getRawValue() as Array<Record<string, string>>).forEach((entry) => {
      addEntry(String(entry['key'] || ''), String(entry['value'] || ''));
    });

    entries.forEach((entry) => this.customVitals.push(this.createCustomVitalGroup(entry.key, entry.value)));
  }

  private syncCustomVitalValue(key: string, value: string): void {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return;
    }

    const index = (this.customVitals.getRawValue() as Array<Record<string, string>>).findIndex(
      (entry) => String(entry['key'] || '').trim() === normalizedKey
    );

    if (!String(value || '').trim()) {
      if (index >= 0) {
        this.customVitals.removeAt(index);
      }
      return;
    }

    if (index >= 0) {
      this.customVitals.at(index).patchValue({ key: normalizedKey, value });
      return;
    }

    this.customVitals.push(this.createCustomVitalGroup(normalizedKey, value));
  }

  private async loadCachedPatientsByPhone(normalizedPhone: string, error: unknown): Promise<void> {
    const cachedPatients = await this.cachedPatientsWithLocal();
    const matchedPatients = cachedPatients.filter((patient) =>
      this.normalizePhone(patient.phone || '').includes(normalizedPhone),
    );

    this.phoneMatchedPatients = matchedPatients;
    this.patients = matchedPatients;
    this.phoneMatchedTotal = matchedPatients.length;
    this.phoneLookupPerformed = true;
    this.phoneLookupLoading = false;

    if (matchedPatients.length === 0 && !this.offline.shouldQueue(error)) {
      this.toastr.error((error as { error?: { message?: string } })?.error?.message || 'Unable to search patients');
    } else if (matchedPatients.length === 0) {
      this.toastr.info('No cached patient found. You can add a new patient offline.');
    }
  }

  private async cachedPatientsWithLocal(): Promise<Patient[]> {
    const cached = await this.offline.readCachedValue<Patient[]>(this.patientsCacheKey(), []);
    const localPatients = (await this.offline.getQueuedWork('patient'))
      .filter((entry) => entry.operation === 'create')
      .map((entry) => this.patientFromQueuedWork(entry));

    return this.mergePatients([...localPatients, ...cached]);
  }

  private async queuePatientFromModal(payload: Record<string, unknown>): Promise<void> {
    this.patientSaving = true;
    const localId = this.offline.buildLocalId('patient');
    const patient = this.buildLocalPatient(localId, payload);

    await this.offline.enqueueWork({
      id: localId,
      entity: 'patient',
      operation: 'create',
      localId,
      payload,
      meta: { patient },
    });
    await this.offline.mergeCachedList(this.patientsCacheKey(), [patient]);

    this.patientSaving = false;
    this.addPatientModalOpen = false;
    this.patientPhone = patient.phone || this.patientPhone;
    this.phoneLookupPerformed = true;
    this.phoneMatchedPatients = this.mergePatients([patient, ...this.phoneMatchedPatients]);
    this.patients = this.phoneMatchedPatients;
    this.phoneMatchedTotal = this.phoneMatchedPatients.length;
    this.selectPatient(patient);
    this.toastr.success('Patient saved offline and queued for sync.');
  }

  private async queueAppointment(
    payload: Record<string, unknown>,
    patient?: Patient | null,
    doctor?: Doctor,
  ): Promise<void> {
    this.saving = true;
    const localId = this.offline.buildLocalId('appointment');
    const appointment = this.buildLocalAppointment(localId, payload, patient, doctor);

    await this.offline.enqueueWork({
      id: localId,
      entity: 'appointment',
      operation: 'create',
      localId,
      payload,
      meta: { appointment, patient: patient || appointment.patient || null },
    });

    this.appointments = this.mergeAppointments([appointment, ...this.appointments]);
    this.saving = false;
    this.toastr.success('Appointment saved offline and queued for sync.');
    this.printAppointmentToken(this.buildAppointmentToken(appointment, patient, doctor));
    this.resetForm();
  }

  private buildLocalPatient(localId: string, payload: Record<string, unknown>): Patient {
    return {
      _id: localId,
      hospitalId: String(payload['hospitalId'] || this.currentHospitalId || ''),
      patientNo: `OFF-${localId.slice(-6).toUpperCase()}`,
      assignedDoctorId: String(payload['assignedDoctorId'] || ''),
      firstName: String(payload['firstName'] || ''),
      lastName: String(payload['lastName'] || ''),
      email: (payload['email'] as string | undefined) || null,
      phone: (payload['phone'] as string | undefined) || null,
      gender: (payload['gender'] as Patient['gender']) || 'other',
      dateOfBirth: (payload['dateOfBirth'] as string | undefined) || null,
      bloodGroup: (payload['bloodGroup'] as string | undefined) || null,
      address: (payload['address'] as string | undefined) || null,
      emergencyContactName: (payload['emergencyContactName'] as string | undefined) || null,
      emergencyContactPhone: (payload['emergencyContactPhone'] as string | undefined) || null,
      allergies: (payload['allergies'] as string[]) || [],
      chronicDiseases: (payload['chronicDiseases'] as string[]) || [],
      currentMedications: (payload['currentMedications'] as string[]) || [],
      status: 'active',
    };
  }

  private buildLocalAppointment(
    localId: string,
    payload: Record<string, unknown>,
    patient?: Patient | null,
    doctor?: Doctor,
  ): Appointment {
    return {
      _id: localId,
      hospitalId: String(payload['hospitalId'] || this.currentHospitalId || ''),
      appointmentNo: `OFF-${localId.slice(-6).toUpperCase()}`,
      patientId: String(payload['patientId'] || patient?._id || ''),
      patient: patient || null,
      doctorId: String(payload['doctorId'] || ''),
      doctor: doctor?.user || null,
      departmentId: String(payload['departmentId'] || doctor?.departmentId || ''),
      department: doctor?.department || null,
      appointmentDate: String(payload['appointmentDate'] || this.todayValue()),
      startTime: String(payload['startTime'] || ''),
      endTime: String(payload['endTime'] || ''),
      reason: (payload['reason'] as string | undefined) || null,
      status: (payload['status'] as Appointment['status']) || 'pending',
      consultationFee: Number(payload['consultationFee'] || doctor?.consultationFee || 0),
      discount: Number(payload['discount'] || 0),
      netFee: Math.max(
        Number(payload['consultationFee'] || doctor?.consultationFee || 0) - Number(payload['discount'] || 0),
        0
      ),
      paymentStatus: (payload['paymentStatus'] as Appointment['paymentStatus']) || 'unpaid',
      visitType: (payload['visitType'] as string | undefined) || this.visitType || 'Consultation',
      vitals: (payload['vitals'] as Record<string, string> | undefined) || {},
      notes: (payload['notes'] as string | undefined) || 'Saved offline',
    };
  }

  private async localQueuedAppointments(): Promise<Appointment[]> {
    const entries = await this.offline.getQueuedWork('appointment');
    return entries
      .filter((entry) => entry.operation === 'create')
      .map((entry) => {
        const metaAppointment = entry.meta?.['appointment'] as Appointment | undefined;
        if (metaAppointment) {
          return metaAppointment;
        }

        return this.buildLocalAppointment(
          entry.localId || entry.id,
          entry.payload as Record<string, unknown>,
          entry.meta?.['patient'] as Patient | null,
          this.findDoctorByUserId(String((entry.payload as Record<string, unknown>)['doctorId'] || '')),
        );
      });
  }

  private patientFromQueuedWork(entry: MooliQueuedWork): Patient {
    const metaPatient = entry.meta?.['patient'] as Patient | undefined;
    if (metaPatient) {
      return metaPatient;
    }

    return this.buildLocalPatient(entry.localId || entry.id, entry.payload as Record<string, unknown>);
  }

  private mergePatients(items: Patient[]): Patient[] {
    const map = new Map<string, Patient>();
    items.forEach((item) => {
      if (item?._id) {
        map.set(item._id, item);
      }
    });
    return Array.from(map.values());
  }

  private mergeAppointments(items: Appointment[]): Appointment[] {
    const map = new Map<string, Appointment>();
    items.forEach((item) => {
      if (item?._id) {
        map.set(item._id, item);
      }
    });
    return Array.from(map.values()).sort((first, second) =>
      `${second.appointmentDate} ${second.startTime}`.localeCompare(`${first.appointmentDate} ${first.startTime}`),
    );
  }

  private appointmentMatchesFilters(appointment: Appointment): boolean {
    if (this.status && appointment.status !== this.status) {
      return false;
    }

    const appointmentDate = toCalendarYmd(appointment.appointmentDate);
    if (this.dateFrom && appointmentDate < this.dateFrom) {
      return false;
    }

    if (this.dateTo && appointmentDate > this.dateTo) {
      return false;
    }

    return true;
  }

  private doctorsCacheKey(): string {
    return this.offline.cacheKey('appointment-doctors');
  }

  private appointmentsCacheKey(): string {
    return this.offline.cacheKey(
      'appointments',
      this.page,
      this.limit,
      this.status || 'all',
      this.dateFrom || 'from',
      this.dateTo || 'to',
    );
  }

  private removeEmptyTimeFields(payload: Record<string, unknown>): void {
    if (!payload['startTime']) {
      delete payload['startTime'];
    }

    if (!payload['endTime']) {
      delete payload['endTime'];
    }
  }

  private removeEmptyOptionalTextFields(payload: Record<string, unknown>, fields: string[]): void {
    fields.forEach((field) => {
      if (String(payload[field] || '').trim() === '') {
        delete payload[field];
      }
    });
  }

  private patientsCacheKey(): string {
    return this.offline.cacheKey('patients');
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const [hour, minute] = String(time || '').split(':').map(Number);
    const date = new Date();
    date.setHours(hour || 0, minute || 0, 0, 0);
    date.setMinutes(date.getMinutes() + minutesToAdd);
    return this.formatTime(date);
  }

  refreshAvailableSlots(): void {
    const doctorId = String(this.appointmentForm.value.doctorId || '').trim();
    const date = this.selectedAppointmentYmd();
    if (!doctorId || !date) {
      this.availableSlotOptions = [];
      return;
    }

    this.slotsLoading = true;
    this.backend
      .getAvailableAppointmentSlots({ doctorId, date })
      .pipe(finalize(() => (this.slotsLoading = false)))
      .subscribe({
        next: (result) => {
          this.slotDurationMinutes = Number(result.durationMinutes || 15);
          const today = todayYmd();
          const now = this.formatTime(new Date());
          this.availableSlotOptions = (result.slots || []).filter((slot) => {
            if (date !== today) {
              return true;
            }
            return slot.startTime > now;
          });
        },
        error: () => {
          this.availableSlotOptions = [];
        },
      });
  }

  private formatTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private dateOnly(value: string | Date): string {
    return toCalendarYmd(value);
  }

  private todayValue(): string {
    return todayYmd();
  }

  private ageLabel(dateOfBirth: string | null): string {
    if (!dateOfBirth) {
      return '';
    }

    const birthDate = new Date(dateOfBirth);

    if (Number.isNaN(birthDate.getTime())) {
      return '';
    }

    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    const monthDelta = today.getMonth() - birthDate.getMonth();

    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
      years -= 1;
    }

    return `${Math.max(years, 0)} Yrs`;
  }

  private titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  collectAppointmentBlockingErrors(): string[] {
    const errors: string[] = [];
    const value = this.appointmentForm.value;
    const startTime = this.normalizeClockTime(value.startTime);
    const endTime = this.normalizeClockTime(value.endTime);
    const discount = Number(value.discount || 0);
    const consultationFee = Number(value.consultationFee || this.selectedDoctorConsultationFee || 0);
    const discountReason = String(value.discountReason || '').trim();

    if (!this.editingId && !this.canCreateAppointment) {
      errors.push('You do not have permission to create appointments.');
      return errors;
    }

    if (this.editingId && !this.canUpdateAppointment) {
      errors.push('You do not have permission to update appointments.');
      return errors;
    }

    if (!value.patientId) {
      errors.push('Patient: search by mobile number, then tap Book on a patient.');
    }

    if (!this.doctors.length) {
      errors.push('Doctor: no active doctors found. Add a doctor first.');
    } else if (!value.doctorId) {
      errors.push('Doctor: select a doctor.');
    }

    if (!value.appointmentDate) {
      errors.push('Date: select an appointment date.');
    } else if (value.doctorId && !this.isSelectedDateAvailable()) {
      const weekday = this.selectedAppointmentWeekdayLabel;
      const available = this.selectedDoctorAvailableDaysLabel;
      errors.push(
        weekday
          ? `Date: doctor is not available on ${weekday}. Working days: ${available}.`
          : `Date: doctor is not available on this date. Working days: ${available}.`
      );
    }

    if (this.isTimeSlotMissing()) {
      errors.push('Time: select an available time slot.');
    } else if (startTime && endTime && startTime >= endTime) {
      errors.push('Time: start time must be before end time.');
    }

    if (discount > consultationFee) {
      errors.push('Discount: cannot be greater than the consultation fee.');
    } else if (discount > 0 && !discountReason) {
      errors.push('Discount reason: required when a discount is entered.');
    }

    if (this.appointmentForm.get('paymentStatus')?.invalid) {
      errors.push('Payment status: select unpaid or paid.');
    }

    if (this.appointmentForm.get('status')?.invalid) {
      errors.push('Status: select an appointment status.');
    }

    if (!errors.length && this.appointmentForm.invalid) {
      errors.push('Please complete the required appointment fields.');
    }

    return errors;
  }

  private appointmentApiErrorMessages(err: unknown): string[] {
    const body = (err as { error?: { message?: string; details?: unknown } })?.error;
    const details = body?.details;
    if (Array.isArray(details) && details.length) {
      const messages = details
        .map((item) => {
          const row = item as { path?: string; message?: string };
          const field = String(row.path || '')
            .replace(/^body\./, '')
            .trim();
          const message = String(row.message || '').trim();
          if (!message) {
            return '';
          }
          return field ? `${field}: ${message}` : message;
        })
        .filter(Boolean);
      if (messages.length) {
        return messages;
      }
    }

    return [body?.message || 'Unable to save appointment.'];
  }

  private scrollToAppointmentErrors(): void {
    queueMicrotask(() => {
      document.getElementById('appointment-form-errors')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }

  private normalizeClockTime(value?: string | null): string {
    const match = String(value || '')
      .trim()
      .match(/^(\d{1,2}):([0-5]\d)/);
    if (!match) {
      return '';
    }
    return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
  }

  private findDoctorByUserId(userId?: string | null): Doctor | undefined {
    const target = String(userId || '').trim();
    if (!target) {
      return undefined;
    }

    return this.doctors.find((doctor) => this.doctorBindingId(doctor) === target);
  }

  private patchDepartmentFromDoctor(userId?: string | null): void {
    const departmentId = this.findDoctorByUserId(userId)?.departmentId || '';
    this.appointmentForm.patchValue({ departmentId });
  }

  private buildAppointmentToken(
    appointment: Appointment,
    patient?: Patient | null,
    doctorRecord?: Doctor
  ): AppointmentToken {
    const resolvedPatient = appointment.patient || patient || null;
    const resolvedDoctorName = this.formatDoctorName(
      appointment.doctor?.name || doctorRecord?.user?.name || doctorRecord?.specialization || '-'
    );
    const resolvedDepartment =
      appointment.department?.name || doctorRecord?.department?.name || 'General';
    const branding = this.resolveClinicBranding();

    return {
      appointmentNo: appointment.appointmentNo,
      clinicName: branding.clinicName,
      clinicSubtitle: branding.clinicSubtitle,
      logoUrl: branding.logoUrl,
      patientName: this.patientName(resolvedPatient),
      doctorName: resolvedDoctorName,
      departmentName: resolvedDepartment,
      appointmentDate: this.shortDate(appointment.appointmentDate),
      timeRange: this.appointmentTimeRange(appointment),
      consultationFee: this.formatConsultationFee(
        appointment.consultationFee ?? doctorRecord?.consultationFee
      ),
      discount: appointment.discount
        ? `PKR ${Number(appointment.discount).toLocaleString('en-PK')}`
        : 'PKR 0',
      netFee: this.formatConsultationFee(
        appointment.netFee ??
          Math.max(
            Number(appointment.consultationFee || doctorRecord?.consultationFee || 0) -
              Number(appointment.discount || 0),
            0
          )
      ),
      paymentStatus: this.paymentStatusLabel(appointment.paymentStatus),
      status: this.appointmentStatusLabel(appointment.status),
      printedAt: `${this.shortDate(new Date())} ${this.formatClockTime(this.formatTime(new Date()))}`,
    };
  }

  private resolveClinicBranding(): { clinicName: string; clinicSubtitle: string; logoUrl: string } {
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null') as {
      hospital?: Hospital | null;
    } | null;
    const hospital = this.hospitalProfile || storedUser?.hospital || null;
    const hospitalName = hospital?.name?.trim() || 'Health Clinic';
    const nameParts = hospitalName.split(/\s+/).filter(Boolean);

    if (nameParts.length >= 3) {
      const splitIndex = Math.ceil(nameParts.length / 2);
      return {
        clinicName: nameParts.slice(0, splitIndex).join(' ').toUpperCase(),
        clinicSubtitle: nameParts.slice(splitIndex).join(' ').toUpperCase(),
        logoUrl: this.safeHospitalLogoUrl(hospital?.logoUrl),
      };
    }

    return {
      clinicName: hospitalName.toUpperCase(),
      clinicSubtitle: (hospital?.city || 'HEALTH CLINIC').toUpperCase(),
      logoUrl: this.safeHospitalLogoUrl(hospital?.logoUrl),
    };
  }

  private safeHospitalLogoUrl(value?: string | null): string {
    const logoUrl = String(value || '').trim();
    if (!logoUrl) {
      return '';
    }

    return resolveAssetUrl(logoUrl.startsWith('data:image/') && logoUrl.length > 1000000 ? '' : logoUrl);
  }

  private formatDoctorName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed === '-') {
      return '-';
    }

    return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr ${trimmed}`;
  }

  private buildAppointmentTokenPrintHtml(token: AppointmentToken): string {
    const logoMarkup = token.logoUrl
      ? `<img class="clinic-logo" src="${this.escapeHtml(token.logoUrl)}" alt="${this.escapeHtml(token.clinicName)}" />`
      : this.defaultClinicLogoSvg();

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title></title>
          <style>
            @page { margin: 0; size: auto; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; width: 100%; }
            body {
              align-items: flex-start;
              background: #fff;
              color: #003E86;
              display: flex;
              font-family: "Segoe UI", Arial, sans-serif;
              justify-content: center;
              min-height: auto;
              padding: 16px 12px;
            }
            .token {
              max-width: 420px;
              overflow: hidden;
              position: relative;
              width: 100%;
            }
            .header {
              align-items: center;
              display: flex;
              justify-content: space-between;
              margin-bottom: 10px;
            }
            .brand {
              align-items: center;
              display: flex;
              gap: 12px;
            }
            .clinic-logo,
            .logo-fallback {
              flex: 0 0 auto;
              height: 52px;
              object-fit: contain;
              width: 52px;
            }
            .logo-fallback {
              display: block;
            }
            .brand-text strong {
              color: #003E86;
              display: block;
              font-size: 18px;
              font-weight: 800;
              letter-spacing: 0.02em;
              line-height: 1.1;
            }
            .brand-text span {
              color: #019C9D;
              display: block;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.08em;
              margin-top: 2px;
            }
            .header-art {
              height: 56px;
              opacity: 0.9;
              width: 88px;
            }
            .divider {
              background: linear-gradient(90deg, #003E86 0 28%, #019C9D 28% 100%);
              height: 3px;
              margin: 10px 0 18px;
              width: 100%;
            }
            .eyebrow {
              color: #019C9D;
              font-size: 12px;
              font-weight: 800;
              letter-spacing: 0.16em;
              margin-bottom: 8px;
              text-align: center;
              text-transform: uppercase;
            }
            h1 {
              color: #003E86;
              font-size: 30px;
              font-weight: 800;
              letter-spacing: 0.01em;
              line-height: 1.05;
              margin: 0 0 8px;
              text-align: center;
            }
            .sub {
              color: #6b7280;
              font-size: 12px;
              margin: 0 0 14px;
              text-align: center;
            }
            .status-badge {
              align-items: center;
              border: 1.5px solid #019C9D;
              border-radius: 999px;
              color: #019C9D;
              display: inline-flex;
              font-size: 12px;
              font-weight: 800;
              gap: 8px;
              margin: 0 auto 18px;
              padding: 7px 14px;
            }
            .status-wrap {
              text-align: center;
            }
            .status-icon {
              align-items: center;
              background: #019C9D;
              border-radius: 50%;
              color: #fff;
              display: inline-flex;
              font-size: 10px;
              height: 18px;
              justify-content: center;
              width: 18px;
            }
            .details-card {
              background: #f4f7fb;
              border: 1px solid #e3eaf3;
              border-radius: 14px;
              margin-bottom: 18px;
              padding: 6px 14px;
            }
            .detail-row {
              align-items: center;
              border-top: 1px dashed #d5dde8;
              display: grid;
              gap: 10px;
              grid-template-columns: 34px 1fr auto;
              min-height: 48px;
              padding: 10px 0;
            }
            .detail-row:first-child { border-top: 0; }
            .detail-icon {
              align-items: center;
              background: #e8f7f7;
              border-radius: 50%;
              display: inline-flex;
              height: 34px;
              justify-content: center;
              width: 34px;
            }
            .detail-icon svg {
              display: block;
              height: 16px;
              width: 16px;
            }
            .detail-label {
              color: #6b7280;
              font-size: 12px;
              font-weight: 700;
            }
            .detail-value {
              color: #003E86;
              font-size: 12px;
              font-weight: 800;
              text-align: right;
            }
            .footer-divider {
              align-items: center;
              display: flex;
              gap: 10px;
              margin-bottom: 10px;
            }
            .footer-line {
              background: #019C9D;
              flex: 1;
              height: 2px;
            }
            .footer-heart {
              align-items: center;
              background: #019C9D;
              border-radius: 50%;
              color: #fff;
              display: inline-flex;
              height: 24px;
              justify-content: center;
              width: 24px;
            }
            .footer-text {
              color: #6b7280;
              font-size: 12px;
              margin: 0;
              text-align: center;
            }
            .corner-art {
              bottom: -8px;
              height: 72px;
              position: absolute;
              right: -8px;
              width: 110px;
            }
            @media print {
              @page { margin: 0; size: auto; }
              html, body {
                height: auto;
                min-height: auto;
              }
              body { padding: 10px 8px; }
              .token {
                max-width: none;
                page-break-after: avoid;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="token">
            <div class="header">
              <div class="brand">
                ${logoMarkup}
                <div class="brand-text">
                  <strong>${this.escapeHtml(token.clinicName)}</strong>
                  <span>${this.escapeHtml(token.clinicSubtitle)}</span>
                </div>
              </div>
              ${this.headerDecorationSvg()}
            </div>

            <div class="divider"></div>

            <div class="eyebrow">Appointment Token</div>
            <h1>${this.escapeHtml(token.appointmentNo)}</h1>
            <p class="sub">Keep this token for your visit</p>
            <div class="status-wrap">
              <div class="status-badge">
                <span class="status-icon">&#10003;</span>
                <span>${this.escapeHtml(token.status)}</span>
              </div>
            </div>

            <div class="details-card">
              ${this.printableTokenDetailRow('Patient', token.patientName, 'patient')}
              ${this.printableTokenDetailRow('Doctor', token.doctorName, 'doctor')}
              ${this.printableTokenDetailRow('Department', token.departmentName, 'department')}
              ${this.printableTokenDetailRow('Consultation Fee', token.consultationFee, 'fee')}
              ${this.printableTokenDetailRow('Discount', token.discount, 'fee')}
              ${this.printableTokenDetailRow('Net Fee', token.netFee, 'fee')}
              ${this.printableTokenDetailRow('Payment', token.paymentStatus, 'payment')}
              ${this.printableTokenDetailRow('Date', token.appointmentDate, 'date')}
              ${this.printableTokenDetailRow('Expected time', token.timeRange, 'time')}
              ${this.printableTokenDetailRow('Printed At', token.printedAt, 'printed')}
            </div>

            <div class="footer-divider">
              <span class="footer-line"></span>
              <span class="footer-heart">${this.footerHeartSvg()}</span>
              <span class="footer-line"></span>
            </div>
            <p class="footer-text">Please wait for your turn.</p>
            ${this.cornerDecorationSvg()}
          </div>
        </body>
      </html>
    `;
  }

  private printableTokenDetailRow(label: string, value: string, icon: string): string {
    return `
      <div class="detail-row">
        <span class="detail-icon">${this.tokenRowIconSvg(icon)}</span>
        <span class="detail-label">${this.escapeHtml(label)}</span>
        <span class="detail-value">${this.escapeHtml(value || '-')}</span>
      </div>
    `;
  }

  private defaultClinicLogoSvg(): string {
    return `
      <svg class="logo-fallback" viewBox="0 0 52 52" aria-hidden="true">
        <rect x="2" y="2" width="48" height="48" rx="10" fill="#019C9D"/>
        <rect x="23" y="12" width="6" height="28" rx="2" fill="#fff"/>
        <rect x="12" y="23" width="28" height="6" rx="2" fill="#fff"/>
        <path d="M14 34 C18 30, 22 28, 26 30 C30 32, 34 30, 38 26" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      </svg>
    `;
  }

  private headerDecorationSvg(): string {
    return `
      <svg class="header-art" viewBox="0 0 88 56" aria-hidden="true">
        <path d="M58 8 C72 6, 82 14, 84 28" stroke="#b9e8e8" stroke-width="2" fill="none"/>
        <path d="M52 16 C66 14, 76 22, 78 36" stroke="#d8f2f2" stroke-width="2" fill="none"/>
        <path d="M68 18 C70 14, 76 12, 80 16 C84 20, 80 26, 76 26 C74 26, 72 24, 72 22 C72 20, 70 18, 68 18 Z" fill="#019C9D"/>
        <path d="M72 22 L74 28 L80 28 L75 32 L77 38 L72 34 L67 38 L69 32 L64 28 L70 28 Z" fill="#019C9D" opacity="0.25"/>
      </svg>
    `;
  }

  private footerHeartSvg(): string {
    return `
      <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
        <path d="M7 12 C4 9, 1.5 7, 1.5 4.5 C1.5 3, 2.7 2, 4 2 C5 2, 6 2.6, 7 3.6 C8 2.6, 9 2, 10 2 C11.3 2, 12.5 3, 12.5 4.5 C12.5 7, 10 9, 7 12 Z" fill="#fff"/>
      </svg>
    `;
  }

  private cornerDecorationSvg(): string {
    return `
      <svg class="corner-art" viewBox="0 0 110 72" aria-hidden="true">
        <path d="M30 72 C55 58, 78 42, 110 18 L110 72 Z" fill="#019C9D" opacity="0.9"/>
        <path d="M52 72 C72 60, 90 46, 110 30 L110 72 Z" fill="#003E86" opacity="0.95"/>
      </svg>
    `;
  }

  private tokenRowIconSvg(type: string): string {
    const stroke = '#003E86';
    const icons: Record<string, string> = {
      patient: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="2.5" stroke="${stroke}" stroke-width="1.4"/><path d="M3.5 14c0-2.8 2-4.5 4.5-4.5S12.5 11.2 12.5 14" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round"/></svg>`,
      doctor: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="4.8" r="2.2" stroke="${stroke}" stroke-width="1.3"/><path d="M3.8 13.5c0-2.4 1.8-3.8 4.2-3.8s4.2 1.4 4.2 3.8" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round"/><path d="M11.2 7.2h1.6v1.6M12 6.4v3.2" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/></svg>`,
      department: `<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 14V5.5L8 2.5l5.5 3V14" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 14v-4h4v4" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 7h3M6.5 9.5h3" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/></svg>`,
      date: `<svg viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="${stroke}" stroke-width="1.3"/><path d="M2.5 6.5h11M5.5 2.5v2M10.5 2.5v2" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round"/></svg>`,
      time: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="${stroke}" stroke-width="1.3"/><path d="M8 5v3.2l2.2 1.3" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round"/></svg>`,
      printed: `<svg viewBox="0 0 16 16" fill="none"><rect x="3" y="2.5" width="10" height="4" rx="1" stroke="${stroke}" stroke-width="1.2"/><path d="M3 8.5h10v4.5H3z" stroke="${stroke}" stroke-width="1.2"/><path d="M5.5 11.5h5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/></svg>`,
      fee: `<svg viewBox="0 0 16 16" fill="none"><rect x="2.5" y="4" width="11" height="8" rx="1.5" stroke="${stroke}" stroke-width="1.3"/><path d="M5 8h6M8 6v4" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round"/></svg>`,
      payment: `<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="4.5" width="12" height="7.5" rx="1.5" stroke="${stroke}" stroke-width="1.3"/><path d="M2 7h12" stroke="${stroke}" stroke-width="1.2"/><path d="M5 10.5h3.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    };

    return icons[type] || icons['patient'];
  }

  private buildAppointmentWhatsAppMessage(token: AppointmentToken): string {
    return [
      `*${token.clinicName}*`,
      token.clinicSubtitle,
      '',
      '*Appointment Token*',
      token.appointmentNo,
      '',
      `Patient: ${token.patientName}`,
      `Doctor: ${token.doctorName}`,
      `Department: ${token.departmentName}`,
      `Consultation Fee: ${token.consultationFee}`,
      `Discount: ${token.discount}`,
      `Net Fee: ${token.netFee}`,
      `Payment: ${token.paymentStatus}`,
      `Date: ${token.appointmentDate}`,
      `Expected time: ${token.timeRange}`,
      `Status: ${token.status}`,
      '',
      'Please keep this token for your visit.',
    ].join('\n');
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  canOpenClinicalRecords(): boolean {
    return this.backend.hasPermission('patients_history.read');
  }

  canOpenPrescriptions(): boolean {
    return this.backend.hasPermission('prescriptions.read') || this.backend.hasPermission('prescriptions.create');
  }

  openPrescriptionForAppointment(appointment: Appointment, event?: Event): void {
    event?.stopPropagation();

    if (!this.canOpenPrescriptions()) {
      return;
    }

    if (appointment.status === 'cancelled') {
      this.toastr.error('Cancelled appointments cannot be opened in prescriptions.');
      return;
    }

    void this.router.navigate(['/prescriptions'], {
      queryParams: {
        appointmentId: appointment._id,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
      },
    });
  }

  changePage(nextPage: number): void {
    if (nextPage < 1 || (this.totalPages && nextPage > this.totalPages)) {
      return;
    }

    this.page = nextPage;
    this.loadAppointments();
  }

  sendAppointmentWhatsApp(appointment: any): void {
    if (!appointment.patient?.phone) {
      this.toastr.error('Patient does not have a phone number.');
      return;
    }

    const token = this.buildAppointmentToken(appointment, appointment.patient, appointment.doctor);
    const phone = this.normalizePhone(appointment.patient.phone);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(
      this.buildAppointmentWhatsAppMessage(token)
    )}`;

    window.open(whatsappUrl, '_blank');
  }
}
