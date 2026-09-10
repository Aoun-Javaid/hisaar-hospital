import {
  escHtml,
  patientDisplayName,
} from '../utils/hms-document-template.util';
import { HmsDocumentHospitalInfo } from '../services/hms-document.types';

const CHARGE_GROUP_LABELS: Record<string, string> = {
  consultation: 'Consultation Fee',
  room: 'Room Charges',
  doctor_visit: 'Doctor Visit',
  laboratory: 'Laboratory Tests',
  pharmacy: 'Medicines',
  procedure: 'Procedure Charges',
  operation: 'Operation Charges',
  nursing: 'Nursing / Ward',
  ward: 'Ward Charges',
  other: 'Other Charges',
  misc: 'Other Charges',
};

export interface DischargeDocumentPatient {
  firstName?: string;
  lastName?: string;
  patientNo?: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  bloodGroup?: string | null;
}

export interface DischargeDocumentContext {
  title?: string;
  patient?: DischargeDocumentPatient | null;
  encounterNo?: string;
  admissionNo?: string;
  consultantName?: string;
  departmentName?: string;
  wardLabel?: string;
  roomBed?: string;
  admittedAt?: string;
  dischargedAt?: string;
  lengthOfStayDays?: number | null;
  chargeBreakdown?: Record<string, number>;
  summary?: {
    totalCharges?: number;
    totalDiscount?: number;
    netPayable?: number;
    totalPaid?: number;
    totalRefunded?: number;
    balance?: number;
    securityDepositHeld?: number;
    securityDepositApplied?: number;
    advanceCreditBalance?: number;
  };
  hospital?: HmsDocumentHospitalInfo | null;
  generatedBy?: string;
}

function formatMoneyAmount(value: unknown): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPrettyDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day}, ${time}`;
}

function capitalize(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text) return '—';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ageFromDob(dateOfBirth?: string | null): string {
  if (!dateOfBirth) return '—';
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return '—';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  if (age < 0) return '—';
  return `${age} year${age === 1 ? '' : 's'}`;
}

function lengthOfStayLabel(context: DischargeDocumentContext): string {
  if (typeof context.lengthOfStayDays === 'number' && Number.isFinite(context.lengthOfStayDays)) {
    const days = Math.max(1, Math.ceil(context.lengthOfStayDays));
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (!context.admittedAt) return '—';
  const start = new Date(context.admittedAt);
  const end = context.dischargedAt ? new Date(context.dischargedAt) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const ms = Math.max(0, end.getTime() - start.getTime());
  const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  return `${days} day${days === 1 ? '' : 's'}`;
}

function wardRoomLabel(context: DischargeDocumentContext): string {
  const parts = [context.wardLabel, context.roomBed]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .map((part) => part.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  return parts.join(' / ') || '—';
}

function hospitalLocation(hospital?: HmsDocumentHospitalInfo | null): string {
  if (!hospital) return '—';
  return [hospital.address, hospital.city].filter(Boolean).join(', ') || hospital.name || '—';
}

function chargeDescription(key: string, context: DischargeDocumentContext): string {
  const base = CHARGE_GROUP_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (key === 'room' && context.wardLabel) {
    return `${base} (${context.wardLabel})`;
  }
  return base;
}

function logoHtml(hospital?: HmsDocumentHospitalInfo | null): string {
  if (hospital?.logoUrl) {
    return `<img class="ds-logo-img" src="${escHtml(hospital.logoUrl)}" alt="${escHtml(hospital.name || 'Hospital')}" />`;
  }
  const initial = escHtml((hospital?.name || 'H').trim().charAt(0).toUpperCase() || 'H');
  return `<div class="ds-logo-fallback" aria-hidden="true">${initial}</div>`;
}

export function buildDischargeStatementDocumentHtml(context: DischargeDocumentContext): string {
  const summary = context.summary || {};
  const hospital = context.hospital;
  const hospitalName = hospital?.name || 'Hospital';
  const title = context.title || 'Discharge Statement';
  const patientName = patientDisplayName(context.patient);
  const patientInitialSource =
    [context.patient?.firstName, context.patient?.lastName].filter(Boolean).join(' ').trim() ||
    context.patient?.patientNo ||
    patientName;
  const patientInitial = escHtml((patientInitialSource || 'P').trim().charAt(0).toUpperCase() || 'P');
  const generatedAt = formatPrettyDateTime(new Date());

  const breakdownEntries = Object.entries(context.chargeBreakdown || {}).filter(
    ([, amount]) => Number(amount) !== 0
  );
  const chargeRows =
    breakdownEntries.length > 0
      ? breakdownEntries
          .map(
            ([key, amount], index) => `
            <tr>
              <td class="ds-num">${index + 1}</td>
              <td>${escHtml(chargeDescription(key, context))}</td>
              <td class="ds-amount">${escHtml(formatMoneyAmount(amount))}</td>
            </tr>`
          )
          .join('')
      : `
            <tr>
              <td colspan="3" class="ds-empty">No charge breakdown available.</td>
            </tr>`;

  const paid = Number(summary.totalPaid || 0);
  const due = Number(summary.balance || 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)} · ${escHtml(hospitalName)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fff;
      color: #1e293b;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    .ds-sheet {
      max-width: 820px;
      margin: 0 auto;
      padding: 8px 4px 4px;
    }
    .ds-header {
      align-items: flex-start;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .ds-brand {
      align-items: center;
      display: flex;
      gap: 12px;
      min-width: 0;
    }
    .ds-logo-img {
      border-radius: 999px;
      height: 58px;
      object-fit: contain;
      width: 58px;
    }
    .ds-logo-fallback {
      align-items: center;
      background: linear-gradient(145deg, #0d9488 0%, #0f766e 100%);
      border-radius: 999px;
      color: #fff;
      display: inline-flex;
      font-size: 22px;
      font-weight: 800;
      height: 58px;
      justify-content: center;
      width: 58px;
    }
    .ds-brand-name {
      color: #0f172a;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }
    .ds-brand-tag {
      color: #64748b;
      font-size: 11px;
      margin-top: 3px;
    }
    .ds-title-block {
      text-align: right;
    }
    .ds-doc-title {
      color: #0f172a;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.04em;
      margin: 0;
      text-transform: uppercase;
    }
    .ds-hospital-title {
      color: #0d9488;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .ds-hospital-tag {
      color: #94a3b8;
      font-size: 11px;
      margin-top: 2px;
    }
    .ds-patient {
      align-items: center;
      background: #f1f5f9;
      border-radius: 14px;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      margin-bottom: 14px;
      padding: 16px 18px;
    }
    .ds-patient-left {
      align-items: center;
      display: flex;
      gap: 14px;
      min-width: 0;
    }
    .ds-avatar {
      align-items: center;
      background: #e2e8f0;
      border-radius: 999px;
      color: #64748b;
      display: inline-flex;
      flex-shrink: 0;
      font-size: 18px;
      font-weight: 800;
      height: 64px;
      justify-content: center;
      width: 64px;
    }
    .ds-patient-label {
      color: #64748b;
      font-size: 11px;
      font-weight: 600;
    }
    .ds-patient-name {
      color: #0f172a;
      font-size: 20px;
      font-weight: 800;
      margin-top: 2px;
    }
    .ds-patient-facts {
      color: #475569;
      display: flex;
      flex-wrap: wrap;
      font-size: 12px;
      font-weight: 600;
      gap: 12px;
      margin-top: 8px;
    }
    .ds-patient-meta {
      display: grid;
      gap: 6px;
      min-width: 210px;
    }
    .ds-meta-row {
      display: flex;
      gap: 8px;
      justify-content: space-between;
    }
    .ds-meta-row span {
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }
    .ds-meta-row strong {
      color: #0f172a;
      font-size: 12px;
      text-align: right;
    }
    .ds-stay {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-bottom: 16px;
    }
    .ds-stay-card {
      background: #fff;
      border: 1px solid #dbe4ee;
      border-radius: 12px;
      padding: 12px 14px;
    }
    .ds-stay-card .label {
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }
    .ds-stay-card .value {
      color: #0f172a;
      font-size: 13px;
      font-weight: 800;
      margin-top: 4px;
    }
    .ds-charges {
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      margin-bottom: 14px;
      overflow: hidden;
    }
    .ds-charges-head {
      align-items: center;
      border-bottom: 1px solid #eef2f7;
      color: #0f172a;
      display: flex;
      font-size: 14px;
      font-weight: 800;
      gap: 8px;
      padding: 12px 14px;
    }
    .ds-charges-head .mark {
      color: #0d9488;
    }
    table.ds-table {
      border-collapse: collapse;
      width: 100%;
    }
    table.ds-table thead th {
      background: #eef6f8;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      padding: 10px 14px;
      text-align: left;
    }
    table.ds-table thead th:last-child,
    table.ds-table tbody td:last-child {
      text-align: right;
    }
    table.ds-table tbody td {
      border-top: 1px solid #f1f5f9;
      color: #334155;
      padding: 11px 14px;
    }
    .ds-num { color: #94a3b8; width: 36px; }
    .ds-amount { font-weight: 700; }
    .ds-empty {
      color: #64748b;
      padding: 24px 14px !important;
      text-align: center !important;
    }
    .ds-totals {
      border-top: 1px solid #e2e8f0;
      display: grid;
      gap: 6px;
      justify-content: end;
      padding: 12px 14px 14px;
    }
    .ds-total-row {
      display: flex;
      gap: 28px;
      justify-content: flex-end;
      min-width: 240px;
    }
    .ds-total-row span { color: #64748b; font-weight: 600; }
    .ds-total-row strong { color: #0f172a; font-weight: 700; min-width: 90px; text-align: right; }
    .ds-total-row.is-net {
      border-top: 1px solid #e2e8f0;
      margin-top: 4px;
      padding-top: 8px;
    }
    .ds-total-row.is-net span,
    .ds-total-row.is-net strong {
      color: #0f172a;
      font-size: 14px;
      font-weight: 800;
    }
    .ds-payment {
      display: grid;
      gap: 12px;
      grid-template-columns: 1fr 1fr;
      margin-bottom: 16px;
    }
    .ds-payment-side {
      background: #0f766e;
      border-radius: 12px;
      color: #fff;
      padding: 14px 18px;
    }
    .ds-payment-side .label {
      font-size: 11px;
      font-weight: 600;
      opacity: 0.9;
    }
    .ds-payment-side .value {
      font-size: 22px;
      font-weight: 800;
      margin-top: 2px;
    }
    .ds-thanks {
      align-items: center;
      background: #f8fafc;
      border-radius: 12px;
      color: #475569;
      display: flex;
      font-size: 12px;
      gap: 10px;
      margin-bottom: 18px;
      padding: 12px 14px;
    }
    .ds-thanks .heart { color: #ef4444; font-size: 14px; }
    .ds-signoff {
      margin-bottom: 18px;
    }
    .ds-generated {
      color: #94a3b8;
      font-size: 11px;
    }
    .ds-footer {
      align-items: center;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      display: flex;
      flex-wrap: wrap;
      font-size: 11px;
      gap: 10px 16px;
      justify-content: space-between;
      padding-top: 12px;
    }
    .ds-footer-contacts {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 16px;
    }
    .ds-footer-slogan {
      color: #94a3b8;
      font-style: italic;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .ds-sheet { max-width: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="ds-sheet">
    <header class="ds-header">
      <div class="ds-brand">
        ${logoHtml(hospital)}
        <div>
          <div class="ds-brand-name">${escHtml(hospitalName)}</div>
          <div class="ds-brand-tag">${escHtml(hospitalLocation(hospital))}</div>
        </div>
      </div>
      <div class="ds-title-block">
        <h1 class="ds-doc-title">${escHtml(title)}</h1>
        <div class="ds-hospital-title">${escHtml(hospitalName)}</div>
        <div class="ds-hospital-tag">Compassion • Care • Better Tomorrow</div>
      </div>
    </header>

    <section class="ds-patient">
      <div class="ds-patient-left">
        <div class="ds-avatar">${patientInitial}</div>
        <div>
          <div class="ds-patient-label">Patient Name</div>
          <div class="ds-patient-name">${escHtml(patientName)}</div>
          <div class="ds-patient-facts">
            <span>${escHtml(capitalize(context.patient?.gender))}</span>
            <span>${escHtml(ageFromDob(context.patient?.dateOfBirth))}</span>
            <span>${escHtml(context.patient?.bloodGroup || '—')}</span>
          </div>
        </div>
      </div>
      <div class="ds-patient-meta">
        <div class="ds-meta-row"><span>MRN</span><strong>${escHtml(context.patient?.patientNo || '—')}</strong></div>
        <div class="ds-meta-row"><span>Admission No</span><strong>${escHtml(context.admissionNo || '—')}</strong></div>
        <div class="ds-meta-row"><span>Ward / Room</span><strong>${escHtml(wardRoomLabel(context))}</strong></div>
        <div class="ds-meta-row"><span>Consultant</span><strong>${escHtml(context.consultantName || '—')}</strong></div>
      </div>
    </section>

    <section class="ds-stay">
      <div class="ds-stay-card">
        <div class="label">Admission Date &amp; Time</div>
        <div class="value">${escHtml(formatPrettyDateTime(context.admittedAt))}</div>
      </div>
      <div class="ds-stay-card">
        <div class="label">Discharge Date &amp; Time</div>
        <div class="value">${escHtml(formatPrettyDateTime(context.dischargedAt || new Date()))}</div>
      </div>
      <div class="ds-stay-card">
        <div class="label">Length of Stay</div>
        <div class="value">${escHtml(lengthOfStayLabel(context))}</div>
      </div>
    </section>

    <section class="ds-charges">
      <div class="ds-charges-head"><span class="mark">&#9635;</span> Charges Summary</div>
      <table class="ds-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Amount (PKR)</th>
          </tr>
        </thead>
        <tbody>
          ${chargeRows}
        </tbody>
      </table>
      <div class="ds-totals">
        <div class="ds-total-row">
          <span>Gross Charges</span>
          <strong>${escHtml(formatMoneyAmount(summary.totalCharges))}</strong>
        </div>
        <div class="ds-total-row">
          <span>Discount</span>
          <strong>${escHtml(formatMoneyAmount(summary.totalDiscount))}</strong>
        </div>
        <div class="ds-total-row is-net">
          <span>Net Payable</span>
          <strong>${escHtml(formatMoneyAmount(summary.netPayable))}</strong>
        </div>
      </div>
    </section>

    <section class="ds-payment">
      <div class="ds-payment-side">
        <div class="label">Amount Paid</div>
        <div class="value">${escHtml(formatMoneyAmount(paid))}</div>
      </div>
      <div class="ds-payment-side">
        <div class="label">Amount Due</div>
        <div class="value">${escHtml(formatMoneyAmount(due))}</div>
      </div>
    </section>

    <div class="ds-thanks">
      <span class="heart">&#10084;</span>
      <span>Thank you for choosing ${escHtml(hospitalName)}. We wish you a speedy recovery.</span>
    </div>

    <div class="ds-signoff">
      <div class="ds-generated">System generated ${escHtml(generatedAt)}</div>
    </div>

    <footer class="ds-footer">
      <div class="ds-footer-contacts">
        <span>${escHtml(hospitalLocation(hospital))}</span>
        ${hospital?.phone ? `<span>${escHtml(hospital.phone)}</span>` : ''}
        ${hospital?.email ? `<span>${escHtml(hospital.email)}</span>` : ''}
      </div>
      <div class="ds-footer-slogan">Your Health, Our Priority</div>
    </footer>
  </div>
</body>
</html>`;
}

export function buildRunningBillDocumentHtml(context: DischargeDocumentContext): string {
  return buildDischargeStatementDocumentHtml({
    ...context,
    title: 'Running Bill',
  });
}
