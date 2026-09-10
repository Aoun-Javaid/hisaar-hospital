import {
  AdmissionRecommendationRecord,
  admissionEnumLabel,
  doctorDisplayName,
} from './admission-recommendation.models';
import { Appointment, Doctor, Hospital, Patient } from '../../../shared/models/hospital.model';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dash(value: unknown): string {
  const text = String(value ?? '').trim();
  return text || '—';
}

function patientName(patient?: Patient | null): string {
  if (!patient) return '—';
  return `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '—';
}

function doctorName(doctor?: Doctor | null): string {
  return doctorDisplayName(doctor);
}

function snapshotSection(record: AdmissionRecommendationRecord, key: string): Record<string, unknown> {
  return ((record.clinicalSnapshot || {})[key] as Record<string, unknown>) || {};
}

function formatWhen(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function listValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ') || '—';
  }
  return dash(value);
}

function field(label: string, value: unknown): string {
  return `
    <div class="field">
      <div class="label">${esc(label)}</div>
      <div class="value">${esc(dash(value))}</div>
    </div>`;
}

function section(title: string, body: string): string {
  return `
    <section class="section">
      <h3>${esc(title)}</h3>
      ${body}
    </section>`;
}

export function buildAdmissionRecommendationPrintHtml(options: {
  hospital?: Hospital | null;
  patient?: Patient | null;
  appointment?: Appointment | null;
  doctor?: Doctor | null;
  record: AdmissionRecommendationRecord;
}): string {
  const { hospital, patient, appointment, doctor, record } = options;
  const clinical = snapshotSection(record, 'clinicalSummary');
  const decision = snapshotSection(record, 'admissionDecision');
  const treatment = snapshotSection(record, 'treatmentPlan');
  const nursing = snapshotSection(record, 'nursingOrders');
  const diet = snapshotSection(record, 'diet');
  const activity = snapshotSection(record, 'activity');
  const isolation = snapshotSection(record, 'isolation');
  const handover = snapshotSection(record, 'handover');
  const investigations = snapshotSection(record, 'investigations');
  const medications = Array.isArray(record.clinicalSnapshot?.['medications'])
    ? (record.clinicalSnapshot?.['medications'] as Array<Record<string, unknown>>)
    : [];

  const hospitalName = hospital?.name || 'Hospital';
  const addressLine = [hospital?.address, hospital?.city].filter(Boolean).join(', ');
  const contactLine = [hospital?.phone, hospital?.email].filter(Boolean).join(' · ');
  const logoUrl = String(hospital?.logoUrl || '').trim();

  const medRows = medications
    .map(
      (med) => `
      <tr>
        <td>${esc(dash(med['name']))}</td>
        <td>${esc(dash(med['dose']))}</td>
        <td>${esc(dash(med['route']))}</td>
        <td>${esc(dash(med['frequency']))}</td>
        <td>${esc(dash(med['duration']))}</td>
      </tr>`
    )
    .join('');

  const levelOfCare = admissionEnumLabel('levelOfCare', String(decision['levelOfCare'] || '')) || decision['levelOfCare'];
  const urgency = admissionEnumLabel('urgency', String(decision['urgency'] || '')) || decision['urgency'];
  const expectedTiming =
    admissionEnumLabel('expectedTiming', String(decision['expectedTiming'] || '')) || decision['expectedTiming'];
  const priority = admissionEnumLabel('priority', String(record.priority || decision['priority'] || 'routine'));
  const dietLabel = admissionEnumLabel('diet', String(diet['type'] || ''));
  const activityLabel = admissionEnumLabel('activity', String(activity['order'] || ''));
  const vitalsLabel = admissionEnumLabel('vitalsFrequency', String(nursing['vitalsFrequency'] || ''));
  const isolationTypeLabel = admissionEnumLabel('isolationType', String(isolation['type'] || ''));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Admission Recommendation</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #0f172a;
      margin: 0;
      background: #fff;
      font-size: 12px;
      line-height: 1.45;
    }
    .sheet { max-width: 780px; margin: 0 auto; }
    .letterhead {
      display: grid;
      grid-template-columns: ${logoUrl ? '72px 1fr' : '1fr'};
      gap: 12px;
      align-items: center;
      border-bottom: 2px solid #1e3a8a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .letterhead img {
      width: 64px;
      height: 64px;
      object-fit: contain;
    }
    .hospital-name {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .hospital-meta {
      margin-top: 4px;
      font-size: 11px;
      color: #475569;
    }
    .doc-title {
      text-align: center;
      font-size: 16px;
      font-weight: 700;
      margin: 0 0 14px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: #0f172a;
    }
    .section {
      margin-bottom: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }
    .section h3 {
      margin: 0;
      padding: 7px 10px;
      background: #eff6ff;
      color: #1e3a8a;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border-bottom: 1px solid #dbeafe;
    }
    .section-body { padding: 10px; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 14px;
    }
    .field .label {
      color: #64748b;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .field .value {
      font-size: 13px;
      font-weight: 600;
      margin-top: 2px;
      min-height: 16px;
      word-break: break-word;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      font-size: 11px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f8fafc; text-transform: uppercase; font-size: 10px; }
    .note {
      margin: 12px 0;
      padding: 8px 10px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      color: #1e3a8a;
      font-size: 11px;
    }
    .meta-line {
      margin-top: 14px;
      font-size: 10px;
      color: #64748b;
    }
    @media print {
      body { margin: 0; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="letterhead">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="" />` : ''}
      <div>
        <h1 class="hospital-name">${esc(hospitalName)}</h1>
        <div class="hospital-meta">
          ${addressLine ? `${esc(addressLine)}<br />` : ''}
          ${contactLine ? esc(contactLine) : ''}
        </div>
      </div>
    </header>

    <h2 class="doc-title">Admission Recommendation</h2>

    ${section(
      'Patient & Visit Information',
      `<div class="section-body grid-2">
        ${field('Order No', record.orderNo)}
        ${field('Date / Time', formatWhen(record.recommendedAt || record.createdAt))}
        ${field('Patient Name', patientName(patient))}
        ${field('MR No', patient?.patientNo)}
        ${field('Appointment No', appointment?.appointmentNo)}
        ${field('Doctor', doctorName(doctor))}
      </div>`
    )}

    ${section(
      'Clinical Information',
      `<div class="section-body grid-2">
        ${field('Reason for Admission', record.reason || clinical['reasonForAdmission'])}
        ${field('Provisional Diagnosis', record.initialDiagnosis || clinical['provisionalDiagnosis'])}
        ${field(
          'Chief Complaint / Symptoms',
          [clinical['chiefComplaint'], clinical['symptoms']].filter(Boolean).join(' — ')
        )}
        ${field(
          'Clinical Summary',
          [clinical['relevantHistory'], clinical['examinationFindings'] ? `Exam: ${clinical['examinationFindings']}` : '']
            .filter(Boolean)
            .join(' · ')
        )}
      </div>`
    )}

    ${section(
      'Care Plan & Timing',
      `<div class="section-body grid-2">
        ${field('Recommended Level of Care', levelOfCare)}
        ${field('Urgency', urgency)}
        ${field('Priority', priority)}
        ${field('Expected Timing', expectedTiming)}
        ${field('Initial Treatment Plan', treatment['plan'])}
        ${field('Clinical Goals', treatment['goals'])}
      </div>`
    )}

    ${section(
      'Investigations & Orders',
      `<div class="section-body grid-2">
        ${field('Lab', listValue(investigations['labTests']))}
        ${field('Imaging', listValue(investigations['imaging']))}
        ${field('Other Investigations', investigations['other'])}
        ${field('Diet', [dietLabel !== '—' ? dietLabel : '', diet['custom'] ? `(${diet['custom']})` : ''].filter(Boolean).join(' '))}
        ${field('Activity', activityLabel)}
        ${field('Monitoring', vitalsLabel !== '—' ? `Vitals: ${vitalsLabel}` : '')}
        ${field(
          'Isolation',
          [isolation['required'], isolationTypeLabel !== '—' ? `(${isolationTypeLabel})` : ''].filter(Boolean).join(' ')
        )}
      </div>`
    )}

    ${
      medications.length
        ? section(
            'Medication Instructions',
            `<div class="section-body">
              <table>
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Dose</th>
                    <th>Route</th>
                    <th>Frequency</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>${medRows}</tbody>
              </table>
            </div>`
          )
        : ''
    }

    ${section(
      'Ward & Additional Instructions',
      `<div class="section-body grid-2">
        ${field('Receiving Ward Instructions', handover['receivingWardInstructions'])}
        ${field('Additional Instructions', handover['additionalInstructions'])}
        ${field('Special Instructions / Handover', handover['specialInstructions'])}
      </div>`
    )}

    <div class="note">
      Admission recommendation only — room/bed allocation and formal admission are completed by the hospital admission / ward desk.
    </div>

    <div class="meta-line">
      System generated · ${esc(new Date().toLocaleString())}
      ${doctorName(doctor) !== '—' ? ` · Recommended by ${esc(doctorName(doctor))}` : ''}
    </div>
  </div>
</body>
</html>`;
}

export function printAdmissionRecommendationHtml(html: string): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100');
  if (!printWindow) {
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}
