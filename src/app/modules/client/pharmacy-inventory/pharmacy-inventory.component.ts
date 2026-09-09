import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { BackendService } from '../../../core/services/backend.service';
import { downloadExcelWorkbook } from '../../../core/utils/excel-export.util';
import { HmsDocumentToolbarComponent } from '../../../shared/components/hms-document-toolbar/hms-document-toolbar.component';
import { ProductCatalogItem, Store } from '../../../shared/models/hospital.model';
import { formatCurrency, normalizeText, readAssignedStoreId } from '../pharmacy-admin.utils';
import { buildPharmacyReportHtml } from '../pharmacy-export.util';

@Component({
  selector: 'app-pharmacy-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HmsDocumentToolbarComponent],
  templateUrl: './pharmacy-inventory.component.html',
  styleUrl: './pharmacy-inventory.component.scss',
})
export class PharmacyInventoryComponent implements OnInit {
  stores: Store[] = [];
  products: ProductCatalogItem[] = [];
  filteredProducts: ProductCatalogItem[] = [];
  loading = false;
  savingAdjust = false;
  search = '';
  storeId = readAssignedStoreId();
  lowStockOnly = false;
  adjustModalOpen = false;
  adjustProduct: ProductCatalogItem | null = null;
  adjustType: 'INCREASE' | 'DECREASE' | 'SET' = 'INCREASE';
  adjustQty = 0;
  adjustNote = '';

  readonly getExportHtml = () =>
    buildPharmacyReportHtml(
      'Pharmacy Inventory',
      [
        { header: 'Medicine', key: 'name' },
        { header: 'SKU', key: 'sku' },
        { header: 'Brand', key: 'brand' },
        { header: 'Batch', key: 'batchNumber' },
        { header: 'Expiry', key: 'expiryDate' },
        { header: 'Available', key: 'available' },
        { header: 'Status', key: 'status' },
        { header: 'Cost', key: 'cost' },
        { header: 'Retail', key: 'retail' },
        { header: 'Valuation', key: 'valuation' },
      ],
      this.exportRows(),
    );

  constructor(
    private backend: BackendService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadStores();
  }

  get totalUnits(): number {
    return this.filteredProducts.reduce((sum, product) => sum + this.qty(product), 0);
  }

  get totalRetailValue(): number {
    return this.filteredProducts.reduce((sum, product) => sum + this.qty(product) * this.price(product), 0);
  }

  get totalCostValue(): number {
    return this.filteredProducts.reduce((sum, product) => sum + this.qty(product) * this.cost(product), 0);
  }

  get lowStockCount(): number {
    return this.filteredProducts.filter((product) => this.isLowStock(product)).length;
  }

  isLowStock(product: ProductCatalogItem): boolean {
    return this.qty(product) <= this.reorder(product);
  }

  loadStores(): void {
    if (!this.backend.hasPermission('stores.read')) {
      this.loadInventory();
      return;
    }

    this.backend.getStores({ limit: 100, isActive: true }).subscribe({
      next: (result) => {
        this.stores = result.items || [];
        if (!this.storeId && this.stores[0]?._id) {
          this.storeId = this.stores[0]._id;
        }
        this.loadInventory();
      },
      error: () => {
        this.stores = [];
        this.loadInventory();
      },
    });
  }

  loadInventory(): void {
    this.loading = true;
    this.backend.getProducts({
      limit: 100,
      isActive: true,
      storeId: this.storeId || undefined,
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => {
          this.products = result.items;
          this.applyFilters();
        },
        error: (err) => {
          this.products = [];
          this.filteredProducts = [];
          this.toastr.error(err?.error?.message || 'Unable to load inventory.');
        },
      });
  }

  applyFilters(): void {
    const query = normalizeText(this.search);
    this.filteredProducts = this.products.filter((product) => {
      const matchesSearch =
        !query ||
        normalizeText([
          product.name,
          product.sku,
          product.barcode,
          product.batchNumber,
          product.brand,
        ].join(' ')).includes(query);
      const matchesStock = !this.lowStockOnly || this.qty(product) <= this.reorder(product);
      return matchesSearch && matchesStock;
    });
  }

  qty(product: ProductCatalogItem): number {
    return Number(product.availableQuantity ?? product.stockQuantity ?? 0) || 0;
  }

  reorder(product: ProductCatalogItem): number {
    return Number(product.reorderLevel ?? 0) || 0;
  }

  price(product: ProductCatalogItem): number {
    return Number(product.sellingPrice ?? 0) || 0;
  }

  cost(product: ProductCatalogItem): number {
    return Number(product.costPrice ?? 0) || 0;
  }

  currency(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  exportExcel(): void {
    downloadExcelWorkbook('pharmacy-inventory', [
      {
        name: 'Inventory',
        columns: [
          { header: 'Medicine', key: 'name' },
          { header: 'SKU', key: 'sku' },
          { header: 'Brand', key: 'brand' },
          { header: 'Batch', key: 'batchNumber' },
          { header: 'Expiry', key: 'expiryDate' },
          { header: 'Available', key: 'available' },
          { header: 'Status', key: 'status' },
          { header: 'Cost', key: 'cost' },
          { header: 'Retail', key: 'retail' },
          { header: 'Valuation', key: 'valuation' },
        ],
        rows: this.exportRows(),
      },
    ]);
  }

  private exportRows(): Array<Record<string, unknown>> {
    return this.filteredProducts.map((product) => ({
      name: product.name,
      sku: product.sku || '',
      brand: product.brand || '',
      batchNumber: product.batchNumber || '-',
      expiryDate: product.expiryDate || '-',
      available: this.qty(product),
      status: this.isLowStock(product) ? 'Low Stock' : 'In Stock',
      cost: this.currency(product.costPrice),
      retail: this.currency(product.sellingPrice),
      valuation: this.currency(this.qty(product) * this.price(product)),
    }));
  }

  canAdjust(): boolean {
    return this.backend.hasPermission('inventory.adjust') && Boolean(this.storeId);
  }

  openAdjust(product: ProductCatalogItem): void {
    this.adjustProduct = product;
    this.adjustType = 'INCREASE';
    this.adjustQty = 0;
    this.adjustNote = '';
    this.adjustModalOpen = true;
  }

  dismissAdjust(): void {
    if (!this.savingAdjust) {
      this.adjustModalOpen = false;
      this.adjustProduct = null;
    }
  }

  submitAdjust(): void {
    if (!this.adjustProduct || !this.storeId) {
      this.toastr.error('Select a store before adjusting stock.');
      return;
    }

    const quantity = Number(this.adjustQty);
    if (!Number.isFinite(quantity) || (this.adjustType !== 'SET' && quantity <= 0)) {
      this.toastr.error('Enter a valid adjustment quantity.');
      return;
    }

    this.savingAdjust = true;
    this.backend
      .adjustInventory({
        productId: this.adjustProduct._id,
        locationType: 'store',
        locationId: this.storeId,
        adjustmentType: this.adjustType,
        quantity,
        reason: 'MANUAL_ADJUSTMENT',
        note: this.adjustNote.trim() || undefined,
      })
      .pipe(finalize(() => (this.savingAdjust = false)))
      .subscribe({
        next: () => {
          this.toastr.success('Stock adjusted.');
          this.adjustModalOpen = false;
          this.adjustProduct = null;
          this.loadInventory();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to adjust stock.'),
      });
  }
}
