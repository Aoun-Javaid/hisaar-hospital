import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { BackendService } from '../../../core/services/backend.service';
import {
  Department,
  Doctor,
  OperationSchedule,
  OperationScheduleStatus,
  TreatmentCatalogItem,
} from '../../../shared/models/hospital.model';

type CalendarRange = 'day' | 'week' | 'month';

interface DayColumn {
  id: string;
  label: string;
  sublabel: string;
}

interface MonthCell {
  date: string;
  label: number;
  inMonth: boolean;
  isToday: boolean;
  items: OperationSchedule[];
}

/** Calendar block: live slot or red "stopped here" marker. */
interface CalendarBlock {
  item: OperationSchedule;
  kind: 'live' | 'stopped';
  start: string;
  end?: string | null;
}

@Component({
  selector: 'app-operation-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './operation-calendar.component.html',
  styleUrl: './operation-calendar.component.scss',
})
export class OperationCalendarComponent implements OnInit {
  viewMode: 'calendar' | 'list' | 'needs' = 'calendar';
  calendarRange: CalendarRange = 'day';
  loading = false;
  items: OperationSchedule[] = [];
  needsScheduling: OperationSchedule[] = [];
  departments: Department[] = [];
  doctors: Doctor[] = [];
  treatments: TreatmentCatalogItem[] = [];
  selected: OperationSchedule | null = null;
  private suppressQueryOpen = false;
  drawerPanel: 'details' | 'reschedule' | 'stop' = 'details';
  rescheduleAt = '';
  stopReason = '';
  stopRescheduleAt = '';
  savingAction = false;
  private dragItem: OperationSchedule | null = null;
  private dragMoved = false;
  departmentFilter = '';
  doctorFilter = '';
  statusFilter = '';
  search = '';
  selectedDate = new Date().toISOString().slice(0, 10);

  readonly hourHeight = 76;
  readonly dayStartHour = 7;
  readonly dayEndHour = 19;
  readonly otCapacityHours = 10;

  kpis = {
    today: 0,
    scheduled: 0,
    completed: 0,
    pending: 0,
    inProgress: 0,
    otUtilization: 0,
    otHoursUsed: 0,
    showOtUtilization: false,
  };

  readonly statuses: OperationScheduleStatus[] = [
    'requested',
    'scheduled',
    'confirmed',
    'in_progress',
    'completed',
    'postponed',
    'cancelled',
  ];

  readonly statusLegend = [
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'pending', label: 'Pending / Stopped' },
    { key: 'cancelled', label: 'Cancelled' },
  ] as const;

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadLookups();
    this.refresh();
    this.route.queryParamMap.subscribe((params) => {
      const operationId = String(params.get('operationId') || params.get('id') || '').trim();
      if (operationId) {
        this.openOperationById(operationId);
      }
    });
  }

  can(permission: string): boolean {
    return this.backend.hasPermission(permission);
  }

  get timeSlots(): number[] {
    const slots: number[] = [];
    for (let hour = this.dayStartHour; hour < this.dayEndHour; hour += 1) {
      slots.push(hour);
    }
    return slots;
  }

  get gridHeight(): number {
    return (this.dayEndHour - this.dayStartHour) * this.hourHeight;
  }

  get dateLabel(): string {
    return this.formatDisplayDate(this.selectedDate, this.calendarRange === 'day' ? 'long' : 'medium');
  }

  get rangeLabel(): string {
    if (this.calendarRange === 'day') {
      return this.formatDisplayDate(this.selectedDate, 'long');
    }
    const { from, to } = this.rangeBounds();
    if (this.calendarRange === 'week') {
      return `${this.formatDisplayDate(from, 'short')} – ${this.formatDisplayDate(to, 'short')}`;
    }
    return this.formatDisplayDate(this.selectedDate, 'month');
  }

  get dayColumns(): DayColumn[] {
    if (this.departmentFilter) {
      const dept = this.departments.find((item) => item._id === this.departmentFilter);
      return [
        {
          id: this.departmentFilter,
          label: `OT · ${dept?.name || 'Department'}`,
          sublabel: dept?.name || 'Filtered department',
        },
      ];
    }

    const map = new Map<string, DayColumn>();
    const consider = (item: OperationSchedule) => {
      const onSelectedDay =
        (item.scheduledStart && this.itemDateKey(item) === this.selectedDate) ||
        (item.stoppedFromStart && this.stoppedDateKey(item) === this.selectedDate);
      if (!onSelectedDay) return;
      const id = this.departmentId(item) || 'unassigned';
      if (map.has(id)) return;
      const name = this.departmentName(item);
      map.set(id, {
        id,
        label: id === 'unassigned' ? 'OT · Unassigned' : `OT · ${name}`,
        sublabel: id === 'unassigned' ? 'No department' : name,
      });
    };

    for (const item of this.items) {
      consider(item);
    }

    if (!map.size) {
      const fallback = this.departments.slice(0, 3).map((dept, index) => ({
        id: dept._id,
        label: `OT-${index + 1} ${dept.name}`,
        sublabel: dept.name,
      }));
      return fallback.length
        ? fallback
        : [{ id: 'unassigned', label: 'OT · Operations', sublabel: 'All departments' }];
    }

    return Array.from(map.values()).map((col, index) => ({
      ...col,
      label: col.id === 'unassigned' ? col.label : `OT-${index + 1} ${col.sublabel}`,
    }));
  }

  get calendarItems(): OperationSchedule[] {
    return this.items.filter((item) => !!item.scheduledStart);
  }

  get agendaItems(): OperationSchedule[] {
    return [...this.calendarItems].sort((a, b) => {
      const aTime = a.scheduledStart ? new Date(a.scheduledStart).getTime() : 0;
      const bTime = b.scheduledStart ? new Date(b.scheduledStart).getTime() : 0;
      return aTime - bTime;
    });
  }

  get weekDays(): Array<{ date: string; label: string; items: OperationSchedule[] }> {
    const start = this.startOfWeek(this.parseDate(this.selectedDate));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = this.toDateKey(date);
      return {
        date: key,
        label: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
        items: this.calendarItems.filter((item) => this.itemDateKey(item) === key),
      };
    });
  }

  get monthCells(): MonthCell[] {
    const anchor = this.parseDate(this.selectedDate);
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const first = new Date(year, month, 1);
    const start = this.startOfWeek(first);
    const todayKey = this.toDateKey(new Date());
    const cells: MonthCell[] = [];

    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = this.toDateKey(date);
      cells.push({
        date: key,
        label: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: key === todayKey,
        items: this.calendarItems.filter((item) => this.itemDateKey(item) === key),
      });
    }
    return cells;
  }

  get scheduledPct(): number {
    return this.pctOfToday(this.kpis.scheduled);
  }

  get completedPct(): number {
    return this.pctOfToday(this.kpis.completed);
  }

  get pendingPct(): number {
    return this.pctOfToday(this.kpis.pending);
  }

  loadLookups(): void {
    this.backend.getDepartments({ limit: 100, status: 'active' }).subscribe({
      next: (result) => (this.departments = result.items || []),
    });
    this.backend.getDoctors({ limit: 100, status: 'active' }).subscribe({
      next: (result) => (this.doctors = result.items || []),
    });
    this.backend.getTreatmentCatalog({ limit: 100, isActive: true }).subscribe({
      next: (result) => (this.treatments = result.items || []),
    });
  }

  refresh(): void {
    this.loading = true;
    const { from, to } = this.rangeBounds();
    const fromIso = `${from}T00:00:00.000Z`;
    const toIso = `${to}T23:59:59.999Z`;

    this.backend.getOperationScheduleKpis({ from: fromIso, to: toIso }).subscribe({
      next: (kpis) => this.applyRemoteKpis(kpis),
      error: () => undefined,
    });

    const params: Record<string, unknown> = {
      limit: 200,
      search: this.search.trim() || undefined,
      departmentId: this.departmentFilter || undefined,
      doctorId: this.doctorFilter || undefined,
      status: this.statusFilter || undefined,
      from: fromIso,
      to: toIso,
    };

    this.backend
      .getOperationSchedules(params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => {
          this.items = result.items || [];
          this.needsScheduling = this.items.filter((item) => item.status === 'requested');
          this.recomputeKpisFromItems();
          if (this.suppressQueryOpen) {
            this.suppressQueryOpen = false;
            this.selected = null;
            return;
          }
          const operationId = String(
            this.route.snapshot.queryParamMap.get('operationId') ||
              this.route.snapshot.queryParamMap.get('id') ||
              ''
          ).trim();
          if (operationId) {
            this.openOperationById(operationId);
          } else if (this.selected?._id) {
            const updated = this.items.find((item) => item._id === this.selected?._id) || null;
            this.selected = updated;
          }
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to load operations.'),
      });
  }

  setView(mode: 'calendar' | 'list' | 'needs'): void {
    this.viewMode = mode;
    this.refresh();
  }

  setCalendarRange(range: CalendarRange): void {
    this.calendarRange = range;
    this.refresh();
  }

  shiftDate(delta: number): void {
    const date = this.parseDate(this.selectedDate);
    if (this.viewMode === 'calendar' && this.calendarRange === 'week') {
      date.setDate(date.getDate() + delta * 7);
    } else if (this.viewMode === 'calendar' && this.calendarRange === 'month') {
      date.setMonth(date.getMonth() + delta);
    } else {
      date.setDate(date.getDate() + delta);
    }
    this.selectedDate = this.toDateKey(date);
    this.refresh();
  }

  goToday(): void {
    this.selectedDate = this.toDateKey(new Date());
    this.refresh();
  }

  selectMonthDay(date: string): void {
    this.selectedDate = date;
    this.calendarRange = 'day';
    this.refresh();
  }

  openScheduleFlow(): void {
    this.setView('needs');
    if (this.needsScheduling.length) {
      this.openDetails(this.needsScheduling[0]);
      return;
    }
    this.toastr.info('No operations need scheduling right now.');
  }

  openDetails(item: OperationSchedule): void {
    this.selected = item;
    this.drawerPanel = 'details';
    this.rescheduleAt = this.toDateTimeLocal(item.scheduledStart);
    this.stopReason = '';
    this.stopRescheduleAt = this.toDateTimeLocal(item.scheduledStart);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { operationId: item._id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openOperationById(operationId: string): void {
    const existing = this.items.find((item) => item._id === operationId);
    if (existing) {
      this.selected = existing;
      return;
    }

    this.backend.getOperationSchedule(operationId).subscribe({
      next: (item) => {
        if (item) {
          this.selected = item;
        }
      },
      error: () => this.toastr.error('Unable to open operation details.'),
    });
  }

  closeDetails(): void {
    this.selected = null;
    this.drawerPanel = 'details';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { operationId: null, id: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  canScheduleOps(): boolean {
    return (
      this.can('operations.update') ||
      this.can('operations.assign') ||
      this.can('ward.admissions.recommend') ||
      this.can('*')
    );
  }

  canMutateOperation(item: OperationSchedule): boolean {
    return !['completed', 'cancelled'].includes(String(item.status || '').toLowerCase());
  }

  canConfirm(item: OperationSchedule): boolean {
    return this.canMutateOperation(item) && ['requested', 'scheduled', 'postponed'].includes(item.status);
  }

  canMarkInProgress(item: OperationSchedule): boolean {
    return this.canMutateOperation(item) && ['scheduled', 'confirmed', 'requested'].includes(item.status);
  }

  canComplete(item: OperationSchedule): boolean {
    return this.canMutateOperation(item) && ['scheduled', 'confirmed', 'in_progress'].includes(item.status);
  }

  canCancel(item: OperationSchedule): boolean {
    return this.canMutateOperation(item) && this.can('operations.cancel');
  }

  canReschedule(item: OperationSchedule): boolean {
    return (
      this.canScheduleOps() &&
      this.canMutateOperation(item) &&
      ['requested', 'scheduled', 'confirmed', 'postponed'].includes(item.status)
    );
  }

  canStopOperation(item: OperationSchedule): boolean {
    return this.canScheduleOps() && item.status === 'in_progress';
  }

  canDrag(item: OperationSchedule): boolean {
    return this.canReschedule(item);
  }

  showReschedulePanel(): void {
    if (!this.selected || !this.canReschedule(this.selected)) return;
    this.drawerPanel = 'reschedule';
    this.rescheduleAt = this.toDateTimeLocal(this.selected.scheduledStart) || this.toDateTimeLocal(new Date().toISOString());
  }

  showStopPanel(): void {
    if (!this.selected || !this.canStopOperation(this.selected)) return;
    this.drawerPanel = 'stop';
    this.stopReason = '';
    this.stopRescheduleAt = this.toDateTimeLocal(this.selected.scheduledStart) || this.toDateTimeLocal(new Date().toISOString());
  }

  cancelDrawerPanel(): void {
    this.drawerPanel = 'details';
  }

  submitReschedule(): void {
    if (!this.selected || !this.rescheduleAt) {
      this.toastr.error('Choose a new date and time.');
      return;
    }
    this.savingAction = true;
    const iso = new Date(this.rescheduleAt).toISOString();
    this.backend
      .updateOperationSchedule(this.selected._id, { scheduledStart: iso })
      .pipe(finalize(() => (this.savingAction = false)))
      .subscribe({
        next: () => {
          this.toastr.success('Operation rescheduled.');
          this.drawerPanel = 'details';
          this.afterMutationRefresh(false);
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to reschedule.'),
      });
  }

  submitStopOperation(): void {
    if (!this.selected) return;
    const reason = this.stopReason.trim();
    if (!reason) {
      this.toastr.error('Stop reason is required.');
      return;
    }
    if (!this.stopRescheduleAt) {
      this.toastr.error('Choose the next schedule date/time.');
      return;
    }
    this.savingAction = true;
    const iso = new Date(this.stopRescheduleAt).toISOString();
    this.backend
      .updateOperationScheduleStatus(this.selected._id, 'postponed', {
        operationNotes: reason,
        scheduledStart: iso,
      })
      .pipe(finalize(() => (this.savingAction = false)))
      .subscribe({
        next: () => {
          this.toastr.success('Operation stopped and rescheduled.');
          this.afterMutationRefresh(true);
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to stop operation.'),
      });
  }

  onCardClick(event: MouseEvent, item: OperationSchedule): void {
    if (this.dragMoved) {
      event.preventDefault();
      this.dragMoved = false;
      return;
    }
    this.openDetails(item);
  }

  onDragStart(event: DragEvent, item: OperationSchedule): void {
    if (!this.canDrag(item)) {
      event.preventDefault();
      return;
    }
    this.dragItem = item;
    this.dragMoved = false;
    event.dataTransfer?.setData('text/plain', item._id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragEnd(): void {
    // click fires after dragend; keep dragMoved true briefly if we dropped
    window.setTimeout(() => {
      this.dragItem = null;
    }, 0);
  }

  onLaneDragOver(event: DragEvent): void {
    if (!this.dragItem || !this.canDrag(this.dragItem)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onLaneDrop(event: DragEvent): void {
    event.preventDefault();
    const item = this.dragItem;
    if (!item || !this.canDrag(item)) return;
    this.dragMoved = true;

    const lane = event.currentTarget as HTMLElement | null;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const y = Math.max(0, Math.min(event.clientY - rect.top, this.gridHeight));
    const rawMinutes = this.dayStartHour * 60 + (y / this.hourHeight) * 60;
    const snapped = Math.round(rawMinutes / 15) * 15;
    const maxMinutes = this.dayEndHour * 60 - 15;
    const minutes = Math.max(this.dayStartHour * 60, Math.min(snapped, maxMinutes));
    const iso = this.combineSelectedDateAndMinutes(minutes);
    this.backend.updateOperationSchedule(item._id, { scheduledStart: iso }).subscribe({
      next: () => {
        this.toastr.success('Operation moved.');
        this.refresh();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to move operation.'),
    });
  }

  private toDateTimeLocal(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private combineSelectedDateAndMinutes(totalMinutes: number): string {
    const [year, month, day] = this.selectedDate.split('-').map(Number);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const date = new Date(year, (month || 1) - 1, day || 1, hours, minutes, 0, 0);
    return date.toISOString();
  }

  patientName(item: OperationSchedule): string {
    const patient = typeof item.patientId === 'object' ? item.patientId : item.patient;
    if (!patient) return '—';
    return `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '—';
  }

  patientId(item: OperationSchedule): string {
    if (typeof item.patientId === 'object' && item.patientId?._id) {
      return String(item.patientId._id);
    }
    if (item.patient?._id) return String(item.patient._id);
    return item.patientId ? String(item.patientId) : '';
  }

  patientMrn(item: OperationSchedule): string {
    const patient = typeof item.patientId === 'object' ? item.patientId : item.patient;
    return patient?.patientNo || '—';
  }

  patientGender(item: OperationSchedule): string {
    const patient = typeof item.patientId === 'object' ? item.patientId : item.patient;
    const gender = String(patient?.gender || '').trim();
    return gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : '—';
  }

  patientAge(item: OperationSchedule): string {
    const patient = typeof item.patientId === 'object' ? item.patientId : item.patient;
    const dob = patient?.dateOfBirth;
    if (!dob) return '—';
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return '—';
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age -= 1;
    }
    return age >= 0 ? `${age} yrs` : '—';
  }

  procedureName(item: OperationSchedule): string {
    return (
      item.treatmentPricingSnapshot?.name ||
      (typeof item.treatmentCatalogId === 'object' ? item.treatmentCatalogId?.name : '') ||
      item.treatmentCatalog?.name ||
      '—'
    );
  }

  doctorName(item: OperationSchedule): string {
    const doctorObj =
      item.assignedOperatingDoctor ||
      (typeof item.assignedOperatingDoctorId === 'object' ? item.assignedOperatingDoctorId : null);
    if (!doctorObj) return '—';
    const withName = doctorObj as Doctor & { name?: string | null };
    return withName.name || withName.user?.name || '—';
  }

  assistantNames(item: OperationSchedule): string[] {
    const ids = item.assistantDoctorIds || [];
    return ids
      .map((id) => {
        const doctor = this.doctors.find((entry) => entry._id === String(id));
        return doctor?.user?.name || doctor?.specialization || '';
      })
      .filter(Boolean);
  }

  priorityLabel(priority?: string | null): string {
    const value = String(priority || 'routine').toLowerCase();
    if (value === 'emergency') return 'Emergency';
    if (value === 'urgent' || value === 'high') return 'Urgent';
    return 'Routine';
  }

  estimatedCharge(item: OperationSchedule): number {
    const base = Number(item.treatmentPricingSnapshot?.baseRate || 0);
    const discount = item.procedureDiscountApproved;
    if (!discount || discount.type === 'none') return base;
    if (discount.type === 'percentage') {
      return Math.max(0, base - (base * Number(discount.value || 0)) / 100);
    }
    if (discount.type === 'fixed') {
      return Math.max(0, base - Number(discount.value || 0));
    }
    return base;
  }

  departmentName(item: OperationSchedule): string {
    const dept = typeof item.departmentId === 'object' ? item.departmentId : null;
    if (dept?.name) return dept.name;
    if (typeof item.departmentId === 'string') {
      return this.departments.find((d) => d._id === item.departmentId)?.name || '—';
    }
    return '—';
  }

  departmentId(item: OperationSchedule): string {
    if (typeof item.departmentId === 'object' && item.departmentId?._id) {
      return String(item.departmentId._id);
    }
    return item.departmentId ? String(item.departmentId) : '';
  }

  statusLabel(status?: string): string {
    if (status === 'postponed') return 'Stopped';
    if (status === 'requested') return 'Pending';
    if (status === 'confirmed') return 'Scheduled';
    return String(status || '').replace(/_/g, ' ');
  }

  statusClass(status?: string): string {
    switch (status) {
      case 'completed':
        return 'is-completed';
      case 'in_progress':
        return 'is-in-progress';
      case 'cancelled':
        return 'is-cancelled';
      case 'requested':
      case 'postponed':
        return 'is-pending';
      case 'scheduled':
      case 'confirmed':
      default:
        return 'is-scheduled';
    }
  }

  itemsForColumn(columnId: string): CalendarBlock[] {
    const blocks: CalendarBlock[] = [];
    for (const item of this.items) {
      const id = this.departmentId(item) || 'unassigned';
      if (id !== columnId) continue;

      if (item.scheduledStart && this.itemDateKey(item) === this.selectedDate) {
        blocks.push({
          item,
          kind: 'live',
          start: item.scheduledStart,
          end: item.scheduledEnd,
        });
      }

      if (item.stoppedFromStart && this.stoppedDateKey(item) === this.selectedDate) {
        // Avoid duplicate if somehow same timestamp as live (edge case).
        const sameSlot =
          item.scheduledStart &&
          new Date(item.scheduledStart).getTime() === new Date(item.stoppedFromStart).getTime();
        if (!sameSlot) {
          blocks.push({
            item,
            kind: 'stopped',
            start: item.stoppedFromStart,
            end: item.stoppedFromEnd,
          });
        }
      }
    }
    return blocks;
  }

  cardStyle(block: CalendarBlock): Record<string, string> {
    const start = block.start ? new Date(block.start) : null;
    if (!start || Number.isNaN(start.getTime())) {
      return { top: '0px', height: `${this.hourHeight}px` };
    }

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const gridStart = this.dayStartHour * 60;
    const duration = this.blockDurationMinutes(block);
    const top = ((startMinutes - gridStart) / 60) * this.hourHeight;
    const height = Math.max((duration / 60) * this.hourHeight, 56);

    return {
      top: `${Math.max(top, 0)}px`,
      height: `${height}px`,
    };
  }

  blockTimeRangeLabel(block: CalendarBlock): string {
    const start = new Date(block.start);
    if (Number.isNaN(start.getTime())) return 'TBD';
    const end = block.end
      ? new Date(block.end)
      : new Date(start.getTime() + this.blockDurationMinutes(block) * 60_000);
    const fmt = (d: Date) =>
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${fmt(start)} - ${fmt(end)}`;
  }

  blockDurationMinutes(block: CalendarBlock): number {
    if (block.start && block.end) {
      const ms = new Date(block.end).getTime() - new Date(block.start).getTime();
      if (ms > 0) return Math.round(ms / 60_000);
    }
    return this.durationMinutes(block.item);
  }

  canDragBlock(block: CalendarBlock): boolean {
    return block.kind === 'live' && this.canDrag(block.item);
  }

  private stoppedDateKey(item: OperationSchedule): string {
    if (!item.stoppedFromStart) return '';
    return this.toDateKey(new Date(item.stoppedFromStart));
  }

  timeRangeLabel(item: OperationSchedule): string {
    if (!item.scheduledStart) return 'TBD';
    const start = new Date(item.scheduledStart);
    const end = item.scheduledEnd
      ? new Date(item.scheduledEnd)
      : new Date(start.getTime() + this.durationMinutes(item) * 60_000);
    const fmt = (d: Date) =>
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${fmt(start)} - ${fmt(end)}`;
  }

  durationMinutes(item: OperationSchedule): number {
    if (item.durationMinutes && item.durationMinutes > 0) return item.durationMinutes;
    if (item.treatmentPricingSnapshot?.durationMinutes) {
      return item.treatmentPricingSnapshot.durationMinutes;
    }
    if (item.scheduledStart && item.scheduledEnd) {
      const ms = new Date(item.scheduledEnd).getTime() - new Date(item.scheduledStart).getTime();
      return Math.max(Math.round(ms / 60_000), 30);
    }
    return 60;
  }

  formatHour(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  updateStatus(item: OperationSchedule, status: string): void {
    this.backend.updateOperationScheduleStatus(item._id, status).subscribe({
      next: () => {
        this.toastr.success('Operation status updated.');
        this.afterMutationRefresh(status === 'cancelled');
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to update status.'),
    });
  }

  complete(item: OperationSchedule): void {
    this.backend.completeOperationSchedule(item._id).subscribe({
      next: () => {
        this.toastr.success('Operation completed and charge posted.');
        this.afterMutationRefresh(true);
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to complete operation.'),
    });
  }

  cancel(item: OperationSchedule): void {
    this.backend.cancelOperationSchedule(item._id, {}).subscribe({
      next: () => {
        this.toastr.success('Operation cancelled.');
        this.afterMutationRefresh(true);
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to cancel operation.'),
    });
  }

  private afterMutationRefresh(closeDrawer: boolean): void {
    if (closeDrawer) {
      this.suppressQueryOpen = true;
      this.closeDetails();
    } else {
      this.drawerPanel = 'details';
    }
    this.refresh();
  }

  private applyRemoteKpis(kpis: Record<string, unknown>): void {
    const byStatus = (kpis['byStatus'] as Record<string, number>) || {};
    const scheduled =
      Number(byStatus['scheduled'] || 0) +
      Number(byStatus['confirmed'] || 0) +
      Number(kpis['upcoming'] || 0);
    const completed = Number(byStatus['completed'] || kpis['completed'] || 0);
    const pending =
      Number(byStatus['requested'] || 0) +
      Number(byStatus['postponed'] || 0) +
      Number(kpis['pending'] || kpis['pendingScheduling'] || 0);
    const inProgress = Number(byStatus['in_progress'] || kpis['inProgress'] || 0);
    const today = Number(kpis['total'] || kpis['today'] || scheduled + completed + pending + inProgress);

    this.kpis = {
      ...this.kpis,
      today,
      scheduled,
      completed,
      pending,
      inProgress,
    };
  }

  private recomputeKpisFromItems(): void {
    const scoped = this.items.filter((item) => item.status !== 'cancelled');
    const scheduled = scoped.filter((item) => ['scheduled', 'confirmed'].includes(item.status)).length;
    const completed = scoped.filter((item) => item.status === 'completed').length;
    const pending = scoped.filter((item) => ['requested', 'postponed'].includes(item.status)).length;
    const inProgress = scoped.filter((item) => item.status === 'in_progress').length;
    const today = scoped.length;

    let minutes = 0;
    for (const item of scoped) {
      const duration = this.durationMinutes(item);
      if (duration > 0) {
        minutes += duration;
      }
    }

    const otHoursUsed = Math.round((minutes / 60) * 10) / 10;
    const otUtilization = Math.min(
      100,
      Math.round((minutes / (this.otCapacityHours * 60)) * 100)
    );

    this.kpis = {
      today,
      scheduled,
      completed,
      pending,
      inProgress,
      otUtilization,
      otHoursUsed,
      showOtUtilization: true,
    };
  }

  private pctOfToday(value: number): number {
    if (!this.kpis.today) return 0;
    return Math.round((value / this.kpis.today) * 100);
  }

  private rangeBounds(): { from: string; to: string } {
    const selected = this.parseDate(this.selectedDate);
    if (this.viewMode !== 'calendar' || this.calendarRange === 'day') {
      const key = this.toDateKey(selected);
      return { from: key, to: key };
    }
    if (this.calendarRange === 'week') {
      const start = this.startOfWeek(selected);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: this.toDateKey(start), to: this.toDateKey(end) };
    }
    const start = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const end = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
    return { from: this.toDateKey(start), to: this.toDateKey(end) };
  }

  private itemDateKey(item: OperationSchedule): string {
    if (!item.scheduledStart) return '';
    return this.toDateKey(new Date(item.scheduledStart));
  }

  private startOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  }

  private toDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatDisplayDate(
    value: string,
    style: 'long' | 'medium' | 'short' | 'month' = 'long'
  ): string {
    const date = this.parseDate(value);
    if (style === 'month') {
      return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (style === 'short') {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    if (style === 'medium') {
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
