import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';
import { buildImagingOrderFromWardRow } from '../../../core/documents/imaging-order-document.builder';
import {
  buildProcedureSummaryDocumentHtml,
  buildVitalsSummaryDocumentHtml,
  buildWardPatientSummaryDocumentHtml,
} from '../../../core/documents/ward-clinical-document.builder';
import { readCurrentUserName, readStoredHospitalDocumentInfo } from '../../../core/utils/hms-document-context.util';
import { HmsDocumentToolbarComponent } from '../../../shared/components/hms-document-toolbar/hms-document-toolbar.component';
import { WardDataService } from './services/ward-data.service';
import {
  AdmissionRecommendationRecord,
  admissionRecommendationStatusLabel,
  admissionHandoverText,
  admissionSnapshotText,
  mapAdmissionRecommendationRecord,
} from '../prescription/admission-recommendation.models';
import { Doctor, Prescription, RoomAllotment } from '../../../shared/models/hospital.model';
import { WardBillingPanelComponent } from './ward-billing-panel.component';
import { WardDoctorOrderModalComponent } from './ward-doctor-order-modal.component';
import { WardMarPanelComponent } from './ward-mar-panel.component';
import { WardActivityTimelineComponent } from './ward-activity-timeline.component';
import { WardVitalsPanelComponent } from './ward-vitals-panel.component';
import { WardDripPanelComponent } from './ward-drip-panel.component';
import { WardPatient } from './ward-patient-list.models';
import { WardModuleRow } from './ward-module.models';
import { WardActivityRecord } from './services/ward-api.mapper';
import {
  hasPermission,
  readStoredPermissions,
  isDoctorRole,
  readStoredRole,
} from '../../auth/access-control';
import {
  isLaboratoryModuleEnabled,
  isPharmacyModuleEnabled,
  isWardModuleEnabled,
} from '../../auth/hospital-modules';

interface PatientDetailTab {
  key: string;
  label: string;
}

interface PatientUpdateItem {
  id: string;
  type: string;
  title: string;
  description: string;
  performedBy: string;
  recommendedBy?: string | null;
  timestamp: string;
  status: string;
  actionRoute: string;
  actionLabel: string;
}

interface AdmissionHistoryItem {
  admissionId: string;
  admissionNo: string;
  admittedAt: string;
  dischargedAt?: string | null;
  status: string;
  wardLabel: string;
  roomBed: string;
  consultant: string;
  diagnosis: string;
  lengthOfStayDays?: number | null;
}

@Component({
  selector: 'app-ward-patient-detail',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    WardBillingPanelComponent,
    WardDoctorOrderModalComponent,
    WardMarPanelComponent,
    WardActivityTimelineComponent,
    WardVitalsPanelComponent,
    WardDripPanelComponent,
    HmsDocumentToolbarComponent,
  ],
  templateUrl: './ward-patient-detail.component.html',
  styleUrl: './ward-patient-detail.component.scss',
})
export class WardPatientDetailComponent implements OnInit {
  loading = false;
  patient: WardPatient | null = null;
  activeTab = 'overview';
  vitalsRows: WardModuleRow[] = [];
  marRows: WardModuleRow[] = [];
  marPrescriptions: Prescription[] = [];
  marActivities: WardActivityRecord[] = [];
  dripRows: WardModuleRow[] = [];
  nursingRows: WardModuleRow[] = [];
  orderRows: WardModuleRow[] = [];
  ioRows: WardModuleRow[] = [];
  handoverRows: WardModuleRow[] = [];
  admissionRecommendation: AdmissionRecommendationRecord | null = null;
  patientUpdates: PatientUpdateItem[] = [];
  admissionHistory: AdmissionHistoryItem[] = [];
  doctors: Doctor[] = [];
  doctorOrderOpen = false;

  readonly tabs: PatientDetailTab[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'admission-plan', label: 'Admission & Plan' },
    { key: 'orders', label: 'Doctor Orders' },
    { key: 'medicines', label: 'Medicines / MAR' },
    { key: 'lab', label: 'Laboratory' },
    { key: 'imaging', label: 'Imaging' },
    { key: 'vitals', label: 'Vitals' },
    { key: 'drips', label: 'IV / Drips' },
    { key: 'procedures', label: 'Procedures' },
    { key: 'nursing', label: 'Nursing Notes' },
    { key: 'io', label: 'I/O' },
    { key: 'billing', label: 'Billing' },
    { key: 'payments', label: 'Payments' },
    { key: 'documents', label: 'Documents' },
    { key: 'history', label: 'Admission History' },
    { key: 'discharge', label: 'Discharge' },
  ];

  private permissions = readStoredPermissions();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
    private wardData: WardDataService,
    private backend: BackendService
  ) {}

  ngOnInit(): void {
    const admissionId = this.route.snapshot.paramMap.get('admissionId') || '';
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab) {
      this.activeTab = tab;
    }

    this.backend.getDoctors({ limit: 100 }).subscribe({
      next: (result) => {
        this.doctors = result?.items || [];
      },
      error: () => {
        this.doctors = [];
      },
    });

    this.loading = true;
    this.wardData.loadPatientDetail(admissionId).subscribe({
      next: (data) => {
        this.patient = data.patient;
        this.vitalsRows = data.vitals;
        this.marRows = data.mar;
        this.marPrescriptions = data.prescriptions;
        this.marActivities = data.marActivities;
        this.dripRows = data.drips;
        this.nursingRows = data.nursing;
        this.orderRows = data.orders;
        this.ioRows = data.io;
        this.handoverRows = data.handover;
        this.loading = false;
        if (!data.patient) {
          this.toastr.warning('Patient admission not found.', 'Patient Control Panel');
        } else {
          this.loadPatientUpdates(admissionId);
          this.loadAdmissionHistory(data.patient.patientId, admissionId);
        }
        this.loadAdmissionRecommendationPlan(admissionId);
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load patient details.', 'Patient Control Panel');
      },
    });
  }

  get admissionId(): string {
    return this.route.snapshot.paramMap.get('admissionId') || '';
  }

  get lengthOfStayLabel(): string {
    if (!this.patient?.admittedOn) return '—';
    const start = new Date(this.patient.admittedOn).getTime();
    const days = Math.max(1, Math.ceil((Date.now() - start) / 86400000));
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  get canVitals(): boolean {
    return this.hasPerm('ward.create') || this.hasPerm('ward.read');
  }

  get canDoctorOrder(): boolean {
    return isWardModuleEnabled() && (this.hasPerm('ward.create') || isDoctorRole(readStoredRole()));
  }

  get canMar(): boolean {
    return isWardModuleEnabled() && this.hasPerm('ward.read');
  }

  get visibleTabs(): PatientDetailTab[] {
    return this.tabs.filter((tab) => {
      if (tab.key === 'lab') return isLaboratoryModuleEnabled();
      if (tab.key === 'medicines') return isPharmacyModuleEnabled() || isWardModuleEnabled();
      return true;
    });
  }

  get canPharmacyRequest(): boolean {
    return isPharmacyModuleEnabled() && this.hasPerm('ward.create');
  }

  get canLab(): boolean {
    return isLaboratoryModuleEnabled() && (this.hasPerm('lab_orders.create') || isDoctorRole(readStoredRole()));
  }

  reloadMarPanel(): void {
    this.reloadDetail();
  }

  refreshChartModules(): void {
    this.reloadDetail();
  }

  get canImaging(): boolean {
    return isWardModuleEnabled() && this.canDoctorOrder;
  }

  get canBilling(): boolean {
    return this.hasPerm('ward.billing.read') || this.hasPerm('encounters.read');
  }

  get canPayment(): boolean {
    return this.hasPerm('ledger_payments.create') || this.hasPerm('ward.payments.collect');
  }

  get canDischarge(): boolean {
    return this.hasPerm('ward.discharge.create') || this.hasPerm('room_allotments.update');
  }

  get imagingRows(): WardModuleRow[] {
    return this.orderRows.filter((row) =>
      /imaging|x-ray|xray|ultrasound|ct|mri|radiology/i.test(`${row.cells['order'] || ''} ${this.rowTitle(row)}`)
    );
  }

  setTab(tab: string): void {
    this.activeTab = tab;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'overview' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  backToOverview(): void {
    this.setTab('overview');
  }

  /** Mockup chart views use quick-action strip only — hide extra nav chrome. */
  get isChartModuleView(): boolean {
    return [
      'payments',
      'billing',
      'discharge',
      'medicines',
      'procedures',
      'vitals',
      'drips',
      'nursing',
      'io',
      'lab',
      'imaging',
      'orders',
    ].includes(this.activeTab);
  }

  get showChartReturnBar(): boolean {
    return this.activeTab !== 'overview' && !this.isChartModuleView;
  }

  get showSecondaryTabs(): boolean {
    return !this.isChartModuleView;
  }

  get activeTabLabel(): string {
    return this.tabs.find((tab) => tab.key === this.activeTab)?.label || this.activeTab;
  }

  ageLabel(patient: WardPatient): string {
    return patient.age > 0 ? `${patient.age} years` : '—';
  }

  genderLabel(patient: WardPatient): string {
    return patient.sex === 'F' ? 'Female' : patient.sex === 'M' ? 'Male' : '—';
  }

  doctorOrderPatientMeta(patient: WardPatient): string {
    const parts = [this.genderLabel(patient), this.ageLabel(patient)].filter((part) => part && part !== '—');
    const base = parts.join(', ');
    return patient.bloodGroup ? `${base} | ${patient.bloodGroup}` : base;
  }

  openDoctorOrder(): void {
    this.doctorOrderOpen = true;
  }

  onDoctorOrderSaved(): void {
    this.reloadDetail();
  }

  navigateAction(path: string): void {
    if (path.startsWith('/')) {
      void this.router.navigateByUrl(path);
      return;
    }
    this.navigate(path);
  }

  navigate(path: string): void {
    if (!this.patient) return;
    void this.router.navigate([path], {
      queryParams: {
        admissionId: this.patient.admissionId,
        patientId: this.patient.patientId,
        patientName: this.patient.patientName,
        wardName: this.patient.wardName,
      },
    });
  }

  statusLabel(status: WardPatient['status']): string {
    const labels: Record<WardPatient['status'], string> = {
      stable: 'Admitted — Stable',
      watch: 'Admitted — Watch',
      critical: 'Admitted — Critical',
      dischargePlanned: 'Ready for Discharge',
      pendingAssignment: 'Pending Assignment',
    };
    return labels[status];
  }

  statusClass(status: WardPatient['status']): string {
    return `hms-status-chip ward-badge ward-badge--${status}`;
  }

  patientInitials(patient: WardPatient): string {
    const parts = String(patient.patientName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  rowTitle(row: WardModuleRow): string {
    return String(
      row.cells['task'] ||
        row.cells['medicine'] ||
        row.cells['fluid'] ||
        row.cells['order'] ||
        row.cells['patient'] ||
        row.cells['bp'] ||
        'Record'
    );
  }

  rowStatus(row: WardModuleRow): string {
    return String(row.cells['status'] || row.cells['dueTime'] || row.cells['recordedAt'] || row.cells['updatedAt'] || '');
  }

  get labRows(): WardModuleRow[] {
    return this.orderRows.filter((row) => /lab/i.test(`${row.cells['order'] || ''} ${this.rowTitle(row)}`));
  }

  get billingMode(): 'billing' | 'payments' | 'settlement' | 'medicines' | 'doctor-visits' | 'procedures' | 'operations' | 'discharge' {
    if (['billing', 'payments', 'medicines', 'procedures', 'operations', 'discharge'].includes(this.activeTab)) {
      return this.activeTab as 'billing' | 'payments' | 'medicines' | 'procedures' | 'operations' | 'discharge';
    }
    return 'billing';
  }

  admissionPlanStatusLabel(status?: string): string {
    return admissionRecommendationStatusLabel(status);
  }

  admissionTreatmentPlan(rec: AdmissionRecommendationRecord): string {
    return admissionSnapshotText(rec.clinicalSnapshot, 'treatmentPlan', 'plan');
  }

  admissionHandoverInstructions(rec: AdmissionRecommendationRecord): string {
    return admissionHandoverText(rec.clinicalSnapshot);
  }

  updateIcon(type: string): string {
    switch (type) {
      case 'lab':
        return 'fa-flask';
      case 'pharmacy':
        return 'fa-medkit';
      case 'mar':
        return 'fa-check-circle';
      case 'imaging':
        return 'fa-picture-o';
      default:
        return 'fa-info-circle';
    }
  }

  private hasPerm(permission: string): boolean {
    return this.permissions.includes('*') || hasPermission(permission, this.permissions);
  }

  private reloadDetail(): void {
    const admissionId = this.admissionId;
    this.wardData.loadPatientDetail(admissionId).subscribe({
      next: (data) => {
        this.patient = data.patient;
        this.vitalsRows = data.vitals;
        this.marRows = data.mar;
        this.marPrescriptions = data.prescriptions;
        this.marActivities = data.marActivities;
        this.dripRows = data.drips;
        this.nursingRows = data.nursing;
        this.orderRows = data.orders;
        this.ioRows = data.io;
        this.handoverRows = data.handover;
        this.loadPatientUpdates(admissionId);
      },
    });
  }

  private loadPatientUpdates(admissionId: string): void {
    this.backend.getPatientUpdates(admissionId).subscribe({
      next: (data) => {
        this.patientUpdates = (data.items || []) as unknown as PatientUpdateItem[];
      },
      error: () => {
        this.patientUpdates = [];
      },
    });
  }

  private loadAdmissionHistory(patientId: string, currentAdmissionId: string): void {
    this.backend.getPatientAdmissionHistory(patientId, currentAdmissionId).subscribe({
      next: (data) => {
        this.admissionHistory = (data.items || []) as unknown as AdmissionHistoryItem[];
      },
      error: () => {
        this.admissionHistory = [];
      },
    });
  }

  private wardDocumentPatient(): { firstName?: string; lastName?: string; patientNo?: string } | null {
    if (!this.patient) return null;
    return {
      firstName: this.patient.patientName,
      lastName: '',
      patientNo: this.patient.mrn,
    };
  }

  buildPatientSummaryDocument = (): string =>
    buildWardPatientSummaryDocumentHtml({
      patient: this.wardDocumentPatient(),
      admissionNo: this.patient?.admissionNo,
      wardLabel: this.patient?.wardName,
      roomBed: `${this.patient?.roomName || ''}${this.patient?.bedNo ? ' / ' + this.patient?.bedNo : ''}`.trim(),
      consultantName: this.patient?.doctorName,
      assignedNurse: this.patient?.nurseName,
      diagnosis: this.patient?.diagnosis,
      allergies: this.patient?.allergies ? [this.patient.allergies] : [],
      vitals: this.vitalsRows.map((row) => row.cells as Record<string, unknown>),
      activeMedicines: this.marRows.map((row) => this.rowTitle(row)),
      doctorOrders: this.orderRows.map((row) => this.rowTitle(row)),
      pendingLaboratory: this.orderRows.filter((row) => /lab/i.test(this.rowTitle(row))).map((row) => this.rowTitle(row)),
      pendingImaging: this.imagingRows.map((row) => this.rowTitle(row)),
      procedures: this.orderRows.filter((row) => /procedure|operation/i.test(this.rowTitle(row))).map((row) => this.rowTitle(row)),
      nursingNotes: this.nursingRows.map((row) => this.rowTitle(row)),
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
    });

  buildVitalsDocument = (): string =>
    buildVitalsSummaryDocumentHtml({
      patient: this.wardDocumentPatient(),
      admissionNo: this.patient?.admissionNo,
      vitals: this.vitalsRows.map((row) => row.cells as Record<string, unknown>),
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
    });

  buildProcedureDocument = (): string =>
    buildProcedureSummaryDocumentHtml({
      patient: this.wardDocumentPatient(),
      admissionNo: this.patient?.admissionNo,
      rows: this.orderRows.filter((row) => /procedure|operation/i.test(this.rowTitle(row))) as unknown as Array<Record<string, unknown>>,
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
    });

  buildImagingDocument = (): string => {
    const row = this.imagingRows[0];
    if (!row) return '';
    return buildImagingOrderFromWardRow({
      row: row as unknown as Record<string, unknown>,
      patient: this.wardDocumentPatient(),
      admissionNo: this.patient?.admissionNo,
      wardLabel: this.patient?.wardName,
      roomBed: `${this.patient?.roomName || ''}${this.patient?.bedNo ? ' / ' + this.patient?.bedNo : ''}`.trim(),
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
    });
  };

  private loadAdmissionRecommendationPlan(admissionId: string): void {
    this.backend.getRoomAllotment(admissionId).subscribe({
      next: (allotment: RoomAllotment) => {
        const recommendationId = String(allotment.admissionRecommendationId || '').trim();
        if (!recommendationId) {
          this.admissionRecommendation = null;
          return;
        }
        this.backend.getAdmissionRecommendation(recommendationId).subscribe({
          next: (record: Record<string, unknown>) => {
            this.admissionRecommendation = mapAdmissionRecommendationRecord(record);
          },
          error: () => {
            this.admissionRecommendation = null;
          },
        });
      },
      error: () => {
        this.admissionRecommendation = null;
      },
    });
  }
}
