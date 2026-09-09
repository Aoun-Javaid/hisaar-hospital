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
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { WARD_MODULE_PAGE_CONFIGS } from './ward-module.config';
import {
  WardModuleHierarchyNode,
  WardModuleKpi,
  WardModulePageConfig,
  WardModuleReportCard,
  WardModuleRow,
  WardRowMenuItem,
} from './ward-module.models';
import { hasPermission, isNurseRole, readStoredRole } from '../../auth/access-control';
import { WardActionModalComponent } from './ward-action-modal.component';
import { WardDripActionModalComponent } from './ward-drip-action-modal.component';
import { WardVitalsTrendsComponent } from './ward-vitals-trends.component';
import { WardDataService } from './services/ward-data.service';
import { WARD_PATIENT_SHIFT_OPTIONS } from './ward-patient-list.mock';
import { HmsActionMenuComponent, HmsActionMenuItem } from '../../../shared/components/hms-action-menu/hms-action-menu.component';
import { HmsDocumentService } from '../../../core/services/hms-document.service';
import { buildHmsStandardDocumentHtml, buildHmsTableHtml } from '../../../core/utils/hms-document-template.util';
import { readCurrentUserName, readStoredHospitalDocumentInfo } from '../../../core/utils/hms-document-context.util';

@Component({
  selector: 'app-ward-module-page',
  imports: [CommonModule, FormsModule, WardActionModalComponent, WardDripActionModalComponent, WardVitalsTrendsComponent, HmsActionMenuComponent],
  templateUrl: './ward-module-page.component.html',
  styleUrl: './ward-module-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WardModulePageComponent implements OnInit, OnDestroy {
  config!: WardModulePageConfig;
  loading = false;
  rows: WardModuleRow[] = [];
  allRows: WardModuleRow[] = [];
  reportCards: WardModuleReportCard[] = [];
  allReportCards: WardModuleReportCard[] = [];
  hierarchyNodes: WardModuleHierarchyNode[] = [];

  ward = '';
  date = new Date().toISOString().slice(0, 10);
  shift = 'Day Shift';
  activeTab = 'all';
  search = '';
  currentPage = 1;
  readonly pageSize = 8;

  contextPatientId = '';
  contextAdmissionId = '';
  contextPatientName = '';
  contextRoomId = '';
  contextBedNo = '';
  contextRecommendationId = '';

  wardOptions: string[] = [];
  readonly shiftOptions = WARD_PATIENT_SHIFT_OPTIONS;
  actionModalOpen = false;
  actionPreset: Record<string, string | number> = {};
  vitalsTrendsRefreshToken = 0;
  dripActionModalOpen = false;
  dripActionType: 'stop' | 'complete' = 'stop';
  dripActionRow: WardModuleRow | null = null;
  activeMenuRow: WardModuleRow | null = null;
  menuPosition: Record<string, string> = {};
  isCompactViewport = typeof window !== 'undefined' && window.innerWidth <= 768;
  typeFilter = '';
  sortDesc = true;
  private pendingDripPatch: { rowId: string; status: 'planned' | 'running' | 'completed' } | null = null;
  private querySub: Subscription | null = null;
  private openedRecommendationId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef,
    private wardData: WardDataService,
    private docs: HmsDocumentService
  ) {}

  get canAddInventoryItem(): boolean {
    return hasPermission('products.create') || hasPermission('inventory.adjust');
  }

  get canRequestStock(): boolean {
    return hasPermission('inventory.adjust') || hasPermission('ward.create');
  }

  get canAdjustStock(): boolean {
    return hasPermission('inventory.adjust');
  }

  get canEditProduct(): boolean {
    return hasPermission('products.update');
  }

  get canArchiveProduct(): boolean {
    return hasPermission('products.delete');
  }

  get showMobileCards(): boolean {
    return this.isCompactViewport && (this.config?.key === 'orders-services' || this.config?.key === 'inventory');
  }

  ngOnInit(): void {
    const moduleKey = this.route.snapshot.data['wardModuleKey'] as string;
    this.config = WARD_MODULE_PAGE_CONFIGS[moduleKey];
    this.applyRouteContext(this.route.snapshot.queryParamMap);
    this.loadWardOptions();
    this.refreshRows();

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.applyRouteContext(params);
      this.openRecommendationFromQueryIfNeeded();
    });
    this.openRecommendationFromQueryIfNeeded();
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
  }

  get displayKpis(): WardModuleKpi[] {
    return (this.config?.kpis || []).map((kpi) => ({
      ...kpi,
      value: this.kpiValueFromRows(kpi),
    }));
  }

  get hideVitalsListTable(): boolean {
    return this.config?.key === 'vitals' && this.hasPatientContext;
  }

  @HostListener('window:resize')
  onViewportResize(): void {
    this.isCompactViewport = window.innerWidth <= 768;
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  closeRowMenuOnOutsideClick(event: Event): void {
    if (!this.activeMenuRow) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.table-actions__menu') || target?.closest('.table-actions__dropdown--fixed')) {
      return;
    }

    this.closeRowMenu();
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  closeRowMenuOnViewportChange(): void {
    this.closeRowMenu();
  }

  toggleRowMenu(row: WardModuleRow, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (this.activeMenuRow?.id === row.id) {
      this.closeRowMenu();
      return;
    }

    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const menuWidth = 196;
    const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);

    this.activeMenuRow = row;
    this.menuPosition = {
      top: `${rect.bottom + 6}px`,
      left: `${left}px`,
    };
    this.cdr.markForCheck();
  }

  closeRowMenu(): void {
    if (!this.activeMenuRow) {
      return;
    }
    this.activeMenuRow = null;
    this.cdr.markForCheck();
  }

  isRowMenuOpen(rowId: string): boolean {
    return this.activeMenuRow?.id === rowId;
  }

  runDripAction(row: WardModuleRow, action: 'start' | 'stop' | 'complete'): void {
    if (action === 'start') {
      this.updateDripStatus(row, action);
      return;
    }
    this.openDripActionModal(row, action);
  }

  dripFluidStatus(row: WardModuleRow): 'planned' | 'running' | 'completed' {
    if (row.meta?.fluidStatus) {
      return row.meta.fluidStatus;
    }

    const fromCell = String(row.cells['status'] || '').trim().toLowerCase();
    if (fromCell === 'running' || fromCell === 'completed' || fromCell === 'planned') {
      return fromCell;
    }

    return 'planned';
  }

  openDripActionModal(row: WardModuleRow, action: 'stop' | 'complete'): void {
    this.dripActionRow = row;
    this.dripActionType = action;
    this.dripActionModalOpen = true;
    this.closeRowMenu();
    this.cdr.markForCheck();
  }

  closeDripActionModal(): void {
    this.dripActionModalOpen = false;
    this.dripActionRow = null;
    this.cdr.markForCheck();
  }

  confirmDripAction(reason: string): void {
    if (!this.dripActionRow) {
      return;
    }
    this.updateDripStatus(this.dripActionRow, this.dripActionType, reason);
    this.closeDripActionModal();
  }

  get dripActionPatientName(): string {
    return this.dripActionRow?.cells['patient'] || this.contextPatientName || '';
  }

  get dripActionFluidName(): string {
    return this.dripActionRow?.cells['fluid'] || this.dripActionRow?.meta?.fluidName || '';
  }

  rowMenuItems(row: WardModuleRow): WardRowMenuItem[] {
    const items: WardRowMenuItem[] = [];
    const meta = row.meta || {};
    const patientId = meta.patientId || this.contextPatientId;
    const admissionId = meta.admissionId || this.contextAdmissionId;

    if (row.linkRoute || patientId) {
      items.push({ id: 'view-patient', label: 'View Patient Chart' });
    }

    if (this.config.key === 'drips-iv') {
      const status = this.dripFluidStatus(row);
      if (status === 'planned') {
        items.push({ id: 'drip-start', label: 'Start Drip' });
      }
      if (status === 'running') {
        items.push({ id: 'drip-stop', label: 'Stop Drip' });
        items.push({ id: 'drip-complete', label: 'Complete Drip' });
      }
    }

    if (this.config.key === 'shift-handover' && row.cells['_tab'] !== 'completed' && row.id) {
      items.push({ id: 'accept-handover', label: 'Accept Handover' });
    }

    if (this.config.key === 'orders-services') {
      const status = String(row.cells['status'] || '').toLowerCase();
      const type = String(row.cells['type'] || '').toLowerCase();
      const source = String(row.cells['_source'] || '');
      const completed = status === 'completed' || status === 'verified' || status === 'result_entered';
      const inProgress = status === 'in progress' || status === 'in_progress' || status === 'processing';
      items.push({ id: 'view-details', label: 'View Details' });
      if (!completed) {
        items.push({ id: 'update-status', label: 'Update Status' });
      }
      if (!completed && !inProgress && (status === 'pending' || status === 'due')) {
        items.push({ id: 'acknowledge-order', label: 'Mark In Progress' });
      }
      if (!completed && (status === 'pending' || status === 'due' || inProgress)) {
        items.push({ id: 'complete-order', label: 'Mark Completed' });
      }
      if (type === 'lab' && !completed && (status === 'pending' || status === 'sample_collected')) {
        items.push({ id: 'verify-sample', label: 'Verify Sample' });
      }
      if (!completed && source === 'ward-order') {
        items.push({ id: 'reassign-order', label: 'Reassign' });
      }
      items.push({ id: 'print-slip', label: 'Print Slip' });
      if (!completed) {
        items.push({ id: 'cancel-order', label: 'Cancel', danger: true });
      }
    }

    if (this.config.key === 'mar' && row.cells['_tab'] === 'due') {
      items.push({ id: 'administer-mar', label: 'Record Administration' });
    }

    if (this.config.key === 'inventory') {
      items.push({ id: 'view-details', label: 'View Details' });
      if (String(row.cells['_kind'] || '') === 'requisition' && row.id) {
        items.push({ id: 'issue-requisition', label: 'Issue Item' });
      }
      if (this.canAdjustStock && String(row.cells['_kind'] || '') === 'stock') {
        items.push({ id: 'issue-item', label: 'Issue Item' });
        items.push({ id: 'add-stock', label: 'Add Stock' });
        items.push({ id: 'transfer-stock', label: 'Transfer' });
        items.push({ id: 'adjust-stock', label: 'Adjust Stock' });
      }
      if (this.canEditProduct) {
        items.push({ id: 'edit-item', label: 'Edit Item' });
      }
      if (this.canArchiveProduct && String(row.cells['_kind'] || '') === 'stock') {
        items.push({ id: 'archive-item', label: 'Delete', danger: true });
      }
    }

    if (patientId) {
      items.push({ id: 'mar', label: 'View MAR' });
      if (this.config.key !== 'vitals') {
        items.push({ id: 'vitals', label: 'View Vitals' });
      }
      if (this.config.key !== 'drips-iv') {
        items.push({ id: 'drips', label: 'View Drips / IV' });
      }
    }

    if ((admissionId || this.contextAdmissionId) && !isNurseRole(readStoredRole())) {
      items.push({ id: 'transfer', label: 'Transfer Bed' });
      items.push({ id: 'discharge', label: 'Discharge Patient', danger: true });
    }

    return items;
  }

  handleRowMenuAction(row: WardModuleRow, actionId: string): void {
    this.closeRowMenu();
    const meta = row.meta || {};
    const patientId = meta.patientId || this.contextPatientId;
    const admissionId = meta.admissionId || this.contextAdmissionId;
    const patientName = row.cells['patient'] || this.contextPatientName;

    switch (actionId) {
      case 'view-patient':
        if (row.linkRoute) {
          void this.router.navigateByUrl(row.linkRoute);
        } else if (admissionId) {
          void this.router.navigate(['/ward/patient-detail', admissionId]);
        } else if (patientId) {
          void this.router.navigate(['/ward/patient-detail', patientId]);
        }
        break;
      case 'drip-start':
        this.updateDripStatus(row, 'start');
        break;
      case 'drip-stop':
        this.openDripActionModal(row, 'stop');
        break;
      case 'drip-complete':
        this.openDripActionModal(row, 'complete');
        break;
      case 'mar':
        this.navigateWithPatient('/ward/mar', patientId, admissionId, patientName);
        break;
      case 'vitals':
        this.navigateWithPatient('/ward/vitals', patientId, admissionId, patientName);
        break;
      case 'drips':
        this.navigateWithPatient('/ward/drips-iv', patientId, admissionId, patientName);
        break;
      case 'transfer':
        this.transferPatient(admissionId);
        break;
      case 'discharge':
        this.dischargePatient(admissionId);
        break;
      case 'accept-handover':
        this.wardData.acceptHandover(row.id).subscribe({
          next: () => {
            this.toastr.success('Handover accepted.');
            this.refreshRows();
          },
          error: (err) => this.toastr.error(err?.error?.message || 'Failed to accept handover.'),
        });
        break;
      case 'administer-mar':
        this.primaryAction();
        break;
      case 'issue-requisition':
        this.wardData.issueWardRequisition(row.id).subscribe({
          next: () => {
            this.toastr.success('Requisition issued to ward.');
            this.refreshRows();
          },
          error: (err) => this.toastr.error(err?.error?.message || 'Failed to issue requisition.'),
        });
        break;
      case 'view-details':
        this.openRow(row);
        break;
      case 'update-status':
      case 'acknowledge-order':
        if (this.isPersistedActivity(row.id)) {
          this.wardData.acknowledgeOrder(row.id).subscribe({
            next: () => {
              this.toastr.success('Order marked in progress.');
              this.refreshRows();
            },
            error: (err) => this.toastr.error(err?.error?.message || 'Failed to update order.'),
          });
        } else {
          this.toastr.info('Open the source module to update this order.');
        }
        break;
      case 'complete-order':
        if (this.isPersistedActivity(row.id)) {
          this.wardData.completeOrder(row.id).subscribe({
            next: () => {
              this.toastr.success('Order completed.');
              this.refreshRows();
            },
            error: (err) => this.toastr.error(err?.error?.message || 'Failed to complete order.'),
          });
        } else {
          this.toastr.info('Open the source module to complete this order.');
        }
        break;
      case 'verify-sample':
        void this.router.navigate(['/laboratory'], { queryParams: { orderId: row.id } });
        break;
      case 'reassign-order':
        this.primaryAction();
        break;
      case 'print-slip':
        this.printOrderSlip(row);
        break;
      case 'cancel-order':
        this.toastr.info('Cancel keeps the order history. Use the source module if a void is required.');
        break;
      case 'issue-item':
      case 'add-stock':
      case 'adjust-stock':
        this.primaryAction();
        break;
      case 'transfer-stock':
        void this.router.navigate(['/pharmacy/stock-movements']);
        break;
      case 'edit-item':
        void this.router.navigate(['/pharmacy/products']);
        break;
      case 'archive-item':
        this.toastr.info('Inventory history is kept. Archive the product from Pharmacy Products if needed.');
        break;
    }
    this.cdr.markForCheck();
  }

  transferCurrentPatient(): void {
    this.transferPatient(this.contextAdmissionId);
  }

  dischargeCurrentPatient(): void {
    this.dischargePatient(this.contextAdmissionId);
  }

  private transferPatient(admissionId: string): void {
    if (!admissionId) {
      this.toastr.warning('No admission found for this patient.');
      return;
    }
    void this.router.navigate(['/ward/bed-management'], {
      queryParams: {
        admissionId,
        bedNo: this.contextBedNo || undefined,
        patientName: this.contextPatientName || undefined,
      },
    });
  }

  private dischargePatient(admissionId: string): void {
    if (!admissionId) {
      this.toastr.warning('No admission found for this patient.');
      return;
    }
    this.wardData.dischargeAllotment(admissionId).subscribe({
      next: () => {
        this.toastr.success('Patient discharged successfully.');
        this.clearPatientContext();
        this.refreshRows();
      },
      error: () => this.toastr.error('Failed to discharge patient.'),
    });
  }

  private updateDripStatus(row: WardModuleRow, action: 'start' | 'stop' | 'complete', notes?: string): void {
    const meta = row.meta;
    if (!meta?.prescriptionId) {
      this.toastr.error('Missing prescription reference for this drip.');
      return;
    }
    this.wardData
      .updateDripStatus({
        action,
        prescriptionId: meta.prescriptionId,
        fluidIndex: meta.fluidIndex,
        fluidName: meta.fluidName,
        patientId: meta.patientId || this.contextPatientId || undefined,
        admissionId: meta.admissionId || this.contextAdmissionId || undefined,
        notes: notes || undefined,
      })
      .subscribe({
        next: (result) => {
          const nextStatus = this.resolveDripStatusFromResult(row, action, result);
          this.pendingDripPatch = { rowId: row.id, status: nextStatus };
          if (this.activeTab !== 'all') {
            this.activeTab = nextStatus;
          }
          const label = action === 'start' ? 'started' : action === 'stop' ? 'stopped' : 'completed';
          this.toastr.success(`Drip ${label} successfully.`);
          this.refreshRows();
        },
        error: () => this.toastr.error('Failed to update drip status.'),
      });
  }

  private resolveDripStatusFromResult(
    row: WardModuleRow,
    action: 'start' | 'stop' | 'complete',
    result?: Record<string, unknown>
  ): 'planned' | 'running' | 'completed' {
    const fluidIndex = row.meta?.fluidIndex;
    const ivFluids = result?.['ivFluids'] as Array<{ status?: string }> | undefined;
    if (ivFluids && fluidIndex != null && ivFluids[fluidIndex]?.status) {
      return this.normalizeDripStatus(ivFluids[fluidIndex].status);
    }
    return action === 'start' ? 'running' : action === 'stop' ? 'planned' : 'completed';
  }

  private normalizeDripStatus(status?: string): 'planned' | 'running' | 'completed' {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'running') {
      return 'running';
    }
    if (value === 'completed') {
      return 'completed';
    }
    return 'planned';
  }

  private applyDripStatusPatch(rows: WardModuleRow[]): WardModuleRow[] {
    if (!this.pendingDripPatch) {
      return rows;
    }

    const { rowId, status } = this.pendingDripPatch;
    this.pendingDripPatch = null;
    const statusLabel = status === 'running' ? 'Running' : status === 'completed' ? 'Completed' : 'Planned';
    const tab = status === 'running' ? 'running' : status === 'completed' ? 'completed' : 'planned';
    const badgeStatus = status === 'running' ? 'running' : status === 'completed' ? 'completed' : 'pending';

    return rows.map((row) => {
      if (row.id !== rowId) {
        return row;
      }
      return {
        ...row,
        meta: {
          ...row.meta,
          fluidStatus: status,
        },
        cells: {
          ...row.cells,
          status: statusLabel,
          _tab: tab,
        },
        badgeTone: {
          ...row.badgeTone,
          status: badgeStatus,
        },
      };
    });
  }

  private navigateWithPatient(path: string, patientId: string, admissionId: string, patientName: string): void {
    void this.router.navigate([path], {
      queryParams: {
        patientId: patientId || undefined,
        admissionId: admissionId || undefined,
        patientName: patientName || undefined,
        wardName: this.ward || undefined,
        bedNo: this.contextBedNo || undefined,
        roomId: this.contextRoomId || undefined,
      },
    });
  }

  get hasPatientContext(): boolean {
    return Boolean(this.contextPatientId || this.contextAdmissionId || this.contextPatientName);
  }

  get patientContextLabel(): string {
    return this.contextPatientName || 'Selected patient';
  }

  get selectedWardLabel(): string {
    return this.ward || 'All Wards';
  }

  clearPatientContext(): void {
    this.contextPatientId = '';
    this.contextAdmissionId = '';
    this.contextPatientName = '';
    this.contextRoomId = '';
    this.contextBedNo = '';
    this.search = '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        admissionId: null,
        patientId: null,
        patientName: null,
        roomId: null,
        bedNo: null,
        wardName: null,
      },
      queryParamsHandling: 'merge',
    });
    this.onFilterChange();
  }

  resetFilters(): void {
    this.activeTab = 'all';
    this.clearPatientContext();
  }

  get paginatedRows(): WardModuleRow[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  get paginationStart(): number {
    return this.rows.length ? (this.currentPage - 1) * this.pageSize + 1 : 0;
  }

  get paginationEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.rows.length);
  }

  tabCount(tabKey: string): number {
    if (this.config.layout === 'reports') {
      return this.allReportCards.length;
    }

    if (tabKey === 'all') {
      return this.allRows.length;
    }
    if (tabKey === 'urgent') {
      return this.allRows.filter((row) => row.cells['_urgent'] === '1' || String(row.cells['priority'] || '').toLowerCase() === 'urgent').length;
    }

    return this.allRows.filter((row) => row.cells['_tab'] === tabKey).length;
  }

  setTab(tabKey: string): void {
    this.activeTab = tabKey;
    this.currentPage = 1;
    if (this.config.layout === 'reports') {
      this.filterReportCards();
      this.cdr.markForCheck();
      return;
    }
    this.applyTabFilter();
    this.cdr.markForCheck();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.refreshRows();
  }

  goToPage(page: number): void {
    this.currentPage = Math.min(Math.max(page, 1), this.totalPages);
    this.cdr.markForCheck();
  }

  refresh(): void {
    this.refreshRows();
    this.toastr.success(`${this.config.title} refreshed.`);
  }

  primaryAction(): void {
    if (this.config.layout === 'reports') {
      this.toastr.info('Report summary loaded from live ward data.', this.config.title);
      return;
    }
    this.actionPreset = this.buildActionPreset();
    this.actionModalOpen = true;
    this.cdr.markForCheck();
  }

  onActionSaved(): void {
    this.toastr.success(`${this.config.primaryActionLabel || 'Action'} saved successfully.`);
    if (this.config.key === 'vitals') {
      this.vitalsTrendsRefreshToken += 1;
    }
    this.refreshRows();
  }

  closeActionModal(): void {
    this.actionModalOpen = false;
    this.cdr.markForCheck();
  }

  exportData(): void {
    if (!this.rows.length) {
      this.toastr.info('No records to export.', 'Export');
      return;
    }

    const columns = this.config.columns.map((column) => column.label);
    const lines = this.rows.map((row) =>
      this.config.columns
        .map((column) => `"${(row.cells[column.key] || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    this.downloadCsv([columns.join(','), ...lines].join('\n'), `${this.config.key}-export.csv`);
  }

  openRow(row: WardModuleRow): void {
    if (row.meta?.recommendationId && row.meta.rowSource === 'admission_recommendation' && !row.linkRoute) {
      this.reviewAdmissionRecommendation(row);
      return;
    }

    if (row.linkRoute) {
      void this.router.navigateByUrl(row.linkRoute);
    }
  }

  reviewAdmissionRecommendation(row: WardModuleRow): void {
    const recommendationId = row.meta?.recommendationId;
    if (!recommendationId) {
      return;
    }

    void this.router.navigate(['/room-allotment/add-alloted-rooms'], {
      queryParams: { recommendationId },
    });
  }

  openReport(card: WardModuleReportCard): void {
    const routes: Record<string, string> = {
      occupancy: '/ward/bed-management',
      records: '/ward-admin',
      r1: '/ward/bed-management',
      r2: '/ward/admissions',
      r3: '/ward/nursing-care',
      r4: '/ward/shift-handover',
      r5: '/ward/mar',
      r6: '/ward/mar',
    };
    const target = routes[card.id];
    if (target) {
      void this.router.navigateByUrl(target);
      return;
    }
    this.toastr.info(card.description, card.title);
  }

  badgeClass(columnKey: string, row: WardModuleRow): string {
    const tone = row.badgeTone?.[columnKey] || row.cells[columnKey]?.toLowerCase().replace(/\s+/g, '') || 'stable';
    return `ward-badge ward-badge--${tone}`;
  }

  trackById(_index: number, row: WardModuleRow): string {
    return row.id;
  }

  private refreshRows(): void {
    this.loading = true;

    if (this.config.layout === 'reports') {
      this.wardData.loadReportCards(this.activeTab, this.search).subscribe({
        next: (cards) => {
          this.allReportCards = cards;
          this.filterReportCards();
          this.rows = [];
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.allReportCards = [];
          this.reportCards = [];
          this.loading = false;
          this.toastr.error('Failed to load reports.');
          this.cdr.markForCheck();
        },
      });
      return;
    }

    this.wardData.loadModuleRows(this.config.key, 'all', this.search, this.moduleFilters()).subscribe({
      next: (rows) => {
        const patchedRows = this.applyDripStatusPatch(rows);
        this.allRows = patchedRows;
        this.applyTabFilter();
        this.reportCards = [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.allRows = [];
        this.rows = [];
        this.loading = false;
        this.toastr.error(`Failed to load ${this.config.title}.`);
        this.cdr.markForCheck();
      },
    });
  }

  private loadWardOptions(): void {
    this.wardData.loadWardFilterOptions().subscribe({
      next: (options) => {
        this.wardOptions = options;
        this.cdr.markForCheck();
      },
    });
  }

  overlayMenuItems(row: WardModuleRow): HmsActionMenuItem[] {
    return this.rowMenuItems(row).map((item) => ({
      id: item.id,
      label: item.label,
      danger: item.danger,
    }));
  }

  onOverlayMenuSelect(row: WardModuleRow, item: HmsActionMenuItem): void {
    this.handleRowMenuAction(row, item.id || item.label);
  }

  typeChipClass(type: string): string {
    return `ward-type-chip ward-type-chip--${String(type || 'other').toLowerCase().replace(/\s+/g, '-')}`;
  }

  toggleSort(): void {
    this.sortDesc = !this.sortDesc;
    this.applyTabFilter();
    this.cdr.markForCheck();
  }

  cycleTypeFilter(): void {
    const options = ['', 'Lab', 'Medicine', 'Imaging', 'Procedure', 'Nursing', 'Other'];
    const index = options.indexOf(this.typeFilter);
    this.typeFilter = options[(index + 1) % options.length];
    this.applyTabFilter();
    this.cdr.markForCheck();
  }

  requestStock(): void {
    this.primaryAction();
  }

  private isPersistedActivity(id: string): boolean {
    return Boolean(id) && !String(id).includes('-') && /^[a-f\d]{24}$/i.test(id);
  }

  private printOrderSlip(row: WardModuleRow): void {
    const html = buildHmsStandardDocumentHtml({
      title: 'Order Slip',
      hospital: readStoredHospitalDocumentInfo(),
      generatedBy: readCurrentUserName(),
      metaRows: [
        { label: 'Patient', value: row.cells['patient'] || '—' },
        { label: 'MR / Ref', value: row.cells['patientSub'] || '—' },
        { label: 'Order', value: row.cells['order'] || '—' },
        { label: 'Type', value: row.cells['type'] || '—' },
        { label: 'Doctor', value: row.cells['doctor'] || '—' },
        { label: 'Priority', value: row.cells['priority'] || '—' },
        { label: 'Status', value: row.cells['status'] || '—' },
      ],
      bodyHtml: `<section class="hms-doc-section"><h3>Order</h3>${buildHmsTableHtml(
        ['Field', 'Value'],
        [
          ['Ordered On', row.cells['orderedOn'] || row.cells['time'] || '—'],
          ['Order', row.cells['order'] || '—'],
        ]
      )}</section>`,
    });
    this.docs.openPreview({
      title: 'Order Slip',
      html,
      filename: 'order-slip.pdf',
      orientation: 'portrait',
    });
  }

  private applyTabFilter(): void {
    let next =
      this.activeTab === 'all'
        ? [...this.allRows]
        : this.activeTab === 'urgent'
          ? this.allRows.filter((row) => row.cells['_urgent'] === '1' || String(row.cells['priority'] || '').toLowerCase() === 'urgent')
          : this.allRows.filter((row) => row.cells['_tab'] === this.activeTab);

    if (this.typeFilter && this.config.key === 'orders-services') {
      next = next.filter((row) => row.cells['type'] === this.typeFilter);
    }

    if (this.config.key === 'orders-services') {
      next.sort((left, right) => {
        const a = String(left.cells['orderedOn'] || left.cells['time'] || '');
        const b = String(right.cells['orderedOn'] || right.cells['time'] || '');
        return this.sortDesc ? b.localeCompare(a) : a.localeCompare(b);
      });
    }

    this.rows = next;
  }

  private filterReportCards(): void {
    if (this.activeTab === 'all') {
      this.reportCards = this.allReportCards;
      return;
    }
    this.reportCards = this.allReportCards.filter(
      (card) => !card.category || card.category === this.activeTab
    );
  }

  private kpiValueFromRows(kpi: WardModuleKpi): number {
    const countTab = kpi.countTab;
    if (!countTab || countTab === 'total') {
      if (this.config.key === 'inventory') {
        return this.allRows.filter((row) => row.cells['_kind'] === 'stock').length;
      }
      return this.allRows.length;
    }
    if (countTab === 'urgent') {
      return this.allRows.filter((row) => row.cells['_urgent'] === '1' || String(row.cells['priority'] || '').toLowerCase() === 'urgent').length;
    }
    if (countTab === 'unique-patient') {
      return new Set(this.allRows.map((row) => row.cells['patient'])).size;
    }
    if (countTab === 'discharge-today') {
      const today = new Date().toISOString().slice(0, 10);
      return this.allRows.filter((row) => {
        const dischargedAt = String(row.cells['_dischargedAt'] || '');
        return row.cells['_tab'] === 'discharge' && dischargedAt.slice(0, 10) === today;
      }).length;
    }
    return this.allRows.filter((row) => row.cells['_tab'] === countTab).length;
  }

  private applyRouteContext(query: { get: (key: string) => string | null; keys?: string[] }): void {
    this.contextPatientId = query.get('patientId') || '';
    this.contextAdmissionId = query.get('admissionId') || '';
    this.contextPatientName = query.get('patientName') || '';
    this.contextRoomId = query.get('roomId') || '';
    this.contextBedNo = query.get('bedNo') || '';
    this.contextRecommendationId = this.readRecommendationId(query);

    const wardName = query.get('wardName');
    if (wardName) {
      this.ward = wardName;
    }

    this.search =
      this.contextPatientName && !this.contextPatientId && !this.contextAdmissionId
        ? this.contextPatientName
        : '';

    if (this.contextRecommendationId && this.config?.key === 'admissions') {
      this.activeTab = 'pending';
    }
  }

  private readRecommendationId(query: { get: (key: string) => string | null; keys?: string[] }): string {
    const direct = String(query.get('recommendationId') || query.get('recommendationid') || '').trim();
    if (direct) {
      return direct;
    }

    const keys = query.keys || [];
    for (const key of keys) {
      if (String(key).toLowerCase() === 'recommendationid') {
        return String(query.get(key) || '').trim();
      }
    }
    return '';
  }

  private openRecommendationFromQueryIfNeeded(): void {
    if (this.config?.key !== 'admissions') {
      return;
    }

    const recommendationId = this.contextRecommendationId;
    if (!recommendationId || recommendationId === this.openedRecommendationId) {
      return;
    }

    this.openedRecommendationId = recommendationId;
    this.toastr.info('Opening admission recommendation for bed allotment…');
    void this.router.navigate(['/room-allotment/add-alloted-rooms'], {
      queryParams: { recommendationId },
      replaceUrl: true,
    });
  }

  private moduleFilters() {
    const hasPatientContext = Boolean(
      this.contextPatientId || this.contextAdmissionId || this.contextPatientName
    );

    return {
      patientId: this.contextPatientId || undefined,
      admissionId: this.contextAdmissionId || undefined,
      patientName: this.contextPatientName || undefined,
      wardName: hasPatientContext ? undefined : this.ward || undefined,
    };
  }

  private buildActionPreset(): Record<string, string | number> {
    const preset: Record<string, string | number> = {};
    if (this.contextPatientId) {
      preset['patientId'] = this.contextPatientId;
    }
    if (this.contextAdmissionId) {
      preset['admissionId'] = this.contextAdmissionId;
    }
    return preset;
  }

  private downloadCsv(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this.toastr.success('Export completed.', 'Export');
  }
}
