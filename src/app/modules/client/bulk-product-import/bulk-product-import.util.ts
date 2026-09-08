import * as XLSX from 'xlsx';
import { downloadExcelWorkbook } from '../../../core/utils/excel-export.util';
import {
  BULK_MAX_FILE_BYTES,
  BULK_MAX_ROWS,
  BULK_PRODUCT_UNITS,
  BULK_STRENGTH_UNITS,
  BULK_TEMPLATE_COLUMNS,
  BulkCreateItemPayload,
  BulkFieldIssue,
  BulkMedicineDraft,
  BulkRowStatus,
} from './bulk-product-import.types';

const COLUMN_ALIASES: Record<string, keyof BulkMedicineDraft | 'ignore'> = {
  'medicine name': 'name',
  medicinename: 'name',
  medicine_name: 'name',
  'product name': 'name',
  productname: 'name',
  product_name: 'name',
  name: 'name',
  type: 'unit',
  unit: 'unit',
  'medicine type': 'unit',
  sku: 'sku',
  strength: 'strengthValue',
  strengthvalue: 'strengthValue',
  strength_value: 'strengthValue',
  'strength unit': 'strengthUnit',
  strengthunit: 'strengthUnit',
  strength_unit: 'strengthUnit',
  category: 'categoryName',
  categoryname: 'categoryName',
  category_name: 'categoryName',
  store: 'storeName',
  storename: 'storeName',
  store_name: 'storeName',
  'cost price': 'costPrice',
  costprice: 'costPrice',
  cost_price: 'costPrice',
  cost: 'costPrice',
  'selling price': 'sellingPrice',
  sellingprice: 'sellingPrice',
  selling_price: 'sellingPrice',
  price: 'sellingPrice',
  'opening stock': 'openingStock',
  openingstock: 'openingStock',
  opening_stock: 'openingStock',
  stock: 'openingStock',
  barcode: 'barcode',
  batch: 'batchNumber',
  'batch number': 'batchNumber',
  batchnumber: 'batchNumber',
  batch_number: 'batchNumber',
  mfd: 'mfdDate',
  'manufacturing date': 'mfdDate',
  manufacturingdate: 'mfdDate',
  manufacturing_date: 'mfdDate',
  mfddate: 'mfdDate',
  mfd_date: 'mfdDate',
  expiry: 'expiryDate',
  'expiry date': 'expiryDate',
  expirydate: 'expiryDate',
  expiry_date: 'expiryDate',
  brand: 'brand',
  'discount eligible': 'discountEligible',
  discounteligible: 'discountEligible',
  discount_eligible: 'discountEligible',
  'max discount type': 'maxDiscountType',
  maxdiscounttype: 'maxDiscountType',
  max_discount_type: 'maxDiscountType',
  'max discount value': 'maxDiscountValue',
  maxdiscountvalue: 'maxDiscountValue',
  max_discount_value: 'maxDiscountValue',
  'max discount': 'maxDiscountValue',
};

export const createEmptyBulkRow = (
  defaults?: Partial<BulkMedicineDraft>
): BulkMedicineDraft => {
  const { localId: _ignore, ...rest } = defaults || {};
  return {
    localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    unit: 'tablet',
    sku: '',
    strengthValue: '',
    strengthUnit: 'mg',
    categoryId: '',
    categoryName: '',
    storeId: '',
    storeName: '',
    costPrice: '0',
    sellingPrice: '0',
    openingStock: '1',
    barcode: '',
    batchNumber: '',
    mfdDate: '',
    expiryDate: '',
    brand: '',
    discountEligible: false,
    maxDiscountType: 'percentage',
    maxDiscountValue: '',
    issues: [],
    errors: [],
    warnings: [],
    status: 'error',
    ...rest,
  };
};

const normalizeHeader = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const excelSerialToIsoDate = (value: number): string => {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return '';
  const y = String(parsed.y).padStart(4, '0');
  const m = String(parsed.m).padStart(2, '0');
  const d = String(parsed.d).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const cellToString = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Prefer date decode for Excel serials in typical date range.
    if (value > 20000 && value < 80000) {
      const asDate = excelSerialToIsoDate(value);
      if (asDate) return asDate;
    }
    return String(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
};

const parseDiscountEligible = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'eligible'].includes(normalized);
};

export const downloadBulkMedicineTemplate = (sampleStoreName = ''): void => {
  downloadExcelWorkbook('hisaar360-bulk-medicines-template.xlsx', [
    {
      name: 'Medicines',
      columns: BULK_TEMPLATE_COLUMNS.map((column) => ({
        header: column.header,
        key: column.key,
      })),
      rows: [
        {
          name: 'Paracetamol (SAMPLE — delete this row)',
          unit: 'tablet',
          sku: '',
          strengthValue: '500',
          strengthUnit: 'mg',
          categoryName: 'Tablets',
          storeName: sampleStoreName || 'Your Pharmacy Store Name',
          costPrice: 10,
          sellingPrice: 20,
          openingStock: 100,
          barcode: '',
          batchNumber: 'B-10023',
          mfdDate: '2026-01-15',
          expiryDate: '2028-08-10',
          brand: 'Generic',
          discountEligible: 'No',
        },
      ],
    },
    {
      name: 'Instructions',
      columns: [
        { header: 'Topic', key: 'topic' },
        { header: 'Guidance', key: 'guidance' },
      ],
      rows: [
        {
          topic: 'Required columns',
          guidance:
            'Medicine Name, Type, Strength, Strength Unit, Store, Cost Price. Opening Stock must be a whole number ≥ 1.',
        },
        {
          topic: 'Type values',
          guidance: BULK_PRODUCT_UNITS.join(', '),
        },
        {
          topic: 'Strength units',
          guidance: BULK_STRENGTH_UNITS.join(', '),
        },
        {
          topic: 'Dates',
          guidance: 'Use YYYY-MM-DD (example 2028-08-10). Expiry cannot be before Manufacturing Date.',
        },
        {
          topic: 'SKU',
          guidance: 'Leave blank to auto-generate on save. Must be unique per company if provided.',
        },
        {
          topic: 'Store / Category',
          guidance:
            'Use exact store and category names from your hospital. Do not paste Mongo IDs. Unknown category can be created if you have categories.create.',
        },
        {
          topic: 'Discount Eligible',
          guidance: 'Yes / No (or true / false).',
        },
        {
          topic: 'Blank vs sample file',
          guidance:
            'This blank template has only 1 SAMPLE row (blocked on save). For load testing, use Download 500 Sample Medicines.',
        },
        {
          topic: 'Limits',
          guidance: `Max ${BULK_MAX_ROWS} rows per import. Max file size 5 MB. Nothing is saved until Save All Medicines.`,
        },
      ],
    },
  ]);
};

const SAMPLE_MEDICINE_SEEDS: Array<{
  name: string;
  unit: string;
  strengthValue: string;
  strengthUnit: string;
  categoryName: string;
  brand: string;
}> = [
  { name: 'Paracetamol', unit: 'tablet', strengthValue: '500', strengthUnit: 'mg', categoryName: 'Analgesics', brand: 'Getz' },
  { name: 'Amoxicillin', unit: 'capsule', strengthValue: '250', strengthUnit: 'mg', categoryName: 'Antibiotics', brand: 'Searle' },
  { name: 'Amoxicillin', unit: 'capsule', strengthValue: '500', strengthUnit: 'mg', categoryName: 'Antibiotics', brand: 'GSK' },
  { name: 'Cetirizine', unit: 'tablet', strengthValue: '10', strengthUnit: 'mg', categoryName: 'Antihistamines', brand: 'Abbott' },
  { name: 'Omeprazole', unit: 'capsule', strengthValue: '20', strengthUnit: 'mg', categoryName: 'Antacids', brand: 'Hilton' },
  { name: 'Azithromycin', unit: 'tablet', strengthValue: '500', strengthUnit: 'mg', categoryName: 'Antibiotics', brand: 'Sami' },
  { name: 'Metformin', unit: 'tablet', strengthValue: '500', strengthUnit: 'mg', categoryName: 'Diabetes', brand: 'Highnoon' },
  { name: 'Metformin', unit: 'tablet', strengthValue: '850', strengthUnit: 'mg', categoryName: 'Diabetes', brand: 'Martin Dow' },
  { name: 'Amlodipine', unit: 'tablet', strengthValue: '5', strengthUnit: 'mg', categoryName: 'Cardiovascular', brand: 'Pfizer' },
  { name: 'Amlodipine', unit: 'tablet', strengthValue: '10', strengthUnit: 'mg', categoryName: 'Cardiovascular', brand: 'Novartis' },
  { name: 'Atorvastatin', unit: 'tablet', strengthValue: '10', strengthUnit: 'mg', categoryName: 'Cardiovascular', brand: 'Generic' },
  { name: 'Atorvastatin', unit: 'tablet', strengthValue: '20', strengthUnit: 'mg', categoryName: 'Cardiovascular', brand: 'Getz' },
  { name: 'Losartan', unit: 'tablet', strengthValue: '50', strengthUnit: 'mg', categoryName: 'Cardiovascular', brand: 'Searle' },
  { name: 'Ibuprofen', unit: 'tablet', strengthValue: '400', strengthUnit: 'mg', categoryName: 'Analgesics', brand: 'Abbott' },
  { name: 'Diclofenac', unit: 'tablet', strengthValue: '50', strengthUnit: 'mg', categoryName: 'Analgesics', brand: 'Hilton' },
  { name: 'Ciprofloxacin', unit: 'tablet', strengthValue: '500', strengthUnit: 'mg', categoryName: 'Antibiotics', brand: 'Sami' },
  { name: 'Pantoprazole', unit: 'tablet', strengthValue: '40', strengthUnit: 'mg', categoryName: 'Antacids', brand: 'Highnoon' },
  { name: 'Montelukast', unit: 'tablet', strengthValue: '10', strengthUnit: 'mg', categoryName: 'Respiratory', brand: 'Abbott' },
  { name: 'Salbutamol', unit: 'inhaler', strengthValue: '100', strengthUnit: 'mcg', categoryName: 'Respiratory', brand: 'GSK' },
  { name: 'Vitamin D3', unit: 'capsule', strengthValue: '50000', strengthUnit: 'IU', categoryName: 'Vitamins', brand: 'Hilton' },
  { name: 'Ceftriaxone', unit: 'injection', strengthValue: '1', strengthUnit: 'g', categoryName: 'Injectables', brand: 'Pfizer' },
  { name: 'ORS', unit: 'pcs', strengthValue: '20.5', strengthUnit: 'g', categoryName: 'Vitamins', brand: 'Generic' },
  { name: 'Multivitamin', unit: 'syrup', strengthValue: '5', strengthUnit: 'ml', categoryName: 'Vitamins', brand: 'Sami' },
  { name: 'Miconazole', unit: 'cream', strengthValue: '2', strengthUnit: '%', categoryName: 'Dermatology', brand: 'Getz' },
  { name: 'Normal Saline', unit: 'injection', strengthValue: '0.9', strengthUnit: '%', categoryName: 'Injectables', brand: 'Generic' },
];

const pad2 = (value: number): string => String(value).padStart(2, '0');

const sampleDate = (seed: number, yearOffset: number): string => {
  const month = ((seed - 1) % 12) + 1;
  const day = ((seed * 3) % 27) + 1;
  return `${2025 + yearOffset}-${pad2(month)}-${pad2(day)}`;
};

export const buildBulkMedicineSampleRows = (
  count: number,
  storeName = 'Medicare Pharmacy Store'
): Record<string, string | number>[] => {
  const total = Math.max(1, Math.min(BULK_MAX_ROWS, Math.floor(count) || 1));
  const rows: Record<string, string | number>[] = [];

  for (let index = 1; index <= total; index += 1) {
    const seed = SAMPLE_MEDICINE_SEEDS[(index - 1) % SAMPLE_MEDICINE_SEEDS.length];
    const cycle = Math.floor((index - 1) / SAMPLE_MEDICINE_SEEDS.length) + 1;
    const cost = Number((5 + ((index * 3) % 95) + (index % 10) * 0.5).toFixed(2));
    const selling = Number((cost * (1.2 + (index % 5) * 0.05)).toFixed(2));
    const sku = `SMP500-${String(index).padStart(3, '0')}`;

    rows.push({
      name: cycle > 1 ? `${seed.name} ${seed.strengthValue}${seed.strengthUnit} #${cycle}` : `${seed.name} ${seed.strengthValue}${seed.strengthUnit}`,
      unit: seed.unit,
      sku,
      strengthValue: seed.strengthValue,
      strengthUnit: seed.strengthUnit,
      categoryName: seed.categoryName,
      storeName: storeName || 'Medicare Pharmacy Store',
      costPrice: cost,
      sellingPrice: selling,
      openingStock: 10 + ((index * 2) % 90),
      barcode: `890500${String(index).padStart(6, '0')}`,
      batchNumber: `B500-${String(index).padStart(3, '0')}`,
      mfdDate: sampleDate(index, 0),
      expiryDate: sampleDate(index, 2),
      brand: seed.brand,
      discountEligible: 'No',
      maxDiscountType: '',
      maxDiscountValue: '',
    });
  }

  return rows;
};

/** Ready-to-import sample workbook (valid rows, not the blocked SAMPLE template row). */
export const downloadBulkMedicineSample = (
  count = 500,
  sampleStoreName = 'Medicare Pharmacy Store'
): void => {
  const rows = buildBulkMedicineSampleRows(count, sampleStoreName);
  downloadExcelWorkbook(`hisaar360-bulk-medicines-sample-${rows.length}.xlsx`, [
    {
      name: 'Medicines',
      columns: BULK_TEMPLATE_COLUMNS.map((column) => ({
        header: column.header,
        key: column.key,
      })),
      rows,
    },
    {
      name: 'Instructions',
      columns: [
        { header: 'Topic', key: 'topic' },
        { header: 'Guidance', key: 'guidance' },
      ],
      rows: [
        {
          topic: 'Purpose',
          guidance: `This file has ${rows.length} valid medicines for bulk import testing. Store column uses: ${sampleStoreName || 'Medicare Pharmacy Store'}.`,
        },
        {
          topic: 'Before upload',
          guidance: 'Confirm the Store name matches an active pharmacy store in Hospital Setup / Pharmacy.',
        },
        {
          topic: 'Limits',
          guidance: `Max ${BULK_MAX_ROWS} rows per import.`,
        },
      ],
    },
  ]);
};

export const parseBulkMedicineFile = async (
  file: File,
  defaults?: Partial<BulkMedicineDraft>
): Promise<{ rows: BulkMedicineDraft[]; missingRequired: string[] }> => {
  if (file.size > BULK_MAX_FILE_BYTES) {
    throw new Error('File is larger than 5 MB.');
  }

  const lower = file.name.toLowerCase();
  if (!/\.(xlsx|xls|csv)$/.test(lower)) {
    throw new Error('Unsupported file type. Upload .xlsx, .xls, or .csv.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => name.toLowerCase().includes('medicine')) ||
    workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The workbook has no sheets.');
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  if (!matrix.length) {
    throw new Error('The spreadsheet is empty.');
  }

  const headerCells = (matrix[0] || []).map((cell) => normalizeHeader(cell));
  const mappedIndexes: Array<{ index: number; field: keyof BulkMedicineDraft }> = [];
  headerCells.forEach((header, index) => {
    if (!header) return;
    const field = COLUMN_ALIASES[header];
    if (field && field !== 'ignore') {
      mappedIndexes.push({ index, field });
    }
  });

  const requiredHeaders = ['name', 'unit', 'strengthValue', 'strengthUnit', 'storeName', 'costPrice'];
  const mappedFields = new Set(mappedIndexes.map((item) => item.field));
  // storeName can also come from defaults.storeId on the page
  const missingRequired = requiredHeaders.filter((field) => {
    if (field === 'storeName' && defaults?.storeId) return false;
    return !mappedFields.has(field as keyof BulkMedicineDraft);
  });

  if (missingRequired.length) {
    const labels: Record<string, string> = {
      name: 'Medicine Name',
      unit: 'Type',
      strengthValue: 'Strength',
      strengthUnit: 'Strength Unit',
      storeName: 'Store',
      costPrice: 'Cost Price',
    };
    throw new Error(
      `Column '${labels[missingRequired[0]] || missingRequired[0]}' is missing.`
    );
  }

  const dataRows = matrix.slice(1).filter((row) =>
    (row || []).some((cell) => String(cell ?? '').trim() !== '')
  );

  if (dataRows.length > BULK_MAX_ROWS) {
    throw new Error(`A maximum of ${BULK_MAX_ROWS} medicines can be imported at once.`);
  }

  const rows = dataRows.map((row) => {
    // Do not stamp default storeId onto every row first — Excel Store column must win.
    // Otherwise a leftover default storeId is sent while the sheet still shows another name.
    const draft = createEmptyBulkRow();
    mappedIndexes.forEach(({ index, field }) => {
      const raw = cellToString(row[index]);
      if (field === 'discountEligible') {
        draft.discountEligible = parseDiscountEligible(raw);
        return;
      }
      if (field === 'maxDiscountType') {
        const normalized = raw.trim().toLowerCase();
        draft.maxDiscountType = normalized === 'amount' ? 'amount' : 'percentage';
        return;
      }
      if (field === 'unit') {
        draft.unit = raw.toLowerCase() || draft.unit;
        return;
      }
      (draft as Record<string, unknown>)[field] = raw;
    });
    if (!draft.storeName.trim() && defaults?.storeId) {
      draft.storeId = defaults.storeId;
      draft.storeName = defaults.storeName || '';
    }
    return draft;
  });

  return { rows, missingRequired: [] };
};

export const validateBulkRows = (
  rows: BulkMedicineDraft[],
  options?: {
    storeNames?: Set<string>;
    categoryNames?: Set<string>;
  }
): BulkMedicineDraft[] => {
  const skuMap = new Map<string, number>();
  const barcodeMap = new Map<string, number>();

  const issue = (
    field: BulkFieldIssue['field'],
    label: string,
    severity: BulkFieldIssue['severity'],
    message: string
  ): BulkFieldIssue => ({ field, label, severity, message });

  const formatIssue = (item: BulkFieldIssue): string =>
    item.field === 'row' ? item.message : `${item.label}: ${item.message}`;

  return rows.map((row, index) => {
    const issues: BulkFieldIssue[] = [];

    const name = row.name.trim();
    if (!name || name.length < 2) {
      issues.push(issue('name', 'Medicine Name', 'error', 'Required — enter the medicine name.'));
    }

    const unit = row.unit.trim().toLowerCase();
    if (!unit) {
      issues.push(issue('unit', 'Type', 'error', 'Required — choose tablet, capsule, syrup, injection, etc.'));
    } else if (!(BULK_PRODUCT_UNITS as readonly string[]).includes(unit)) {
      issues.push(
        issue(
          'unit',
          'Type',
          'warning',
          `"${row.unit.trim()}" is uncommon. Prefer: ${BULK_PRODUCT_UNITS.join(', ')}.`
        )
      );
    }

    if (!row.strengthValue.trim()) {
      issues.push(issue('strengthValue', 'Strength', 'error', 'Required — e.g. 500.'));
    }
    if (!row.strengthUnit.trim()) {
      issues.push(issue('strengthUnit', 'Unit', 'error', 'Required — e.g. mg, ml.'));
    } else if (!(BULK_STRENGTH_UNITS as readonly string[]).includes(row.strengthUnit.trim())) {
      issues.push(
        issue(
          'strengthUnit',
          'Unit',
          'warning',
          `"${row.strengthUnit.trim()}" is uncommon. Prefer: ${BULK_STRENGTH_UNITS.join(', ')}.`
        )
      );
    }

    if (!row.storeId && !row.storeName.trim()) {
      issues.push(issue('storeName', 'Store', 'error', 'Required — select or type a store name.'));
    } else if (
      row.storeName.trim() &&
      options?.storeNames &&
      options.storeNames.size &&
      !options.storeNames.has(row.storeName.trim().toLowerCase()) &&
      !row.storeId
    ) {
      issues.push(
        issue('storeName', 'Store', 'error', `"${row.storeName.trim()}" was not found. Use an exact store name.`)
      );
    }

    if (
      row.categoryName.trim() &&
      options?.categoryNames &&
      options.categoryNames.size &&
      !row.categoryId &&
      !options.categoryNames.has(row.categoryName.trim().toLowerCase())
    ) {
      issues.push(
        issue(
          'categoryName',
          'Category',
          'warning',
          `"${row.categoryName.trim()}" is new and will be created on save (if you have permission).`
        )
      );
    } else if (!row.categoryId && !row.categoryName.trim()) {
      issues.push(
        issue('categoryName', 'Category', 'warning', 'No category set — medicine will import without a category.')
      );
    }

    const costRaw = String(row.costPrice ?? '').trim();
    const cost = costRaw === '' ? NaN : Number(costRaw);
    if (costRaw === '') {
      issues.push(issue('costPrice', 'Cost Price', 'error', 'Required — enter a number (0 or more).'));
    } else if (!Number.isFinite(cost) || cost < 0) {
      issues.push(
        issue('costPrice', 'Cost Price', 'error', `"${costRaw}" is invalid. Enter a non-negative number.`)
      );
    }

    const sellRaw = String(row.sellingPrice ?? '').trim();
    if (sellRaw === '') {
      issues.push(issue('sellingPrice', 'Selling Price', 'error', 'Required — enter a number (0 or more).'));
    } else {
      const selling = Number(sellRaw);
      if (!Number.isFinite(selling) || selling < 0) {
        issues.push(
          issue(
            'sellingPrice',
            'Selling Price',
            'error',
            `"${sellRaw}" is invalid. Enter a non-negative number.`
          )
        );
      } else if (Number.isFinite(cost) && selling < cost) {
        issues.push(
          issue(
            'sellingPrice',
            'Selling Price',
            'warning',
            'Selling price is lower than cost price — confirm this is intentional.'
          )
        );
      }
    }

    const stockRaw = String(row.openingStock ?? '').trim();
    const opening = stockRaw === '' ? NaN : Number(stockRaw);
    if (stockRaw === '') {
      issues.push(issue('openingStock', 'Opening Stock', 'error', 'Required — enter a whole number of at least 1.'));
    } else if (!Number.isInteger(opening) || opening < 1) {
      issues.push(
        issue(
          'openingStock',
          'Opening Stock',
          'error',
          `"${stockRaw}" is invalid. Enter a whole number of at least 1.`
        )
      );
    }

    const sku = row.sku.trim().toUpperCase();
    if (sku) {
      if (skuMap.has(sku)) {
        issues.push(
          issue(
            'sku',
            'SKU',
            'error',
            `Duplicate in this file (also on row ${skuMap.get(sku)}). Change SKU or leave blank for auto.`
          )
        );
      } else {
        skuMap.set(sku, index + 1);
      }
    }

    const barcode = row.barcode.trim();
    if (barcode) {
      if (barcodeMap.has(barcode)) {
        issues.push(
          issue(
            'barcode',
            'Barcode',
            'error',
            `Duplicate in this file (also on row ${barcodeMap.get(barcode)}).`
          )
        );
      } else {
        barcodeMap.set(barcode, index + 1);
      }
    }

    if (row.mfdDate && Number.isNaN(new Date(row.mfdDate).getTime())) {
      issues.push(issue('mfdDate', 'MFD', 'error', 'Invalid date. Use YYYY-MM-DD.'));
    }
    if (row.expiryDate && Number.isNaN(new Date(row.expiryDate).getTime())) {
      issues.push(issue('expiryDate', 'Expiry', 'error', 'Invalid date. Use YYYY-MM-DD.'));
    }
    if (row.mfdDate && row.expiryDate) {
      const mfd = new Date(row.mfdDate);
      const exp = new Date(row.expiryDate);
      if (!Number.isNaN(mfd.getTime()) && !Number.isNaN(exp.getTime()) && exp < mfd) {
        issues.push(issue('expiryDate', 'Expiry', 'error', 'Cannot be before Manufacturing Date (MFD).'));
      }
    }

    if (/sample/i.test(name)) {
      issues.push(
        issue('name', 'Medicine Name', 'error', 'This looks like a template sample row — rename or delete it.')
      );
    }

    if (row.discountEligible) {
      const discountRaw = String(row.maxDiscountValue ?? '').trim();
      if (!discountRaw) {
        issues.push(
          issue(
            'maxDiscountValue',
            'Max Discount',
            'error',
            'Required when Discount Eligible is Yes — enter a value (e.g. 5 or 10).'
          )
        );
      } else {
        const discountNum = Number(discountRaw);
        if (!Number.isFinite(discountNum) || discountNum <= 0) {
          issues.push(
            issue(
              'maxDiscountValue',
              'Max Discount',
              'error',
              'Must be greater than 0 when Discount Eligible is Yes.'
            )
          );
        } else if (row.maxDiscountType === 'percentage' && discountNum > 100) {
          issues.push(
            issue('maxDiscountValue', 'Max Discount', 'error', 'Percentage discount cannot exceed 100.')
          );
        }
      }
    }

    const errors = issues.filter((item) => item.severity === 'error').map(formatIssue);
    const warnings = issues.filter((item) => item.severity === 'warning').map(formatIssue);

    let status: BulkRowStatus = 'valid';
    if (errors.length) status = 'error';
    else if (warnings.length) status = 'warning';

    return {
      ...row,
      name,
      unit,
      sku: row.sku.trim(),
      issues,
      errors,
      warnings,
      status,
    };
  });
};

export const buildBulkCreatePayload = (
  rows: BulkMedicineDraft[]
): { items: BulkCreateItemPayload[] } => ({
  items: rows.map((row) => {
    const item: BulkCreateItemPayload = {
      name: row.name.trim(),
      unit: row.unit.trim().toLowerCase(),
      costPrice: row.costPrice || '0',
      sellingPrice: row.sellingPrice || '0',
      openingStock: Math.floor(Number(row.openingStock)),
      isActive: true,
      discountEligible: Boolean(row.discountEligible),
    };
    if (row.sku.trim()) item.sku = row.sku.trim();
    if (row.barcode.trim()) item.barcode = row.barcode.trim();
    if (row.batchNumber.trim()) item.batchNumber = row.batchNumber.trim();
    if (row.brand.trim()) item.brand = row.brand.trim();
    if (row.strengthValue.trim()) item.strengthValue = row.strengthValue.trim();
    if (row.strengthUnit.trim()) item.strengthUnit = row.strengthUnit.trim();
    if (row.mfdDate) item.mfdDate = row.mfdDate;
    if (row.expiryDate) item.expiryDate = row.expiryDate;
    if (row.categoryId) item.categoryId = row.categoryId;
    else if (row.categoryName.trim()) item.categoryName = row.categoryName.trim();
    if (row.storeId) item.storeId = row.storeId;
    else if (row.storeName.trim()) item.storeName = row.storeName.trim();
    if (row.discountEligible) {
      item.maxDiscountType = row.maxDiscountType || 'percentage';
      const discountValue = String(row.maxDiscountValue ?? '').trim();
      item.maxDiscountValue = discountValue || '5';
    }
    return item;
  }),
});

export const summarizeBulkRows = (rows: BulkMedicineDraft[]) => {
  const total = rows.length;
  const errors = rows.filter((row) => row.status === 'error').length;
  const warnings = rows.filter((row) => row.status === 'warning').length;
  const valid = rows.filter((row) => row.status === 'valid').length;
  return { total, valid, warnings, errors };
};
