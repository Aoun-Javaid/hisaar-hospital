import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../../core/services/backend.service';
import { MooliOfflineService } from '../../../../core/services/mooli-offline.service';
import {
  ageYearsFromIsoDate,
  isoDateFromAgeYears,
  todayIsoDate,
} from '../../../../core/utils/dob-age.util';
import { Doctor, Patient, User } from '../../../../shared/models/hospital.model';

@Component({
  selector: 'app-add-patient',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './add-patient.component.html',
  styleUrl: './add-patient.component.scss',
})
export class AddPatientComponent implements OnInit {
  patientForm: FormGroup;
  doctors: Doctor[] = [];
  editingPatient: Patient | null = null;
  currentUser: User | null = null;
  currentHospitalId: string | null = null;
  saving = false;
  bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  patientAgeYears: number | null = null;
  readonly maxDateOfBirth = todayIsoDate();

  constructor(
    private fb: FormBuilder,
    private backend: BackendService,
    readonly offline: MooliOfflineService,
    private toastr: ToastrService,
    private router: Router,
    private route: ActivatedRoute
  ) {
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
    this.editingPatient = history.state?.patient || null;
    this.currentUser = JSON.parse(localStorage.getItem('user') || 'null') as User | null;
    this.currentHospitalId = this.currentUser?.hospitalId || null;
    this.applyEditingState();
    this.applyPhoneFromQuery();
    this.backend.getAccessibleDoctors({ limit: 100, status: 'active' }).subscribe({
      next: (result) => {
        this.doctors = result.items;
        void this.offline.cacheValue(this.doctorsCacheKey(), this.doctors);
      },
      error: () => {
        void this.loadCachedDoctors();
      },
    });
  }

  toArray(value: string): string[] {
    return value
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
  }

  can(permission: string): boolean {
    return this.backend.hasPermission(permission);
  }

  submitPatient(): void {
    if (!this.editingPatient && !this.can('patients.create')) {
      return;
    }

    if (this.editingPatient && !this.can('patients.update')) {
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

    if (!this.editingPatient && this.currentHospitalId) {
      payload['hospitalId'] = this.currentHospitalId;
    }

    if (!this.offline.online() && !this.editingPatient) {
      void this.queuePatient(payload);
      return;
    }

    this.saving = true;
    const request$ = this.editingPatient
      ? this.backend.updatePatient(this.editingPatient._id, payload)
      : this.backend.createPatient(payload);

    request$
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (response) => {
          this.toastr.success(response.message);
          if (response.data) {
            void this.offline.mergeCachedList(this.patientsCacheKey(), [response.data]);
          }
          this.router.navigateByUrl('/patients/all-patients');
        },
        error: (err) => {
          if (!this.editingPatient && this.offline.shouldQueue(err)) {
            void this.queuePatient(payload);
            return;
          }

          this.toastr.error(err?.error?.message || 'Something went wrong');
        },
      });
  }

  private applyEditingState(): void {
    if (!this.editingPatient) {
      return;
    }

    this.patientForm.patchValue({
      firstName: this.editingPatient.firstName,
      lastName: this.editingPatient.lastName,
      email: this.editingPatient.email || '',
      phone: this.editingPatient.phone || '',
      gender: this.editingPatient.gender,
      dateOfBirth: this.editingPatient.dateOfBirth ? String(this.editingPatient.dateOfBirth).slice(0, 10) : '',
      bloodGroup: this.editingPatient.bloodGroup || '',
      address: this.editingPatient.address || '',
      emergencyContactName: this.editingPatient.emergencyContactName || '',
      emergencyContactPhone: this.editingPatient.emergencyContactPhone || '',
      allergies: (this.editingPatient.allergies || []).join(', '),
      chronicDiseases: (this.editingPatient.chronicDiseases || []).join(', '),
      currentMedications: (this.editingPatient.currentMedications || []).join(', '),
    });
    this.patientAgeYears = ageYearsFromIsoDate(
      this.editingPatient.dateOfBirth ? String(this.editingPatient.dateOfBirth).slice(0, 10) : ''
    );
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

  private applyPhoneFromQuery(): void {
    if (this.editingPatient) {
      return;
    }

    const phone = this.route.snapshot.queryParamMap.get('phone');
    if (phone) {
      this.patientForm.patchValue({ phone });
    }
  }

  private async loadCachedDoctors(): Promise<void> {
    this.doctors = await this.offline.readCachedValue<Doctor[]>(this.doctorsCacheKey(), []);
  }

  private async queuePatient(payload: Record<string, unknown>): Promise<void> {
    this.saving = true;
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

    this.saving = false;
    this.toastr.success('Patient saved offline and queued for sync.');
    this.router.navigateByUrl('/patients/all-patients');
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

  private doctorsCacheKey(): string {
    return this.offline.cacheKey('patient-form-doctors');
  }

  private patientsCacheKey(): string {
    return this.offline.cacheKey('patients');
  }
}
