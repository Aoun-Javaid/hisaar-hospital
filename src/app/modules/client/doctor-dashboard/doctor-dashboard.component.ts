import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApexChart, ApexDataLabels, ApexLegend, ApexNonAxisChartSeries, ApexPlotOptions, ApexStroke, ApexXAxis } from 'ng-apexcharts';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BackendService } from '../../../core/services/backend.service';
import {
  Appointment,
  DashboardStatusBreakdown,
  DashboardSummary,
  OperationSchedule,
  Patient,
} from '../../../shared/models/hospital.model';
import { isDoctorRole } from '../../auth/access-control';

type DonutChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  legend: ApexLegend;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  plotOptions: ApexPlotOptions;
};

type BarChartOptions = {
  series: Array<{ name: string; data: number[] }>;
  chart: ApexChart;
  xaxis: ApexXAxis;
  colors: string[];
  plotOptions: ApexPlotOptions;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
};

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NgApexchartsModule, CurrencyPipe],
  templateUrl: './doctor-dashboard.component.html',
  styleUrl: './doctor-dashboard.component.scss',
})
export class DoctorDashboardComponent implements OnInit {
  loading = false;
  readonly todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  canOpenClinicalRecords = false;
  canOpenPrescriptions = false;
  canOpenPatients = false;
  canOpenAppointments = false;
  canOpenOperations = false;
  operationKpis = {
    today: 0,
    upcoming: 0,
    pending: 0,
  };
  myOperations: OperationSchedule[] = [];

  summary: DashboardSummary = this.emptySummary();
  currentUserName = 'Doctor';

  statCards: Array<{ label: string; value: string | number; hint: string; icon: string; tone: string; isCurrency?: boolean }> = [];
  quickLinks: Array<{ label: string; route: string; icon: string; visible: boolean }> = [];

  appointmentDonut: DonutChartOptions = this.buildDonutChart(this.emptyBreakdown());
  workloadBar: BarChartOptions = this.buildWorkloadBar(this.emptyBreakdown());

  constructor(
    private backend: BackendService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.hydrateSession();
    this.initializePermissions();
    this.loadSummary();
    this.loadOperationsSnapshot();
  }

  get isDoctor(): boolean {
    return isDoctorRole(localStorage.getItem('role') || '');
  }

  greetingName(): string {
    return this.isDoctor ? `Dr. ${this.currentUserName}` : this.currentUserName;
  }

  loadSummary(): void {
    this.loading = true;

    this.backend
      .getDoctorDashboardSummary()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (summary) => {
          this.summary = summary;
          this.syncDashboardState();
        },
        error: (err) => {
          this.summary = this.emptySummary();
          this.syncDashboardState();
          this.toastr.error(err?.error?.message || 'Unable to load dashboard.');
        },
      });
  }

  private loadOperationsSnapshot(): void {
    if (!this.canOpenOperations) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    this.backend.getOperationScheduleKpis({ from: `${today}T00:00:00.000Z`, to: `${today}T23:59:59.999Z` }).subscribe({
      next: (kpis) => {
        this.operationKpis = {
          today: Number(kpis['today'] || 0),
          upcoming: Number(kpis['upcoming'] || 0),
          pending: Number(kpis['pending'] || kpis['pendingScheduling'] || 0),
        };
      },
      error: () => undefined,
    });

    this.backend.getOperationSchedules({ limit: 8, from: `${today}T00:00:00.000Z` }).subscribe({
      next: (result) => {
        this.myOperations = result.items || [];
      },
      error: () => {
        this.myOperations = [];
      },
    });
  }

  operationPatientName(item: OperationSchedule): string {
    const patient = typeof item.patientId === 'object' ? item.patientId : item.patient;
    return this.patientName(patient || null);
  }

  operationProcedureName(item: OperationSchedule): string {
    return (
      item.treatmentPricingSnapshot?.name ||
      (typeof item.treatmentCatalogId === 'object' ? item.treatmentCatalogId?.name : '') ||
      item.treatmentCatalog?.name ||
      '—'
    );
  }

  patientName(patient?: Patient | null): string {
    if (!patient) {
      return '-';
    }

    return `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '-';
  }

  appointmentPatientName(appointment: Appointment): string {
    return this.patientName(appointment.patient);
  }

  statusClass(status?: string): string {
    return `status-${String(status || 'pending').replace(/_/g, '-')}`;
  }

  statusLabel(status?: string): string {
    return String(status || 'pending').replace(/_/g, ' ');
  }

  private hydrateSession(): void {
    const currentUser = JSON.parse(localStorage.getItem('user') || 'null') as
      | { name?: string | null }
      | null;

    this.currentUserName =
      (currentUser?.name || 'Doctor').replace(/^dr\.?\s*/i, '').trim() || 'Doctor';
  }

  private initializePermissions(): void {
    this.canOpenClinicalRecords = this.backend.hasPermission('patients_history.read');
    this.canOpenPrescriptions =
      this.backend.hasPermission('prescriptions.read') ||
      this.backend.hasPermission('prescriptions.create');
    this.canOpenPatients = this.backend.hasPermission('patients.read');
    this.canOpenAppointments = this.backend.hasPermission('appointments.read');
    this.canOpenOperations =
      this.backend.hasPermission('operations.read') ||
      this.backend.hasPermission('operations.read_all') ||
      this.backend.hasPermission('*');

    this.quickLinks = [
      { label: 'Appointments', route: '/appointments', icon: 'fa-calendar', visible: this.canOpenAppointments },
      { label: 'Prescriptions', route: '/prescriptions', icon: 'fa-file-text-o', visible: this.canOpenPrescriptions },
      { label: 'Clinical Records', route: '/clinical-records', icon: 'fa-stethoscope', visible: this.canOpenClinicalRecords },
      { label: 'My Patients', route: '/patients/all-patients', icon: 'fa-users', visible: this.canOpenPatients },
      { label: 'Operation Calendar', route: '/operations', icon: 'fa-heartbeat', visible: this.canOpenOperations },
    ];
  }

  private syncDashboardState(): void {
    const breakdown = this.summary.todayAppointmentBreakdown || this.emptyBreakdown();

    this.statCards = [
      {
        label: 'My Patients',
        value: this.summary.totalPatients,
        hint: 'Assigned to you',
        icon: 'fa-user-md',
        tone: 'tone-blue',
      },
      {
        label: "Today's Appointments",
        value: this.summary.todayAppointments,
        hint: 'Scheduled today',
        icon: 'fa-calendar-check-o',
        tone: 'tone-teal',
      },
      {
        label: 'Confirmed Today',
        value: breakdown.confirmed,
        hint: 'Ready to see',
        icon: 'fa-check-circle',
        tone: 'tone-green',
      },
      {
        label: 'Pending Today',
        value: breakdown.pending,
        hint: 'Awaiting action',
        icon: 'fa-clock-o',
        tone: 'tone-amber',
      },
      {
        label: 'Completed Today',
        value: breakdown.completed,
        hint: 'Visits done',
        icon: 'fa-heartbeat',
        tone: 'tone-purple',
      },
      {
        label: "Today's Fee Collected",
        value: this.summary.todayFeesCollected || 0,
        hint: 'Paid consultations',
        icon: 'fa-money',
        tone: 'tone-navy',
        isCurrency: true,
      },
    ];

    this.appointmentDonut = this.buildDonutChart(breakdown);
    this.workloadBar = this.buildWorkloadBar(breakdown);
  }

  private buildDonutChart(breakdown: DashboardStatusBreakdown): DonutChartOptions {
    const series = [
      breakdown.pending,
      breakdown.confirmed,
      breakdown.completed,
      breakdown.cancelled,
      breakdown.noShow,
    ];

    return {
      series,
      chart: { type: 'donut', height: 320, fontFamily: 'inherit' },
      labels: ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'No Show'],
      colors: ['#f59e0b', '#019c9d', '#16a34a', '#ef4444', '#94a3b8'],
      legend: { position: 'bottom', fontSize: '12px' },
      dataLabels: { enabled: true },
      stroke: { width: 1 },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Today',
                formatter: () => String(series.reduce((sum, value) => sum + value, 0)),
              },
            },
          },
        },
      },
    };
  }

  private buildWorkloadBar(breakdown: DashboardStatusBreakdown): BarChartOptions {
    return {
      series: [{ name: 'Appointments', data: [breakdown.pending, breakdown.confirmed, breakdown.completed] }],
      chart: { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: 'inherit' },
      xaxis: { categories: ['Pending', 'Confirmed', 'Completed'] },
      colors: ['#003e86'],
      plotOptions: { bar: { borderRadius: 8, columnWidth: '48%' } },
      dataLabels: { enabled: false },
      stroke: { show: true, width: 2, colors: ['transparent'] },
    };
  }

  private emptyBreakdown(): DashboardStatusBreakdown {
    return { pending: 0, confirmed: 0, completed: 0, cancelled: 0, noShow: 0 };
  }

  private emptySummary(): DashboardSummary {
    return {
      totalPatients: 0,
      totalDoctors: 1,
      todayAppointments: 0,
      todayPendingAppointments: 0,
      todayConfirmedAppointments: 0,
      todayCompletedAppointments: 0,
      todayCancelledAppointments: 0,
      pendingAppointments: 0,
      completedAppointments: 0,
      totalRevenue: 0,
      todayRevenue: 0,
      todayFeesCollected: 0,
      todayPrescriptions: 0,
      totalPrescriptions: 0,
      appointmentBreakdown: this.emptyBreakdown(),
      todayAppointmentBreakdown: this.emptyBreakdown(),
      recentPatients: [],
      upcomingAppointments: [],
      todayAppointmentsList: [],
    };
  }
}
