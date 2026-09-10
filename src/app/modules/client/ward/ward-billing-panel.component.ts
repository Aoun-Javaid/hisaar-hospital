import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';
import { buildDischargeStatementDocumentHtml, buildRunningBillDocumentHtml } from '../../../core/documents/discharge-document.builder';
import { readCurrentUserName, readStoredHospitalDocumentInfo } from '../../../core/utils/hms-document-context.util';
import { HmsDocumentService } from '../../../core/services/hms-document.service';
import { HmsDocumentToolbarComponent } from '../../../shared/components/hms-document-toolbar/hms-document-toolbar.component';

@Component({
  selector: 'app-ward-billing-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, HmsDocumentToolbarComponent],
  templateUrl: './ward-billing-panel.component.html',
  styleUrl: './ward-billing-panel.component.scss',
})
export class WardBillingPanelComponent implements OnChanges {
  @Input() admissionId = '';
  @Input() mode: 'billing' | 'payments' | 'settlement' | 'medicines' | 'doctor-visits' | 'procedures' | 'operations' | 'discharge' = 'billing';
  @Input() consultantName = '';

  loading = false;
  billData: Record<string, unknown> = {};
  dischargeData: Record<string, unknown> = {};
  now = new Date();
  chargeForm = { title: '', rate: 0, category: 'misc' };
  paymentForm = { amount: 0, method: 'cash', type: 'final', note: '' };
  securityForm = { amount: 0, method: 'cash', note: '' };
  visitForm = { doctorId: '', visitType: 'regular_round', fee: 0, chargeable: true, clinicalNote: '' };
  medicineForm = { productId: '', requestedQty: 1, notes: '' };
  procedureForm = { procedureName: '', procedureType: '', doctorId: '', rate: 0, qty: 1, notes: '' };
  operationForm = { operationName: '', surgeonId: '', baseCharge: 0, otRoom: '', clinicalNote: '' };
  doctorVisits: Array<Record<string, unknown>> = [];
  medicineRequests: Array<Record<string, unknown>> = [];
  procedures: Array<Record<string, unknown>> = [];
  operations: Array<Record<string, unknown>> = [];

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
    private docs: HmsDocumentService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['admissionId']?.currentValue || changes['mode']?.currentValue) {
      this.load();
    }
  }

  get summary(): Record<string, unknown> {
    return (this.billData['billingSummary'] as Record<string, unknown>) || {};
  }

  get latestInvoice(): Record<string, unknown> {
    return (this.billData['latestInvoice'] as Record<string, unknown>) || {};
  }

  get ledgerItems(): Array<Record<string, unknown>> {
    const ledger = (this.billData['ledger'] as Record<string, unknown>) || {};
    return (ledger['items'] as Array<Record<string, unknown>>) || [];
  }

  get ledgerPayments(): Array<Record<string, unknown>> {
    const ledger = (this.billData['ledger'] as Record<string, unknown>) || {};
    return (ledger['payments'] as Array<Record<string, unknown>>) || [];
  }

  get settlements(): Array<Record<string, unknown>> {
    return (this.billData['settlements'] as Array<Record<string, unknown>>) || [];
  }

  get dischargeStatement(): Record<string, unknown> {
    return (this.dischargeData['dischargeStatement'] as Record<string, unknown>) || {};
  }

  get outstandingAmount(): number {
    return Number(this.summary['outstandingBalance'] ?? this.summary['balance'] ?? 0);
  }

  get billingInsight(): string {
    const due = this.outstandingAmount;
    if (due > 0) {
      return `Outstanding amount is ${this.money(due)} PKR. Collect payment to avoid delays in discharge process.`;
    }
    if (Number(this.summary['securityDepositHeld'] || 0) > 0) {
      return 'Bill is settled. Security deposit remains held until discharge adjustment.';
    }
    return 'No outstanding balance. Patient bill is currently settled.';
  }

  buildRunningBillDocument = (): string => {
    const admission = (this.billData['admission'] as Record<string, unknown>) || {};
    const patient = (admission['patient'] as Record<string, unknown>) || null;
    const ledger = (this.billData['ledger'] as Record<string, unknown>) || {};
    const encounter = (ledger['encounter'] as Record<string, unknown>) || {};
    return buildRunningBillDocumentHtml({
      patient: patient as {
        firstName?: string;
        lastName?: string;
        patientNo?: string;
        gender?: string | null;
        dateOfBirth?: string | null;
        bloodGroup?: string | null;
      },
      admissionNo: String(admission['admissionNo'] || ''),
      encounterNo: String(encounter['encounterNo'] || this.latestInvoice['invoiceNo'] || ''),
      consultantName: this.resolveConsultantName(admission),
      wardLabel: String(admission['wardLabel'] || admission['roomType'] || (admission['room'] as Record<string, unknown>)?.['roomType'] || ''),
      roomBed: String(admission['bedLabel'] || ''),
      admittedAt: String(admission['admittedAt'] || ''),
      lengthOfStayDays: Number(admission['lengthOfStayDays'] || 0) || null,
      chargeBreakdown: (this.billData['chargeBreakdown'] as Record<string, number>) || {},
      summary: {
        totalCharges: Number(this.summary['totalCharges'] || 0),
        totalDiscount: Number(this.summary['totalDiscount'] || 0),
        netPayable: Number(this.summary['netPayable'] || 0),
        totalPaid: Number(this.summary['totalPaid'] || 0),
        totalRefunded: Number(this.summary['totalRefunded'] || 0),
        balance: Number(this.summary['outstandingBalance'] || this.summary['balance'] || 0),
        securityDepositHeld: Number(this.summary['securityDepositHeld'] || 0),
        securityDepositApplied: Number(this.summary['securityDepositApplied'] || 0),
        advanceCreditBalance: Number(this.summary['advanceCreditBalance'] || 0),
      },
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
    });
  };

  buildDischargeDocument = (): string => {
    const statement = this.dischargeStatement;
    const admission = (this.dischargeData['admission'] as Record<string, unknown>) || {};
    const patient = ((statement['patient'] || admission['patient']) as Record<string, unknown>) || null;
    return buildDischargeStatementDocumentHtml({
      patient: patient as {
        firstName?: string;
        lastName?: string;
        patientNo?: string;
        gender?: string | null;
        dateOfBirth?: string | null;
        bloodGroup?: string | null;
      },
      admissionNo: String(statement['admissionNo'] || admission['admissionNo'] || ''),
      consultantName: String(statement['consultantName'] || this.resolveConsultantName(admission)),
      wardLabel: String(statement['wardLabel'] || admission['wardLabel'] || (admission['room'] as Record<string, unknown>)?.['roomType'] || ''),
      roomBed: String(statement['roomBed'] || admission['bedLabel'] || ''),
      admittedAt: String(statement['admittedAt'] || admission['admittedAt'] || ''),
      dischargedAt: String(statement['dischargedAt'] || admission['dischargedAt'] || ''),
      lengthOfStayDays:
        Number(statement['lengthOfStayDays'] || admission['lengthOfStayDays'] || 0) || null,
      chargeBreakdown: (statement['chargeBreakdown'] as Record<string, number>) || {},
      summary: {
        totalCharges: Number(statement['grossCharges'] || 0),
        totalDiscount: Number(statement['totalDiscount'] || 0),
        netPayable: Number(statement['netCharges'] || 0),
        totalPaid: Number(statement['previousPayments'] || 0),
        balance: Number(statement['balanceDue'] || 0),
        securityDepositHeld: Number(statement['securityAvailable'] || 0),
        securityDepositApplied: Number(statement['securityAdjusted'] || 0),
        advanceCreditBalance: Number(statement['advanceCreditBalance'] || 0),
      },
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
    });
  };

  private resolveConsultantName(admission: Record<string, unknown>): string {
    if (this.consultantName?.trim()) {
      return this.consultantName.trim();
    }
    const fromStatement = String(this.dischargeStatement['consultantName'] || '').trim();
    if (fromStatement) {
      return fromStatement;
    }
    const consultant = admission['consultantDoctor'] as { name?: string } | null;
    return String(consultant?.name || '').trim();
  }

  load(): void {
    if (!this.admissionId) {
      return;
    }
    this.loading = true;
    this.now = new Date();
    if (this.mode === 'discharge') {
      this.backend.getWardDischargeStatement(this.admissionId).subscribe({
        next: (data) => {
          this.dischargeData = data || {};
          this.billData = data || {};
          this.medicineRequests = (data?.['medicineRequests'] as Array<Record<string, unknown>>) || [];
          this.procedures = (data?.['procedures'] as Array<Record<string, unknown>>) || [];
          this.operations = (data?.['operations'] as Array<Record<string, unknown>>) || [];
          this.loading = false;
        },
        error: (err) => {
          this.loading = false;
          this.toastr.error(err?.error?.message || 'Unable to load discharge statement');
        },
      });
      return;
    }

    this.backend.getWardAdmissionBill(this.admissionId).subscribe({
      next: (data) => {
        this.billData = data || {};
        this.medicineRequests = (data?.['medicineRequests'] as Array<Record<string, unknown>>) || [];
        this.procedures = (data?.['procedures'] as Array<Record<string, unknown>>) || [];
        this.operations = (data?.['operations'] as Array<Record<string, unknown>>) || [];
        this.loading = false;
        if (this.mode === 'doctor-visits') {
          this.loadDoctorVisits();
        }
      },
      error: (err) => {
        this.loading = false;
        this.toastr.error(err?.error?.message || 'Unable to load ward bill');
      },
    });
  }

  loadDoctorVisits(): void {
    this.backend.listWardDoctorVisits(this.admissionId).subscribe({
      next: (items) => (this.doctorVisits = items || []),
      error: () => (this.doctorVisits = []),
    });
  }

  addCharge(): void {
    if (!this.chargeForm.title || this.chargeForm.rate <= 0) {
      this.toastr.warning('Enter charge title and rate');
      return;
    }
    this.backend.addWardCharge(this.admissionId, this.chargeForm).subscribe({
      next: () => {
        this.toastr.success('Charge added');
        this.chargeForm = { title: '', rate: 0, category: 'misc' };
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to add charge'),
    });
  }

  collectPayment(): void {
    if (this.paymentForm.amount <= 0) {
      this.toastr.warning('Enter payment amount');
      return;
    }
    this.backend.collectWardPayment(this.admissionId, this.paymentForm).subscribe({
      next: () => {
        this.toastr.success('Payment collected');
        this.paymentForm = { amount: 0, method: 'cash', type: 'final', note: '' };
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to collect payment'),
    });
  }

  collectSecurity(): void {
    if (this.securityForm.amount <= 0) {
      this.toastr.warning('Enter security deposit amount');
      return;
    }
    this.backend.collectWardSecurityDeposit(this.admissionId, {
      ...this.securityForm,
      type: 'security_deposit',
    }).subscribe({
      next: () => {
        this.toastr.success('Security deposit collected');
        this.securityForm = { amount: 0, method: 'cash', note: '' };
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to collect security deposit'),
    });
  }

  viewInvoice(): void {
    const html = this.buildRunningBillDocument();
    if (!html.trim()) {
      this.toastr.warning('No invoice data available');
      return;
    }
    this.docs.openPreview({
      title: 'Invoice / Running Bill',
      html,
      filename: 'ward-invoice.pdf',
      orientation: 'portrait',
    });
  }

  printReceipt(): void {
    const html = this.buildRunningBillDocument();
    if (!html.trim()) {
      this.toastr.warning('Nothing to print');
      return;
    }
    this.docs.printHtml(html, 'Invoice / Running Bill');
  }

  async downloadInvoice(): Promise<void> {
    const html = this.buildRunningBillDocument();
    if (!html.trim()) {
      this.toastr.warning('Nothing to download');
      return;
    }
    try {
      await this.docs.downloadPdf(html, 'ward-invoice.pdf', 'portrait');
    } catch {
      this.toastr.error('Unable to generate PDF');
    }
  }

  createVisit(): void {
    if (!this.visitForm.doctorId) {
      this.toastr.warning('Doctor ID is required');
      return;
    }
    this.backend.createWardDoctorVisit({ roomAllotmentId: this.admissionId, ...this.visitForm }).subscribe({
      next: () => {
        this.toastr.success('Doctor visit scheduled');
        this.loadDoctorVisits();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to create visit'),
    });
  }

  completeVisit(visitId: string): void {
    this.backend.completeWardDoctorVisit(visitId).subscribe({
      next: () => {
        this.toastr.success('Visit completed');
        this.load();
        this.loadDoctorVisits();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to complete visit'),
    });
  }

  createMedicineRequest(): void {
    if (!this.medicineForm.productId || this.medicineForm.requestedQty <= 0) {
      this.toastr.warning('Product ID and quantity are required');
      return;
    }
    this.backend
      .createWardMedicineRequest({
        roomAllotmentId: this.admissionId,
        notes: this.medicineForm.notes,
        items: [{ productId: this.medicineForm.productId, requestedQty: this.medicineForm.requestedQty }],
      })
      .subscribe({
        next: () => {
          this.toastr.success('Medicine request created');
          this.medicineForm = { productId: '', requestedQty: 1, notes: '' };
          this.load();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to create medicine request'),
      });
  }

  createProcedure(): void {
    if (!this.procedureForm.procedureName || this.procedureForm.rate < 0) {
      this.toastr.warning('Procedure name and rate are required');
      return;
    }
    this.backend
      .createWardProcedure({ roomAllotmentId: this.admissionId, ...this.procedureForm })
      .subscribe({
        next: () => {
          this.toastr.success('Procedure scheduled');
          this.procedureForm = { procedureName: '', procedureType: '', doctorId: '', rate: 0, qty: 1, notes: '' };
          this.load();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to schedule procedure'),
      });
  }

  completeProcedure(id: string): void {
    this.backend.completeWardProcedure(id).subscribe({
      next: () => {
        this.toastr.success('Procedure completed');
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to complete procedure'),
    });
  }

  cancelProcedure(id: string): void {
    this.backend.cancelWardProcedure(id).subscribe({
      next: () => {
        this.toastr.success('Procedure cancelled');
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to cancel procedure'),
    });
  }

  createOperation(): void {
    if (!this.operationForm.operationName) {
      this.toastr.warning('Operation name is required');
      return;
    }
    this.backend.createWardOperation({ roomAllotmentId: this.admissionId, ...this.operationForm }).subscribe({
      next: () => {
        this.toastr.success('Operation scheduled');
        this.operationForm = { operationName: '', surgeonId: '', baseCharge: 0, otRoom: '', clinicalNote: '' };
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to schedule operation'),
    });
  }

  completeOperation(id: string): void {
    this.backend.completeWardOperation(id).subscribe({
      next: () => {
        this.toastr.success('Operation completed');
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to complete operation'),
    });
  }

  cancelOperation(id: string): void {
    this.backend.cancelWardOperation(id).subscribe({
      next: () => {
        this.toastr.success('Operation cancelled');
        this.load();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to cancel operation'),
    });
  }

  printDischarge(): void {
    window.print();
  }

  money(value: unknown): string {
    return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  settlementClass(status: unknown): string {
    const value = String(status || '').toLowerCase();
    if (value === 'settled') return 'ward-badge ward-badge--stable';
    if (value === 'pending_settlement') return 'ward-badge ward-badge--watch';
    return 'ward-badge';
  }

  paymentTypeLabel(type: unknown): string {
    switch (String(type || '').toLowerCase()) {
      case 'security_deposit':
        return 'Security Deposit';
      case 'security_apply':
        return 'Security Applied';
      case 'security_refund':
        return 'Security Refund';
      case 'advance':
        return 'Advance';
      case 'final':
        return 'Full Payment';
      case 'partial':
        return 'Payment';
      default:
        return String(type || 'Payment');
    }
  }

  paymentTypeClass(type: unknown): string {
    const value = String(type || '').toLowerCase();
    if (value === 'security_deposit' || value === 'security_apply' || value === 'security_refund') {
      return 'pay-type pay-type--security';
    }
    if (value === 'advance') return 'pay-type pay-type--advance';
    return 'pay-type pay-type--payment';
  }

  paymentStatusLabel(status: unknown): string {
    const value = String(status || 'completed').toLowerCase();
    if (value === 'cancelled' || value === 'void') return 'Cancelled';
    return 'Completed';
  }

  collectedByName(payment: Record<string, unknown>): string {
    if (payment['collectedByName']) return String(payment['collectedByName']);
    const received = payment['receivedBy'];
    if (received && typeof received === 'object' && (received as Record<string, unknown>)['name']) {
      return String((received as Record<string, unknown>)['name']);
    }
    return '—';
  }

  asDate(value: unknown): string | number | Date | null {
    if (value == null) return null;
    return value as string | number | Date;
  }

  asId(value: unknown): string {
    return String(value || '');
  }

  requestItems(row: Record<string, unknown>): Array<Record<string, unknown>> {
    return (row['items'] as Array<Record<string, unknown>>) || [];
  }

  saleCount(row: Record<string, unknown>): number {
    const ids = row['pharmacySaleIds'];
    return Array.isArray(ids) ? ids.length : 0;
  }

  pharmacySettlement(): Record<string, unknown> {
    return (this.dischargeStatement['pharmacySettlement'] as Record<string, unknown>) || {};
  }

  private dischargeAdmission(): Record<string, unknown> {
    return (this.dischargeData['admission'] as Record<string, unknown>) || {};
  }

  private dischargePatient(): Record<string, unknown> {
    return (
      (this.dischargeStatement['patient'] as Record<string, unknown>) ||
      (this.dischargeAdmission()['patient'] as Record<string, unknown>) ||
      {}
    );
  }

  hospitalName(): string {
    return readStoredHospitalDocumentInfo()?.name?.trim() || 'Hospital';
  }

  dischargePatientName(): string {
    const patient = this.dischargePatient();
    const name = [patient['firstName'], patient['lastName']].filter(Boolean).join(' ').trim();
    return name || String(patient['name'] || patient['patientNo'] || '—');
  }

  dischargePatientInitial(): string {
    const source = this.dischargePatientName();
    return (source || 'P').trim().charAt(0).toUpperCase() || 'P';
  }

  dischargePatientMrn(): string {
    return String(this.dischargePatient()['patientNo'] || '—');
  }

  dischargePatientGender(): string {
    const gender = String(this.dischargePatient()['gender'] || '').trim();
    if (!gender) return '—';
    return gender.charAt(0).toUpperCase() + gender.slice(1);
  }

  dischargePatientAge(): string {
    const dobRaw = this.dischargePatient()['dateOfBirth'];
    if (!dobRaw) return '—';
    const dob = new Date(String(dobRaw));
    if (Number.isNaN(dob.getTime())) return '—';
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age -= 1;
    }
    if (age < 0) return '—';
    return `${age} year${age === 1 ? '' : 's'}`;
  }

  dischargePatientBloodGroup(): string {
    return String(this.dischargePatient()['bloodGroup'] || '—');
  }

  dischargeAdmissionNo(): string {
    return String(this.dischargeStatement['admissionNo'] || this.dischargeAdmission()['admissionNo'] || '—');
  }

  dischargeWardRoom(): string {
    const admission = this.dischargeAdmission();
    const room = (admission['room'] as Record<string, unknown>) || {};
    const ward = String(
      this.dischargeStatement['wardLabel'] ||
        admission['wardLabel'] ||
        room['roomType'] ||
        ''
    )
      .replace(/_/g, ' ')
      .trim();
    const bed = String(this.dischargeStatement['roomBed'] || admission['bedLabel'] || '').trim();
    const label = [ward, bed]
      .filter(Boolean)
      .map((part) => part.replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(' / ');
    return label || '—';
  }

  dischargeConsultant(): string {
    return (
      String(this.dischargeStatement['consultantName'] || '').trim() ||
      this.resolveConsultantName(this.dischargeAdmission()) ||
      '—'
    );
  }

  private formatDischargeDateTime(value: unknown): string {
    if (!value) return '—';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '—';
    const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${day}, ${time}`;
  }

  dischargeAdmittedAt(): string {
    return this.formatDischargeDateTime(
      this.dischargeStatement['admittedAt'] || this.dischargeAdmission()['admittedAt']
    );
  }

  dischargeDischargedAt(): string {
    return this.formatDischargeDateTime(
      this.dischargeStatement['dischargedAt'] || this.dischargeAdmission()['dischargedAt'] || new Date()
    );
  }

  dischargeLengthOfStay(): string {
    const stated = Number(
      this.dischargeStatement['lengthOfStayDays'] || this.dischargeAdmission()['lengthOfStayDays'] || 0
    );
    if (Number.isFinite(stated) && stated > 0) {
      const days = Math.max(1, Math.ceil(stated));
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    const admittedRaw = this.dischargeStatement['admittedAt'] || this.dischargeAdmission()['admittedAt'];
    if (!admittedRaw) return '—';
    const start = new Date(String(admittedRaw));
    const endRaw = this.dischargeStatement['dischargedAt'] || this.dischargeAdmission()['dischargedAt'];
    const end = endRaw ? new Date(String(endRaw)) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
    const days = Math.max(1, Math.ceil(Math.max(0, end.getTime() - start.getTime()) / 86400000));
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  get dischargeChargeRows(): Array<{ label: string; amount: number }> {
    const labels: Record<string, string> = {
      consultation: 'Consultation Fee',
      room: 'Room Charges',
      doctor_visit: 'Doctor Visit',
      laboratory: 'Laboratory Tests',
      pharmacy: 'Medicines',
      procedure: 'Procedure Charges',
      operation: 'Operation Charges',
      nursing: 'Nursing / Ward',
      ward: 'Ward Charges',
      other: 'Other Charges',
      misc: 'Other Charges',
    };
    const breakdown =
      (this.dischargeStatement['chargeBreakdown'] as Record<string, number>) ||
      (this.dischargeData['chargeBreakdown'] as Record<string, number>) ||
      {};
    const ward = String(this.dischargeStatement['wardLabel'] || '').trim();
    return Object.entries(breakdown)
      .filter(([, amount]) => Number(amount) !== 0)
      .map(([key, amount]) => {
        let label =
          labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        if (key === 'room' && ward) {
          label = `${label} (${ward.replace(/\b\w/g, (c) => c.toUpperCase())})`;
        }
        return { label, amount: Number(amount) || 0 };
      });
  }

  procedureCount(status: string): number {
    return this.procedures.filter((row) => String(row['status'] || '').toUpperCase() === status).length;
  }

  procedureStatusLabel(status: unknown): string {
    const value = String(status || '').toUpperCase();
    if (value === 'COMPLETED') return 'Completed';
    if (value === 'CANCELLED') return 'Cancelled';
    if (value === 'PLANNED') return 'Planned';
    return 'Scheduled';
  }

  procedureStatusClass(status: unknown): string {
    const value = String(status || '').toUpperCase();
    if (value === 'COMPLETED') return 'wcs-badge--completed';
    if (value === 'CANCELLED') return 'wcs-badge--cancelled';
    if (value === 'PLANNED') return 'wcs-badge--planned';
    return 'wcs-badge--scheduled';
  }
}
