import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../../core/services/backend.service';
import { buildLabOrderReportHtml, openLabReportPrintWindow } from '../../laboratory/lab-order-report.builder';
import { isLabOrderReportReady } from '../../laboratory/lab-print-details';
import {
  Bill,
  Hospital,
  LabOrder,
  Patient,
  PatientHistory,
  Prescription,
  User,
} from '../../../../shared/models/hospital.model';

@Component({
  selector: 'app-patient-profile',
  imports: [CommonModule, RouterLink],
  templateUrl: './patient-profile.component.html',
  styleUrl: './patient-profile.component.scss',
})
export class PatientProfileComponent implements OnInit {
  patient: Patient | null = null;
  history: PatientHistory[] = [];
  prescriptions: Prescription[] = [];
  bills: Bill[] = [];
  labOrders: LabOrder[] = [];
  hospital: Hospital | null = null;
  loading = false;
  historyLoading = false;
  prescriptionsLoading = false;
  billsLoading = false;
  labOrdersLoading = false;
  labReportLoadingId: string | null = null;
  labActionsOpen = false;
  selectedLabOrder: LabOrder | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private backend: BackendService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadPatient(id);
    }
  }

  loadPatient(id: string): void {
    this.loading = true;
    this.backend
      .getPatientProfile(id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (patient) => {
          this.patient = patient;
          this.loadRelated(id);
        },
        error: (err) => {
          this.toastr.error(err?.error?.message || 'Something went wrong');
        },
      });
  }

  loadRelated(id: string): void {
    this.historyLoading = true;
    this.backend
      .getPatientHistory(id, { limit: 100 })
      .pipe(finalize(() => (this.historyLoading = false)))
      .subscribe({
        next: (result) => {
          this.history = result.items;
        },
        error: () => {
          this.history = [];
        },
      });

    this.prescriptionsLoading = true;
    this.backend
      .getPatientPrescriptions(id, { limit: 100 })
      .pipe(finalize(() => (this.prescriptionsLoading = false)))
      .subscribe({
        next: (result) => {
          this.prescriptions = result.items;
        },
        error: () => {
          this.prescriptions = [];
        },
      });

    this.billsLoading = true;
    this.backend
      .getPatientBills(id, { limit: 100 })
      .pipe(finalize(() => (this.billsLoading = false)))
      .subscribe({
        next: (result) => {
          this.bills = result.items;
        },
        error: () => {
          this.bills = [];
        },
      });

    this.labOrdersLoading = true;
    this.backend
      .getPatientLabOrders(id)
      .pipe(finalize(() => (this.labOrdersLoading = false)))
      .subscribe({
        next: (orders) => {
          this.labOrders = orders || [];
        },
        error: () => {
          this.labOrders = [];
        },
      });
  }

  patientName(): string {
    return this.patient
      ? `${this.patient.firstName} ${this.patient.lastName}`.trim()
      : '-';
  }

  can(permission: string): boolean {
    const permissions = JSON.parse(localStorage.getItem('permissions') || '[]') as string[];
    return permissions.includes('*') || permissions.includes(permission);
  }

  canOpenClinicalRecords(): boolean {
    return this.can('patients_history.read');
  }

  canOpenPrescriptions(): boolean {
    return this.can('prescriptions.read') || this.can('prescriptions.create');
  }

  canCreatePrescription(): boolean {
    return this.can('prescriptions.create');
  }

  canViewBills(): boolean {
    return this.can('bills.read');
  }

  canEditPatient(): boolean {
    return this.can('patients.update');
  }

  editPatient(): void {
    if (!this.patient || !this.canEditPatient()) {
      return;
    }
    this.router.navigate(['/patients/add-patient'], { state: { patient: this.patient } });
  }

  genderLabel(): string {
    const gender = String(this.patient?.gender || '').trim();
    if (!gender) {
      return '-';
    }
    return gender.charAt(0).toUpperCase() + gender.slice(1);
  }

  statusLabel(): string {
    const status = String(this.patient?.status || '').trim();
    if (!status) {
      return '-';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  openLabActions(order: LabOrder, event?: Event): void {
    event?.stopPropagation();
    this.selectedLabOrder = order;
    this.labActionsOpen = true;
  }

  closeLabActions(): void {
    this.labActionsOpen = false;
    this.selectedLabOrder = null;
  }

  viewLabReport(): void {
    if (!this.selectedLabOrder) {
      return;
    }
    this.printLabReport(this.selectedLabOrder);
  }

  prescriptionQueryParams(order?: LabOrder | null): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.patient?._id) {
      params['patientId'] = this.patient._id;
    }

    const doctorId = order?.doctorId || this.activeDoctorId();
    if (doctorId) {
      params['doctorId'] = doctorId;
    }

    return params;
  }

  activeDoctorId(): string {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null') as User | null;
      return String(user?._id || '').trim();
    } catch {
      return '';
    }
  }

  ageLabel(): string {
    if (!this.patient?.dateOfBirth) {
      return '-';
    }

    const dob = new Date(this.patient.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      return '-';
    }

    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age -= 1;
    }

    return `${age} years`;
  }

  primaryMedicine(prescription: Prescription): string {
    if (!prescription.medicines?.length) {
      return '-';
    }

    const names = prescription.medicines
      .map((medicine) => medicine.name?.trim())
      .filter((name): name is string => Boolean(name));

    if (names.length === 0) {
      return '-';
    }

    if (names.length === 1) {
      return names[0];
    }

    return `${names[0]} +${names.length - 1} more`;
  }

  historySummary(item: PatientHistory): string {
    return item.notes || item.symptoms || item.diagnosis || '-';
  }

  labTestsSummary(order: LabOrder): string {
    return (order.items || [])
      .filter((item) => item.status !== 'cancelled')
      .map((item) => item.shortCode || item.testName)
      .join(', ') || '-';
  }

  labOrderStatusLabel(order: LabOrder): string {
    if (isLabOrderReportReady(order)) {
      return 'Report ready';
    }

    const status = String(order.status || '').replace(/_/g, ' ');
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : '-';
  }

  canPrintLabReport(order: LabOrder): boolean {
    return isLabOrderReportReady(order);
  }

  isLabReportLoading(order: LabOrder): boolean {
    return this.labReportLoadingId === order._id;
  }

  printLabReport(order: LabOrder): void {
    if (!this.canPrintLabReport(order)) {
      this.toastr.error('Lab report is ready only after all tests are verified.');
      return;
    }

    this.labReportLoadingId = order._id;
    const finish = () => {
      this.labReportLoadingId = null;
    };

    const openReport = (hospital: Hospital | null) => {
      const html = buildLabOrderReportHtml({
        order,
        hospital,
        comparison: [],
        reportGeneratedBy: this.currentUser(),
      });
      const opened = openLabReportPrintWindow(html);
      finish();
      if (!opened) {
        this.toastr.error('Unable to open lab report print view.');
      }
    };

    if (this.hospital) {
      openReport(this.hospital);
      return;
    }

    this.backend.getLabSettings().subscribe({
      next: (settings) => {
        this.hospital = {
          _id: settings.hospital._id || '',
          name: settings.hospital.name,
          code: '',
          status: 'active',
          phone: settings.hospital.phone,
          email: settings.hospital.email,
          address: settings.hospital.address,
          city: settings.hospital.city,
          logoUrl: settings.hospital.logoUrl,
          laboratorySettings: settings.laboratorySettings,
        };
        openReport(this.hospital);
      },
      error: () => openReport(null),
    });
  }

  private currentUser(): User | null {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null') as User | null;
    } catch {
      return null;
    }
  }
}
