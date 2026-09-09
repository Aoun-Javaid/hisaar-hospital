import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { AppDialogService } from '../../../core/services/app-dialog.service';
import { BackendService } from '../../../core/services/backend.service';
import { ProductCatalogItem, Supplier, Warehouse } from '../../../shared/models/hospital.model';
import { formatCurrency, formatDate } from '../pharmacy-admin.utils';

const PURCHASE_SEARCH_LIMIT = 25;

interface PurchaseLineForm {
  productId: string;
  productSearch: string;
  productLabel: string;
  qty: number;
  unitCost: number;
  discount: number;
  tax: number;
  batchNumber: string;
  expiryDate: string;
}

@Component({
  selector: 'app-pharmacy-purchases',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pharmacy-purchases.component.html',
  styleUrl: './pharmacy-purchases.component.scss',
})
export class PharmacyPurchasesComponent implements OnInit, OnDestroy {
  view: 'list' | 'create' | 'detail' | 'returns' = 'list';
  loading = false;
  saving = false;
  purchases: Array<Record<string, unknown>> = [];
  purchase: Record<string, unknown> | null = null;
  returns: Array<Record<string, unknown>> = [];
  suppliers: Supplier[] = [];
  warehouses: Warehouse[] = [];
  products: ProductCatalogItem[] = [];
  status = '';
  form = this.emptyForm();
  warehouseCreateOpen = false;
  creatingWarehouse = false;
  warehouseForm = { name: '', code: '' };

  activeSearchLineIndex: number | null = null;
  lineSearchResults: ProductCatalogItem[] = [];
  lineSearchLoading = false;
  lineScanResolving = false;
  private lineSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lineSearchRequestSeq = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private backend: BackendService,
    private dialog: AppDialogService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.view = (data['purchasesView'] as typeof this.view) || 'list';
      this.refresh();
    });
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.view = 'detail';
        this.loadPurchase(id);
      }
    });
    this.backend.getSuppliers({ limit: 100 }).subscribe({
      next: (result) => (this.suppliers = result.items),
      error: () => (this.suppliers = []),
    });
    this.loadWarehouses();
    this.backend.getProducts({ limit: 100, isActive: true }).subscribe({
      next: (result) => (this.products = result.items),
      error: () => (this.products = []),
    });
  }

  ngOnDestroy(): void {
    if (this.lineSearchDebounceTimer) {
      clearTimeout(this.lineSearchDebounceTimer);
      this.lineSearchDebounceTimer = null;
    }
  }

  get canCreate(): boolean {
    return this.backend.hasPermission('purchases.create');
  }

  get canReceive(): boolean {
    return this.backend.hasPermission('purchases.receive');
  }

  get canCancel(): boolean {
    return this.backend.hasPermission('purchases.cancel');
  }

  get canManageWarehouses(): boolean {
    return this.backend.hasPermission('warehouses.manage');
  }

  get purchaseTotal(): number {
    return this.purchases.reduce((sum, item) => sum + Number(item['total'] || 0), 0);
  }

  get purchasePaid(): number {
    return this.purchases.reduce((sum, item) => sum + Number(item['paidAmount'] || 0), 0);
  }

  get purchasePending(): number {
    return Math.max(this.purchaseTotal - this.purchasePaid, 0);
  }

  get returnTotal(): number {
    return this.returns.reduce((sum, item) => sum + Number(item['total'] || 0), 0);
  }

  get returnPendingCount(): number {
    return this.returns.filter((item) => {
      const status = String(item['status'] || '').toLowerCase();
      return status === 'draft' || status === 'pending';
    }).length;
  }

  get returnCompletedCount(): number {
    return this.returns.filter((item) => {
      const status = String(item['status'] || '').toLowerCase();
      return status === 'completed' || status === 'posted' || status === 'received';
    }).length;
  }

  get formItemsTotal(): number {
    return this.form.items.reduce((sum, item) => {
      const line =
        Number(item.qty || 0) * Number(item.unitCost || 0) -
        Number(item.discount || 0) +
        Number(item.tax || 0);
      return sum + Math.max(line, 0);
    }, 0);
  }

  get selectedSupplier(): Supplier | null {
    return this.suppliers.find((supplier) => supplier._id === this.form.supplierId) || null;
  }

  get supplierCreditHint(): string {
    const supplier = this.selectedSupplier;
    if (!supplier || this.view !== 'create') {
      return '';
    }
    const creditLimit = Number(supplier.creditLimit || 0);
    if (creditLimit <= 0) {
      return 'Credit not allowed for this supplier (limit is 0). Pay full amount.';
    }
    const outstanding = this.partyOutstanding(supplier);
    const remaining = Math.max(creditLimit - outstanding, 0);
    return `Supplier credit remaining approx. ${formatCurrency(remaining)} (limit ${formatCurrency(creditLimit)}).`;
  }

  loadWarehouses(): void {
    this.backend.getWarehouses({ limit: 100, isActive: true }).subscribe({
      next: (result) => (this.warehouses = result.items || []),
      error: () => (this.warehouses = []),
    });
  }

  openWarehouseCreate(): void {
    this.warehouseCreateOpen = true;
    this.warehouseForm = { name: '', code: '' };
  }

  createWarehouse(): void {
    const name = this.warehouseForm.name.trim();
    const code = this.warehouseForm.code.trim().toUpperCase();
    if (name.length < 2 || code.length < 2) {
      this.toastr.error('Warehouse name and code must be at least 2 characters');
      return;
    }
    this.creatingWarehouse = true;
    this.backend
      .createWarehouse({ name, code })
      .pipe(finalize(() => (this.creatingWarehouse = false)))
      .subscribe({
        next: (response) => {
          const warehouse = response.data;
          this.toastr.success('Warehouse created');
          this.warehouseCreateOpen = false;
          this.warehouseForm = { name: '', code: '' };
          if (warehouse?._id) {
            this.warehouses = [warehouse, ...this.warehouses.filter((item) => item._id !== warehouse._id)];
            this.form.warehouseId = warehouse._id;
          } else {
            this.loadWarehouses();
          }
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to create warehouse'),
      });
  }

  refresh(): void {
    if (this.view === 'returns') {
      this.loadReturns();
      return;
    }
    if (this.view === 'create') {
      return;
    }
    if (this.view !== 'detail') {
      this.loadPurchases();
    }
  }

  loadPurchases(): void {
    this.loading = true;
    this.backend
      .getPurchases({ limit: 100, status: this.status || undefined })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.purchases = result.items),
        error: (err) => {
          this.purchases = [];
          this.toastr.error(err?.error?.message || 'Unable to load purchases');
        },
      });
  }

  loadPurchase(id: string): void {
    this.loading = true;
    this.backend
      .getPurchaseById(id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (item) => (this.purchase = item),
        error: (err) => this.toastr.error(err?.error?.message || 'Purchase not found'),
      });
  }

  loadReturns(): void {
    this.loading = true;
    this.backend
      .getPurchaseReturns({ limit: 100 })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.returns = result.items || []),
        error: () => (this.returns = []),
      });
  }

  addLine(): void {
    this.form.items.push(this.emptyLine());
  }

  removeLine(index: number): void {
    this.form.items.splice(index, 1);
    if (this.activeSearchLineIndex === index) {
      this.clearLineSearchUi();
    } else if (this.activeSearchLineIndex != null && this.activeSearchLineIndex > index) {
      this.activeSearchLineIndex -= 1;
    }
  }

  onLineProductSearchChange(index: number): void {
    const line = this.form.items[index];
    if (!line) {
      return;
    }
    this.activeSearchLineIndex = index;
    line.productId = '';
    line.productLabel = '';

    const raw = line.productSearch.trim();
    if (this.lineSearchDebounceTimer) {
      clearTimeout(this.lineSearchDebounceTimer);
      this.lineSearchDebounceTimer = null;
    }

    if (!raw) {
      this.lineSearchResults = [];
      this.lineSearchLoading = false;
      return;
    }

    this.lineSearchDebounceTimer = setTimeout(() => {
      void this.runLineCatalogSearch(index, raw);
    }, 220);
  }

  onLineProductSearchFocus(index: number): void {
    this.activeSearchLineIndex = index;
    const raw = this.form.items[index]?.productSearch?.trim() || '';
    if (raw && !this.lineSearchResults.length) {
      void this.runLineCatalogSearch(index, raw);
    }
  }

  async handleLineProductSearchEnter(event: Event, index: number): Promise<void> {
    event.preventDefault();
    if (this.lineScanResolving) {
      return;
    }

    const line = this.form.items[index];
    if (!line) {
      return;
    }

    const raw = line.productSearch.trim();
    if (!raw) {
      return;
    }

    if (this.lineSearchDebounceTimer) {
      clearTimeout(this.lineSearchDebounceTimer);
      this.lineSearchDebounceTimer = null;
    }

    this.lineScanResolving = true;
    try {
      const product = await this.resolveScannedOrSearchedProduct(raw);
      if (!product) {
        this.toastr.warning('No medicine found for this barcode / SKU / name.');
        return;
      }
      this.applyProductToLine(index, product);
      this.clearLineSearchUi();
    } finally {
      this.lineScanResolving = false;
    }
  }

  selectLineProduct(index: number, product: ProductCatalogItem): void {
    this.applyProductToLine(index, product);
    this.clearLineSearchUi();
  }

  save(): void {
    if (this.saving) {
      return;
    }
    if (!this.form.warehouseId || !this.form.supplierId || !this.form.items.length) {
      this.toastr.error('Supplier, warehouse, and at least one item are required');
      return;
    }
    if (this.form.items.some((item) => !item.productId)) {
      this.toastr.error('Select a product for every line item');
      return;
    }

    const total = this.formItemsTotal;
    const paidAmount = Number(this.form.paidAmount || 0);
    const unpaid = Math.max(total - paidAmount, 0);
    if (unpaid > 0) {
      const creditError = this.validateSupplierCredit(unpaid);
      if (creditError) {
        this.toastr.error(creditError);
        return;
      }
    }

    this.saving = true;
    this.backend
      .createPurchase({
        warehouseId: this.form.warehouseId,
        supplierId: this.form.supplierId,
        purchaseDate: this.form.purchaseDate,
        note: this.form.note,
        status: this.form.status,
        paidAmount: this.form.paidAmount || 0,
        paymentMethod: this.form.paymentMethod || undefined,
        items: this.form.items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          unitCost: item.unitCost,
          discount: item.discount || 0,
          tax: item.tax || 0,
          batchNumber: item.batchNumber || undefined,
          expiryDate: item.expiryDate || undefined,
        })),
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (response) => {
          this.toastr.success('Purchase saved');
          const data = (response.data || {}) as Record<string, unknown>;
          const created = (data['purchase'] as Record<string, unknown> | undefined) || data;
          const id = String(created['_id'] || '');
          if (id) {
            void this.router.navigate(['/pharmacy/purchases', id]);
          } else {
            void this.router.navigate(['/pharmacy/purchases']);
          }
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to save purchase'),
      });
  }

  receive(id: string): void {
    if (this.saving) {
      return;
    }
    this.dialog
      .confirm({
        title: 'Receive purchase',
        message: 'Receive this purchase into inventory and post accounts payable?',
        confirmText: 'Receive',
      })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.saving = true;
        this.backend
          .receivePurchase(id)
          .pipe(finalize(() => (this.saving = false)))
          .subscribe({
            next: () => {
              this.toastr.success('Purchase received');
              this.loadPurchase(id);
            },
            error: (err) => this.toastr.error(err?.error?.message || 'Unable to receive purchase'),
          });
      });
  }

  cancel(id: string): void {
    if (this.saving) {
      return;
    }
    this.dialog
      .confirm({
        title: 'Cancel purchase',
        message: 'Cancel this purchase? Posted stock must be reversed with a purchase return.',
        confirmText: 'Cancel',
      })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.saving = true;
        this.backend
          .cancelPurchase(id)
          .pipe(finalize(() => (this.saving = false)))
          .subscribe({
            next: () => {
              this.toastr.success('Purchase cancelled');
              this.loadPurchase(id);
            },
            error: (err) => this.toastr.error(err?.error?.message || 'Unable to cancel purchase'),
          });
      });
  }

  text(value: unknown): string {
    return value == null ? '' : String(value);
  }

  currency(value: unknown): string {
    return formatCurrency(value as string | number | null | undefined);
  }

  date(value: unknown): string {
    return formatDate(this.text(value) || null);
  }

  statusClass(status?: string): string {
    return `status-${String(status || 'draft').replace(/_/g, '-')}`;
  }

  balance(record: Record<string, unknown> | null = this.purchase): number {
    const total = Number(record?.['total'] || 0);
    const paid = Number(record?.['paidAmount'] || 0);
    return Math.max(total - paid, 0);
  }

  paymentStatusLabel(record: Record<string, unknown> | null = this.purchase): string {
    const status = this.text(record?.['paymentStatus']) || 'unpaid';
    return status.replace(/_/g, ' ');
  }

  supplierName(record: Record<string, unknown> | null = this.purchase): string {
    const id = this.text(record?.['supplierId']);
    return this.suppliers.find((supplier) => supplier._id === id)?.name || id || '—';
  }

  warehouseName(record: Record<string, unknown> | null = this.purchase): string {
    const id = this.text(record?.['warehouseId']);
    return this.warehouses.find((warehouse) => warehouse._id === id)?.name || id || '—';
  }

  purchaseLines(): Array<Record<string, unknown>> {
    const items = this.purchase?.['items'];
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  }

  private validateSupplierCredit(unpaidPortion: number): string | null {
    const supplier = this.selectedSupplier;
    if (!supplier) {
      return 'Select a supplier before creating a credit purchase.';
    }

    const creditLimit = Number(supplier.creditLimit || 0);
    if (creditLimit <= 0) {
      return 'Credit not allowed for this supplier (limit is 0). Pay the full purchase amount.';
    }

    if (supplier.availableCredit != null && supplier.availableCredit !== '') {
      if (unpaidPortion > Number(supplier.availableCredit || 0)) {
        return 'This purchase exceeds the supplier available credit.';
      }
      return null;
    }

    if (
      supplier.outstandingBalance != null ||
      supplier.openingBalance != null ||
      supplier.availableCredit != null
    ) {
      const outstanding = this.partyOutstanding(supplier);
      if (outstanding + unpaidPortion > creditLimit) {
        return `Supplier credit limit exceeded. Outstanding + unpaid (${formatCurrency(outstanding + unpaidPortion)}) > limit (${formatCurrency(creditLimit)}).`;
      }
    }

    return null;
  }

  private partyOutstanding(party: Supplier): number {
    if (party.outstandingBalance != null && party.outstandingBalance !== '') {
      return Math.max(Number(party.outstandingBalance || 0), 0);
    }
    return Math.max(Number(party.openingBalance || 0), 0);
  }

  private applyProductToLine(index: number, product: ProductCatalogItem): void {
    const line = this.form.items[index];
    if (!line) {
      return;
    }
    this.mergeProductIntoCatalog(product);
    line.productId = product._id;
    line.productLabel = this.productDisplayLabel(product);
    line.productSearch = line.productLabel;
    const cost = Number(product.costPrice ?? 0);
    if (Number.isFinite(cost) && cost > 0) {
      line.unitCost = cost;
    }
  }

  private clearLineSearchUi(): void {
    this.activeSearchLineIndex = null;
    this.lineSearchResults = [];
    this.lineSearchLoading = false;
  }

  private async runLineCatalogSearch(index: number, raw: string): Promise<void> {
    const requestId = ++this.lineSearchRequestSeq;
    this.lineSearchLoading = true;
    try {
      const result = await firstValueFrom(
        this.backend.getProducts({
          search: raw,
          isActive: true,
          limit: PURCHASE_SEARCH_LIMIT,
        }),
      );
      if (requestId !== this.lineSearchRequestSeq) {
        return;
      }
      if (this.activeSearchLineIndex !== index) {
        return;
      }
      if (this.form.items[index]?.productSearch.trim() !== raw) {
        return;
      }
      this.lineSearchResults = this.rankSearchHits(result.items || [], raw);
    } catch {
      if (requestId !== this.lineSearchRequestSeq) {
        return;
      }
      this.lineSearchResults = this.localProductMatches(raw).slice(0, PURCHASE_SEARCH_LIMIT);
    } finally {
      if (requestId === this.lineSearchRequestSeq) {
        this.lineSearchLoading = false;
      }
    }
  }

  private async resolveScannedOrSearchedProduct(
    raw: string,
  ): Promise<ProductCatalogItem | null> {
    const localExact = this.findLocalExactCodeMatch(raw);
    if (localExact) {
      return localExact;
    }

    try {
      const byBarcode = await firstValueFrom(
        this.backend.getProducts({
          barcode: raw,
          isActive: true,
          limit: 5,
        }),
      );
      const barcodeHit =
        (byBarcode.items || []).find((item) => this.isExactCodeMatch(item, raw)) ||
        byBarcode.items?.[0];
      if (barcodeHit) {
        return barcodeHit;
      }

      const bySku = await firstValueFrom(
        this.backend.getProducts({
          sku: raw.toUpperCase(),
          isActive: true,
          limit: 5,
        }),
      );
      const skuHit =
        (bySku.items || []).find((item) => this.isExactCodeMatch(item, raw)) ||
        bySku.items?.[0];
      if (skuHit) {
        return skuHit;
      }

      const bySearch = await firstValueFrom(
        this.backend.getProducts({
          search: raw,
          isActive: true,
          limit: PURCHASE_SEARCH_LIMIT,
        }),
      );
      const ranked = this.rankSearchHits(bySearch.items || [], raw);
      this.lineSearchResults = ranked;
      return ranked.find((item) => this.isExactCodeMatch(item, raw)) || ranked[0] || null;
    } catch {
      return this.findLocalExactCodeMatch(raw) || this.localProductMatches(raw)[0] || null;
    }
  }

  private rankSearchHits(items: ProductCatalogItem[], raw: string): ProductCatalogItem[] {
    return [...items].sort((a, b) => {
      const aExact = this.isExactCodeMatch(a, raw) ? 0 : 1;
      const bExact = this.isExactCodeMatch(b, raw) ? 0 : 1;
      if (aExact !== bExact) {
        return aExact - bExact;
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  private localProductMatches(raw: string): ProductCatalogItem[] {
    const query = String(raw || '').trim().toLowerCase();
    if (!query) {
      return this.products.slice(0, 20);
    }
    const exact = this.products.filter((product) => this.isExactCodeMatch(product, raw));
    const partial = this.products.filter((product) => {
      if (this.isExactCodeMatch(product, raw)) {
        return false;
      }
      return this.productSearchText(product).includes(query);
    });
    return [...exact, ...partial];
  }

  private findLocalExactCodeMatch(raw: string): ProductCatalogItem | null {
    return this.products.find((product) => this.isExactCodeMatch(product, raw)) || null;
  }

  private isExactCodeMatch(product: ProductCatalogItem, raw: string): boolean {
    const code = String(raw || '').trim();
    if (!code) {
      return false;
    }
    const barcode = String(product.barcode || '').trim();
    const sku = String(product.sku || '').trim();
    return (
      (!!barcode && barcode.toLowerCase() === code.toLowerCase()) ||
      (!!sku && sku.toLowerCase() === code.toLowerCase())
    );
  }

  private productSearchText(product: ProductCatalogItem): string {
    return [product.name, product.sku, product.barcode, product.brand]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private productDisplayLabel(product: ProductCatalogItem): string {
    const bits = [product.name, product.sku ? `SKU ${product.sku}` : '', product.barcode || '']
      .filter(Boolean);
    return bits.join(' · ');
  }

  private mergeProductIntoCatalog(product: ProductCatalogItem): void {
    if (!product?._id) {
      return;
    }
    const index = this.products.findIndex((item) => item._id === product._id);
    if (index >= 0) {
      this.products[index] = product;
      return;
    }
    this.products = [product, ...this.products];
  }

  private emptyLine(): PurchaseLineForm {
    return {
      productId: '',
      productSearch: '',
      productLabel: '',
      qty: 1,
      unitCost: 0,
      discount: 0,
      tax: 0,
      batchNumber: '',
      expiryDate: '',
    };
  }

  private emptyForm() {
    return {
      warehouseId: '',
      supplierId: '',
      purchaseDate: new Date().toISOString().slice(0, 10),
      note: '',
      status: 'draft',
      paidAmount: 0,
      paymentMethod: '',
      items: [this.emptyLine()],
    };
  }
}
