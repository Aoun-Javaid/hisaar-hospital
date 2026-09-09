import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../../core/services/backend.service';
import { Patient, Room, Doctor, RoomAllotment, TreatmentCatalogItem } from '../../../../shared/models/hospital.model';

interface WardAdmissionSuccess {
  admissionNo: string;
  encounterId: string;
  encounterNo?: string;
  roomAllotmentId: string;
  wardName: string;
  roomNo: string;
  bedLabel: string;
  consultantName: string;
  nurseName: string;
}

@Component({
  selector: 'app-add-allotment',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './add-allotment.component.html',
  styleUrl: './add-allotment.component.scss',
})
export class AddAllotmentComponent implements OnInit {
  allotmentForm: FormGroup;
  rooms: Room[] = [];
  selectedRoom: Room | null = null;
  prefilledWardName = '';
  prefilledBedId = '';
  currentHospitalId: string | null = null;
  saving = false;
  roomsLoading = false;
  patientSearchQuery = '';
  patientLookupLoading = false;
  patientLookupPerformed = false;
  matchedPatients: Patient[] = [];
  selectedPatient: Patient | null = null;
  admissionRecommendationId = '';
  recommendationSummary: Record<string, unknown> | null = null;
  recommendationReadOnly = false;
  admissionSuccess: WardAdmissionSuccess | null = null;
  treatmentCatalog: TreatmentCatalogItem[] = [];
  canApproveDiscounts = false;

  constructor(
    private fb: FormBuilder,
    private backend: BackendService,
    private toastr: ToastrService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.allotmentForm = this.fb.group({
      roomId: ['', Validators.required],
      bedLabel: ['', Validators.required],
      consultantDoctorId: [''],
      admissionReason: ['', Validators.required],
      treatmentCatalogId: [''],
      roomDiscountType: ['none'],
      roomDiscountValue: [0],
      roomDiscountReason: [''],
      procedureDiscountType: ['none'],
      procedureDiscountValue: [0],
      procedureDiscountReason: [''],
      advanceAmount: [null],
      advanceMethod: ['cash'],
      securityAmount: [null],
      securityMethod: ['cash'],
      admittedAt: [this.currentDateTimeLocalValue(), Validators.required],
      notes: [''],
    });
  }

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('user') || 'null') as { hospitalId?: string | null } | null;
    this.currentHospitalId = currentUser?.hospitalId || null;
    this.prefilledWardName = String(this.route.snapshot.queryParamMap.get('wardName') || '').trim();
    this.prefilledBedId = String(this.route.snapshot.queryParamMap.get('bedId') || '').trim();
    this.admissionRecommendationId = String(
      this.route.snapshot.queryParamMap.get('recommendationId')
        || this.route.snapshot.queryParamMap.get('recommendationid')
        || ''
    ).trim();

    const bedNo = String(this.route.snapshot.queryParamMap.get('bedNo') || '').trim();
    if (bedNo) {
      this.allotmentForm.patchValue({ bedLabel: bedNo });
    }

    this.allotmentForm.get('roomId')?.valueChanges.subscribe((roomId) => {
      this.selectedRoom = this.rooms.find((room) => room._id === roomId) || this.selectedRoom;
    });

    this.loadRooms();
    this.loadTreatmentCatalog();
    this.canApproveDiscounts =
      this.backend.hasPermission('admission_discounts.approve') || this.backend.hasPermission('*');
    this.loadAdmissionRecommendationContext();
  }

  private loadTreatmentCatalog(): void {
    this.backend.getTreatmentCatalog({ limit: 100, isActive: true }).subscribe({
      next: (result) => {
        this.treatmentCatalog = result.items || [];
      },
      error: () => {
        this.treatmentCatalog = [];
      },
    });
  }

  private loadAdmissionRecommendationContext(): void {
    if (!this.admissionRecommendationId) {
      return;
    }

    this.recommendationReadOnly = true;
    this.backend.getAdmissionRecommendation(this.admissionRecommendationId).subscribe({
      next: (recommendation) => {
        this.recommendationSummary = recommendation;
        const patient = recommendation['patientId'] as Patient | undefined;
        if (patient?._id) {
          this.selectedPatient = patient;
          this.matchedPatients = [patient];
          this.patientLookupPerformed = true;
        }

        this.allotmentForm.patchValue({
          consultantDoctorId:
            typeof recommendation['recommendedByDoctorId'] === 'object'
              ? String((recommendation['recommendedByDoctorId'] as Doctor)?._id || '')
              : String(recommendation['recommendedByDoctorId'] || ''),
          admissionReason: String(recommendation['reason'] || recommendation['initialDiagnosis'] || ''),
          treatmentCatalogId:
            typeof recommendation['treatmentCatalogId'] === 'object'
              ? String((recommendation['treatmentCatalogId'] as { _id?: string })?._id || '')
              : String(recommendation['treatmentCatalogId'] || ''),
          roomDiscountType:
            (recommendation['roomDiscountRecommendation'] as { type?: string } | undefined)?.type || 'none',
          roomDiscountValue:
            Number((recommendation['roomDiscountRecommendation'] as { value?: number } | undefined)?.value || 0),
          roomDiscountReason:
            String((recommendation['roomDiscountRecommendation'] as { reason?: string } | undefined)?.reason || ''),
          procedureDiscountType:
            (recommendation['procedureDiscountRecommendation'] as { type?: string } | undefined)?.type || 'none',
          procedureDiscountValue:
            Number((recommendation['procedureDiscountRecommendation'] as { value?: number } | undefined)?.value || 0),
          procedureDiscountReason:
            String((recommendation['procedureDiscountRecommendation'] as { reason?: string } | undefined)?.reason || ''),
        });
      },
      error: () => this.toastr.error('Unable to load admission recommendation.'),
    });
  }

  private currentDateTimeLocalValue(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  get addPatientQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};

    if (this.selectedRoom?._id) {
      params['roomId'] = this.selectedRoom._id;
    }

    if (this.patientSearchQuery.trim()) {
      params['phone'] = this.patientSearchQuery.trim();
    }

    return params;
  }

  get selectableRooms(): Room[] {
    return [...this.rooms].sort((left, right) => {
      if (left.status === 'available' && right.status !== 'available') {
        return -1;
      }

      if (right.status === 'available' && left.status !== 'available') {
        return 1;
      }

      return left.roomNo.localeCompare(right.roomNo, undefined, { numeric: true });
    });
  }

  get notesCount(): number {
    return String(this.allotmentForm.get('notes')?.value || '').length;
  }

  get roomCharge(): number {
    return Number(this.selectedRoom?.chargesPerDay || 0);
  }

  get packageRate(): number {
    const id = String(this.allotmentForm.get('treatmentCatalogId')?.value || '').trim();
    const fromCatalog = this.treatmentCatalog.find((item) => item._id === id)?.baseRate;
    if (fromCatalog != null) return Number(fromCatalog || 0);
    return Number((this.recommendationSummary?.['treatmentSnapshot'] as { baseRate?: number } | undefined)?.baseRate || 0);
  }

  get recommendedRoomDiscountLabel(): string {
    const rec = this.recommendationSummary?.['roomDiscountRecommendation'] as
      | { type?: string; value?: number }
      | undefined;
    return this.formatDiscountLabel(rec?.type, rec?.value);
  }

  get recommendedProcedureDiscountLabel(): string {
    const rec = this.recommendationSummary?.['procedureDiscountRecommendation'] as
      | { type?: string; value?: number }
      | undefined;
    return this.formatDiscountLabel(rec?.type, rec?.value);
  }

  get effectiveRoomRate(): number {
    return this.applyDiscount(
      this.roomCharge,
      String(this.allotmentForm.get('roomDiscountType')?.value || 'none'),
      Number(this.allotmentForm.get('roomDiscountValue')?.value || 0)
    );
  }

  get effectivePackageRate(): number {
    return this.applyDiscount(
      this.packageRate,
      String(this.allotmentForm.get('procedureDiscountType')?.value || 'none'),
      Number(this.allotmentForm.get('procedureDiscountValue')?.value || 0)
    );
  }

  private formatDiscountLabel(type?: string, value?: number): string {
    if (!type || type === 'none') return 'None';
    if (type === 'percentage') return `${Number(value || 0)}%`;
    return `Rs. ${Number(value || 0).toLocaleString()}`;
  }

  private applyDiscount(gross: number, type: string, value: number): number {
    if (type === 'percentage') {
      return Math.max(0, gross - (gross * Math.min(100, Math.max(0, value))) / 100);
    }
    if (type === 'fixed') {
      return Math.max(0, gross - Math.max(0, value));
    }
    return gross;
  }

  get advanceCharge(): number {
    return Number(this.allotmentForm.get('advanceAmount')?.value || 0);
  }

  get securityCharge(): number {
    return Number(this.allotmentForm.get('securityAmount')?.value || 0);
  }

  get totalPayableToday(): number {
    return this.advanceCharge + this.securityCharge;
  }

  get estimatedChargesTotal(): number {
    return this.effectiveRoomRate + this.effectivePackageRate;
  }

  isUrgentPriority(priority: unknown): boolean {
    return String(priority || '').toLowerCase() === 'urgent';
  }

  priorityLabel(priority: unknown): string {
    const value = String(priority || 'normal').trim() || 'normal';
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  doctorDisplayName(value: unknown): string {
    if (!value) return '—';
    if (typeof value === 'object') {
      const doctor = value as Doctor;
      return doctor.user?.name || doctor.specialization || '—';
    }
    return String(value);
  }

  treatmentDisplayName(rec: Record<string, unknown>): string {
    const snapshot = rec['treatmentSnapshot'] as { name?: string; code?: string } | undefined;
    if (snapshot?.name) {
      return snapshot.code ? `${snapshot.code} — ${snapshot.name}` : snapshot.name;
    }
    const catalog = rec['treatmentCatalogId'];
    if (catalog && typeof catalog === 'object') {
      const item = catalog as { name?: string; code?: string };
      return item.code ? `${item.code} — ${item.name}` : item.name || '—';
    }
    return '—';
  }

  packageRateFromRecommendation(rec: Record<string, unknown>): number {
    const snapshot = rec['treatmentSnapshot'] as { baseRate?: number } | undefined;
    if (snapshot?.baseRate != null) return Number(snapshot.baseRate || 0);
    const catalog = rec['treatmentCatalogId'];
    if (catalog && typeof catalog === 'object') {
      return Number((catalog as { baseRate?: number }).baseRate || 0);
    }
    return this.packageRate;
  }

  clearForm(): void {
    const keepRecommendationPatient = this.recommendationReadOnly && !!this.selectedPatient;
    const consultantDoctorId = this.allotmentForm.get('consultantDoctorId')?.value || '';
    const admissionReason = keepRecommendationPatient
      ? String(this.recommendationSummary?.['reason'] || this.allotmentForm.get('admissionReason')?.value || '')
      : '';

    this.allotmentForm.reset({
      roomId: '',
      bedLabel: '',
      consultantDoctorId,
      admissionReason,
      treatmentCatalogId: keepRecommendationPatient
        ? this.allotmentForm.get('treatmentCatalogId')?.value || ''
        : '',
      roomDiscountType: 'none',
      roomDiscountValue: 0,
      roomDiscountReason: '',
      procedureDiscountType: 'none',
      procedureDiscountValue: 0,
      procedureDiscountReason: '',
      advanceAmount: null,
      advanceMethod: 'cash',
      securityAmount: null,
      securityMethod: 'cash',
      admittedAt: this.currentDateTimeLocalValue(),
      notes: '',
    });
    this.selectedRoom = null;

    if (!keepRecommendationPatient) {
      this.selectedPatient = null;
      this.matchedPatients = [];
      this.patientLookupPerformed = false;
      this.patientSearchQuery = '';
    }
  }

  scrollToRoomField(): void {
    document.getElementById('room-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private loadRooms(): void {
    const preselectedRoomId = String(this.route.snapshot.queryParamMap.get('roomId') || '').trim();

    this.roomsLoading = true;
    this.backend
      .getRooms({ limit: 100 })
      .pipe(finalize(() => (this.roomsLoading = false)))
      .subscribe({
        next: (result) => {
          this.rooms = result.items || [];

          if (preselectedRoomId) {
            this.ensurePreselectedRoom(preselectedRoomId);
            return;
          }

          const firstAvailable = this.rooms.find((room) => room.status === 'available');
          if (firstAvailable) {
            this.setSelectedRoom(firstAvailable);
          }
        },
        error: (err) => {
          this.rooms = [];
          this.toastr.error(err?.error?.message || 'Unable to load rooms.');
        },
      });
  }

  private ensurePreselectedRoom(roomId: string): void {
    const existing = this.rooms.find((room) => room._id === roomId);
    if (existing) {
      this.setSelectedRoom(existing);
      return;
    }

    this.backend.getRoom(roomId).subscribe({
      next: (room) => {
        if (!this.rooms.some((item) => item._id === room._id)) {
          this.rooms = [room, ...this.rooms];
        }
        this.setSelectedRoom(room);
      },
      error: () => this.toastr.error('Unable to load selected room.'),
    });
  }

  private setSelectedRoom(room: Room): void {
    this.selectedRoom = room;
    this.allotmentForm.patchValue({ roomId: room._id }, { emitEvent: false });

    if (!this.allotmentForm.get('bedLabel')?.value) {
      this.allotmentForm.patchValue({ bedLabel: room.roomNo });
    }
  }

  onRoomChange(roomId: string): void {
    this.selectedRoom = this.rooms.find((room) => room._id === roomId) || null;
  }

  patientName(patient: Patient): string {
    return `${patient.firstName} ${patient.lastName}`.trim();
  }

  patientSummary(patient: Patient): string {
    const parts = [patient.patientNo || '', patient.phone || ''].filter(Boolean);
    return parts.join(' · ');
  }

  roomTypeLabel(roomType?: string | null): string {
    return String(roomType || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  roomStatusLabel(status?: string | null): string {
    return String(status || 'available')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  roomWardName(room?: Room | null): string {
    if (!room) {
      return this.prefilledWardName || '-';
    }

    return this.prefilledWardName || room.ward?.name || '-';
  }

  roomFloorLabel(room?: Room | null): string {
    if (!room) {
      return '-';
    }

    return room.floorRecord?.label || room.floorRecord?.name || room.floor || '-';
  }

  roomOptionLabel(room: Room): string {
    return `${room.roomNo} - ${this.roomTypeLabel(room.roomType)} - ${this.roomStatusLabel(room.status)} - ${room.chargesPerDay}/day`;
  }

  canSearchPatients(): boolean {
    return this.patientSearchQuery.trim().length >= 2 && !this.patientLookupLoading;
  }

  lookupPatients(): void {
    const query = this.patientSearchQuery.trim();

    if (query.length < 2) {
      this.toastr.error('Enter at least 2 characters to search by name, patient number, or phone.');
      return;
    }

    this.patientLookupLoading = true;
    this.patientLookupPerformed = false;
    this.matchedPatients = [];
    this.selectedPatient = null;

    this.backend
      .getPatients({ limit: 100, status: 'active', search: query })
      .pipe(finalize(() => (this.patientLookupLoading = false)))
      .subscribe({
        next: (result) => {
          this.matchedPatients = result.items || [];
          this.patientLookupPerformed = true;

          if (this.matchedPatients.length === 0) {
            this.toastr.info('No patient found for this search.');
          }
        },
        error: (err) => {
          this.patientLookupPerformed = true;
          this.toastr.error(err?.error?.message || 'Unable to search patients.');
        },
      });
  }

  selectPatient(patient: Patient): void {
    this.selectedPatient = patient;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  clearSelectedPatient(): void {
    this.selectedPatient = null;
  }

  can(permission: string): boolean {
    return this.backend.hasPermission(permission);
  }

  consultantName(doctorId?: string | null): string {
    if (!doctorId) return '—';
    return String(doctorId);
  }

  openPatientControlPanel(): void {
    if (!this.admissionSuccess?.roomAllotmentId) return;
    void this.router.navigate(['/ward/patient-detail', this.admissionSuccess.roomAllotmentId]);
  }

  backToAdmissions(): void {
    void this.router.navigate(['/ward/admissions']);
  }

  submitAllotment(): void {
    if (!this.can('room_allotments.create')) {
      this.toastr.error('You do not have permission to create room allotments.');
      return;
    }

    if (!this.selectedPatient?._id) {
      this.toastr.error('Please search and select a patient.');
      return;
    }

    if (this.allotmentForm.invalid) {
      this.allotmentForm.markAllAsTouched();
      this.toastr.error('Please complete required allotment fields before saving.');
      return;
    }

    const value = this.allotmentForm.getRawValue();
    const payload: Record<string, unknown> = {
      patientId: this.selectedPatient._id,
      roomId: value.roomId,
      bedId: /^[a-f\d]{24}$/i.test(this.prefilledBedId) ? this.prefilledBedId : undefined,
      admittedAt: value.admittedAt ? new Date(value.admittedAt).toISOString() : undefined,
      notes: value.notes || undefined,
      bedLabel: String(value.bedLabel || '').trim() || undefined,
      consultantDoctorId: value.consultantDoctorId || undefined,
      admissionReason: value.admissionReason || undefined,
      advanceAmount: value.advanceAmount ? Number(value.advanceAmount) : undefined,
      advanceMethod: value.advanceMethod || undefined,
      securityAmount: value.securityAmount ? Number(value.securityAmount) : undefined,
      securityMethod: value.securityMethod || undefined,
      admissionRecommendationId: this.admissionRecommendationId || undefined,
      recommendedByDoctorId: value.consultantDoctorId || undefined,
      sourceAppointmentId:
        typeof this.recommendationSummary?.['sourceAppointmentId'] === 'object'
          ? String((this.recommendationSummary?.['sourceAppointmentId'] as { _id?: string })._id || '')
          : String(this.recommendationSummary?.['sourceAppointmentId'] || '') || undefined,
      initialDiagnosis: String(this.recommendationSummary?.['initialDiagnosis'] || value.admissionReason || '') || undefined,
      treatmentCatalogId: value.treatmentCatalogId || undefined,
      roomDiscountApproved: {
        type: value.roomDiscountType || 'none',
        value: Number(value.roomDiscountValue || 0),
        reason: String(value.roomDiscountReason || '').trim(),
      },
      procedureDiscountApproved: {
        type: value.procedureDiscountType || 'none',
        value: Number(value.procedureDiscountValue || 0),
        reason: String(value.procedureDiscountReason || '').trim(),
      },
      recommendedOperatingDoctorId:
        typeof this.recommendationSummary?.['recommendedOperatingDoctorId'] === 'object'
          ? String((this.recommendationSummary?.['recommendedOperatingDoctorId'] as { _id?: string })?._id || '')
          : String(this.recommendationSummary?.['recommendedOperatingDoctorId'] || '') || undefined,
      preferredOperationAt: this.recommendationSummary?.['preferredOperationAt'] || undefined,
      operationScheduleId: this.recommendationSummary?.['operationScheduleId'] || undefined,
    };

    if (this.currentHospitalId) {
      payload['hospitalId'] = this.currentHospitalId;
    }

    this.saving = true;
    this.admissionSuccess = null;
    this.backend
      .createRoomAllotment(payload)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (response) => {
          const allotment = (response.data || {}) as RoomAllotment & {
            encounter?: { _id?: string; encounterNo?: string };
            admissionEncounterId?: string;
          };
          const encounterId = String(
            allotment.encounterId || allotment.admissionEncounterId || allotment.encounter?._id || ''
          ).trim();
          const admissionNo = String(allotment.admissionNo || '').trim();
          const encounterNo = String(allotment.encounter?.encounterNo || '').trim();

          if (!admissionNo || !encounterId) {
            this.toastr.error('Admission saved but response did not include admission/encounter identifiers.');
            return;
          }

          this.admissionSuccess = {
            admissionNo,
            encounterId,
            encounterNo: encounterNo || undefined,
            roomAllotmentId: String(allotment._id || ''),
            wardName: this.roomWardName(this.selectedRoom),
            roomNo: this.selectedRoom?.roomNo || '',
            bedLabel: String(value.bedLabel || this.selectedRoom?.roomNo || ''),
            consultantName: this.consultantName(value.consultantDoctorId),
            nurseName: '',
          };

          this.toastr.success(response.message || 'Room allotment created successfully');
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to save room allotment.'),
      });
  }
}
