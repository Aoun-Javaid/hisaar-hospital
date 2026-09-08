import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, map, Observable, of, switchMap, throwError } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AppDialogService } from '../../../core/services/app-dialog.service';
import { BackendService } from '../../../core/services/backend.service';
import {
  Category,
  ProductDiscountType,
  ProductCatalogItem,
  Store,
  User,
} from '../../../shared/models/hospital.model';

interface ProductForm {
  name: string;
  sku: string;
  barcode: string;
  batchNumber: string;
  expiryDate: string;
  mfdDate: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  strengthValue: string;
  strengthUnit: string;
  costPrice: string;
  sellingPrice: string;
  openingStock: string;
  storeId: string;
  discountEligible: boolean;
  maxDiscountType: ProductDiscountType;
  maxDiscountValue: string;
}

type ProductFormSection = 'basic' | 'pricing' | 'batch' | 'optional';

@Component({
  selector: 'app-pharmacy-products',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pharmacy-products.component.html',
  styleUrl: './pharmacy-products.component.scss',
})
export class PharmacyProductsComponent implements OnInit {
  products: ProductCatalogItem[] = [];
  productsTotal = 0;
  productsTotalPages = 1;
  productsPage = 1;
  /** Rows per page: 10 (default), 100, 200, or all (up to API max). */
  pageSizeChoice: 10 | 100 | 200 | 'all' = 10;
  readonly pageSizeOptions: Array<{ value: 10 | 100 | 200 | 'all'; label: string }> = [
    { value: 10, label: '10' },
    { value: 100, label: '100' },
    { value: 200, label: '200' },
    { value: 'all', label: 'All' },
  ];
  categories: Category[] = [];
  stores: Store[] = [];
  productSearch = '';
  productsLoading = false;
  categoriesLoading = false;
  storesLoading = false;
  productModalOpen = false;
  savingProduct = false;
  editingProductId = '';
  editingOriginalStock = '';
  deletingProductId = '';
  productSections: Record<ProductFormSection, boolean> = {
    basic: true,
    pricing: true,
    batch: true,
    optional: true,
  };
  productUnits = [
    'tablet',
    'capsule',
    'syrup',
    'injection',
    'drops',
    'cream',
    'ointment',
    'inhaler',
    'pcs',
  ];
  strengthUnits = [
    'mg',
    'ml',
    'g',
    'mcg',
    'IU',
    '%',
    'mg/ml',
    'mg/5ml',
    'mcg/ml',
  ];
  productForm: ProductForm = this.getEmptyProductForm();
  showBulkTip = false;

  private readonly bulkTipStorageKey = 'hms-bulk-medicines-catalog-tip-seen';
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private route: ActivatedRoute,
    private backend: BackendService,
    private toastr: ToastrService,
    private dialog: AppDialogService,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('productModal') === '1') {
        setTimeout(() => this.openProductModal());
      }
      const storeId = params.get('storeId');
      if (storeId) {
        this.productForm.storeId = storeId;
        this.loadProducts();
      }
    });

    this.refreshCurrentUser();
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(this.bulkTipStorageKey)) {
      this.showBulkTip = true;
    }
  }

  dismissBulkTip(): void {
    this.showBulkTip = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.bulkTipStorageKey, '1');
    }
  }

  get canViewProducts(): boolean {
    return this.backend.hasPermission('products.read');
  }

  get canCreateProducts(): boolean {
    return this.backend.hasPermission('products.create');
  }

  get canUpdateProducts(): boolean {
    return this.backend.hasPermission('products.update');
  }

  get canDeleteProducts(): boolean {
    return this.backend.hasPermission('products.delete');
  }

  get canCreateCategories(): boolean {
    return this.backend.hasPermission('categories.create');
  }

  get canAdjustInventory(): boolean {
    return this.backend.hasPermission('inventory.adjust');
  }

  get selectedStoreLabel(): string {
    const storeId = this.currentStoreId();
    const store = this.stores.find((item) => item._id === storeId);
    return (
      store?.name || (storeId ? 'Assigned pharmacy store' : 'No store assigned')
    );
  }

  get filteredProducts(): ProductCatalogItem[] {
    // Search + pagination are server-side via loadProducts().
    return this.products;
  }

  get pageRangeLabel(): string {
    if (!this.productsTotal) return '0 products';
    if (this.pageSizeChoice === 'all') {
      return `Showing all ${this.productsTotal} products`;
    }
    const size = this.pageSizeChoice;
    const start = (this.productsPage - 1) * size + 1;
    const end = Math.min(this.productsPage * size, this.productsTotal);
    return `Showing ${start}–${end} of ${this.productsTotal}`;
  }

  get visiblePageNumbers(): number[] {
    const total = Math.max(1, this.productsTotalPages);
    const current = this.productsPage;
    const windowSize = 5;
    let start = Math.max(1, current - Math.floor(windowSize / 2));
    const end = Math.min(total, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    const pages: number[] = [];
    for (let p = start; p <= end; p += 1) pages.push(p);
    return pages;
  }

  onProductSearchChange(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.productsPage = 1;
      this.loadProducts();
    }, 300);
  }

  onPageSizeChange(): void {
    this.productsPage = 1;
    this.loadProducts();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.productsTotalPages || page === this.productsPage) return;
    this.productsPage = page;
    this.loadProducts();
  }

  refreshCurrentUser(): void {
    this.backend.getMe().subscribe({
      next: (user) => {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('role', user.role?.name || '');
        localStorage.setItem(
          'permissions',
          JSON.stringify(user.role?.permissions || []),
        );

        if (user.storeId && !this.productForm.storeId) {
          this.productForm.storeId = user.storeId;
        }

        this.loadStores();
        this.loadCategories();
      },
      error: () => {
        // Use cached session data if profile refresh fails.
      },
    });
  }

  loadProducts(): void {
    if (!this.canViewProducts) {
      this.products = [];
      this.productsTotal = 0;
      this.productsTotalPages = 1;
      return;
    }

    this.productsLoading = true;
    const search = this.productSearch.trim();
    const limit =
      this.pageSizeChoice === 'all'
        ? 5000
        : this.pageSizeChoice;
    const page = this.pageSizeChoice === 'all' ? 1 : this.productsPage;

    this.backend
      .getProducts({
        page,
        limit,
        isActive: true,
        storeId: this.currentStoreId() || undefined,
        ...(search ? { search } : {}),
      })
      .pipe(finalize(() => (this.productsLoading = false)))
      .subscribe({
        next: (result) => {
          this.products = result.items;
          this.productsTotal = result.pagination?.total ?? result.items.length;
          this.productsTotalPages = Math.max(
            1,
            result.pagination?.totalPages ??
              (this.pageSizeChoice === 'all'
                ? 1
                : Math.ceil(this.productsTotal / this.pageSizeChoice) || 1),
          );
          if (this.productsPage > this.productsTotalPages) {
            this.productsPage = this.productsTotalPages;
          }
        },
        error: (err) => {
          this.products = [];
          this.productsTotal = 0;
          this.productsTotalPages = 1;
          this.toastr.error(err?.error?.message || 'Unable to load products.');
        },
      });
  }

  loadCategories(): void {
    if (!this.backend.hasPermission('categories.read')) {
      this.categories = [];
      return;
    }

    this.categoriesLoading = true;
    this.backend
      .getCategories({ limit: 100, isActive: true })
      .pipe(finalize(() => (this.categoriesLoading = false)))
      .subscribe({
        next: (result) => {
          this.categories = result.items;
        },
        error: () => {
          this.categories = [];
        },
      });
  }

  loadStores(): void {
    const user = this.getStoredUser();
    if (!this.backend.hasPermission('stores.read')) {
      this.stores = [];
      if (user?.storeId && !this.productForm.storeId) {
        this.productForm.storeId = user.storeId;
      }
      this.loadProducts();
      return;
    }

    this.storesLoading = true;
    this.backend
      .getStores({
        limit: 100,
        isActive: true,
        hospitalId: user?.hospitalId || undefined,
      })
      .pipe(finalize(() => (this.storesLoading = false)))
      .subscribe({
        next: (result) => {
          this.stores = result.items;
          const assignedStoreId = user?.storeId || '';
          const fallbackStoreId = this.stores[0]?._id || '';

          if (!this.productForm.storeId) {
            this.productForm.storeId = assignedStoreId || fallbackStoreId;
          }
          this.loadProducts();
        },
        error: () => {
          this.stores = [];
          this.loadProducts();
        },
      });
  }

  onStoreChange(): void {
    this.productsPage = 1;
    this.loadProducts();
  }

  openProductModal(): void {
    if (!this.canCreateProducts) {
      this.toastr.error(
        'This role needs products.create to add pharmacy medicines.',
      );
      return;
    }

    const storeId = this.currentStoreId();
    this.editingProductId = '';
    this.editingOriginalStock = '';
    this.productForm = this.getEmptyProductForm();
    this.productForm.storeId = storeId;
    this.resetProductSections();

    this.productModalOpen = true;
  }

  openEditProduct(product: ProductCatalogItem): void {
    if (!this.canUpdateProducts) {
      this.toastr.error(
        'This role needs products.update to edit pharmacy medicines.',
      );
      return;
    }

    const stock = this.productStock(product);
    this.editingProductId = product._id;
    this.editingOriginalStock = stock;
    this.productForm = {
      name: product.name || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      batchNumber: product.batchNumber || '',
      expiryDate: this.toDateInputValue(product.expiryDate),
      mfdDate: this.toDateInputValue(product.mfdDate),
      brand: product.brand || '',
      categoryId: product.categoryId || '',
      categoryName: '',
      unit: product.unit || 'tablet',
      strengthValue: product.strengthValue || '',
      strengthUnit: product.strengthUnit || 'mg',
      costPrice: product.costPrice || '0',
      sellingPrice: product.sellingPrice || '0',
      openingStock: stock,
      storeId: product.storeId || this.currentStoreId(),
      discountEligible: Boolean(product.discountEligible),
      maxDiscountType:
        product.maxDiscountType === 'percentage' ? 'percentage' : 'amount',
      maxDiscountValue:
        product.maxDiscountValue === null ||
        product.maxDiscountValue === undefined
          ? ''
          : String(product.maxDiscountValue),
    };
    this.resetProductSections();
    this.productModalOpen = true;
  }

  toggleProductSection(section: ProductFormSection): void {
    this.productSections[section] = !this.productSections[section];
  }

  private resetProductSections(): void {
    this.productSections = {
      basic: true,
      pricing: true,
      batch: true,
      optional: true,
    };
  }

  closeProductModal(): void {
    if (this.savingProduct) {
      return;
    }

    const storeId = this.currentStoreId();
    this.productModalOpen = false;
    this.editingProductId = '';
    this.editingOriginalStock = '';
    this.productForm = this.getEmptyProductForm();
    this.productForm.storeId = storeId;
  }

  saveProduct(): void {
    if (this.savingProduct) {
      return;
    }

    const name = this.productForm.name.trim();
    const sku = this.productForm.sku.trim();
    const sellingPrice = Number(this.productForm.sellingPrice);
    const openingStock = Number(this.productForm.openingStock || 0);
    const storeId = this.productForm.storeId || this.currentStoreId();
    const isEditing = Boolean(this.editingProductId);

    if (!isEditing && !this.canCreateProducts) {
      this.toastr.error(
        'This role needs products.create to add pharmacy medicines.',
      );
      return;
    }

    if (isEditing && !this.canUpdateProducts) {
      this.toastr.error(
        'This role needs products.update to edit pharmacy medicines.',
      );
      return;
    }

    if (!name) {
      this.toastr.error('Medicine/product name is required.');
      return;
    }

    if (isEditing && !sku) {
      this.toastr.error('SKU is required when editing a product.');
      return;
    }

    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      this.toastr.error('Enter a valid selling price.');
      return;
    }

    if (this.productForm.discountEligible && !this.isValidDiscountSetup()) {
      this.toastr.error(
        'Enable discount only after setting a valid maximum amount or percentage.',
      );
      return;
    }

    if (
      this.productForm.discountEligible &&
      !this.isHalfStepValue(this.productForm.maxDiscountValue)
    ) {
      this.toastr.error('Discount must be in 0.5 steps like 1.5 or 5.0.');
      return;
    }

    if (!isEditing && !storeId) {
      this.toastr.error(
        'No pharmacy store is assigned. Login again or assign a store to this pharmacy user.',
      );
      return;
    }

    if (!isEditing && (!Number.isInteger(openingStock) || openingStock < 1)) {
      this.toastr.error(
        'Opening stock must be at least 1 to add this product to the store.',
      );
      return;
    }

    if (isEditing && (!Number.isInteger(openingStock) || openingStock < 0)) {
      this.toastr.error('Stock quantity must be 0 or greater.');
      return;
    }

    if (isEditing && !storeId) {
      this.toastr.error('No store is available for stock update.');
      return;
    }

    if (
      isEditing &&
      this.hasStockChanged(openingStock) &&
      !this.canAdjustInventory
    ) {
      this.toastr.error(
        'This role needs inventory.adjust to update stock quantity.',
      );
      return;
    }

    this.savingProduct = true;
    const strengthDescription = [
      this.productForm.strengthValue.trim(),
      this.productForm.strengthUnit,
    ]
      .filter(Boolean)
      .join(' ');

    this.resolveProductCategoryId(!isEditing)
      .pipe(
        switchMap((categoryId) => {
          const payload = {
            ...(categoryId ? { categoryId } : {}),
            name,
            sku: sku || this.generateSku(name),
            barcode: this.productForm.barcode.trim() || undefined,
            batchNumber: this.productForm.batchNumber.trim() || undefined,
            expiryDate:
              this.normalizeDateForPayload(this.productForm.expiryDate) ||
              undefined,
            mfdDate:
              this.normalizeDateForPayload(this.productForm.mfdDate) ||
              undefined,
            brand: this.productForm.brand.trim() || undefined,
            unit: this.productForm.unit || 'pcs',
            strengthValue: this.productForm.strengthValue.trim() || undefined,
            strengthUnit: this.productForm.strengthUnit || undefined,
            description: strengthDescription || undefined,
            costPrice: this.productForm.costPrice || '0',
            sellingPrice: this.productForm.sellingPrice || '0',
            discountEligible: this.productForm.discountEligible,
            maxDiscountType: this.productForm.discountEligible
              ? this.productForm.maxDiscountType
              : undefined,
            maxDiscountValue:
              this.productForm.discountEligible &&
              this.productForm.maxDiscountValue !== ''
                ? this.productForm.maxDiscountValue
                : undefined,
            taxRate: '0',
            isActive: true,
          };

          return isEditing
            ? this.backend.updateProduct(this.editingProductId, payload)
            : this.backend.createProduct(payload);
        }),
        switchMap((response) => {
          if (!isEditing) {
            return this.setProductStock(
              response.data,
              storeId,
              openingStock,
              'OPENING_STOCK',
              'Opening stock from product management',
            );
          }

          return this.hasStockChanged(openingStock)
            ? this.setProductStock(
                response.data,
                storeId,
                openingStock,
                'MANUAL_ADJUSTMENT',
                'Stock update from product management',
              )
            : of(response.data);
        }),
        finalize(() => (this.savingProduct = false)),
      )
      .subscribe({
        next: () => {
          this.toastr.success(
            isEditing
              ? 'Medicine/product and stock updated.'
              : 'Medicine/product added to pharmacy store.',
          );
          this.productModalOpen = false;
          this.editingProductId = '';
          this.editingOriginalStock = '';
          this.productForm = this.getEmptyProductForm();
          this.productForm.storeId = storeId;
          this.loadProducts();
        },
        error: (err) => {
          this.toastr.error(
            err?.error?.message ||
              err?.message ||
              'Unable to add medicine/product.',
          );
        },
      });
  }

  async deleteProduct(product: ProductCatalogItem): Promise<void> {
    if (!this.canDeleteProducts) {
      this.toastr.error(
        'This role needs products.delete to remove pharmacy medicines.',
      );
      return;
    }

    const confirmed = await this.dialog.confirm({
      title: 'Delete Product',
      message: `Delete ${product.name} from product management? This action cannot be undone.`,
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    this.deletingProductId = product._id;
    this.backend
      .deleteProduct(product._id)
      .pipe(finalize(() => (this.deletingProductId = '')))
      .subscribe({
        next: () => {
          this.products = this.products.filter(
            (item) => item._id !== product._id,
          );
          this.toastr.success('Medicine/product deleted.');
        },
        error: (err) => {
          this.toastr.error(
            err?.error?.message || 'Unable to delete medicine/product.',
          );
        },
      });
  }

  productStrength(product: ProductCatalogItem): string {
    return (
      [product.strengthValue, product.strengthUnit].filter(Boolean).join(' ') ||
      '-'
    );
  }

  productStock(product: ProductCatalogItem): string {
    return String(product.availableQuantity ?? product.stockQuantity ?? '0');
  }

  productDiscountSummary(product: ProductCatalogItem): string {
    if (!product.discountEligible) {
      return 'N/A';
    }

    const value = Number(product.maxDiscountValue || 0);
    if (!Number.isFinite(value) || value <= 0) {
      return 'N/A';
    }

    return product.maxDiscountType === 'percentage'
      ? `${this.formatNumber(value)}%`
      : this.formatCurrency(value);
  }

  formatProductDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString();
  }

  expiryLabel(product: ProductCatalogItem): string {
    if (!product.expiryDate) {
      return 'No expiry';
    }

    return this.isExpired(product.expiryDate) ? 'Expired' : 'Valid';
  }

  expiryBadgeClass(product: ProductCatalogItem): string {
    if (!product.expiryDate) {
      return 'badge-secondary';
    }

    return this.isExpired(product.expiryDate)
      ? 'badge-danger'
      : 'badge-success';
  }

  currentStoreId(): string {
    const user = this.getStoredUser();
    return (
      user?.storeId || this.productForm.storeId || this.stores[0]?._id || ''
    );
  }

  private resolveProductCategoryId(required: boolean): Observable<string> {
    if (this.productForm.categoryId) {
      return of(this.productForm.categoryId);
    }

    const categoryName = this.productForm.categoryName.trim();
    if (!required && !categoryName) {
      return of('');
    }

    if (!categoryName) {
      return throwError(
        () => new Error('Select category or enter a new category name.'),
      );
    }

    if (!this.canCreateCategories) {
      return throwError(
        () =>
          new Error(
            'This role needs categories.create to add a new medicine category.',
          ),
      );
    }

    return this.backend
      .createCategory({
        name: categoryName,
        code: this.generateCode(categoryName),
        isActive: true,
      })
      .pipe(
        map((response) => {
          const category = response.data;
          this.categories = [category, ...this.categories];
          this.productForm.categoryId = category._id;
          return category._id;
        }),
      );
  }

  private setProductStock(
    product: ProductCatalogItem,
    storeId: string,
    quantity: number,
    reason: 'OPENING_STOCK' | 'MANUAL_ADJUSTMENT',
    note: string,
  ): Observable<ProductCatalogItem> {
    if (!Number.isFinite(quantity) || quantity < 0) {
      return of(product);
    }

    if (!this.canAdjustInventory) {
      this.toastr.warning(
        'Product saved, but this role needs inventory.adjust to set stock.',
      );
      return of(product);
    }

    return this.backend
      .adjustInventory({
        productId: product._id,
        locationType: 'store',
        locationId: storeId,
        adjustmentType: 'SET',
        quantity: String(Math.floor(quantity)),
        reason,
        note,
      })
      .pipe(map(() => product));
  }

  private hasStockChanged(nextStock: number): boolean {
    return (
      String(Math.floor(nextStock)) !== String(this.editingOriginalStock || '0')
    );
  }

  private getStoredUser(): User | null {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null') as User | null;
    } catch {
      return null;
    }
  }

  private getEmptyProductForm(): ProductForm {
    return {
      name: '',
      sku: '',
      barcode: '',
      batchNumber: '',
      expiryDate: '',
      mfdDate: '',
      brand: '',
      categoryId: '',
      categoryName: '',
      unit: 'tablet',
      strengthValue: '',
      strengthUnit: 'mg',
      costPrice: '0',
      sellingPrice: '0',
      openingStock: '1',
      storeId: this.getStoredUser()?.storeId || '',
      discountEligible: false,
      maxDiscountType: 'amount',
      maxDiscountValue: '',
    };
  }

  get discountEnabled(): boolean {
    return Boolean(this.productForm.discountEligible);
  }

  private formatCurrency(value: unknown): string {
    return `Rs ${Number(value || 0).toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private formatNumber(value: unknown): string {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) {
      return '0';
    }

    return amount.toLocaleString('en-PK', {
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  private normalizeText(value: string): string {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private toDateInputValue(value?: string | null): string {
    if (!value) {
      return '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeDateForPayload(value?: string | null): string {
    return this.toDateInputValue(value);
  }

  private isValidDiscountSetup(): boolean {
    const value = Number(this.productForm.maxDiscountValue);
    if (
      (this.productForm.maxDiscountType !== 'amount' &&
        this.productForm.maxDiscountType !== 'percentage') ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return false;
    }

    if (this.productForm.maxDiscountType === 'percentage' && value > 100) {
      return false;
    }

    return true;
  }

  private isHalfStepValue(value: number | string | null | undefined): boolean {
    const normalized = String(value ?? '').trim();
    if (!normalized.length) {
      return false;
    }

    const numeric = Number(normalized);
    return (
      Number.isFinite(numeric) &&
      numeric > 0 &&
      Math.abs(numeric * 2 - Math.round(numeric * 2)) < 0.000001
    );
  }

  private isExpired(value?: string | null): boolean {
    const normalized = this.toDateInputValue(value);
    if (!normalized) {
      return false;
    }

    const expiry = new Date(`${normalized}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry < today;
  }

  private generateSku(name: string): string {
    const prefix = this.generateCode(name).slice(0, 18) || 'MED';
    const suffix = Date.now().toString(36).slice(-6).toUpperCase();
    return `${prefix}-${suffix}`;
  }

  private generateCode(value: string): string {
    return (
      String(value || 'MED')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30) || 'MED'
    );
  }
}
