export type BulkRowStatus = 'valid' | 'error' | 'warning';

export type BulkIssueField =
  | 'name'
  | 'unit'
  | 'sku'
  | 'strengthValue'
  | 'strengthUnit'
  | 'categoryName'
  | 'storeName'
  | 'costPrice'
  | 'sellingPrice'
  | 'openingStock'
  | 'barcode'
  | 'batchNumber'
  | 'mfdDate'
  | 'expiryDate'
  | 'brand'
  | 'maxDiscountValue'
  | 'row';

export type BulkFieldIssue = {
  field: BulkIssueField;
  label: string;
  severity: 'error' | 'warning';
  message: string;
};

export type BulkMedicineDraft = {
  localId: string;
  name: string;
  unit: string;
  sku: string;
  strengthValue: string;
  strengthUnit: string;
  categoryId: string;
  categoryName: string;
  storeId: string;
  storeName: string;
  costPrice: string;
  sellingPrice: string;
  openingStock: string;
  barcode: string;
  batchNumber: string;
  mfdDate: string;
  expiryDate: string;
  brand: string;
  discountEligible: boolean;
  maxDiscountType: 'amount' | 'percentage';
  maxDiscountValue: string;
  /** Structured field issues (preferred). */
  issues: BulkFieldIssue[];
  /** Derived display strings kept for filters / legacy. */
  errors: string[];
  warnings: string[];
  status: BulkRowStatus;
};

export type BulkCreateItemPayload = {
  name: string;
  unit: string;
  sku?: string;
  barcode?: string;
  batchNumber?: string;
  expiryDate?: string | null;
  mfdDate?: string | null;
  strengthValue?: string;
  strengthUnit?: string;
  brand?: string;
  costPrice: string | number;
  sellingPrice: string | number;
  openingStock: string | number;
  categoryId?: string;
  categoryName?: string;
  storeId?: string;
  storeName?: string;
  discountEligible?: boolean;
  maxDiscountType?: 'amount' | 'percentage';
  maxDiscountValue?: string | number;
  isActive?: boolean;
};

export type BulkCreateResponse = {
  createdCount: number;
  products: Array<{
    _id: string;
    name: string;
    sku: string;
    storeId?: string;
    openingStock?: number;
  }>;
  inventoryCreated: number;
  stockMovementsCreated: number;
};

export type BulkBackendRowError = {
  row: number;
  field?: string;
  code?: string;
  message: string;
};

export const BULK_MAX_ROWS = 500;
export const BULK_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Client sends this many medicines per API call so proxies don't hang on one 500-row POST. */
export const BULK_SAVE_CHUNK_SIZE = 25;

export const BULK_PRODUCT_UNITS = [
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'drops',
  'cream',
  'ointment',
  'inhaler',
  'pcs',
] as const;

export const BULK_STRENGTH_UNITS = [
  'mg',
  'ml',
  'g',
  'mcg',
  'IU',
  '%',
  'mg/ml',
  'mg/5ml',
  'mcg/ml',
] as const;

export const BULK_TEMPLATE_COLUMNS = [
  { header: 'Medicine Name *', key: 'name' },
  { header: 'Type *', key: 'unit' },
  { header: 'SKU', key: 'sku' },
  { header: 'Strength *', key: 'strengthValue' },
  { header: 'Strength Unit *', key: 'strengthUnit' },
  { header: 'Category', key: 'categoryName' },
  { header: 'Store *', key: 'storeName' },
  { header: 'Cost Price *', key: 'costPrice' },
  { header: 'Selling Price', key: 'sellingPrice' },
  { header: 'Opening Stock', key: 'openingStock' },
  { header: 'Barcode', key: 'barcode' },
  { header: 'Batch Number', key: 'batchNumber' },
  { header: 'Manufacturing Date', key: 'mfdDate' },
  { header: 'Expiry Date', key: 'expiryDate' },
  { header: 'Brand', key: 'brand' },
  { header: 'Discount Eligible', key: 'discountEligible' },
  { header: 'Max Discount Type', key: 'maxDiscountType' },
  { header: 'Max Discount Value', key: 'maxDiscountValue' },
] as const;
