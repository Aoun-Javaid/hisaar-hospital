import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Appointment, Doctor, Patient, Prescription } from '../../../shared/models/hospital.model';

export type AdmissionRecommendationStatus =
  | 'draft'
  | 'pending'
  | 'acknowledged'
  | 'admitted'
  | 'cancelled'
  | 'declined';

export interface AdmissionRecommendationRecord {
  _id: string;
  orderNo?: string;
  status: AdmissionRecommendationStatus;
  patientId: string | Patient;
  recommendedByDoctorId?: string | Doctor;
  departmentId?: string | { _id?: string; name?: string };
  sourceAppointmentId?: string | Appointment;
  sourceEncounterId?: string | null;
  prescriptionId?: string | null;
  reason?: string;
  initialDiagnosis?: string;
  priority?: 'routine' | 'urgent' | 'emergency';
  clinicalSnapshot?: Record<string, unknown>;
  recommendedAt?: string;
  createdAt?: string;
  roomAllotmentId?: string | null;
  admissionNo?: string;
  treatmentCatalogId?: string | { _id?: string; name?: string; code?: string; baseRate?: number; type?: string } | null;
  treatmentSnapshot?: Record<string, unknown> | null;
  recommendedOperatingDoctorId?: string | Doctor | null;
  preferredOperationAt?: string | null;
  roomDiscountRecommendation?: {
    type?: 'none' | 'percentage' | 'fixed';
    value?: number;
    reason?: string;
  } | null;
  procedureDiscountRecommendation?: {
    type?: 'none' | 'percentage' | 'fixed';
    value?: number;
    reason?: string;
  } | null;
  operationScheduleId?: string | null;
}

export function doctorDisplayName(doctor?: Doctor | null): string {
  if (!doctor) {
    return '—';
  }
  return doctor.user?.name || doctor.specialization || '—';
}

export function mapAdmissionRecommendationRecord(raw: unknown): AdmissionRecommendationRecord {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    _id: String(item['_id'] || ''),
    orderNo: item['orderNo'] ? String(item['orderNo']) : undefined,
    status: (String(item['status'] || 'draft') as AdmissionRecommendationStatus),
    patientId: item['patientId'] as string | Patient,
    recommendedByDoctorId: item['recommendedByDoctorId'] as string | Doctor | undefined,
    departmentId: item['departmentId'] as AdmissionRecommendationRecord['departmentId'],
    sourceAppointmentId: item['sourceAppointmentId'] as string | Appointment | undefined,
    sourceEncounterId: item['sourceEncounterId'] ? String(item['sourceEncounterId']) : null,
    prescriptionId: item['prescriptionId'] ? String(item['prescriptionId']) : null,
    reason: item['reason'] ? String(item['reason']) : undefined,
    initialDiagnosis: item['initialDiagnosis'] ? String(item['initialDiagnosis']) : undefined,
    priority: item['priority'] as AdmissionRecommendationRecord['priority'],
    clinicalSnapshot: (item['clinicalSnapshot'] as Record<string, unknown>) || {},
    recommendedAt: item['recommendedAt'] ? String(item['recommendedAt']) : undefined,
    createdAt: item['createdAt'] ? String(item['createdAt']) : undefined,
    roomAllotmentId: item['roomAllotmentId'] ? String(item['roomAllotmentId']) : null,
    admissionNo: item['admissionNo'] ? String(item['admissionNo']) : undefined,
    treatmentCatalogId: item['treatmentCatalogId'] as AdmissionRecommendationRecord['treatmentCatalogId'],
    treatmentSnapshot: (item['treatmentSnapshot'] as Record<string, unknown>) || null,
    recommendedOperatingDoctorId: item['recommendedOperatingDoctorId'] as AdmissionRecommendationRecord['recommendedOperatingDoctorId'],
    preferredOperationAt: item['preferredOperationAt'] ? String(item['preferredOperationAt']) : null,
    roomDiscountRecommendation: (item['roomDiscountRecommendation'] as AdmissionRecommendationRecord['roomDiscountRecommendation']) || null,
    procedureDiscountRecommendation:
      (item['procedureDiscountRecommendation'] as AdmissionRecommendationRecord['procedureDiscountRecommendation']) || null,
    operationScheduleId: item['operationScheduleId'] ? String(item['operationScheduleId']) : null,
  };
}

export function admissionSnapshotText(
  snapshot: Record<string, unknown> | undefined,
  section: string,
  field: string
): string {
  const sectionValue = snapshot?.[section];
  if (!sectionValue || typeof sectionValue !== 'object') {
    return '—';
  }
  const value = (sectionValue as Record<string, unknown>)[field];
  return value ? String(value) : '—';
}

export function admissionHandoverText(snapshot: Record<string, unknown> | undefined): string {
  const handover = snapshot?.['handover'];
  if (!handover || typeof handover !== 'object') {
    return '—';
  }
  const record = handover as Record<string, unknown>;
  return String(record['receivingWardInstructions'] || record['additionalInstructions'] || '—');
}

export const ADMISSION_TYPE_OPTIONS = ['medical', 'surgical', 'obstetric', 'pediatric', 'other'] as const;

const ENUM_LABELS: Record<string, Record<string, string>> = {
  urgency: { elective: 'Elective / Planned', urgent: 'Urgent', emergency: 'Emergency' },
  levelOfCare: {
    general_ward: 'General Ward',
    private_semi_private: 'Private / Semi-private',
    hdu: 'HDU',
    icu: 'ICU',
    isolation: 'Isolation',
    other: 'Other',
  },
  priority: { routine: 'Routine', urgent: 'Urgent', emergency: 'Critical' },
  expectedTiming: { now: 'Now', today: 'Today', scheduled: 'Scheduled' },
  admissionType: { medical: 'Medical', surgical: 'Surgical', obstetric: 'Obstetric', pediatric: 'Pediatric', other: 'Other' },
  vitalsFrequency: {
    routine: 'Routine',
    every_8h: 'Every 8 hours',
    every_6h: 'Every 6 hours',
    every_4h: 'Every 4 hours',
    every_2h: 'Every 2 hours',
    hourly: 'Hourly',
    custom: 'Custom',
  },
  activity: {
    as_tolerated: 'As tolerated',
    ambulate_assist: 'Ambulate with assistance',
    bed_rest: 'Bed rest',
    bathroom_privileges: 'Bathroom privileges',
    fall_precautions: 'Fall precautions',
    custom: 'Custom',
  },
  diet: {
    regular: 'Regular',
    npo: 'NPO',
    clear_liquids: 'Clear liquids',
    full_liquids: 'Full liquids',
    diabetic: 'Diabetic',
    low_salt: 'Low salt',
    renal: 'Renal',
    soft: 'Soft',
    other: 'Other',
  },
  medReconciliationStatus: {
    reviewed: 'Reviewed',
    needs_reconciliation: 'Needs review',
    unable_to_verify: 'Unable to verify',
  },
  isolationType: {
    contact: 'Contact',
    droplet: 'Droplet',
    airborne: 'Airborne',
    protective: 'Protective / Other',
  },
  vteAssessment: { not_assessed: 'Not yet assessed', low: 'Low', moderate: 'Moderate', high: 'High' },
  bleedingRisk: { none_known: 'None known', present: 'Present', requires_review: 'Requires review' },
  prophylaxisDecision: {
    not_indicated: 'Not indicated',
    mechanical: 'Mechanical',
    pharmacological: 'Pharmacological',
    already_anticoagulated: 'Already anticoagulated',
    contraindicated: 'Contraindicated / defer',
  },
};

export function admissionEnumLabel(group: keyof typeof ENUM_LABELS, value?: string | null): string {
  const key = String(value || '').trim();
  if (!key) return '—';
  return ENUM_LABELS[group]?.[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function admissionSelectOptions(group: keyof typeof ENUM_LABELS, values: readonly string[]): Array<{ value: string; label: string }> {
  return values.map((value) => ({ value, label: admissionEnumLabel(group, value) }));
}

export function doctorProfileLine(doctor?: Doctor | null): string {
  if (!doctor) return '';
  const parts = [doctor.qualification, doctor.specialization || doctor.department?.name].filter(Boolean);
  return parts.join(' • ');
}

function normalizeEntityId(value: unknown): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return String((value as { _id: string })._id);
  }
  return String(value);
}

export const ADMISSION_URGENCY_OPTIONS = ['elective', 'urgent', 'emergency'] as const;
export const EXPECTED_TIMING_OPTIONS = ['now', 'today', 'scheduled'] as const;
export const ADMISSION_PRIORITY_OPTIONS = ['routine', 'urgent', 'emergency'] as const;
export const ADMISSION_LEVEL_OPTIONS = [
  'general_ward',
  'private_semi_private',
  'hdu',
  'icu',
  'isolation',
  'other',
] as const;
export const VITALS_FREQUENCY_OPTIONS = [
  'routine',
  'every_8h',
  'every_6h',
  'every_4h',
  'every_2h',
  'hourly',
  'custom',
] as const;
export const ACTIVITY_OPTIONS = [
  'as_tolerated',
  'ambulate_assist',
  'bed_rest',
  'bathroom_privileges',
  'fall_precautions',
  'custom',
] as const;
export const DIET_OPTIONS = [
  'regular',
  'npo',
  'clear_liquids',
  'full_liquids',
  'diabetic',
  'low_salt',
  'renal',
  'soft',
  'other',
] as const;

export function admissionRecommendationStatusLabel(status?: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending':
      return 'Recommended';
    case 'acknowledged':
      return 'Acknowledged';
    case 'admitted':
      return 'Admitted';
    case 'cancelled':
      return 'Cancelled';
    case 'declined':
      return 'Not Admitted';
    default:
      return status || '—';
  }
}

export function buildAdmissionRecommendationForm(fb: FormBuilder): FormGroup {
  return fb.group({
    admissionRequired: [true],
    urgency: ['elective', Validators.required],
    levelOfCare: ['general_ward', Validators.required],
    consultantDoctorId: ['', Validators.required],
    departmentId: [''],
    recommendedWard: [''],
    admissionType: ['medical'],
    priority: ['routine', Validators.required],
    expectedTiming: ['now', Validators.required],
    scheduledAt: [''],
    chiefComplaint: [''],
    symptoms: [''],
    symptomDuration: [''],
    reasonForAdmission: ['', Validators.required],
    provisionalDiagnosis: ['', Validators.required],
    differentialDiagnosis: [''],
    relevantHistory: [''],
    examinationFindings: [''],
    vitals: fb.group({
      temperature: [''],
      pulse: [''],
      bp: [''],
      respiratoryRate: [''],
      spo2: [''],
      weight: [''],
      consciousness: [''],
    }),
    knownAllergies: [''],
    drugAllergies: [''],
    foodAllergies: [''],
    currentMedications: [''],
    medReconciliationStatus: ['reviewed'],
    chronicConditions: [''],
    pregnancyStatus: [''],
    anticoagulantUse: [''],
    treatmentPlan: [''],
    clinicalGoals: [''],
    specialInstructions: [''],
    vitalsFrequency: ['routine'],
    vitalsFrequencyCustom: [''],
    monitoring: fb.group({
      intakeOutput: [false],
      bloodGlucose: [false],
      oxygenSaturation: [false],
      neuroObservations: [false],
      cardiacMonitoring: [false],
      other: [''],
    }),
    fallPrecautions: ['not_assessed'],
    pressureInjuryRisk: ['not_assessed'],
    activityOrder: ['as_tolerated'],
    activityCustom: [''],
    diet: ['regular'],
    dietCustom: [''],
    ivAccessRequired: [false],
    ivFluid: [''],
    ivRate: [''],
    ivDuration: [''],
    ivInstruction: [''],
    oxygenRequired: [false],
    oxygenDevice: [''],
    oxygenFlow: [''],
    oxygenNotes: [''],
    medications: fb.array([]),
    labTests: [''],
    imaging: [''],
    otherInvestigations: [''],
    proposedProcedures: [''],
    specialistConsults: [''],
    treatmentCatalogId: [''],
    recommendedOperatingDoctorId: [''],
    preferredOperationAt: [''],
    roomDiscountType: ['none'],
    roomDiscountValue: [0],
    roomDiscountReason: [''],
    procedureDiscountType: ['none'],
    procedureDiscountValue: [0],
    procedureDiscountReason: [''],
    isolationRequired: ['no'],
    isolationType: [''],
    isolationReason: [''],
    vteAssessment: ['not_assessed'],
    bleedingRisk: ['none_known'],
    prophylaxisDecision: ['not_indicated'],
    vteNotApplicable: [false],
    resuscitationStatus: [''],
    escalationInstruction: [''],
    limitationNotes: [''],
    receivingWardInstructions: [''],
    additionalInstructions: [''],
  });
}

export const ADMISSION_RECOMMEND_REQUIRED_FIELDS = [
  'urgency',
  'levelOfCare',
  'consultantDoctorId',
  'priority',
  'expectedTiming',
  'reasonForAdmission',
  'provisionalDiagnosis',
] as const;

export function admissionRecommendRequiredFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    urgency: 'Urgency',
    levelOfCare: 'Level of Care',
    consultantDoctorId: 'Consultant Doctor',
    priority: 'Priority',
    expectedTiming: 'Expected Timing',
    reasonForAdmission: 'Reason for Admission',
    provisionalDiagnosis: 'Provisional Diagnosis',
  };
  return labels[field] || field;
}

export function collectAdmissionRecommendValidationErrors(form: FormGroup): string[] {
  return ADMISSION_RECOMMEND_REQUIRED_FIELDS.filter((field) => {
    const control = form.get(field);
    return !control || control.invalid || !String(control.value ?? '').trim();
  }).map(admissionRecommendRequiredFieldLabel);
}

export function isAdmissionRecommendFormValid(form: FormGroup): boolean {
  return collectAdmissionRecommendValidationErrors(form).length === 0;
}

export function createAdmissionMedicationGroup(fb: FormBuilder, value?: Record<string, unknown>): FormGroup {
  const hasName = Boolean(String(value?.['name'] || '').trim());
  return fb.group({
    name: [String(value?.['name'] || ''), hasName ? Validators.required : []],
    dose: [String(value?.['dose'] || '')],
    route: [String(value?.['route'] || '')],
    frequency: [String(value?.['frequency'] || '')],
    duration: [String(value?.['duration'] || '')],
    startInstruction: [String(value?.['startInstruction'] || '')],
    prn: [Boolean(value?.['prn'])],
    prnIndication: [String(value?.['prnIndication'] || '')],
    notes: [String(value?.['notes'] || '')],
  });
}

export function patchAdmissionRecommendationForm(
  form: FormGroup,
  fb: FormBuilder,
  record?: AdmissionRecommendationRecord | null,
  context?: {
    patient?: Patient | null;
    appointment?: Appointment | null;
    prescription?: Partial<Prescription> | null;
    doctor?: Doctor | null;
  }
): void {
  const snapshot = (record?.clinicalSnapshot || {}) as Record<string, Record<string, unknown>>;
  const decision = snapshot['admissionDecision'] || {};
  const clinical = snapshot['clinicalSummary'] || {};
  const safety = snapshot['patientSafety'] || {};
  const treatment = snapshot['treatmentPlan'] || {};
  const nursing = snapshot['nursingOrders'] || {};
  const activity = snapshot['activity'] || {};
  const diet = snapshot['diet'] || {};
  const ivOxygen = snapshot['ivFluidOxygen'] || {};
  const investigations = snapshot['investigations'] || {};
  const procedures = snapshot['proceduresConsults'] || {};
  const isolation = snapshot['isolation'] || {};
  const vte = snapshot['vteReview'] || {};
  const codeStatus = snapshot['codeStatus'] || {};
  const handover = snapshot['handover'] || {};
  const vitals = (clinical['vitals'] as Record<string, string>) || context?.prescription?.vitals || {};

  form.patchValue({
    admissionRequired: decision['admissionRequired'] !== false,
    urgency: decision['urgency'] || 'elective',
    levelOfCare: decision['levelOfCare'] || 'general_ward',
    consultantDoctorId: normalizeEntityId(
      decision['consultantDoctorId'] ||
        record?.recommendedByDoctorId ||
        context?.doctor?._id ||
        context?.appointment?.doctorId ||
        ''
    ),
    departmentId: normalizeEntityId(
      decision['departmentId'] ||
        record?.departmentId ||
        context?.appointment?.departmentId ||
        context?.appointment?.department?._id ||
        context?.doctor?.departmentId ||
        context?.doctor?.department?._id ||
        ''
    ),
    recommendedWard: decision['recommendedWard'] || '',
    admissionType: decision['admissionType'] || 'medical',
    priority: record?.priority || decision['priority'] || 'routine',
    expectedTiming: decision['expectedTiming'] || 'now',
    scheduledAt: decision['scheduledAt'] || '',
    chiefComplaint: clinical['chiefComplaint'] || context?.prescription?.chiefComplaint || context?.appointment?.reason || '',
    symptoms: clinical['symptoms'] || '',
    symptomDuration: clinical['symptomDuration'] || '',
    reasonForAdmission: record?.reason || clinical['reasonForAdmission'] || '',
    provisionalDiagnosis: record?.initialDiagnosis || clinical['provisionalDiagnosis'] || context?.prescription?.diagnosis || '',
    differentialDiagnosis: clinical['differentialDiagnosis'] || '',
    relevantHistory: clinical['relevantHistory'] || context?.prescription?.history || '',
    examinationFindings: clinical['examinationFindings'] || context?.prescription?.examination || '',
    vitals: {
      temperature: vitals['temperature'] || '',
      pulse: vitals['pulse'] || '',
      bp: vitals['bp'] || '',
      respiratoryRate: vitals['respiratoryRate'] || '',
      spo2: vitals['spo2'] || '',
      weight: vitals['weight'] || '',
      consciousness: vitals['consciousness'] || '',
    },
    knownAllergies: safety['knownAllergies'] || '',
    drugAllergies: safety['drugAllergies'] || '',
    foodAllergies: safety['foodAllergies'] || '',
    currentMedications: safety['currentMedications'] || '',
    medReconciliationStatus: safety['medReconciliationStatus'] || 'reviewed',
    chronicConditions: safety['chronicConditions'] || '',
    pregnancyStatus: safety['pregnancyStatus'] || '',
    anticoagulantUse: safety['anticoagulantUse'] || '',
    treatmentPlan: treatment['plan'] || '',
    clinicalGoals: treatment['goals'] || '',
    specialInstructions: treatment['specialInstructions'] || '',
    vitalsFrequency: nursing['vitalsFrequency'] || 'routine',
    vitalsFrequencyCustom: nursing['vitalsFrequencyCustom'] || '',
    monitoring: nursing['monitoring'] || {},
    fallPrecautions: nursing['fallPrecautions'] || 'not_assessed',
    pressureInjuryRisk: nursing['pressureInjuryRisk'] || 'not_assessed',
    activityOrder: activity['order'] || 'as_tolerated',
    activityCustom: activity['custom'] || '',
    diet: diet['type'] || 'regular',
    dietCustom: diet['custom'] || '',
    ivAccessRequired: Boolean(ivOxygen['ivAccessRequired']),
    ivFluid: ivOxygen['ivFluid'] || '',
    ivRate: ivOxygen['ivRate'] || '',
    ivDuration: ivOxygen['ivDuration'] || '',
    ivInstruction: ivOxygen['ivInstruction'] || '',
    oxygenRequired: Boolean(ivOxygen['oxygenRequired']),
    oxygenDevice: ivOxygen['oxygenDevice'] || '',
    oxygenFlow: ivOxygen['oxygenFlow'] || '',
    oxygenNotes: ivOxygen['oxygenNotes'] || '',
    labTests: Array.isArray(investigations['labTests']) ? (investigations['labTests'] as string[]).join('\n') : '',
    imaging: Array.isArray(investigations['imaging']) ? (investigations['imaging'] as string[]).join('\n') : '',
    otherInvestigations: investigations['other'] || '',
    proposedProcedures: procedures['proposedProcedures'] || '',
    specialistConsults: procedures['specialistConsults'] || '',
    treatmentCatalogId: normalizeEntityId(record?.treatmentCatalogId || ''),
    recommendedOperatingDoctorId: normalizeEntityId(record?.recommendedOperatingDoctorId || ''),
    preferredOperationAt: record?.preferredOperationAt
      ? String(record.preferredOperationAt).slice(0, 16)
      : '',
    roomDiscountType: record?.roomDiscountRecommendation?.type || 'none',
    roomDiscountValue: record?.roomDiscountRecommendation?.value || 0,
    roomDiscountReason: record?.roomDiscountRecommendation?.reason || '',
    procedureDiscountType: record?.procedureDiscountRecommendation?.type || 'none',
    procedureDiscountValue: record?.procedureDiscountRecommendation?.value || 0,
    procedureDiscountReason: record?.procedureDiscountRecommendation?.reason || '',
    isolationRequired: isolation['required'] || 'no',
    isolationType: isolation['type'] || '',
    isolationReason: isolation['reason'] || '',
    vteAssessment: vte['assessment'] || 'not_assessed',
    bleedingRisk: vte['bleedingRisk'] || 'none_known',
    prophylaxisDecision: vte['prophylaxisDecision'] || 'not_indicated',
    vteNotApplicable: Boolean(vte['notApplicable']),
    resuscitationStatus: codeStatus['resuscitationStatus'] || '',
    escalationInstruction: codeStatus['escalationInstruction'] || '',
    limitationNotes: codeStatus['limitationNotes'] || '',
    receivingWardInstructions: handover['receivingWardInstructions'] || '',
    additionalInstructions: handover['additionalInstructions'] || '',
  });

  const medications = form.get('medications') as FormArray;
  medications.clear();
  const medItems = Array.isArray(snapshot['medications']) ? snapshot['medications'] : [];
  if (medItems.length) {
    medItems.forEach((item) => medications.push(createAdmissionMedicationGroup(fb, item as Record<string, unknown>)));
  }
}

export function buildAdmissionRecommendationPayload(
  form: FormGroup,
  context: {
    patientId: string;
    appointmentId?: string;
    encounterId?: string;
    prescriptionId?: string;
    status?: 'draft' | 'pending';
    recommend?: boolean;
  }
): Record<string, unknown> {
  const value = form.getRawValue();
  const splitLines = (raw: string): string[] =>
    String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  return {
    patientId: context.patientId,
    sourceAppointmentId: context.appointmentId || undefined,
    sourceEncounterId: context.encounterId || undefined,
    prescriptionId: context.prescriptionId || undefined,
    recommendedByDoctorId: value.consultantDoctorId,
    departmentId: value.departmentId || undefined,
    reason: String(value.reasonForAdmission || '').trim(),
    initialDiagnosis: String(value.provisionalDiagnosis || '').trim(),
    priority: value.priority,
    status: context.recommend ? 'pending' : context.status || 'draft',
    recommend: context.recommend === true,
    treatmentCatalogId: value.treatmentCatalogId || undefined,
    recommendedOperatingDoctorId: value.recommendedOperatingDoctorId || value.consultantDoctorId || undefined,
    preferredOperationAt: value.preferredOperationAt || undefined,
    roomDiscountRecommendation: {
      type: value.roomDiscountType || 'none',
      value: Number(value.roomDiscountValue || 0),
      reason: String(value.roomDiscountReason || '').trim(),
    },
    procedureDiscountRecommendation: {
      type: value.procedureDiscountType || 'none',
      value: Number(value.procedureDiscountValue || 0),
      reason: String(value.procedureDiscountReason || '').trim(),
    },
    clinicalSnapshot: {
      admissionDecision: {
        admissionRequired: value.admissionRequired !== false,
        urgency: value.urgency,
        levelOfCare: value.levelOfCare,
        consultantDoctorId: value.consultantDoctorId,
        departmentId: value.departmentId || null,
        recommendedWard: value.recommendedWard || '',
        admissionType: value.admissionType || 'medical',
        priority: value.priority,
        expectedTiming: value.expectedTiming,
        scheduledAt: value.scheduledAt || null,
      },
      clinicalSummary: {
        chiefComplaint: value.chiefComplaint || '',
        symptoms: value.symptoms || '',
        symptomDuration: value.symptomDuration || '',
        reasonForAdmission: value.reasonForAdmission || '',
        provisionalDiagnosis: value.provisionalDiagnosis || '',
        differentialDiagnosis: value.differentialDiagnosis || '',
        relevantHistory: value.relevantHistory || '',
        examinationFindings: value.examinationFindings || '',
        vitals: value.vitals || {},
      },
      patientSafety: {
        knownAllergies: value.knownAllergies || '',
        drugAllergies: value.drugAllergies || '',
        foodAllergies: value.foodAllergies || '',
        currentMedications: value.currentMedications || '',
        medReconciliationStatus: value.medReconciliationStatus || '',
        chronicConditions: value.chronicConditions || '',
        pregnancyStatus: value.pregnancyStatus || '',
        anticoagulantUse: value.anticoagulantUse || '',
      },
      treatmentPlan: {
        plan: value.treatmentPlan || '',
        goals: value.clinicalGoals || '',
        specialInstructions: value.specialInstructions || '',
      },
      nursingOrders: {
        vitalsFrequency: value.vitalsFrequency,
        vitalsFrequencyCustom: value.vitalsFrequencyCustom || '',
        monitoring: value.monitoring || {},
        fallPrecautions: value.fallPrecautions,
        pressureInjuryRisk: value.pressureInjuryRisk,
      },
      activity: {
        order: value.activityOrder,
        custom: value.activityCustom || '',
      },
      diet: {
        type: value.diet,
        custom: value.dietCustom || '',
      },
      ivFluidOxygen: {
        ivAccessRequired: Boolean(value.ivAccessRequired),
        ivFluid: value.ivFluid || '',
        ivRate: value.ivRate || '',
        ivDuration: value.ivDuration || '',
        ivInstruction: value.ivInstruction || '',
        oxygenRequired: Boolean(value.oxygenRequired),
        oxygenDevice: value.oxygenDevice || '',
        oxygenFlow: value.oxygenFlow || '',
        oxygenNotes: value.oxygenNotes || '',
      },
      medications: value.medications || [],
      investigations: {
        labTests: splitLines(value.labTests),
        imaging: splitLines(value.imaging),
        other: value.otherInvestigations || '',
      },
      proceduresConsults: {
        proposedProcedures: value.proposedProcedures || '',
        specialistConsults: value.specialistConsults || '',
      },
      isolation: {
        required: value.isolationRequired,
        type: value.isolationType || '',
        reason: value.isolationReason || '',
      },
      vteReview: {
        assessment: value.vteAssessment,
        bleedingRisk: value.bleedingRisk,
        prophylaxisDecision: value.prophylaxisDecision,
        notApplicable: Boolean(value.vteNotApplicable),
      },
      codeStatus: {
        resuscitationStatus: value.resuscitationStatus || '',
        escalationInstruction: value.escalationInstruction || '',
        limitationNotes: value.limitationNotes || '',
      },
      handover: {
        receivingWardInstructions: value.receivingWardInstructions || '',
        additionalInstructions: value.additionalInstructions || '',
      },
    },
  };
}
