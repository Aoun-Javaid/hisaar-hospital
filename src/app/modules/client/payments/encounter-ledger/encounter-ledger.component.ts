import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../../core/services/backend.service';
import { buildPatientLedgerDocumentHtml, buildPaymentReceiptDocumentHtml } from '../../../../core/documents/patient-ledger-document.builder';
import { downloadExcelWorkbook } from '../../../../core/utils/excel-export.util';
import { readCurrentUserName, readStoredHospitalDocumentInfo } from '../../../../core/utils/hms-document-context.util';
import { buildHmsStandardDocumentHtml, buildHmsTableHtml, formatHmsMoney } from '../../../../core/utils/hms-document-template.util';
import { HmsDocumentToolbarComponent } from '../../../../shared/components/hms-document-toolbar/hms-document-toolbar.component';
import { Encounter, EncounterLedger, LedgerPayment } from '../../../../shared/models/hospital.model';

@Component({
  selector: 'app-encounter-ledger',
  imports: [CommonModule, FormsModule, HmsDocumentToolbarComponent],
  templateUrl: './encounter-ledger.component.html',
  styleUrl: './encounter-ledger.component.scss',
})
export class EncounterLedgerComponent implements OnInit {
  encounters: Encounter[] = [];
  selectedLedger: EncounterLedger | null = null;
  selectedEncounterId: string | null = null;
  showDetailPanel = false;
  loading = false;
  ledgerLoading = false;
  status = '';
  type = '';
  search = '';
  page = 1;
  limit = 10;
  totalPages = 0;
  totalItems = 0;
  mobileChip: 'all' | 'admitted' | 'discharged' | 'due' = 'all';

  paymentAmount = 0;
  paymentMethod = 'cash';
  paymentType = 'partial';
  paymentNote = '';
  selectedReceiptPayment: LedgerPayment | null = null;

  constructor(
    private backend: BackendService,
    private route: ActivatedRoute,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const encounterId = params.get('encounterId');
      this.loadEncounters();

      if (encounterId) {
        this.openLedger(encounterId);
      }
    });
  }

  get filteredEncounters(): Encounter[] {
    let rows = this.encounters;
    const term = this.search.trim().toLowerCase();
    if (term) {
      rows = rows.filter((encounter) => {
        const name = this.patientName(encounter).toLowerCase();
        const pid = (encounter.patient?.patientNo || '').toLowerCase();
        return encounter.encounterNo.toLowerCase().includes(term) || name.includes(term) || pid.includes(term);
      });
    }

    if (this.mobileChip === 'admitted') {
      rows = rows.filter((e) => e.status === 'admitted' || e.status === 'open');
    } else if (this.mobileChip === 'discharged') {
      rows = rows.filter((e) => e.status === 'discharged' || e.status === 'closed');
    } else if (this.mobileChip === 'due') {
      rows = rows.filter((e) => (e.summary?.balance || 0) > 0);
    }

    return rows;
  }

  get kpiTotalEncounters(): number {
    return this.totalItems || this.encounters.length;
  }

  get kpiOutstanding(): number {
    return this.encounters.reduce((sum, item) => sum + Math.max(item.summary?.balance || 0, 0), 0);
  }

  get kpiBilledOnPage(): number {
    return this.encounters.reduce((sum, item) => sum + (item.summary?.totalCharges || 0), 0);
  }

  get kpiPaidOnPage(): number {
    return this.encounters.reduce((sum, item) => sum + (item.summary?.totalPaid || 0), 0);
  }

  get chipCounts(): { all: number; admitted: number; discharged: number; due: number } {
    return {
      all: this.encounters.length,
      admitted: this.encounters.filter((e) => e.status === 'admitted' || e.status === 'open').length,
      discharged: this.encounters.filter((e) => e.status === 'discharged' || e.status === 'closed').length,
      due: this.encounters.filter((e) => (e.summary?.balance || 0) > 0).length,
    };
  }

  loadEncounters(): void {
    this.loading = true;
    this.backend
      .getEncounters({
        page: this.page,
        limit: this.limit,
        status: this.status || undefined,
        type: this.type || undefined,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => {
          this.encounters = result.items;
          this.totalPages = result.pagination.totalPages;
          this.totalItems = result.pagination.total;
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to load encounters'),
      });
  }

  applyFilters(): void {
    this.page = 1;
    this.loadEncounters();
  }

  clearFilters(): void {
    this.status = '';
    this.type = '';
    this.search = '';
    this.mobileChip = 'all';
    this.page = 1;
    this.loadEncounters();
  }

  openLedger(encounterId: string): void {
    this.selectedEncounterId = encounterId;
    this.showDetailPanel = true;
    this.selectedReceiptPayment = null;
    this.ledgerLoading = true;
    this.backend
      .getEncounterLedger(encounterId)
      .pipe(finalize(() => (this.ledgerLoading = false)))
      .subscribe({
        next: (ledger) => {
          this.selectedLedger = ledger;
          const payments = ledger.payments || [];
          this.selectedReceiptPayment = payments.length ? payments[payments.length - 1] : null;
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to load patient ledger'),
      });
  }

  recordPayment(): void {
    if (!this.selectedLedger || this.paymentAmount <= 0) {
      this.toastr.error('Enter a valid payment amount');
      return;
    }

    this.backend
      .recordEncounterPayment(this.selectedLedger.encounter._id, {
        amount: this.paymentAmount,
        method: this.paymentMethod,
        type: this.paymentType,
        note: this.paymentNote,
      })
      .subscribe({
        next: (response) => {
          this.toastr.success(response.message || 'Payment recorded');
          this.paymentAmount = 0;
          this.paymentNote = '';
          this.openLedger(this.selectedLedger!.encounter._id);
          this.loadEncounters();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to record payment'),
      });
  }

  closeLedger(): void {
    this.showDetailPanel = false;
    this.selectedLedger = null;
    this.selectedEncounterId = null;
  }

  changePage(nextPage: number): void {
    if (nextPage < 1 || (this.totalPages > 0 && nextPage > this.totalPages)) {
      return;
    }

    this.page = nextPage;
    this.loadEncounters();
  }

  statusBadgeClass(status: string): string {
    return `badge-${status.replace(/_/g, '-')}`;
  }

  buildPaymentReceiptHtml = (): string => {
    if (!this.selectedLedger || !this.selectedReceiptPayment) return '';
    return buildPaymentReceiptDocumentHtml({
      payment: this.selectedReceiptPayment,
      patient: this.selectedLedger.encounter.patient,
      encounterNo: this.selectedLedger.encounter.encounterNo,
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
      receivedBy: readCurrentUserName(),
    });
  };

  selectReceiptPayment(payment: LedgerPayment): void {
    this.selectedReceiptPayment = payment;
  }

  isReceiptSelected(payment: LedgerPayment): boolean {
    return this.selectedReceiptPayment?._id === payment._id;
  }

  buildPatientLedgerHtml = (): string => {
    if (!this.selectedLedger) return '';
    return buildPatientLedgerDocumentHtml({
      ledger: this.selectedLedger,
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
    });
  };

  /** Shared HTML used by list PDF download and Print (HmsDocumentToolbar / HmsDocumentService). */
  buildEncountersListHtml = (): string => {
    const rows = this.filteredEncounters.map((encounter) => [
      encounter.encounterNo,
      `${this.patientName(encounter)}${encounter.patient?.patientNo ? ` (${encounter.patient.patientNo})` : ''}`,
      encounter.type,
      encounter.status,
      formatHmsMoney(encounter.summary?.totalCharges || 0),
      formatHmsMoney(encounter.summary?.totalPaid || 0),
      formatHmsMoney(encounter.summary?.balance || 0),
    ]);

    return buildHmsStandardDocumentHtml({
      title: 'Patient Ledger — Encounters',
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
      metaRows: [
        { label: 'Rows', value: String(this.filteredEncounters.length) },
        { label: 'Page', value: String(this.page) },
        { label: 'Billed (page)', value: formatHmsMoney(this.kpiBilledOnPage) },
        { label: 'Paid (page)', value: formatHmsMoney(this.kpiPaidOnPage) },
        { label: 'Outstanding', value: formatHmsMoney(this.kpiOutstanding) },
      ],
      bodyHtml: buildHmsTableHtml(
        ['Encounter', 'Patient', 'Type', 'Status', 'Billed', 'Paid', 'Balance'],
        rows,
        { numericColumns: [4, 5, 6], emptyMessage: 'No encounters to export.' }
      ),
    });
  };

  exportEncountersExcel(): void {
    if (!this.filteredEncounters.length) {
      this.toastr.info('No encounters to export');
      return;
    }

    downloadExcelWorkbook(`patient-ledger-encounters-page-${this.page}`, [
      {
        name: 'Encounters',
        columns: [
          { header: 'Encounter ID', key: 'encounterNo' },
          { header: 'Patient', key: 'patient' },
          { header: 'Patient No', key: 'patientNo' },
          { header: 'Type', key: 'type' },
          { header: 'Status', key: 'status' },
          { header: 'Billed', key: 'billed' },
          { header: 'Paid', key: 'paid' },
          { header: 'Balance', key: 'balance' },
        ],
        rows: this.filteredEncounters.map((encounter) => ({
          encounterNo: encounter.encounterNo,
          patient: this.patientName(encounter),
          patientNo: encounter.patient?.patientNo || '',
          type: encounter.type,
          status: encounter.status,
          billed: encounter.summary?.totalCharges || 0,
          paid: encounter.summary?.totalPaid || 0,
          balance: encounter.summary?.balance || 0,
        })),
      },
    ]);
  }

  patientName(encounter: Encounter): string {
    const patient = encounter.patient;
    if (!patient) {
      return 'Unknown patient';
    }

    return [patient.firstName, patient.lastName].filter(Boolean).join(' ').trim() || patient.patientNo || 'Patient';
  }

  patientInitials(encounter: Encounter): string {
    const patient = encounter.patient;
    if (!patient) return 'P';
    const first = (patient.firstName || '').trim().charAt(0);
    const last = (patient.lastName || '').trim().charAt(0);
    return `${first}${last}`.toUpperCase() || (patient.patientNo || 'P').slice(0, 2).toUpperCase();
  }

  patientAgeGender(encounter: Encounter): string {
    const patient = encounter.patient;
    if (!patient) return '';
    return [patient.gender, patient.patientNo].filter(Boolean).join(' · ');
  }
}
