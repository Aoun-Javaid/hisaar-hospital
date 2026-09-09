export interface PharmacyExportColumn {
  header: string;
  key: string;
}

export const escapePharmacyHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const buildPharmacyReportHtml = (
  title: string,
  columns: PharmacyExportColumn[],
  rows: Array<Record<string, unknown>>,
): string => {
  const headerCells = columns
    .map((column) => `<th>${escapePharmacyHtml(column.header)}</th>`)
    .join('');
  const bodyRows = rows.length
    ? rows
        .map((row) => {
          const cells = columns
            .map((column) => `<td>${escapePharmacyHtml(row[column.key])}</td>`)
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('')
    : `<tr><td colspan="${Math.max(columns.length, 1)}">No rows</td></tr>`;

  return `
<div class="pharmacy-export">
  <h1>${escapePharmacyHtml(title)}</h1>
  <p>Generated ${escapePharmacyHtml(new Date().toLocaleString())}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</div>
<style>
  .pharmacy-export { color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
  .pharmacy-export h1 { font-size: 18px; margin: 0 0 8px; }
  .pharmacy-export p { color: #64748b; font-size: 12px; margin: 0 0 16px; }
  .pharmacy-export table { border-collapse: collapse; font-size: 12px; width: 100%; }
  .pharmacy-export th, .pharmacy-export td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  .pharmacy-export th { background: #f1f5f9; font-weight: 700; }
</style>`.trim();
};
