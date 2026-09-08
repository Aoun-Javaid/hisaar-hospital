import {
  buildBulkCreatePayload,
  buildBulkMedicineSampleRows,
  createEmptyBulkRow,
  summarizeBulkRows,
  validateBulkRows,
} from './bulk-product-import.util';

describe('bulk-product-import.util', () => {
  it('builds 500 unique sample medicine rows', () => {
    const rows = buildBulkMedicineSampleRows(500, 'Medicare Pharmacy Store');
    expect(rows.length).toBe(500);
    expect(new Set(rows.map((row) => row['sku'])).size).toBe(500);
    expect(rows[0]['storeName']).toBe('Medicare Pharmacy Store');
    expect(String(rows[0]['name'])).not.toContain('SAMPLE');
  });
  it('marks missing required fields as errors with field labels', () => {
    const rows = validateBulkRows([createEmptyBulkRow()]);
    expect(rows[0].status).toBe('error');
    expect(rows[0].errors.join(' ')).toContain('Medicine Name');
    expect(rows[0].issues.some((issue) => issue.field === 'name' && issue.severity === 'error')).toBeTrue();
  });

  it('marks uncommon type as a warning on the Type field', () => {
    const rows = validateBulkRows([
      createEmptyBulkRow({
        name: 'Custom Med',
        unit: 'sachet',
        strengthValue: '10',
        strengthUnit: 'mg',
        storeName: 'Main',
        categoryName: 'General',
        costPrice: '5',
        sellingPrice: '8',
        openingStock: '2',
      }),
    ]);
    expect(rows[0].status).toBe('warning');
    expect(rows[0].issues.some((issue) => issue.field === 'unit' && issue.severity === 'warning')).toBeTrue();
  });

  it('detects duplicate SKUs inside the import', () => {
    const base = createEmptyBulkRow({
      name: 'Para',
      unit: 'tablet',
      strengthValue: '500',
      strengthUnit: 'mg',
      storeName: 'Main Store',
      categoryName: 'Tablets',
      costPrice: '10',
      sellingPrice: '20',
      openingStock: '5',
      sku: 'PARA-1',
    });
    const rows = validateBulkRows([
      base,
      createEmptyBulkRow({ ...base, name: 'Para 2', sku: 'PARA-1' }),
    ]);
    expect(rows[1].errors.some((msg) => /Duplicate SKU/i.test(msg))).toBeTrue();
  });

  it('builds one payload with no stock field on products', () => {
    const row = createEmptyBulkRow({
      name: 'Amoxicillin',
      unit: 'capsule',
      strengthValue: '250',
      strengthUnit: 'mg',
      storeId: '64b000000000000000000001',
      categoryName: 'Antibiotics',
      costPrice: '12',
      sellingPrice: '25',
      openingStock: '40',
    });
    const valid = validateBulkRows([row]);
    const payload = buildBulkCreatePayload(valid);
    expect(payload.items.length).toBe(1);
    expect((payload.items[0] as { stock?: unknown }).stock).toBeUndefined();
    expect(payload.items[0].openingStock).toBe(40);
  });

  it('summarizes valid and error counts', () => {
    const good = validateBulkRows([
      createEmptyBulkRow({
        name: 'Good Med',
        unit: 'tablet',
        strengthValue: '10',
        strengthUnit: 'mg',
        storeName: 'Store',
        categoryName: 'Cat',
        costPrice: '1',
        sellingPrice: '2',
        openingStock: '3',
      }),
    ])[0];
    const bad = validateBulkRows([createEmptyBulkRow()])[0];
    const summary = summarizeBulkRows([good, bad]);
    expect(summary.total).toBe(2);
    expect(summary.errors).toBe(1);
  });
});
