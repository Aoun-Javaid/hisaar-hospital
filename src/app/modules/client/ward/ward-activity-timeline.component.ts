import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BackendService } from '../../../core/services/backend.service';
import { WardActionModalComponent } from './ward-action-modal.component';

export type TimelineStatusKey = 'all' | 'due' | 'completed' | 'critical' | 'in_progress' | 'pending_review';

export interface TimelineActivity {
  id: string;
  type: string;
  typeLabel: string;
  typeIcon: string;
  activity: string;
  details: string;
  source: string;
  status: string;
  statusKey: TimelineStatusKey | string;
  priority: string;
  timestamp: string;
  actionRoute?: string;
}

interface TimelineGroup {
  key: string;
  label: string;
  count: number;
  items: TimelineActivity[];
}

@Component({
  selector: 'app-ward-activity-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule, WardActionModalComponent],
  templateUrl: './ward-activity-timeline.component.html',
  styleUrl: './ward-activity-timeline.component.scss',
})
export class WardActivityTimelineComponent implements OnChanges {
  @Input() admissionId = '';
  @Input() patientId = '';
  @Input() patientName = '';

  loading = false;
  addOpen = false;
  search = '';
  typeFilter = 'all';
  statusFilter = 'all';
  quickFilter: TimelineStatusKey = 'all';
  dateFrom = '';
  dateTo = '';
  activities: TimelineActivity[] = [];

  readonly typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'nursing', label: 'Nursing Note' },
    { value: 'mar', label: 'Medicine / MAR' },
    { value: 'vitals', label: 'Vitals' },
    { value: 'iv', label: 'IV / Drip' },
    { value: 'lab', label: 'Lab Test' },
    { value: 'imaging', label: 'Imaging' },
    { value: 'io', label: 'I/O' },
    { value: 'handover', label: 'Handover' },
    { value: 'pharmacy', label: 'Pharmacy' },
    { value: 'procedure', label: 'Procedure' },
  ];

  readonly statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'due', label: 'Due' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending_review', label: 'Pending Review' },
    { value: 'critical', label: 'Critical' },
  ];

  readonly quickFilters: Array<{ key: TimelineStatusKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'due', label: 'Due' },
    { key: 'completed', label: 'Completed' },
    { key: 'critical', label: 'Critical' },
  ];

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
    private router: Router
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['admissionId']?.currentValue) {
      this.initDateRange();
      this.load();
    }
  }

  get totalCount(): number {
    return this.activities.length;
  }

  get dueCount(): number {
    return this.activities.filter((item) => item.statusKey === 'due' || item.statusKey === 'pending').length;
  }

  get completedCount(): number {
    return this.activities.filter((item) => item.statusKey === 'completed').length;
  }

  get pendingReviewCount(): number {
    return this.activities.filter((item) => item.statusKey === 'pending_review').length;
  }

  get filteredActivities(): TimelineActivity[] {
    const q = this.search.trim().toLowerCase();
    const from = this.dateFrom ? new Date(`${this.dateFrom}T00:00:00`) : null;
    const to = this.dateTo ? new Date(`${this.dateTo}T23:59:59`) : null;

    return this.activities.filter((item) => {
      if (this.typeFilter !== 'all' && item.type !== this.typeFilter) return false;
      if (this.statusFilter !== 'all' && item.statusKey !== this.statusFilter) return false;
      if (this.quickFilter === 'due' && item.statusKey !== 'due' && item.statusKey !== 'pending') return false;
      if (this.quickFilter === 'completed' && item.statusKey !== 'completed') return false;
      if (this.quickFilter === 'critical' && item.statusKey !== 'critical' && item.priority !== 'critical') return false;
      if (q) {
        const hay = `${item.activity} ${item.details} ${item.source} ${item.typeLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (from || to) {
        const ts = new Date(item.timestamp).getTime();
        if (from && ts < from.getTime()) return false;
        if (to && ts > to.getTime()) return false;
      }
      return true;
    });
  }

  get groupedActivities(): TimelineGroup[] {
    const groups = new Map<string, TimelineGroup>();
    for (const item of this.filteredActivities) {
      const key = this.dayKey(item.timestamp);
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
        existing.count += 1;
      } else {
        groups.set(key, {
          key,
          label: this.dayLabel(item.timestamp),
          count: 1,
          items: [item],
        });
      }
    }
    return Array.from(groups.values());
  }

  get dateRangeLabel(): string {
    if (!this.dateFrom && !this.dateTo) return 'All dates';
    const from = this.dateFrom ? this.formatShortDate(this.dateFrom) : '…';
    const to = this.dateTo ? this.formatShortDate(this.dateTo) : '…';
    return `${from} - ${to}`;
  }

  get addPreset(): Record<string, string | number> {
    return {
      admissionId: this.admissionId,
      patientId: this.patientId,
      noteType: 'progress',
      priority: 'normal',
      shift: 'day',
    };
  }

  load(): void {
    if (!this.admissionId) return;
    this.loading = true;

    forkJoin({
      updates: this.backend.getPatientUpdates(this.admissionId).pipe(
        catchError(() => of({ items: [] as Record<string, unknown>[] }))
      ),
      activities: this.backend.getWardActivities({ admissionId: this.admissionId, limit: 200 }).pipe(
        catchError(() => of({ items: [] as Record<string, unknown>[], pagination: { page: 1, limit: 200, total: 0, pages: 0 } }))
      ),
    }).subscribe({
      next: ({ updates, activities }) => {
        const mapped = new Map<string, TimelineActivity>();

        for (const raw of activities.items || []) {
          const item = this.mapWardActivity(raw);
          mapped.set(item.id, item);
        }

        for (const raw of updates.items || []) {
          const item = this.mapUpdate(raw);
          if (!mapped.has(item.id)) {
            mapped.set(item.id, item);
          } else {
            const existing = mapped.get(item.id)!;
            if (!existing.source && item.source) existing.source = item.source;
            if (!existing.details && item.details) existing.details = item.details;
          }
        }

        this.activities = Array.from(mapped.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.activities = [];
        this.toastr.error('Unable to load patient activity timeline');
      },
    });
  }

  openAdd(): void {
    this.addOpen = true;
  }

  onActivitySaved(): void {
    this.addOpen = false;
    this.load();
  }

  setQuickFilter(key: TimelineStatusKey): void {
    this.quickFilter = key;
  }

  viewItem(item: TimelineActivity): void {
    if (item.actionRoute) {
      void this.router.navigateByUrl(item.actionRoute);
    }
  }

  statusClass(statusKey: string): string {
    switch (statusKey) {
      case 'completed':
        return 'tl-status tl-status--completed';
      case 'due':
      case 'pending':
        return 'tl-status tl-status--due';
      case 'in_progress':
        return 'tl-status tl-status--progress';
      case 'critical':
        return 'tl-status tl-status--critical';
      case 'pending_review':
        return 'tl-status tl-status--review';
      default:
        return 'tl-status';
    }
  }

  statusIcon(statusKey: string): string {
    switch (statusKey) {
      case 'completed':
        return 'fa-check';
      case 'due':
      case 'pending':
        return 'fa-clock-o';
      case 'in_progress':
        return 'fa-refresh';
      case 'critical':
        return 'fa-exclamation';
      default:
        return 'fa-circle-o';
    }
  }

  private initDateRange(): void {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 2);
    this.dateTo = this.toInputDate(to);
    this.dateFrom = this.toInputDate(from);
  }

  private toInputDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatShortDate(value: string): string {
    const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private dayKey(value: string): string {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private dayLabel(value: string): string {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const formatted = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (sameDay(date, today)) return `Today ${formatted}`;
    if (sameDay(date, yesterday)) return `Yesterday ${formatted}`;
    return formatted;
  }

  private mapWardActivity(raw: Record<string, unknown>): TimelineActivity {
    const activityType = String(raw['activityType'] || 'nursing_task');
    const meta = (raw['metadata'] as Record<string, unknown>) || {};
    const typeInfo = this.typeFromActivity(activityType, meta);
    const statusRaw = String(raw['status'] || 'pending');
    const priority = String(raw['priority'] || meta['priority'] || 'normal').toLowerCase();
    const createdBy = raw['createdBy'];
    const createdByName =
      String(raw['createdByName'] || '') ||
      (createdBy && typeof createdBy === 'object'
        ? String((createdBy as Record<string, unknown>)['name'] || '')
        : '');

    return {
      id: String(raw['_id'] || ''),
      type: typeInfo.type,
      typeLabel: typeInfo.label,
      typeIcon: typeInfo.icon,
      activity: String(raw['title'] || typeInfo.label),
      details: String(raw['description'] || meta['details'] || meta['fluidName'] || meta['medicineName'] || ''),
      source: createdByName || String(meta['nurseName'] || meta['doctorName'] || 'Nursing Staff'),
      status: this.statusLabel(statusRaw, priority),
      statusKey: this.statusKey(statusRaw, priority),
      priority,
      timestamp: String(raw['completedAt'] || raw['scheduledAt'] || raw['createdAt'] || new Date().toISOString()),
      actionRoute: this.admissionId ? `/ward/patient-detail/${this.admissionId}?tab=nursing` : undefined,
    };
  }

  private mapUpdate(raw: Record<string, unknown>): TimelineActivity {
    const typeRaw = String(raw['type'] || 'activity');
    const typeInfo = this.typeFromUpdate(typeRaw, String(raw['title'] || ''));
    const statusRaw = String(raw['status'] || 'pending');
    const priority = /critical|stat/i.test(statusRaw) ? 'critical' : 'normal';

    return {
      id: String(raw['id'] || ''),
      type: typeInfo.type,
      typeLabel: typeInfo.label,
      typeIcon: typeInfo.icon,
      activity: String(raw['title'] || typeInfo.label),
      details: String(raw['description'] || ''),
      source: String(raw['recommendedBy'] || raw['performedBy'] || 'Staff'),
      status: this.statusLabel(statusRaw, priority),
      statusKey: this.statusKey(statusRaw, priority),
      priority,
      timestamp: String(raw['timestamp'] || new Date().toISOString()),
      actionRoute: String(raw['actionRoute'] || '') || undefined,
    };
  }

  private typeFromActivity(activityType: string, meta: Record<string, unknown>): { type: string; label: string; icon: string } {
    if (activityType === 'mar_dose') return { type: 'mar', label: 'Medicine / MAR', icon: 'fa-medkit' };
    if (activityType === 'io_entry') return { type: 'io', label: 'I/O', icon: 'fa-bar-chart' };
    if (activityType === 'handover') return { type: 'handover', label: 'Handover', icon: 'fa-exchange' };
    if (activityType === 'care_plan' || activityType === 'nursing_task') {
      return { type: 'nursing', label: 'Nursing Note', icon: 'fa-sticky-note-o' };
    }
    if (String(meta['orderType'] || '') === 'lab') return { type: 'lab', label: 'Lab Test', icon: 'fa-flask' };
    if (String(meta['orderType'] || '') === 'imaging') return { type: 'imaging', label: 'Imaging', icon: 'fa-picture-o' };
    if (/drip|iv/i.test(String(meta['fluidName'] || meta['action'] || ''))) {
      return { type: 'iv', label: 'IV / Drip', icon: 'fa-tint' };
    }
    return { type: 'nursing', label: 'Activity', icon: 'fa-circle-o' };
  }

  private typeFromUpdate(type: string, title: string): { type: string; label: string; icon: string } {
    const value = type.toLowerCase();
    if (value === 'mar' || value === 'pharmacy') return { type: value === 'pharmacy' ? 'pharmacy' : 'mar', label: value === 'pharmacy' ? 'Pharmacy' : 'Medicine / MAR', icon: 'fa-medkit' };
    if (value === 'lab') return { type: 'lab', label: 'Lab Test', icon: 'fa-flask' };
    if (value === 'imaging' || /x-ray|imaging|ultrasound|ct|mri/i.test(title)) {
      return { type: 'imaging', label: 'Imaging', icon: 'fa-picture-o' };
    }
    if (/drip|iv/i.test(title)) return { type: 'iv', label: 'IV / Drip', icon: 'fa-tint' };
    if (/vital/i.test(title)) return { type: 'vitals', label: 'Vitals', icon: 'fa-heartbeat' };
    if (/procedure/i.test(title)) return { type: 'procedure', label: 'Procedure', icon: 'fa-scissors' };
    if (/handover/i.test(title)) return { type: 'handover', label: 'Handover', icon: 'fa-exchange' };
    return { type: 'nursing', label: 'Nursing Note', icon: 'fa-sticky-note-o' };
  }

  private statusKey(status: string, priority: string): string {
    const value = status.toLowerCase();
    if (priority === 'critical' || value === 'critical' || value === 'stat') return 'critical';
    if (['completed', 'given', 'verified', 'issued', 'done'].includes(value)) return 'completed';
    if (['in_progress', 'in progress', 'running', 'partially_issued'].includes(value)) return 'in_progress';
    if (['pending_review', 'review', 'acknowledged'].includes(value)) return 'pending_review';
    if (['due', 'pending', 'requested', 'scheduled'].includes(value)) return 'due';
    return value || 'due';
  }

  private statusLabel(status: string, priority: string): string {
    const key = this.statusKey(status, priority);
    switch (key) {
      case 'completed':
        return 'Completed';
      case 'due':
        return 'Due';
      case 'in_progress':
        return 'In Progress';
      case 'critical':
        return 'Critical';
      case 'pending_review':
        return 'Pending Review';
      default:
        return status || 'Due';
    }
  }
}
