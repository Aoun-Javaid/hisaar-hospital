import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { hasRouteAccess, readStoredPermissions } from '../../auth/access-control';
import { User } from '../../../shared/models/hospital.model';
import {
  PatientStatus,
  PatientStatusTab,
  WardPatient,
  WardPatientKpi,
  WardPatientListFilters,
} from './ward-patient-list.models';
import { WARD_PATIENT_SHIFT_OPTIONS } from './ward-patient-list.mock';
import { WardDataService } from './services/ward-data.service';
import { getWardOptionsFromRooms, mapAllotmentToWardPatient } from './services/ward-api.mapper';
import { HmsActionMenuComponent, HmsActionMenuItem } from '../../../shared/components/hms-action-menu/hms-action-menu.component';

@Component({
  selector: 'app-ward-patient-list',
  imports: [CommonModule, FormsModule, RouterLink, HmsActionMenuComponent],
  templateUrl: './ward-patient-list.component.html',
  styleUrl: './ward-patient-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WardPatientListComponent implements OnInit, OnDestroy {
  loading = false;
  patients: WardPatient[] = [];
  wardPatientsList: WardPatient[] = [];
  filteredPatientsList: WardPatient[] = [];
  paginatedPatientsList: WardPatient[] = [];
  kpiCardsList: WardPatientKpi[] = [];
  doctorOptionsList: string[] = [];
  nurseOptionsList: string[] = [];
  roomOptionsList: string[] = [];
  pageNumbersList: number[] = [];

  openMenuAdmissionId: string | null = null;
  previewPatient: WardPatient | null = null;
  assignNursePatient: WardPatient | null = null;
  nurseCandidates: User[] = [];
  visibleNurses: User[] = [];
  nurseSearch = '';
  selectedAssignNurseId = '';
  nursesLoading = false;
  nursesError = false;
  assigningNurse = false;
  private nurseCache: User[] | null = null;
  private previousBodyOverflow = '';
  isMobileView = false;
  mobileFiltersOpen = false;
  pageSize = 10;
  currentPage = 1;
  readonly canAddPatient = hasRouteAccess(
    ['patients.create', 'patients.update'],
    readStoredPermissions()
  );

  wardOptions: string[] = [];
  readonly shiftOptions = WARD_PATIENT_SHIFT_OPTIONS;
  readonly statusTabs: Array<{ key: PatientStatusTab; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'stable', label: 'Stable' },
    { key: 'watch', label: 'Watch' },
    { key: 'critical', label: 'Critical' },
    { key: 'dischargePlanned', label: 'Discharge Planned' },
  ];

  filters: WardPatientListFilters = {
    ward: '',
    date: new Date().toISOString().slice(0, 10),
    shift: 'Day Shift',
    statusTab: 'all',
    search: '',
    doctor: '',
    nurse: '',
    room: '',
    unassignedNurseOnly: false,
  };

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef,
    private wardData: WardDataService
  ) {}

  ngOnInit(): void {
    this.syncViewportMode();
    this.loadPatients();
  }

  ngOnDestroy(): void {
    this.closePreview();
    this.closeAssignNurse();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.syncViewportMode();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.openMenuAdmissionId) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.table-actions__menu')) {
      return;
    }

    this.openMenuAdmissionId = null;
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.assignNursePatient) {
      this.closeAssignNurse();
      return;
    }
    if (this.previewPatient) {
      this.closePreview();
    }

    if (this.openMenuAdmissionId) {
      this.openMenuAdmissionId = null;
      this.cdr.markForCheck();
    }
  }

  loadPatients(): void {
    this.loading = true;
    this.wardData.loadClinicalBundle().subscribe({
      next: (bundle) => {
        this.wardOptions = getWardOptionsFromRooms(bundle.rooms, bundle.hospitalWards);
        const roomById = new Map(bundle.rooms.map((room) => [String(room._id), room]));

        this.patients = bundle.allotments
          .filter((allotment) => allotment.status === 'admitted')
          .map((allotment) => {
            const room = roomById.get(String(allotment.roomId)) || allotment.room || null;
            return {
              ...allotment,
              room,
            };
          })
          .map((allotment) =>
            mapAllotmentToWardPatient(
              allotment,
              bundle.doctors,
              bundle.history,
              bundle.prescriptions,
              bundle.encounters,
              bundle.hospitalWards
            )
          );
        this.currentPage = 1;
        this.loading = false;
        this.recomputeViewState();
      },
      error: () => {
        this.patients = [];
        this.loading = false;
        this.toastr.error('Failed to load ward patients.', 'Patient List');
        this.recomputeViewState();
      },
    });
  }

  refresh(): void {
    this.loadPatients();
    this.toastr.success('Patient list refreshed.', 'Ward Patients');
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPatientsList.length / this.pageSize));
  }

  get paginationStart(): number {
    if (!this.filteredPatientsList.length) {
      return 0;
    }
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get paginationEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredPatientsList.length);
  }

  get selectedWardLabel(): string {
    return this.filters.ward || 'All Wards';
  }

  statusTabCount(tab: PatientStatusTab): number {
    if (tab === 'all') {
      return this.wardPatientsList.length;
    }
    return this.wardPatientsList.filter((patient) => patient.status === tab).length;
  }

  setStatusTab(tab: PatientStatusTab): void {
    this.filters.statusTab = tab;
    this.filters.unassignedNurseOnly = false;
    this.currentPage = 1;
    this.recomputeViewState();
  }

  applyKpiFilter(card: WardPatientKpi): void {
    if (card.unassignedOnly) {
      this.filters.statusTab = 'all';
      this.filters.nurse = '';
      this.filters.unassignedNurseOnly = true;
      this.filters.search = '';
      this.currentPage = 1;
      this.recomputeViewState();
      return;
    }

    this.filters.unassignedNurseOnly = false;

    if (card.filterTab) {
      this.setStatusTab(card.filterTab);
    }
  }

  resetFilters(): void {
    this.filters = {
      ward: '',
      date: new Date().toISOString().slice(0, 10),
      shift: 'Day Shift',
      statusTab: 'all',
      search: '',
      doctor: '',
      nurse: '',
      room: '',
      unassignedNurseOnly: false,
    };
    this.currentPage = 1;
    this.mobileFiltersOpen = false;
    this.recomputeViewState();
  }

  onFilterChange(): void {
    this.filters.unassignedNurseOnly = false;
    this.currentPage = 1;
    this.recomputeViewState();
  }

  toggleMobileFilters(): void {
    this.mobileFiltersOpen = !this.mobileFiltersOpen;
    this.cdr.markForCheck();
  }

  applyMobileFilters(): void {
    this.mobileFiltersOpen = false;
    this.onFilterChange();
  }

  get activeFilterCount(): number {
    let count = 0;
    if (this.filters.ward) count += 1;
    if (this.filters.doctor) count += 1;
    if (this.filters.nurse) count += 1;
    if (this.filters.room) count += 1;
    if (this.filters.shift && this.filters.shift !== 'Day Shift') count += 1;
    if (this.filters.unassignedNurseOnly) count += 1;
    return count;
  }

  rowNumber(index: number): number {
    return (this.currentPage - 1) * this.pageSize + index + 1;
  }

  patientInitials(name: string): string {
    const parts = String(name || 'P')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return ((parts[0]?.[0] || 'P') + (parts[1]?.[0] || '')).toUpperCase();
  }

  addPatient(): void {
    if (!this.canAddPatient) {
      return;
    }
    void this.router.navigate(['/patients/add-patient']);
  }

  goToPage(page: number): void {
    this.currentPage = Math.min(Math.max(page, 1), this.totalPages);
    this.recomputeViewState();
  }

  trackByAdmissionId(_index: number, patient: WardPatient): string {
    return patient.admissionId;
  }

  statusLabel(status: PatientStatus): string {
    const labels: Record<PatientStatus, string> = {
      stable: 'Stable',
      watch: 'Watch',
      critical: 'Critical',
      dischargePlanned: 'Discharge Planned',
      pendingAssignment: 'Pending Assignment',
    };
    return labels[status];
  }

  statusClass(status: PatientStatus): string {
    return `patient-badge--${status}`;
  }

  ageSex(patient: WardPatient): string {
    const agePart = patient.age > 0 ? `${patient.age} Y` : '—';
    return `${agePart} / ${patient.sex || '—'}`;
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  displayValue(value?: string): string {
    return value?.trim() ? value : '—';
  }

  openPreview(patient: WardPatient, event?: Event): void {
    event?.stopPropagation();
    this.previewPatient = patient;
    this.openMenuAdmissionId = null;
    this.cdr.markForCheck();
  }

  closePreview(): void {
    this.previewPatient = null;
    this.cdr.markForCheck();
  }

  toggleMoreMenu(admissionId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuAdmissionId = this.openMenuAdmissionId === admissionId ? null : admissionId;
    this.cdr.markForCheck();
  }

  isMenuOpen(admissionId: string): boolean {
    return this.openMenuAdmissionId === admissionId;
  }

  viewPatient(patient: WardPatient): void {
    void this.router.navigate(['/ward/patient-detail', patient.admissionId]);
  }

  readonly moreMenuItems: HmsActionMenuItem[] = [
    { label: 'View MAR' },
    { label: 'View Vitals' },
    { label: 'View Drips / IV' },
    { label: 'Nursing Notes' },
    { label: 'Discharge Clearance' },
  ];

  onMoreAction(patient: WardPatient, item: HmsActionMenuItem): void {
    const routes: Record<string, string> = {
      'View MAR': '/ward/mar',
      'View Vitals': '/ward/vitals',
      'View Drips / IV': '/ward/drips-iv',
      'Nursing Notes': '/ward/nursing-care',
      'Discharge Clearance': '/ward/admissions',
    };
    this.navigateWithAdmission(routes[item.label], patient);
  }

  assignNurse(patient: WardPatient): void {
    this.assignNursePatient = patient;
    this.selectedAssignNurseId = patient.nurseId || '';
    this.nurseSearch = '';
    this.nursesError = false;
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.loadNurses();
    this.cdr.markForCheck();
  }

  closeAssignNurse(): void {
    this.assignNursePatient = null;
    this.assigningNurse = false;
    document.body.style.overflow = this.previousBodyOverflow || '';
    this.cdr.markForCheck();
  }

  onNurseSearch(): void {
    this.applyNurseFilter();
  }

  private loadNurses(): void {
    if (this.nurseCache) {
      this.nurseCandidates = this.nurseCache;
      this.applyNurseFilter();
      return;
    }
    this.nursesLoading = true;
    this.wardData.loadWardStaff().pipe(catchError(() => of([] as User[]))).subscribe({
      next: (users) => {
        this.nurseCache = users || [];
        this.nurseCandidates = this.nurseCache;
        this.nursesLoading = false;
        this.applyNurseFilter();
      },
      error: () => {
        this.nursesLoading = false;
        this.nursesError = true;
        this.cdr.markForCheck();
      },
    });
  }

  private applyNurseFilter(): void {
    const query = this.nurseSearch.trim().toLowerCase();
    const nurses = this.nurseCandidates.filter((user) => {
      const role = String(user.role?.name || '').toLowerCase();
      return role.includes('nurse') || role === 'ward admin';
    });
    const list = (nurses.length ? nurses : this.nurseCandidates).filter((user) => user.status !== 'inactive');
    this.visibleNurses = query
      ? list.filter((user) => [user.name, user.role?.name, user.email].join(' ').toLowerCase().includes(query))
      : list.slice(0, 80);
    this.cdr.markForCheck();
  }

  confirmAssignNurse(): void {
    const patient = this.assignNursePatient;
    if (!patient?.admissionId || !this.selectedAssignNurseId || this.assigningNurse) return;
    this.assigningNurse = true;
    this.wardData.assignNurse(patient.admissionId, this.selectedAssignNurseId).subscribe({
      next: () => {
        this.assigningNurse = false;
        this.toastr.success('Nurse assigned.');
        this.closeAssignNurse();
        this.loadPatients();
      },
      error: (err) => {
        this.assigningNurse = false;
        this.toastr.error(err?.error?.message || 'Failed to assign nurse.');
        this.cdr.markForCheck();
      },
    });
  }

  transferBed(patient: WardPatient): void {
    void this.router.navigate(['/ward/bed-management'], {
      queryParams: {
        admissionId: patient.admissionId,
        patientId: patient.patientId,
        patientName: patient.patientName,
        wardName: patient.wardName,
        bedNo: patient.bedNo,
      },
    });
  }

  navigateWithAdmission(path: string, patient: WardPatient): void {
    this.openMenuAdmissionId = null;
    void this.router.navigate([path], {
      queryParams: {
        admissionId: patient.admissionId,
        patientId: patient.patientId,
        patientName: patient.patientName,
        wardName: patient.wardName,
      },
    });
  }

  exportCsv(): void {
    const rows = this.filteredPatientsList;
    if (!rows.length) {
      this.toastr.info('No patients to export for current filters.', 'Export');
      return;
    }

    const header = ['Bed', 'Patient', 'MRN', 'Age/Sex', 'Diagnosis', 'Doctor', 'Nurse', 'Admitted On', 'Status'];
    const lines = rows.map((patient) =>
      [
        patient.bedNo,
        patient.patientName,
        patient.mrn,
        this.ageSex(patient),
        patient.diagnosis,
        patient.doctorName,
        patient.nurseName || '',
        this.formatDate(patient.admittedOn),
        this.statusLabel(patient.status),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    );

    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ward-patients-${this.selectedWardLabel.toLowerCase().replace(/\s+/g, '-')}-${this.filters.date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.toastr.success('Patient list exported.', 'Export');
  }

  private syncViewportMode(): void {
    this.isMobileView = window.innerWidth <= 768;
    if (!this.isMobileView) {
      this.mobileFiltersOpen = false;
    }
    this.cdr.markForCheck();
  }

  private recomputeViewState(): void {
    const selectedWard = this.filters.ward.trim().toLowerCase();
    this.wardPatientsList = selectedWard
      ? this.patients.filter((patient) => patient.wardName.trim().toLowerCase() === selectedWard)
      : [...this.patients];

    const search = this.filters.search.trim().toLowerCase();
    this.filteredPatientsList = this.wardPatientsList.filter((patient) => {
      if (this.filters.statusTab !== 'all' && patient.status !== this.filters.statusTab) {
        return false;
      }

      if (this.filters.doctor && patient.doctorName !== this.filters.doctor) {
        return false;
      }

      if (this.filters.nurse && patient.nurseName !== this.filters.nurse) {
        return false;
      }

      if (this.filters.room && patient.roomName !== this.filters.room) {
        return false;
      }

      if (this.filters.unassignedNurseOnly && patient.nurseName) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = [
        patient.patientName,
        patient.bedNo,
        patient.mrn,
        patient.diagnosis,
        patient.doctorName,
        patient.nurseName || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });

    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedPatientsList = this.filteredPatientsList.slice(start, start + this.pageSize);
    this.pageNumbersList = Array.from({ length: this.totalPages }, (_, index) => index + 1);

    const doctors = new Set(this.patients.map((patient) => patient.doctorName));
    this.doctorOptionsList = Array.from(doctors).sort();

    const nurses = new Set(
      this.patients.map((patient) => patient.nurseName).filter((name): name is string => Boolean(name))
    );
    this.nurseOptionsList = Array.from(nurses).sort();

    const rooms = new Set(this.patients.map((patient) => patient.roomName));
    this.roomOptionsList = Array.from(rooms).sort();

    const list = this.wardPatientsList;
    this.kpiCardsList = [
      {
        key: 'total',
        label: 'Total Patients',
        description: 'All admitted patients',
        count: list.length,
        icon: 'fa-users',
        tone: 'blue',
        filterTab: 'all',
      },
      {
        key: 'stable',
        label: 'Stable',
        description: 'Condition normal',
        count: list.filter((patient) => patient.status === 'stable').length,
        icon: 'fa-check-circle',
        tone: 'green',
        filterTab: 'stable',
      },
      {
        key: 'watch',
        label: 'Watch',
        description: 'Needs close monitoring',
        count: list.filter((patient) => patient.status === 'watch').length,
        icon: 'fa-exclamation-circle',
        tone: 'orange',
        filterTab: 'watch',
      },
      {
        key: 'critical',
        label: 'Critical',
        description: 'Requires urgent care',
        count: list.filter((patient) => patient.status === 'critical').length,
        icon: 'fa-heartbeat',
        tone: 'red',
        filterTab: 'critical',
      },
      {
        key: 'discharge',
        label: 'Discharge Planned',
        description: 'Planned for discharge',
        count: list.filter((patient) => patient.status === 'dischargePlanned').length,
        icon: 'fa-sign-out',
        tone: 'purple',
        filterTab: 'dischargePlanned',
      },
      {
        key: 'unassigned',
        label: 'Unassigned Nurse',
        description: 'No nurse assigned',
        count: list.filter((patient) => !patient.nurseName).length,
        icon: 'fa-user-times',
        tone: 'amber',
        unassignedOnly: true,
      },
    ];

    this.cdr.markForCheck();
  }
}
