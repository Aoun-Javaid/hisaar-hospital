import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { BackendService } from '../../../core/services/backend.service';
import { Category, Store } from '../../../shared/models/hospital.model';
import {
  BULK_MAX_ROWS,
  BULK_PRODUCT_UNITS,
  BULK_SAVE_CHUNK_SIZE,
  BULK_STRENGTH_UNITS,
  BulkBackendRowError,
  BulkFieldIssue,
  BulkIssueField,
  BulkMedicineDraft,
} from './bulk-product-import.types';
import {
  buildBulkCreatePayload,
  createEmptyBulkRow,
  downloadBulkMedicineSample,
  downloadBulkMedicineTemplate,
  parseBulkMedicineFile,
  summarizeBulkRows,
  validateBulkRows,
} from './bulk-product-import.util';

type BulkStep = 1 | 2 | 3;
type PreviewMode = 'sheet' | 'manual';
type RowFilter = 'all' | 'valid' | 'errors' | 'warnings';

const TUTORIAL_STORAGE = 'hms-bulk-medicines-tutorial-seen';
const TUTORIAL_STEPS: Array<{
  target: string;
  title: string;
  text: string;
  requiresRows?: boolean;
  place?: 'auto' | 'above' | 'below';
  maxSpotHeight?: number;
}> = [
  {
    target: 'bulk-page-title',
    title: 'Add Bulk Medicines',
    text: 'Add many medicines in one import. Nothing is saved until the final confirmation.',
    place: 'below',
  },
  {
    target: 'bulk-upload',
    title: 'Upload File',
    text: 'Upload an Excel or CSV file using the provided template.',
    place: 'below',
  },
  {
    target: 'bulk-template',
    title: 'Download Template',
    text: 'Download the correct column format before preparing your data.',
    place: 'below',
  },
  {
    target: 'bulk-preview-tabs',
    title: 'Spreadsheet Preview / Add Manually',
    text: 'Review uploaded medicines or add rows manually.',
    place: 'below',
  },
  {
    target: 'bulk-preview',
    title: 'Review medicines',
    text: 'Every medicine is validated before submission. Error rows must be fixed first.',
    requiresRows: true,
    place: 'below',
    maxSpotHeight: 220,
  },
  {
    target: 'bulk-row-actions',
    title: 'Edit or remove',
    text: 'Edit or remove a medicine before saving.',
    requiresRows: true,
    place: 'above',
  },
  {
    target: 'bulk-validation',
    title: 'Validation summary',
    text: 'Check how many medicines are valid and how many still have errors.',
    requiresRows: true,
    place: 'below',
  },
  {
    target: 'bulk-save-btn',
    title: 'Save All Medicines',
    text: 'All valid medicines are submitted together in one request.',
    place: 'above',
  },
];

@Component({
  selector: 'app-bulk-product-import',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './bulk-product-import.component.html',
  styleUrl: './bulk-product-import.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkProductImportComponent implements OnInit, OnDestroy {
  private readonly backend = inject(BackendService);
  private readonly toastr = inject(ToastrService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly productUnits = BULK_PRODUCT_UNITS;
  readonly strengthUnits = BULK_STRENGTH_UNITS;
  readonly maxRows = BULK_MAX_ROWS;

  step: BulkStep = 1;
  previewMode: PreviewMode = 'sheet';
  rowFilter: RowFilter = 'all';
  search = '';
  validateBeforeSave = true;

  stores: Store[] = [];
  categories: Category[] = [];
  rows: BulkMedicineDraft[] = [];
  editingRow: BulkMedicineDraft | null = null;
  editorOpen = false;
  editorMode: 'create' | 'edit' = 'create';

  loadingLookups = false;
  parsing = false;
  saving = false;
  saveProgress = { done: 0, total: 0, chunk: 0, chunks: 0 };

  defaultStoreId = '';
  defaultStoreName = '';

  tipsOpen = false;
  dragOver = false;

  tutorialActive = false;
  tutorialStep = 0;
  tutorialRect: { top: number; left: number; width: number; height: number } | null = null;
  tutorialCardStyle: Record<string, string> = {};

  get canCreate(): boolean {
    return this.backend.hasPermission('products.create');
  }

  get summary() {
    return summarizeBulkRows(this.rows);
  }

  get filteredRows(): BulkMedicineDraft[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter((row) => {
      if (this.rowFilter === 'valid' && row.status !== 'valid') return false;
      if (this.rowFilter === 'errors' && row.status !== 'error') return false;
      if (this.rowFilter === 'warnings' && row.status !== 'warning') return false;
      if (!q) return true;
      return [row.name, row.sku, row.barcode, row.categoryName, row.storeName, ...row.errors, ...row.warnings]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }

  get canSave(): boolean {
    if (!this.canCreate || this.saving || !this.rows.length) return false;
    if (this.validateBeforeSave && this.summary.errors > 0) return false;
    return true;
  }

  get editorBlockingIssues() {
    return (this.editingRow?.issues || []).filter((issue) => issue.severity === 'error');
  }

  get editorWarningIssues() {
    return (this.editingRow?.issues || []).filter((issue) => issue.severity === 'warning');
  }

  get activeTutorialSteps() {
    return TUTORIAL_STEPS.filter((step) => !step.requiresRows || this.rows.length > 0);
  }

  ngOnInit(): void {
    if (!this.canCreate) {
      this.toastr.error('You need products.create permission to bulk-add medicines.');
      void this.router.navigate(['/pharmacy/products']);
      return;
    }
    // Desktop: tips always visible via CSS. Mobile accordion starts collapsed.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      this.tipsOpen = true;
    }
    this.loadLookups();

    const tutorialRequested = this.route.snapshot.queryParamMap.get('tutorial') === '1';
    if (tutorialRequested) {
      setTimeout(() => this.startTutorial(), 250);
    } else if (typeof localStorage !== 'undefined' && !localStorage.getItem(TUTORIAL_STORAGE)) {
      this.startTutorial();
    }
  }

  ngOnDestroy(): void {
    this.clearTutorialLayout();
  }

  get saveProgressPercent(): number {
    if (!this.saveProgress.total) return 0;
    return Math.min(100, Math.round((this.saveProgress.done / this.saveProgress.total) * 100));
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.saving) return;
    event.preventDefault();
    event.returnValue = true;
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.tutorialActive) this.positionTutorial();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.editorOpen) this.closeEditor();
  }

  get selectedStoreLabel(): string {
    return this.defaultStoreName || (this.defaultStoreId ? 'Selected store' : 'Select pharmacy store');
  }

  loadLookups(): void {
    this.loadingLookups = true;
    const user = this.readStoredUser();
    const queryStoreId = String(this.route.snapshot.queryParamMap.get('storeId') || '').trim();
    this.backend.getStores({ limit: 100 }).subscribe({
      next: (result) => {
        this.stores = result.items || [];
        const fromQuery = queryStoreId
          ? this.stores.find((store) => store._id === queryStoreId)
          : undefined;
        const assigned = user?.storeId
          ? this.stores.find((store) => store._id === user.storeId)
          : undefined;
        const fallback = fromQuery || assigned || this.stores[0];
        if (fallback) {
          this.setTargetStore(fallback._id, false);
        }
        this.resolveRowStores();
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('Unable to load stores.'),
    });
    this.backend
      .getCategories({ limit: 100 })
      .pipe(finalize(() => {
        this.loadingLookups = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (result) => {
          this.categories = result.items || [];
          this.revalidate();
        },
        error: () => this.toastr.error('Unable to load categories.'),
      });
  }

  /** Top-of-page store picker — all bulk rows import into this pharmacy. */
  onTargetStoreChange(): void {
    this.setTargetStore(this.defaultStoreId, true);
  }

  private setTargetStore(storeId: string, applyToRows: boolean): void {
    const store = this.stores.find((item) => item._id === storeId);
    this.defaultStoreId = store?._id || storeId || '';
    this.defaultStoreName = store?.name || '';
    if (applyToRows && this.rows.length) {
      this.applyCurrentStoreToAll(false);
      this.toastr.success(`Import store set to "${this.defaultStoreName}".`);
    }
  }

  private readStoredUser(): { storeId?: string } | null {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null') as { storeId?: string } | null;
    } catch {
      return null;
    }
  }

  /**
   * Bulk import always uses the store selected at the top of the page.
   * Excel Store column is ignored so users don't fix 500 rows one-by-one.
   */
  private resolveRowStores(): number {
    if (!this.rows.length || !this.defaultStoreId) return 0;

    let remapped = 0;
    this.rows = this.rows.map((row) => {
      if (row.storeId === this.defaultStoreId && row.storeName === this.defaultStoreName) {
        return row;
      }
      remapped += 1;
      return {
        ...row,
        storeId: this.defaultStoreId,
        storeName: this.defaultStoreName,
      };
    });
    return remapped;
  }

  /** One-click: set every preview row to the current pharmacy store. */
  applyCurrentStoreToAll(showToast = true): void {
    if (!this.defaultStoreId) {
      this.toastr.error('Select a pharmacy store at the top first.');
      return;
    }
    if (!this.rows.length) return;

    this.rows = this.rows.map((row) => ({
      ...row,
      storeId: this.defaultStoreId,
      storeName: this.defaultStoreName,
    }));
    this.revalidate();
    if (showToast) {
      this.toastr.success(`Store set to "${this.defaultStoreName}" on all ${this.rows.length} medicines.`);
    }
  }

  downloadTemplate(): void {
    downloadBulkMedicineTemplate(this.defaultStoreName);
  }

  downloadSample500(): void {
    downloadBulkMedicineSample(500, this.defaultStoreName || 'Medicare Pharmacy Store');
    this.toastr.info('Downloaded 500-medicine sample. Upload it, review Valid count, then Save All.');
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.ingestFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.parsing || this.saving || !this.defaultStoreId) return;
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await this.ingestFile(file);
  }

  private async ingestFile(file: File): Promise<void> {
    if (!this.defaultStoreId) {
      this.toastr.error('Select a pharmacy store at the top first.');
      return;
    }

    this.parsing = true;
    this.cdr.markForCheck();
    try {
      const { rows } = await parseBulkMedicineFile(file, {
        storeId: this.defaultStoreId,
        storeName: this.defaultStoreName,
      });
      this.rows = rows;
      const remapped = this.resolveRowStores();
      this.revalidate();
      this.step = 2;
      this.previewMode = 'sheet';
      this.toastr.success(`${rows.length} medicines loaded for review.`);
      if (remapped > 0 && this.defaultStoreName) {
        this.toastr.info(`All rows will import into "${this.defaultStoreName}" (store selected above).`);
      }
      if (this.tutorialActive) this.positionTutorial();
    } catch (error) {
      this.toastr.error(error instanceof Error ? error.message : 'Unable to parse file.');
    } finally {
      this.parsing = false;
      this.cdr.markForCheck();
    }
  }

  categoryTone(name: string | null | undefined): string {
    const text = String(name || '').trim().toLowerCase();
    if (!text) return 'bulk-pill--tone-0';
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash + text.charCodeAt(i) * (i + 1)) % 6;
    }
    return `bulk-pill--tone-${hash}`;
  }

  shortStoreName(name: string | null | undefined): string {
    const text = String(name || '').trim();
    if (!text) return '—';
    return text.replace(/\bPharmacy\s+Pharmacy\b/i, 'Pharmacy');
  }

  setPreviewMode(mode: PreviewMode): void {
    this.previewMode = mode;
    if (mode === 'manual' && !this.rows.length) {
      this.openEditor(createEmptyBulkRow(this.defaultDraft()), 'create');
    }
    this.cdr.markForCheck();
  }

  defaultDraft(): Partial<BulkMedicineDraft> {
    return { storeId: this.defaultStoreId, storeName: this.defaultStoreName };
  }

  addManualRow(): void {
    this.openEditor(createEmptyBulkRow(this.defaultDraft()), 'create');
  }

  openEditor(row: BulkMedicineDraft, mode: 'create' | 'edit' = 'edit'): void {
    if (this.tutorialActive) {
      this.finishTutorial(false);
    }
    this.editorMode = mode;
    this.editingRow = {
      ...row,
      issues: [...(row.issues || [])],
      errors: [...(row.errors || [])],
      warnings: [...(row.warnings || [])],
    };
    this.editorOpen = true;
    this.cdr.markForCheck();
  }

  closeEditor(): void {
    this.editorOpen = false;
    this.editingRow = null;
    this.cdr.markForCheck();
  }

  saveEditorRow(): void {
    if (!this.editingRow) return;
    const draft: BulkMedicineDraft = {
      ...this.editingRow,
      issues: [],
      errors: [],
      warnings: [],
    };
    if (draft.categoryId) {
      const category = this.categories.find((item) => item._id === draft.categoryId);
      draft.categoryName = category?.name || draft.categoryName;
    }
    if (draft.storeId) {
      const store = this.stores.find((item) => item._id === draft.storeId);
      draft.storeName = store?.name || draft.storeName;
    }

    const index = this.rows.findIndex((row) => row.localId === draft.localId);
    if (index >= 0) {
      this.rows = this.rows.map((row, i) => (i === index ? draft : row));
    } else {
      this.rows = [...this.rows, draft];
    }

    this.revalidate();
    this.step = Math.max(this.step, 2) as BulkStep;
    this.toastr.success(
      this.editorMode === 'edit' ? 'Medicine updated in preview.' : 'Medicine added to preview.'
    );
    this.closeEditor();
  }

  duplicateRow(row: BulkMedicineDraft, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    if (this.tutorialActive) {
      this.finishTutorial(false);
    }
    const { localId: _id, errors: _errors, warnings: _warnings, status: _status, ...rest } = row;
    const copy = createEmptyBulkRow({
      ...rest,
      sku: '',
      barcode: '',
      name: row.name ? `${row.name} (copy)` : 'Copied medicine',
    });
    this.rows = [...this.rows, copy];
    this.revalidate();
    this.step = Math.max(this.step, 2) as BulkStep;
    this.toastr.success('Medicine duplicated in preview.');
    this.cdr.markForCheck();
  }

  deleteRow(row: BulkMedicineDraft, event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.rows = this.rows.filter((item) => item.localId !== row.localId);
    this.revalidate();
    this.toastr.info('Medicine removed from preview.');
  }

  revalidate(): void {
    this.resolveRowStores();
    this.resolveRowCategories();
    const storeNames = new Set(
      this.stores.map((store) => String(store.name || '').trim().toLowerCase()).filter(Boolean)
    );
    const categoryNames = new Set(
      this.categories
        .map((category) => String(category.name || '').trim().toLowerCase())
        .filter(Boolean)
    );
    this.rows = validateBulkRows(this.rows, { storeNames, categoryNames });
    if (this.rows.length && this.summary.errors === 0) this.step = 3;
    else if (this.rows.length) this.step = 2;
    this.cdr.markForCheck();
  }

  /** Link category names in the sheet to existing category IDs when possible. */
  private resolveRowCategories(): void {
    if (!this.rows.length || !this.categories.length) return;
    this.rows = this.rows.map((row) => {
      if (row.categoryId) {
        const byId = this.categories.find((category) => category._id === row.categoryId);
        if (byId) {
          return { ...row, categoryName: byId.name || row.categoryName };
        }
      }

      const name = row.categoryName.trim().toLowerCase();
      if (!name) return row;

      const byName = this.categories.find(
        (category) => String(category.name || '').trim().toLowerCase() === name
      );
      if (byName) {
        return { ...row, categoryId: byName._id, categoryName: byName.name || row.categoryName };
      }
      return row;
    });
  }

  goConfirm(): void {
    this.revalidate();
    if (!this.rows.length) {
      this.toastr.warning('Add or upload at least one medicine first.');
      return;
    }
    if (this.summary.errors > 0) {
      this.toastr.error('Fix error rows before confirming.');
      this.rowFilter = 'errors';
      return;
    }
    this.step = 3;
    this.cdr.markForCheck();
  }

  async saveAll(): Promise<void> {
    if (!this.canSave) return;
    this.revalidate();
    if (this.summary.errors > 0) {
      this.toastr.error('Fix validation errors before saving.');
      return;
    }

    const allRows = [...this.rows];
    const total = allRows.length;
    const chunkSize = BULK_SAVE_CHUNK_SIZE;
    const chunks = Math.ceil(total / chunkSize);
    let savedCount = 0;
    let lastStoreId = this.defaultStoreId;
    const remainingRows = [...allRows];

    this.saving = true;
    this.saveProgress = { done: 0, total, chunk: 0, chunks };
    this.cdr.markForCheck();

    try {
      for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex += 1) {
        const slice = remainingRows.slice(0, chunkSize);
        this.saveProgress = {
          done: savedCount,
          total,
          chunk: chunkIndex + 1,
          chunks,
        };
        this.cdr.markForCheck();

        const payload = buildBulkCreatePayload(slice);
        try {
          const response = await firstValueFrom(this.backend.bulkCreateProducts(payload));
          const created = response.data?.createdCount ?? slice.length;
          savedCount += created;
          lastStoreId =
            response.data?.products?.[0]?.storeId ||
            payload.items.find((item) => item.storeId)?.storeId ||
            lastStoreId;
          remainingRows.splice(0, slice.length);
          this.rows = [...remainingRows];
          this.saveProgress = {
            done: savedCount,
            total,
            chunk: chunkIndex + 1,
            chunks,
          };
          this.cdr.markForCheck();
        } catch (err) {
          const httpErr = err as HttpErrorResponse;
          this.rows = [...remainingRows];
          this.revalidate();
          this.handleSaveChunkError(httpErr, savedCount, total);
          return;
        }
      }

      const storeName =
        this.stores.find((store) => store._id === lastStoreId)?.name ||
        this.defaultStoreName ||
        'selected store';
      this.toastr.success(`${savedCount} medicines added to ${storeName}.`);
      if (this.tutorialActive) this.finishTutorial(true);
      void this.router.navigate(['/pharmacy/products'], {
        queryParams: lastStoreId ? { storeId: lastStoreId } : undefined,
      });
    } finally {
      this.saving = false;
      this.saveProgress = { done: 0, total: 0, chunk: 0, chunks: 0 };
      this.cdr.markForCheck();
    }
  }

  private handleSaveChunkError(err: HttpErrorResponse, savedCount: number, total: number): void {
    const prefix =
      savedCount > 0
        ? `Saved ${savedCount} of ${total}. Remaining medicines are still in the preview — fix and click Save All again. `
        : '';

    const details = err?.error?.details;
    const rowErrors = (details?.errors || []) as BulkBackendRowError[];
    if (rowErrors.length) {
      this.applyBackendRowErrors(rowErrors);
      const first = rowErrors[0];
      const detailMsg = first?.message
        ? `Row ${first.row}: ${first.message}`
        : err?.error?.message || 'Bulk import failed validation.';
      this.toastr.error(prefix + detailMsg);
      this.rowFilter = 'errors';
      this.step = 2;
      return;
    }

    if (Array.isArray(details) && details.length) {
      const zodRowErrors = this.mapZodDetailsToRowErrors(details);
      if (zodRowErrors.length) {
        this.applyBackendRowErrors(zodRowErrors);
        const first = details[0]?.message || 'Request validation failed';
        this.toastr.error(
          `${prefix}${first} (${details.length} issue${details.length > 1 ? 's' : ''})`
        );
        this.rowFilter = 'errors';
        this.step = 2;
        this.cdr.markForCheck();
        return;
      }
      this.toastr.error(prefix + (details[0]?.message || err?.error?.message || 'Request validation failed'));
      return;
    }

    this.toastr.error(
      prefix +
        ((err?.error && (err.error.message || err.error.error)) ||
          'Unable to save medicines. Already-saved medicines stay in the catalog.')
    );
    this.step = 2;
  }

  private mapZodDetailsToRowErrors(
    details: Array<{ path?: string; message?: string }>
  ): BulkBackendRowError[] {
    const mapped: BulkBackendRowError[] = [];
    details.forEach((item) => {
      const path = String(item.path || '');
      const match = path.match(/^items\.(\d+)\.?(.*)$/);
      if (!match) return;
      const row = Number(match[1]) + 1;
      const field = (match[2] || 'row') as BulkIssueField;
      mapped.push({
        row,
        field,
        message: item.message || 'Invalid value',
      });
    });
    return mapped;
  }

  private applyBackendRowErrors(errors: BulkBackendRowError[]): void {
    const byRow = new Map<number, BulkBackendRowError[]>();
    errors.forEach((item) => {
      const list = byRow.get(item.row) || [];
      list.push(item);
      byRow.set(item.row, list);
    });
    this.rows = this.rows.map((row, index) => {
      const messages = byRow.get(index + 1);
      if (!messages?.length) return row;
      const extraIssues: BulkFieldIssue[] = messages.map((item) => {
        const field = (item.field || 'row') as BulkIssueField;
        const label = this.fieldLabel(field);
        return {
          field,
          label,
          severity: 'error' as const,
          message: item.message,
        };
      });
      const issues = [...(row.issues || []), ...extraIssues];
      return {
        ...row,
        issues,
        errors: [
          ...row.errors,
          ...extraIssues.map((issue) =>
            issue.field === 'row' ? issue.message : `${issue.label}: ${issue.message}`
          ),
        ],
        status: 'error',
      };
    });
    this.cdr.markForCheck();
  }

  setRowFilter(filter: RowFilter): void {
    this.rowFilter = filter;
    this.cdr.markForCheck();
  }

  fieldLabel(field: BulkIssueField | string): string {
    const labels: Record<string, string> = {
      name: 'Medicine Name',
      unit: 'Type',
      sku: 'SKU',
      strengthValue: 'Strength',
      strengthUnit: 'Unit',
      categoryName: 'Category',
      storeName: 'Store',
      costPrice: 'Cost Price',
      sellingPrice: 'Selling Price',
      openingStock: 'Opening Stock',
      barcode: 'Barcode',
      batchNumber: 'Batch',
      mfdDate: 'MFD',
      expiryDate: 'Expiry',
      brand: 'Brand',
      maxDiscountValue: 'Max Discount',
      row: 'Row',
    };
    return labels[field] || field;
  }

  fieldSeverity(row: BulkMedicineDraft, field: BulkIssueField): 'error' | 'warning' | null {
    const issues = row.issues || [];
    if (issues.some((item) => item.field === field && item.severity === 'error')) return 'error';
    if (issues.some((item) => item.field === field && item.severity === 'warning')) return 'warning';
    return null;
  }

  fieldIssueMessage(row: BulkMedicineDraft | null, field: BulkIssueField): string {
    if (!row?.issues?.length) return '';
    const hit = row.issues.find((item) => item.field === field);
    return hit?.message || '';
  }

  displayCell(value: string | number | null | undefined, empty = '—'): string {
    const text = String(value ?? '').trim();
    return text ? text : empty;
  }

  startTutorial(): void {
    this.tutorialActive = true;
    this.tutorialStep = 0;
    this.positionTutorial();
  }

  skipTutorial(): void {
    this.finishTutorial(false);
  }

  nextTutorial(): void {
    if (this.tutorialStep >= this.activeTutorialSteps.length - 1) {
      this.finishTutorial(true);
      return;
    }
    this.tutorialStep += 1;
    this.positionTutorial();
  }

  prevTutorial(): void {
    if (this.tutorialStep <= 0) return;
    this.tutorialStep -= 1;
    this.positionTutorial();
  }

  finishTutorial(markSeen: boolean): void {
    this.tutorialActive = false;
    this.clearTutorialLayout();
    if (markSeen && typeof localStorage !== 'undefined') {
      localStorage.setItem(TUTORIAL_STORAGE, '1');
    }
    this.cdr.markForCheck();
  }

  get activeTutorialStep() {
    return this.activeTutorialSteps[this.tutorialStep] || null;
  }

  get tutorialProgressLabel(): string {
    return `Step ${this.tutorialStep + 1} of ${this.activeTutorialSteps.length}`;
  }

  private resolveTourTarget(target: string): HTMLElement | null {
    const nodes = Array.from(
      document.querySelectorAll(`[data-tour="${target}"]`)
    ) as HTMLElement[];
    if (!nodes.length) return null;
    const visible = nodes.find((node) => {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return visible || nodes[0];
  }

  private positionTutorial(): void {
    const step = this.activeTutorialSteps[this.tutorialStep];
    if (!step || typeof document === 'undefined') return;

    const tryPosition = (attempt = 0) => {
      const el = this.resolveTourTarget(step.target);
      if (!el) {
        if (attempt < 12) {
          window.setTimeout(() => tryPosition(attempt + 1), 40);
          return;
        }
        this.tutorialRect = null;
        this.tutorialCardStyle = {
          top: '88px',
          left: '16px',
          width: 'min(360px, calc(100vw - 24px))',
        };
        this.cdr.markForCheck();
        return;
      }

      const sticky = step.target === 'bulk-save' || step.target === 'bulk-save-btn';
      el.scrollIntoView({
        behavior: attempt === 0 ? 'smooth' : 'auto',
        block: sticky ? 'end' : 'center',
        inline: 'nearest',
      });

      const settleMs = attempt === 0 ? 280 : 40;
      window.setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const pad = 4;
        const maxH = step.maxSpotHeight ?? Math.min(window.innerHeight * 0.42, 280);
        const spotHeight = Math.min(Math.max(rect.height + pad * 2, 36), maxH);
        this.tutorialRect = {
          top: Math.max(8, rect.top - pad),
          left: Math.max(8, rect.left - pad),
          width: Math.min(window.innerWidth - 16, Math.max(rect.width + pad * 2, 44)),
          height: spotHeight,
        };

        const cardWidth = Math.min(360, window.innerWidth - 24);
        const cardHeight = 172;
        const gap = 12;
        let top: number;
        if (step.place === 'above' || sticky) {
          top = Math.max(12, rect.top - cardHeight - gap);
        } else if (step.place === 'below') {
          top = rect.top + Math.min(rect.height, spotHeight) + gap;
          if (top + cardHeight > window.innerHeight - 12) {
            top = Math.max(12, rect.top - cardHeight - gap);
          }
        } else {
          top = rect.top + Math.min(rect.height, spotHeight) + gap;
          if (top + cardHeight > window.innerHeight - 12) {
            top = Math.max(12, rect.top - cardHeight - gap);
          }
        }

        let left = Math.min(window.innerWidth - cardWidth - 12, Math.max(12, rect.left));
        if (window.innerWidth < 768) {
          left = 12;
        }

        this.tutorialCardStyle = {
          top: `${top}px`,
          left: `${left}px`,
          width: `${cardWidth}px`,
        };
        this.cdr.markForCheck();
      }, settleMs);
    };

    tryPosition();
  }

  private clearTutorialLayout(): void {
    this.tutorialRect = null;
    this.tutorialCardStyle = {};
  }
}