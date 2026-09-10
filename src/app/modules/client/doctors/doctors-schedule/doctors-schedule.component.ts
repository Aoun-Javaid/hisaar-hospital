import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FullCalendarModule } from '@fullcalendar/angular';
import { Calendar, CalendarOptions, DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { AuthService } from '../../../../core/services/auth.service';
import { BackendService } from '../../../../core/services/backend.service';
import { toCalendarYmd } from '../../../../core/utils/calendar-date';
import { Appointment, Doctor, OperationSchedule, User } from '../../../../shared/models/hospital.model';
import { isDoctorRole } from '../../../auth/access-control';

type DayHours = { enabled: boolean; startTime: string; endTime: string };
type ScheduleTab = 'schedule' | 'appointments' | 'operations' | 'leave' | 'availability';
type EventKind = 'opd' | 'followup' | 'operation' | 'leave' | 'completed';

const EVENT_COLORS: Record<EventKind, { bg: string; border: string; text: string }> = {
  opd: { bg: '#16a34a', border: '#15803d', text: '#ffffff' },
  followup: { bg: '#7c3aed', border: '#6d28d9', text: '#ffffff' },
  operation: { bg: '#2563eb', border: '#1d4ed8', text: '#ffffff' },
  leave: { bg: '#ea580c', border: '#c2410c', text: '#ffffff' },
  completed: { bg: '#94a3b8', border: '#64748b', text: '#ffffff' },
};

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FullCalendarModule],
  selector: 'app-doctors-schedule',
  templateUrl: './doctors-schedule.component.html',
  styleUrls: ['./doctors-schedule.component.scss'],
})
export class DoctorsScheduleComponent implements OnInit {
  readonly weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  readonly slotDurationOptions = [5, 10, 15, 20, 30];

  doctors: Doctor[] = [];
  selectedDoctorId = '';
  selectedDoctor: Doctor | null = null;
  ownDoctor: Doctor | null = null;

  appointments: Appointment[] = [];
  operations: OperationSchedule[] = [];
  calendarEvents: EventInput[] = [];

  loading = false;
  calendarLoading = false;
  saving = false;

  activeTab: ScheduleTab = 'schedule';
  showHoursPanel = false;
  showLeavePanel = false;

  filters = {
    opd: true,
    followup: true,
    operations: true,
    leave: true,
  };

  dayHours: Record<string, DayHours> = DoctorsScheduleComponent.defaultDayHours();
  unavailableDates: string[] = [];
  leaveDate = '';
  slotDurationMinutes = 15;

  rangeFrom = '';
  rangeTo = '';

  @ViewChild('calendar') calendar?: { getApi: () => Calendar };

  calendarOptions: CalendarOptions = {
    initialView: 'dayGridMonth',
    height: 'auto',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    buttonText: {
      today: 'Today',
      month: 'Month',
      week: 'Week',
      day: 'Day',
    },
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    events: [],
    editable: false,
    selectable: false,
    dayMaxEvents: 4,
    displayEventTime: true,
    eventDisplay: 'block',
    eventTextColor: '#ffffff',
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      meridiem: false,
      hour12: false,
    },
    datesSet: (arg) => this.onDatesSet(arg),
    eventClick: (arg) => this.onEventClick(arg),
  };

  constructor(
    private backend: BackendService,
    private authService: AuthService,
    private toastr: ToastrService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadSchedule();
  }

  get currentUser(): User | null {
    return (this.authService.currentUser() as User | null) || null;
  }

  get isDoctorUser(): boolean {
    return isDoctorRole(this.currentUser?.role?.name || localStorage.getItem('role') || '');
  }

  get canReadDirectory(): boolean {
    return this.backend.hasPermission('doctors.read');
  }

  get canManageAllSchedules(): boolean {
    return this.backend.hasPermission('doctors.update');
  }

  get canPickDoctor(): boolean {
    return this.canReadDirectory && this.doctors.length > 1;
  }

  get canEditSelected(): boolean {
    if (!this.selectedDoctor) return false;
    if (this.canManageAllSchedules) return true;
    return this.isOwnDoctor(this.selectedDoctor);
  }

  get canReadOperations(): boolean {
    return (
      this.backend.hasPermission('operations.read') ||
      this.backend.hasPermission('operations.read_all') ||
      this.backend.hasPermission('ward.admissions.recommend') ||
      this.backend.hasPermission('*') ||
      this.isDoctorUser
    );
  }

  get doctorDisplayName(): string {
    const doctor = this.selectedDoctor;
    if (!doctor) return 'Doctor';
    const name = doctor.user?.name || doctor.specialization || 'Doctor';
    return this.isOwnDoctor(doctor) ? `${name} (Me)` : name;
  }

  get kpis(): { appointmentsToday: number; operationsToday: number; upcomingWeek: number; leaveDays: number } {
    const today = this.toYmd(new Date());
    const weekEnd = this.toYmd(this.addDays(new Date(), 7));

    const appointmentsToday = this.appointments.filter((item) => this.appointmentDay(item) === today).length;
    const operationsToday = this.operations.filter((item) => this.operationDay(item) === today).length;
    const upcomingAppointments = this.appointments.filter((item) => {
      const day = this.appointmentDay(item);
      return day >= today && day <= weekEnd;
    }).length;
    const upcomingOperations = this.operations.filter((item) => {
      const day = this.operationDay(item);
      return day >= today && day <= weekEnd;
    }).length;

    return {
      appointmentsToday,
      operationsToday,
      upcomingWeek: upcomingAppointments + upcomingOperations,
      leaveDays: this.unavailableDates.filter((day) => day >= today).length,
    };
  }

  loadSchedule(): void {
    this.loading = true;
    if (this.canReadDirectory) {
      this.backend
        .getDoctors({ limit: 100 })
        .pipe(finalize(() => (this.loading = false)))
        .subscribe({
          next: (result) => {
            this.doctors = result.items;
            this.selectInitialDoctor();
          },
          error: (err) => {
            this.toastr.error(err?.error?.message || 'Unable to load doctors');
            this.loadOwnDoctor();
          },
        });
      return;
    }
    this.loadOwnDoctor();
  }

  onDoctorChange(): void {
    this.selectedDoctor = this.doctors.find((item) => item._id === this.selectedDoctorId) || null;
    this.applyDoctorToEditor(this.selectedDoctor);
    this.reloadCalendarRange();
  }

  setTab(tab: ScheduleTab): void {
    this.activeTab = tab;
    if (tab === 'appointments') {
      this.filters = { opd: true, followup: true, operations: false, leave: false };
    } else if (tab === 'operations') {
      this.filters = { opd: false, followup: false, operations: true, leave: false };
    } else if (tab === 'leave') {
      this.filters = { opd: false, followup: false, operations: false, leave: true };
      this.showLeavePanel = true;
    } else if (tab === 'availability') {
      this.showHoursPanel = true;
    } else {
      this.filters = { opd: true, followup: true, operations: true, leave: true };
    }
    this.applyFiltersToCalendar();
  }

  toggleFilter(key: keyof typeof this.filters): void {
    this.filters[key] = !this.filters[key];
    this.applyFiltersToCalendar();
  }

  openHoursPanel(): void {
    this.showHoursPanel = true;
    this.activeTab = 'availability';
  }

  openLeavePanel(): void {
    this.showLeavePanel = true;
    this.activeTab = 'leave';
  }

  days(doctor: Doctor | null): string {
    const days = doctor?.availableDays || [];
    return days.length ? days.map((day) => this.titleCase(day)).join(', ') : 'Not configured';
  }

  slots(doctor: Doctor | null): string {
    const slots = doctor?.availableSlots || [];
    if (!slots.length) return 'No weekly slots';
    return slots
      .map((slot) => `${this.titleCase(slot.day || '')} ${slot.startTime || ''}-${slot.endTime || ''}`.trim())
      .join(' · ');
  }

  saveSchedule(): void {
    if (!this.canEditSelected || !this.selectedDoctor) return;

    const availableDays = this.weekDays.filter((day) => this.dayHours[day]?.enabled);
    const availableSlots = availableDays.map((day) => ({
      day,
      startTime: this.dayHours[day].startTime,
      endTime: this.dayHours[day].endTime,
    }));
    const invalid = availableSlots.find((slot) => !slot.startTime || !slot.endTime || slot.startTime >= slot.endTime);
    if (invalid) {
      this.toastr.error(`End time must be after start time on ${this.titleCase(invalid.day)}.`);
      return;
    }

    const payload = {
      availableDays,
      availableSlots,
      unavailableDates: this.unavailableDates,
      slotDurationMinutes: this.slotDurationMinutes,
    };

    this.saving = true;
    const request$ =
      this.isOwnDoctor(this.selectedDoctor) && !this.canManageAllSchedules
        ? this.backend.updateMyDoctorSchedule(payload)
        : this.backend.updateDoctor(this.selectedDoctor._id, payload);

    request$.pipe(finalize(() => (this.saving = false))).subscribe({
      next: (response) => {
        const doctor = response.data;
        if (doctor) this.replaceDoctor(doctor);
        this.toastr.success(response.message || 'Schedule saved.');
        this.reloadCalendarRange();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to save schedule'),
    });
  }

  addLeaveDate(): void {
    const ymd = String(this.leaveDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      this.toastr.error('Select a date to mark unavailable.');
      return;
    }
    if (!this.unavailableDates.includes(ymd)) {
      this.unavailableDates = [...this.unavailableDates, ymd].sort();
    }
    this.leaveDate = '';
    this.applyFiltersToCalendar();
  }

  removeLeaveDate(ymd: string): void {
    this.unavailableDates = this.unavailableDates.filter((item) => item !== ymd);
    this.applyFiltersToCalendar();
  }

  private onDatesSet(arg: DatesSetArg): void {
    this.rangeFrom = arg.startStr.slice(0, 10);
    this.rangeTo = arg.endStr.slice(0, 10);
    this.reloadCalendarRange();
  }

  private onEventClick(arg: EventClickArg): void {
    arg.jsEvent.preventDefault();
    const props = arg.event.extendedProps || {};
    const kind = String(props['kind'] || '');

    if (kind === 'leave') {
      return;
    }

    if (kind === 'operation') {
      const operationId = String(props['operationId'] || arg.event.id || '').replace(/^op-/, '');
      if (!operationId) return;
      this.navigateToOperation(operationId);
      return;
    }

    if (kind === 'opd' || kind === 'followup') {
      const appointmentId = String(props['appointmentId'] || arg.event.id || '').replace(/^appt-/, '');
      if (!appointmentId) return;
      this.navigateToAppointment(appointmentId);
    }
  }

  openOperation(operation: OperationSchedule): void {
    if (!operation?._id) return;
    this.navigateToOperation(String(operation._id));
  }

  operationListLabel(operation: OperationSchedule): string {
    return this.operationPatientName(operation) || this.operationProcedureName(operation) || 'Operation';
  }

  private navigateToOperation(operationId: string): void {
    void this.router.navigate(['/operations'], {
      queryParams: { operationId },
    });
  }

  private navigateToAppointment(appointmentId: string): void {
    if (this.backend.hasPermission('prescriptions.read') || this.backend.hasPermission('prescriptions.create')) {
      void this.router.navigate(['/prescriptions'], {
        queryParams: { appointmentId },
      });
      return;
    }
    void this.router.navigate(['/appointments'], {
      queryParams: { appointmentId },
    });
  }

  private reloadCalendarRange(): void {
    if (!this.selectedDoctor) {
      this.appointments = [];
      this.operations = [];
      this.calendarEvents = [];
      this.patchCalendarEvents([]);
      return;
    }

    const from = this.rangeFrom || this.toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const to =
      this.rangeTo ||
      this.toYmd(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

    const doctorUserId = String(this.selectedDoctor.userId || this.selectedDoctor.user?._id || '').trim();
    const doctorProfileId = String(this.selectedDoctor._id || '').trim();

    this.calendarLoading = true;

    const appointments$ = this.backend.hasPermission('appointments.read')
      ? this.backend
          .getAppointmentCalendar({
            dateFrom: from,
            dateTo: to,
            doctorId: doctorUserId || undefined,
          })
          .pipe(catchError(() => of([] as Appointment[])))
      : of([] as Appointment[]);

    const operations$ = this.canReadOperations
      ? this.backend
          .getOperationScheduleCalendar({
            from: `${from}T00:00:00.000Z`,
            to: `${to}T23:59:59.999Z`,
            doctorId: doctorProfileId || doctorUserId || undefined,
          })
          .pipe(catchError(() => of([] as OperationSchedule[])))
      : of([] as OperationSchedule[]);

    forkJoin({ appointments: appointments$, operations: operations$ })
      .pipe(finalize(() => (this.calendarLoading = false)))
      .subscribe({
        next: ({ appointments, operations }) => {
          this.appointments = appointments || [];
          this.operations = (operations || []).map((item) => this.normalizeCalendarOperation(item));
          this.applyFiltersToCalendar();
        },
      });
  }

  private applyFiltersToCalendar(): void {
    const events: EventInput[] = [];

    if (this.filters.opd || this.filters.followup) {
      for (const appointment of this.appointments) {
        const kind = this.appointmentKind(appointment);
        if (kind === 'opd' && !this.filters.opd) continue;
        if (kind === 'followup' && !this.filters.followup) continue;
        events.push(this.appointmentToEvent(appointment, kind));
      }
    }

    if (this.filters.operations) {
      for (const operation of this.operations) {
        events.push(this.operationToEvent(operation));
      }
    }

    if (this.filters.leave) {
      for (const day of this.unavailableDates) {
        if (this.rangeFrom && day < this.rangeFrom) continue;
        if (this.rangeTo && day > this.rangeTo) continue;
        events.push(this.leaveToEvent(day));
      }
    }

    this.calendarEvents = events;
    this.patchCalendarEvents(events);
  }

  private patchCalendarEvents(events: EventInput[]): void {
    this.calendarOptions = {
      ...this.calendarOptions,
      events,
    };
  }

  private appointmentKind(appointment: Appointment): 'opd' | 'followup' {
    const visit = String(appointment.visitType || '').toLowerCase();
    if (visit.includes('follow')) return 'followup';
    return 'opd';
  }

  private appointmentPatientName(appointment: Appointment): string {
    const patient = appointment.patient;
    if (!patient) return 'Patient';
    const name = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
    return name || patient.patientNo || 'Patient';
  }

  private isAppointmentCompleted(appointment: Appointment): boolean {
    return String(appointment.status || '').toLowerCase() === 'completed';
  }

  private appointmentToEvent(appointment: Appointment, kind: 'opd' | 'followup'): EventInput {
    const day = this.appointmentDay(appointment);
    const patientName = this.appointmentPatientName(appointment);
    const startTime = String(appointment.startTime || '').slice(0, 5);
    const endTime = String(appointment.endTime || '').slice(0, 5);
    const completed = this.isAppointmentCompleted(appointment);
    const colors = completed ? EVENT_COLORS.completed : EVENT_COLORS[kind];

    return {
      id: `appt-${appointment._id}`,
      title: patientName,
      start: startTime ? `${day}T${startTime}:00` : day,
      end: endTime ? `${day}T${endTime}:00` : undefined,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      classNames: completed ? ['evt-completed', `evt-${kind}`, 'is-clickable'] : [`evt-${kind}`, 'is-clickable'],
      extendedProps: {
        kind,
        completed,
        appointmentId: appointment._id,
        status: appointment.status,
      },
    };
  }

  private operationToEvent(operation: OperationSchedule): EventInput {
    const completed = String(operation.status || '').toLowerCase() === 'completed';
    const colors = completed ? EVENT_COLORS.completed : EVENT_COLORS.operation;
    const patientName = this.operationPatientName(operation);
    const procedureName = this.operationProcedureName(operation);
    const start = operation.scheduledStart || undefined;
    const end = operation.scheduledEnd || undefined;
    const title = patientName || procedureName || 'Operation';
    const day = this.operationDay(operation) || this.toYmd(new Date());

    return {
      id: `op-${operation._id}`,
      title,
      start: start || day,
      end: end || undefined,
      allDay: !start,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      classNames: completed ? ['evt-completed', 'evt-operation', 'is-clickable'] : ['evt-operation', 'is-clickable'],
      extendedProps: { kind: 'operation', completed, operationId: operation._id, status: operation.status },
    };
  }

  private leaveToEvent(day: string): EventInput {
    const colors = EVENT_COLORS.leave;
    return {
      id: `leave-${day}`,
      title: 'Leave',
      start: day,
      allDay: true,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      classNames: ['evt-leave'],
      extendedProps: { kind: 'leave' },
    };
  }

  private normalizeCalendarOperation(item: OperationSchedule | Record<string, unknown>): OperationSchedule {
    const raw = item as Record<string, unknown>;
    const id = String(raw['_id'] || raw['id'] || '').trim();
    const scheduledStart = (raw['scheduledStart'] || raw['start'] || null) as string | null;
    const scheduledEnd = (raw['scheduledEnd'] || raw['end'] || null) as string | null;
    const patientName = String(raw['patientName'] || '').trim();
    const snapshot =
      (raw['treatmentPricingSnapshot'] as OperationSchedule['treatmentPricingSnapshot']) ||
      ({
        name: this.cleanProcedureLabel(String(raw['title'] || '')),
      } as OperationSchedule['treatmentPricingSnapshot']);

    if (!id && !scheduledStart && !raw['operationNo']) {
      return item as OperationSchedule;
    }

    let patient = raw['patient'] as OperationSchedule['patient'];
    if (!patient && patientName) {
      const parts = patientName.split(/\s+/);
      patient = {
        firstName: parts[0] || patientName,
        lastName: parts.slice(1).join(' '),
      } as OperationSchedule['patient'];
    }

    return {
      ...(item as OperationSchedule),
      _id: id,
      scheduledStart,
      scheduledEnd,
      operationNo: String(raw['operationNo'] || ''),
      status: (raw['status'] as OperationSchedule['status']) || 'scheduled',
      treatmentPricingSnapshot: {
        ...(snapshot || {}),
        name: this.cleanProcedureLabel(String(snapshot?.name || raw['title'] || '')),
      },
      patientId: (raw['patientId'] as OperationSchedule['patientId']) || '',
      patient,
    };
  }

  private cleanProcedureLabel(value: string): string {
    const label = String(value || '').trim();
    if (!label) return '';
    // Avoid showing technical operation numbers as the calendar title.
    if (/^OP[-_]?\d/i.test(label) || /^OP-\d{8}-\d+/i.test(label)) {
      return '';
    }
    return label;
  }

  private appointmentDay(appointment: Appointment): string {
    return toCalendarYmd(appointment.appointmentDate) || String(appointment.appointmentDate || '').slice(0, 10);
  }

  private operationDay(operation: OperationSchedule): string {
    if (!operation.scheduledStart) return '';
    return toCalendarYmd(operation.scheduledStart) || String(operation.scheduledStart).slice(0, 10);
  }

  private operationPatientName(operation: OperationSchedule): string {
    const patient = operation.patient;
    if (patient && typeof patient === 'object') {
      return `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
    }
    return '';
  }

  private operationProcedureName(operation: OperationSchedule): string {
    return this.cleanProcedureLabel(String(operation.treatmentPricingSnapshot?.name || ''));
  }

  private loadOwnDoctor(): void {
    this.backend
      .getMyDoctorProfile()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (doctor) => {
          this.ownDoctor = doctor;
          this.doctors = [doctor];
          this.selectedDoctorId = doctor._id;
          this.onDoctorChange();
        },
        error: (err) => {
          this.toastr.error(err?.error?.message || 'Unable to load your schedule');
        },
      });
  }

  private selectInitialDoctor(): void {
    const currentUserId = String(this.currentUser?._id || '');
    const own =
      this.doctors.find((doctor) => String(doctor.userId) === currentUserId) ||
      this.ownDoctor ||
      this.doctors[0] ||
      null;
    this.ownDoctor = this.doctors.find((doctor) => String(doctor.userId) === currentUserId) || this.ownDoctor;
    this.selectedDoctorId = own?._id || '';
    this.onDoctorChange();
  }

  private applyDoctorToEditor(doctor: Doctor | null): void {
    this.resetDayHours();
    this.slotDurationMinutes = Number(doctor?.slotDurationMinutes || 15);
    this.unavailableDates = (doctor?.unavailableDates || [])
      .map((item) => String(item || '').slice(0, 10))
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));

    if (!doctor) return;

    const selectedDays = new Set((doctor.availableDays || []).map((day) => String(day).toLowerCase()));
    (doctor.availableSlots || []).forEach((slot) => {
      const day = String(slot.day || '').toLowerCase();
      if (!this.dayHours[day]) return;
      this.dayHours[day] = {
        enabled: true,
        startTime: slot.startTime || '09:00',
        endTime: slot.endTime || '17:00',
      };
      selectedDays.add(day);
    });
    selectedDays.forEach((day) => {
      if (!this.dayHours[day]) return;
      this.dayHours[day] = { ...this.dayHours[day], enabled: true };
    });
  }

  private resetDayHours(): void {
    this.dayHours = DoctorsScheduleComponent.defaultDayHours();
  }

  private static defaultDayHours(): Record<string, DayHours> {
    return {
      monday: { enabled: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { enabled: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { enabled: false, startTime: '09:00', endTime: '17:00' },
      thursday: { enabled: false, startTime: '09:00', endTime: '17:00' },
      friday: { enabled: false, startTime: '09:00', endTime: '17:00' },
      saturday: { enabled: false, startTime: '09:00', endTime: '17:00' },
      sunday: { enabled: false, startTime: '09:00', endTime: '17:00' },
    };
  }

  private replaceDoctor(doctor: Doctor): void {
    this.doctors = this.doctors.map((item) => (item._id === doctor._id ? doctor : item));
    if (!this.doctors.some((item) => item._id === doctor._id)) {
      this.doctors = [...this.doctors, doctor];
    }
    this.selectedDoctor = doctor;
    this.selectedDoctorId = doctor._id;
    if (this.isOwnDoctor(doctor)) this.ownDoctor = doctor;
    this.applyDoctorToEditor(doctor);
  }

  isOwnDoctor(doctor: Doctor | null): boolean {
    if (!doctor) return false;
    return String(doctor.userId) === String(this.currentUser?._id || '');
  }

  private titleCase(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }

  private toYmd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
}
