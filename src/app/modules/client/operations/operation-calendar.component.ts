import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

@Component({
  selector: 'app-operation-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './operation-calendar.component.html',
  styleUrl: './operation-calendar.component.scss',
})
export class OperationCalendarComponent implements OnInit {
  viewMode: 'calendar' | 'list' | 'needs' = 'list';
  loading = false;
  items: OperationSchedule[] = [];
  needsScheduling: OperationSchedule[] = [];
  departments: Department[] = [];
  doctors: Doctor[] = [];
  treatments: TreatmentCatalogItem[] = [];
  selected: OperationSchedule | null = null;
  departmentFilter = '';
  doctorFilter = '';
  statusFilter = '';
  search = '';
  selectedDate = new Date().toISOString().slice(0, 10);

  kpis = {
    today: 0,
    upcoming: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
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

  constructor(
    private backend: BackendService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadLookups();
    this.refresh();
  }

  can(permission: string): boolean {
    return this.backend.hasPermission(permission);
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
    const from = `${this.selectedDate}T00:00:00.000Z`;
    const to = `${this.selectedDate}T23:59:59.999Z`;

    this.backend
      .getOperationScheduleKpis({ from, to })
      .subscribe({
        next: (kpis) => {
          this.kpis = {
            today: Number(kpis['today'] || 0),
            upcoming: Number(kpis['upcoming'] || 0),
            pending: Number(kpis['pending'] || kpis['pendingScheduling'] || 0),
            inProgress: Number(kpis['inProgress'] || 0),
            completed: Number(kpis['completed'] || 0),
          };
        },
        error: () => undefined,
      });

    const params: Record<string, unknown> = {
      limit: 100,
      search: this.search.trim() || undefined,
      departmentId: this.departmentFilter || undefined,
      doctorId: this.doctorFilter || undefined,
      status: this.statusFilter || undefined,
      from,
      to,
    };

    this.backend
      .getOperationSchedules(params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => {
          this.items = result.items || [];
          this.needsScheduling = this.items.filter((item) => item.status === 'requested');
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to load operations.'),
      });
  }

  setView(mode: 'calendar' | 'list' | 'needs'): void {
    this.viewMode = mode;
  }

  openDetails(item: OperationSchedule): void {
    this.selected = item;
  }

  closeDetails(): void {
    this.selected = null;
  }

  patientName(item: OperationSchedule): string {
    const patient = typeof item.patientId === 'object' ? item.patientId : item.patient;
    if (!patient) return '—';
    return `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '—';
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
    const doctor =
      typeof item.assignedOperatingDoctorId === 'object'
        ? item.assignedOperatingDoctorId
        : item.assignedOperatingDoctor;
    return doctor?.user?.name || '—';
  }

  departmentName(item: OperationSchedule): string {
    const dept = typeof item.departmentId === 'object' ? item.departmentId : null;
    return dept?.name || '—';
  }

  statusLabel(status?: string): string {
    return String(status || '').replace(/_/g, ' ');
  }

  updateStatus(item: OperationSchedule, status: string): void {
    this.backend.updateOperationScheduleStatus(item._id, status).subscribe({
      next: () => {
        this.toastr.success('Operation status updated.');
        this.refresh();
        this.closeDetails();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to update status.'),
    });
  }

  complete(item: OperationSchedule): void {
    this.backend.completeOperationSchedule(item._id).subscribe({
      next: () => {
        this.toastr.success('Operation completed and charge posted.');
        this.refresh();
        this.closeDetails();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to complete operation.'),
    });
  }

  cancel(item: OperationSchedule): void {
    this.backend.cancelOperationSchedule(item._id, {}).subscribe({
      next: () => {
        this.toastr.success('Operation cancelled.');
        this.refresh();
        this.closeDetails();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to cancel operation.'),
    });
  }
}
