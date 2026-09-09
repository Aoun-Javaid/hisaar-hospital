import { Pagination } from './api-response.model';

export type Status = 'active' | 'inactive';
export type PrescriptionTemplate =
  | 'classic'
  | 'clinical-blue'
  | 'gynae-clinical'
  | 'gynae-womens-health'
  | 'gynae-modern'
  | 'minimal-teal'
  | 'compact-mono';

export type PrescriptionSpecialtyTemplate =
  | 'general'
  | 'eye'
  | 'ultrasound'
  | 'radiology'
  | 'gynae'
  | 'dental'
  | 'physiotherapy'
  | 'lab';

export type ClinicalDepartmentKey =
  | 'general_medical'
  | 'surgery'
  | 'women_child'
  | 'eye_ent_dental'
  | 'physiotherapy'
  | 'diagnostics'
  | 'other_common';

export interface Role {
  _id: string;
  companyId?: string | null;
  hospitalId?: string | null;
  context?: 'pos' | 'hospital';
  name: string;
  description?: string;
  permissions: string[];
  isSystemRole?: boolean;
  isActive?: boolean;
}

export interface User {
  _id: string;
  companyId?: string;
  centralUserId?: string | null;
  centralCompanyId?: string | null;
  hospitalId?: string | null;
  hospital?: Hospital | null;
  storeId?: string | null;
  warehouseId?: string | null;
  roleId?: string;
  name: string;
  email: string;
  phone?: string | null;
  status?: string;
  isEmailVerified?: boolean;
  role?: Role | null;
  photoKey?: string | null;
  photoUrl?: string | null;
}

export interface PrescriptionPrintSettings {
  showLogo: boolean;
  logoScale: number;
  revisionNote?: string | null;
  followUpLine?: string | null;
  contactLine?: string | null;
  footerLines: string[];
}

export interface LabReportSignatory {
  name: string;
  credentials?: string | null;
  title?: string | null;
}

export interface LaboratoryPrintSettings {
  useCustomDetails?: boolean;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  tagline?: string | null;
  reportNameColor?: string | null;
  reportBorderColor?: string | null;
  reportDisclaimer?: string | null;
  systemGeneratedLine?: string | null;
  reportSignatories?: LabReportSignatory[];
}

export interface BirthCertificateSettings {
  enabled?: boolean;
  documentTitle?: string;
  certificatePrefix?: string;
  birthRecordPrefix?: string;
  logoUrl?: string;
  stampUrl?: string;
  signatoryName?: string;
  signatoryDesignation?: string;
  signatureUrl?: string;
  footerText?: string;
  legalDisclaimer?: string;
  showFatherCnic?: boolean;
  showMotherCnic?: boolean;
  showBirthWeight?: boolean;
  showDeliveryMode?: boolean;
  showQrCode?: boolean;
  showRevocationReason?: boolean;
  verificationBaseUrl?: string;
}

export interface LabSettingsResponse {
  hospital: {
    _id?: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    logoUrl?: string | null;
  };
  laboratorySettings: LaboratoryPrintSettings;
}

export interface Store {
  _id: string;
  companyId: string;
  hospitalId?: string | null;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  managerName?: string | null;
  isActive: boolean;
}

export interface Customer {
  _id: string;
  companyId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  openingBalance?: number | string;
  creditLimit?: number | string;
  notes?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Supplier {
  _id: string;
  companyId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  openingBalance?: number | string;
  creditLimit?: number | string;
  taxNumber?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Warehouse {
  _id: string;
  companyId: string;
  company?: {
    _id: string;
    name: string;
    code: string;
  } | null;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  managerName?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  _id: string;
  companyId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  parentCategoryId?: string | null;
  isActive?: boolean;
}

export interface HospitalEnabledModules {
  pharmacy: boolean;
  laboratory: boolean;
  ward: boolean;
  clinical: boolean;
}

export interface Hospital {
  _id: string;
  name: string;
  nameUrdu?: string | null;
  code: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  logoUrl?: string | null;
  status: Status;
  subscriptionPlan?: string | null;
  productEdition?: 'hospital' | 'laboratory' | string | null;
  enabledModules?: HospitalEnabledModules | null;
  modulesEnforced?: boolean;
  prescriptionSettings?: PrescriptionPrintSettings | null;
  laboratorySettings?: LaboratoryPrintSettings | null;
  birthCertificateSettings?: BirthCertificateSettings | null;
}

export interface Department {
  _id: string;
  hospitalId: string;
  name: string;
  code?: string;
  category?: string;
  systemTemplateKey?: string;
  sortOrder?: number;
  description?: string | null;
  status: Status;
  inChargeDoctorId?: string | Doctor | null;
  inChargeDoctor?: Doctor | null;
}

export type TreatmentCatalogType =
  | 'treatment'
  | 'procedure'
  | 'operation'
  | 'surgery'
  | 'package';

export type DiscountType = 'none' | 'percentage' | 'fixed';

export interface DiscountSnapshot {
  type?: DiscountType;
  value?: number;
  amount?: number;
  reason?: string;
  recommendedByDoctorId?: string | null;
  recommendedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface TreatmentCatalogItem {
  _id: string;
  hospitalId: string;
  companyId?: string | null;
  code: string;
  name: string;
  type: TreatmentCatalogType;
  departmentId?: string | Department | null;
  department?: Department | null;
  baseRate: number;
  description?: string;
  defaultDurationMinutes?: number;
  requiresOperationSchedule?: boolean;
  isActive?: boolean;
  includedItems?: string[];
  packageNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type OperationScheduleStatus =
  | 'requested'
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'postponed'
  | 'cancelled';

export interface OperationSchedule {
  _id: string;
  hospitalId: string;
  operationNo?: string;
  patientId: string | Patient;
  patient?: Patient | null;
  departmentId?: string | Department | null;
  treatmentCatalogId?: string | TreatmentCatalogItem | null;
  treatmentCatalog?: TreatmentCatalogItem | null;
  admissionRecommendationId?: string | null;
  encounterId?: string | null;
  roomAllotmentId?: string | null;
  assignedOperatingDoctorId?: string | Doctor | null;
  assignedOperatingDoctor?: Doctor | null;
  assistantDoctorIds?: string[];
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  durationMinutes?: number;
  priority?: 'routine' | 'urgent' | 'emergency';
  status: OperationScheduleStatus;
  clinicalNotes?: string;
  operationNotes?: string;
  treatmentPricingSnapshot?: {
    treatmentCatalogId?: string;
    code?: string;
    name?: string;
    type?: string;
    baseRate?: number;
    durationMinutes?: number;
    requiresOperationSchedule?: boolean;
  } | null;
  procedureDiscountApproved?: DiscountSnapshot | null;
  ledgerItemId?: string | null;
  billingPostedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Doctor {
  _id: string;
  hospitalId: string;
  userId: string;
  user?: User | null;
  departmentId?: string | null;
  department?: Department | null;
  clinicalDepartment?: ClinicalDepartmentKey | null;
  specialization?: string | null;
  qualification?: string | null;
  nameUrdu?: string | null;
  experienceYears?: number;
  consultationFee?: number;
  prescriptionTemplate?: PrescriptionTemplate;
  prescriptionSpecialtyTemplate?: PrescriptionSpecialtyTemplate;
  availableDays?: string[];
  availableSlots?: Array<{ day: string; startTime: string; endTime: string }>;
  slotDurationMinutes?: number;
  unavailableDates?: string[];
  status: Status;
  photoKey?: string | null;
  photoUrl?: string | null;
}

export interface Patient {
  _id: string;
  hospitalId: string;
  patientNo: string;
  /** Printed on invoices for public lab report lookup. */
  reportAccessCode?: string;
  assignedDoctorId: string;
  assignedDoctor?: User | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: string | null;
  bloodGroup?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  allergies?: string[];
  chronicDiseases?: string[];
  currentMedications?: string[];
  status: 'active' | 'inactive' | 'deceased';
  createdAt?: string;
}

export interface PatientHistory {
  _id: string;
  hospitalId: string;
  patientId: string;
  patient?: Patient | null;
  doctorId: string;
  doctor?: User | null;
  appointmentId?: string | null;
  sourcePrescriptionId?: string | null;
  recordType?: 'clinical' | 'laboratory' | 'ward';
  title?: string | null;
  diagnosis?: string | null;
  symptoms?: string | null;
  notes?: string | null;
  vitals?: Record<string, string>;
  attachments?: Array<{ name?: string; url: string }>;
  createdAt?: string;
}

export interface Appointment {
  _id: string;
  hospitalId: string;
  appointmentNo: string;
  patientId: string;
  patient?: Patient | null;
  doctorId: string;
  doctor?: User | null;
  departmentId?: string | null;
  department?: Department | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  visitType?: 'Consultation' | 'Follow-up' | 'Walk-in' | 'Emergency' | string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  consultationFee?: number;
  discount?: number;
  discountReason?: string | null;
  netFee?: number;
  paymentStatus?: 'unpaid' | 'paid';
  vitals?: Record<string, string>;
  notes?: string | null;
  createdAt?: string;
}

export interface PatientLastVisit {
  hasPreviousVisit: boolean;
  lastVisitDate?: string | null;
  lastVisitType?: string | null;
  lastDoctorName?: string | null;
  lastAppointmentNo?: string | null;
}

export interface PrescriptionMedicine {
  name: string;
  type?: string;
  route?: string;
  eye?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  afterMeal?: boolean;
  beforeMeal?: boolean;
  morning?: boolean;
  morningDose?: string;
  noon?: boolean;
  noonDose?: string;
  evening?: boolean;
  eveningDose?: string;
  night?: boolean;
  nightDose?: string;
  instructions?: string;
}

export interface DoctorMedicine extends PrescriptionMedicine {
  _id: string;
  hospitalId: string;
  doctorId: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PrescriptionLabTest {
  name: string;
  category?: string;
  selected?: boolean;
}

export interface PrescriptionIvFluid {
  name: string;
  rate?: string;
  duration?: string;
  route?: string;
  status?: 'running' | 'completed' | 'planned';
  startDateTime?: string;
}

export interface AdmissionOrderItem {
  order: string;
  category?: string;
  orderedOn?: string;
  priority?: 'normal' | 'high';
  status?: 'active' | 'planned' | 'completed';
}

export interface PatientDocumentItem {
  name: string;
  type?: string;
  category?: string;
  notes?: string;
  uploadedOn?: string;
  uploadedBy?: string;
  url?: string;
}

export interface Prescription {
  _id: string;
  hospitalId: string;
  patientId: string;
  patient?: Patient | null;
  doctorId: string;
  doctor?: User | null;
  appointmentId?: string | null;
  appointment?: Appointment | null;
  medicines: PrescriptionMedicine[];
  chiefComplaint?: string | null;
  history?: string | null;
  examination?: string | null;
  diagnosis?: string | null;
  visitType?: 'opd' | 'follow_up' | string | null;
  labTests?: PrescriptionLabTest[];
  ivFluids?: PrescriptionIvFluid[];
  admissionOrders?: {
    roomType?: string;
    bed?: string;
    regularDiet?: boolean;
    npo?: boolean;
    consultation?: string;
    monitoring?: {
      bp?: boolean;
      pulse?: boolean;
      spo2?: boolean;
      rbs?: boolean;
    };
    notes?: string;
  } | null;
  admissionOrderItems?: AdmissionOrderItem[];
  patientDocuments?: PatientDocumentItem[];
  vitals?: Record<string, string> | null;
  specialtySection?: string | null;
  specialtyData?: Record<string, unknown> | null;
  advice?: string | null;
  followUpDate?: string | null;
  prescriptionTemplate?: PrescriptionTemplate;
  createdAt?: string;
  updatedAt?: string;
}

export type LabOrderSource = 'doctor' | 'walk-in' | 'admission' | 'emergency';
export type LabOrderStatus =
  | 'ordered'
  | 'sample_collected'
  | 'processing'
  | 'result_entered'
  | 'verified'
  | 'completed'
  | 'cancelled';
export type LabParameterStatus = 'low' | 'normal' | 'high' | 'critical';
export type LabParameterTrend = 'improved' | 'worsened' | 'stable' | 'unknown';

export interface LabTestParameterTemplate {
  subCategory?: string;
  parameterName: string;
  unit?: string;
  referenceMin?: number | null;
  referenceMax?: number | null;
  referenceText?: string;
  criticalMin?: number | null;
  criticalMax?: number | null;
  sortOrder?: number;
}

export interface LabTestCatalog {
  _id: string;
  hospitalId: string;
  name: string;
  shortCode: string;
  department: string;
  sampleType: string;
  tubeType?: string;
  price: number;
  reportType: 'structured' | 'uploaded_report' | 'both';
  turnaroundHours?: number;
  requiresFasting?: boolean;
  parameters: LabTestParameterTemplate[];
  isActive: boolean;
}

export interface LabResultParameter {
  _id?: string;
  subCategory?: string;
  parameterName: string;
  resultValue?: string;
  unit?: string;
  referenceMin?: number | null;
  referenceMax?: number | null;
  referenceText?: string;
  status?: LabParameterStatus;
  previousValue?: string;
  changeValue?: string;
  changePercent?: number | null;
  trend?: LabParameterTrend;
}

export interface LabReportFile {
  _id?: string;
  fileUrl: string;
  fileType: 'pdf' | 'image';
  reportType?: string;
  reportDate?: string;
  uploadedById?: string | null;
  uploadedBy?: User | null;
  verifiedById?: string | null;
  verifiedBy?: User | null;
  status?: 'pending' | 'verified';
}

export type LabSampleStatus =
  | 'collected'
  | 'received'
  | 'in_process'
  | 'result_entered'
  | 'verified'
  | 'delivered'
  | 'rejected';

export interface LabSample {
  _id: string;
  sampleNo: string;
  sampleType?: string;
  containerType?: string;
  testsSummary?: string;
  status: LabSampleStatus;
  rejectionReason?: string;
  collectedAt?: string;
  collectedById?: string | null;
  collectedBy?: User | null;
  rejectedAt?: string;
  rejectedById?: string | null;
  rejectedBy?: User | null;
  receivedAt?: string;
}

export interface LabOrderItem {
  _id: string;
  testId?: string | null;
  testName: string;
  shortCode?: string;
  department?: string;
  sampleType?: string;
  tubeType?: string;
  price: number;
  status: LabOrderStatus;
  sampleId?: string | null;
  resultMode: 'structured' | 'uploaded_report' | 'both';
  parameters: LabResultParameter[];
  reportFiles: LabReportFile[];
  remarks?: string;
  collectedAt?: string;
  collectedById?: string | null;
  collectedBy?: User | null;
  resultEnteredAt?: string;
  resultEnteredById?: string | null;
  resultEnteredBy?: User | null;
  verifiedAt?: string;
  verifiedById?: string | null;
  verifiedBy?: User | null;
  addedLater?: boolean;
}

export interface LabOrder {
  _id: string;
  hospitalId: string;
  orderNo: string;
  patientId: string;
  patient?: Patient | null;
  prescriptionId?: string | null;
  appointmentId?: string | null;
  encounterId?: string | null;
  source: LabOrderSource;
  doctorId?: string | null;
  doctor?: User | null;
  referredBy?: string;
  status: LabOrderStatus;
  priority: 'normal' | 'urgent';
  totalAmount: number;
  paidAmount: number;
  paymentMethod?: string;
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  receivedById?: string | null;
  receivedBy?: User | null;
  paidAt?: string | null;
  balanceAmount: number;
  sampleCollectionAt?: string;
  notes?: string;
  samples?: LabSample[];
  items: LabOrderItem[];
  criticalAlerts?: Array<{
    testName: string;
    parameterName: string;
    resultValue: string;
    message: string;
  }>;
  createdById?: string | null;
  createdBy?: User | null;
  updatedById?: string | null;
  updatedBy?: User | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LabDashboardStats {
  pendingOrders: number;
  sampleCollected: number;
  resultPending: number;
  readyToVerify: number;
  completedToday: number;
  todayCollected?: number;
  totalCollected?: number;
  outstandingAmount?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface LabComparisonRow {
  testName: string;
  subCategory?: string;
  parameterName: string;
  unit?: string;
  referenceText?: string;
  referenceMin?: number | null;
  referenceMax?: number | null;
  history: Array<{
    orderId: string;
    orderNo: string;
    date?: string;
    resultValue?: string;
    status?: LabParameterStatus;
    trend?: LabParameterTrend;
  }>;
}

export interface HospitalWard {
  _id: string;
  hospitalId: string;
  name: string;
  code?: string;
  description?: string;
  type?: string;
  purpose?: string;
  departmentMode?: 'GENERAL' | 'DEPARTMENT_SPECIFIC';
  departmentIds?: string[];
  genderPolicy?: string;
  ageGroup?: string;
  careLevel?: string;
  systemTemplateKey?: string;
  sortOrder?: number;
  notes?: string;
  status: 'active' | 'inactive';
}

export interface WardFloor {
  _id: string;
  hospitalId: string;
  wardId: string;
  name: string;
  label?: string;
  sortOrder?: number;
  status: 'active' | 'inactive';
}

export interface Room {
  _id: string;
  hospitalId: string;
  wardId?: string | null;
  floorId?: string | null;
  ward?: Pick<HospitalWard, '_id' | 'name' | 'code'> | null;
  floorRecord?: Pick<WardFloor, '_id' | 'wardId' | 'name' | 'label'> | null;
  roomNo: string;
  roomType: 'general' | 'private' | 'icu' | 'emergency' | 'operation_theater';
  floor?: string | null;
  chargesPerDay: number;
  status: 'available' | 'occupied' | 'maintenance';
}

export interface RoomAllotment {
  _id: string;
  hospitalId: string;
  patientId: string;
  patient?: Patient | null;
  roomId: string;
  room?: Room | null;
  bedId?: string | null;
  encounterId?: string | null;
  consultantDoctorId?: string | null;
  bedLabel?: string;
  admissionReason?: string;
  admittedAt: string;
  dischargedAt?: string | null;
  status: 'admitted' | 'discharged';
  notes?: string | null;
  assignedNurseId?: string | null;
  assignedNurse?: Pick<User, '_id' | 'name' | 'email' | 'phone'> | null;
  admissionRecommendationId?: string | null;
  admissionNo?: string | null;
  treatmentCatalogId?: string | null;
  treatmentPricingSnapshot?: OperationSchedule['treatmentPricingSnapshot'];
  roomPricingSnapshot?: {
    roomId?: string;
    roomNo?: string;
    chargesPerDay?: number;
  } | null;
  roomDiscountApproved?: DiscountSnapshot | null;
  procedureDiscountApproved?: DiscountSnapshot | null;
}

export interface BillItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export interface Bill {
  _id: string;
  hospitalId: string;
  patientId: string;
  patient?: Patient | null;
  appointmentId?: string | null;
  appointment?: Appointment | null;
  sourceType?: string;
  sourceId?: string;
  sourceNo?: string;
  billNo: string;
  items: BillItem[];
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paymentMethod?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EncounterSummary {
  totalCharges: number;
  totalDiscount: number;
  netPayable: number;
  totalPaid: number;
  totalRefunded: number;
  balance: number;
}

export interface Encounter {
  _id: string;
  hospitalId: string;
  patientId: string;
  patient?: Patient | null;
  encounterNo: string;
  type: 'opd' | 'admission' | 'emergency' | 'follow_up';
  status: 'open' | 'admitted' | 'ready_for_discharge' | 'discharged' | 'closed' | 'cancelled';
  appointmentId?: string | null;
  roomAllotmentId?: string | null;
  prescriptionId?: string | null;
  consultantDoctorId?: string | null;
  roomId?: string | null;
  room?: Room | null;
  wardLabel?: string;
  bedLabel?: string;
  admissionReason?: string;
  openedAt?: string;
  closedAt?: string | null;
  summary?: EncounterSummary;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerItem {
  _id: string;
  encounterId: string;
  patientId: string;
  sourceType: string;
  sourceId?: string;
  category: string;
  title: string;
  description?: string;
  qty: number;
  rate: number;
  amount: number;
  discount: number;
  netAmount: number;
  status: 'active' | 'cancelled' | 'refunded';
  reason?: string;
  createdAt?: string;
}

export interface LedgerPayment {
  _id: string;
  encounterId: string;
  patientId: string;
  paymentNo: string;
  amount: number;
  method: string;
  type: 'advance' | 'partial' | 'final' | 'refund';
  sourceType?: string;
  sourceId?: string;
  note?: string;
  referenceNo?: string;
  createdAt?: string;
}

export interface EncounterLedger {
  encounter: Encounter;
  items: LedgerItem[];
  payments: LedgerPayment[];
}

export interface PatientPaymentSourceSummary {
  sourceType: string;
  label: string;
  amount: number;
  count: number;
  remaining?: number;
}

export interface PatientPaymentSummary {
  patient: Patient;
  totalCharges?: number;
  totalDiscount?: number;
  netPayable: number;
  totalPaid: number;
  balance: number;
  encounterCount: number;
  latestEncounterId?: string | null;
  chargesBySource: Record<string, PatientPaymentSourceSummary>;
  remainingBySource: Record<string, PatientPaymentSourceSummary>;
}

export interface PatientPaymentDetailItem {
  _id: string;
  encounterId: string;
  sourceType: string;
  sourceLabel: string;
  title: string;
  description?: string;
  qty: number;
  rate: number;
  amount: number;
  discount: number;
  netAmount: number;
  createdAt?: string;
}

export interface PatientPaymentDetailPayment {
  _id: string;
  encounterId: string;
  paymentNo: string;
  amount: number;
  method: string;
  type: string;
  note?: string;
  createdAt?: string;
}

export interface PatientPaymentDetail {
  patient: Patient;
  totals: {
    totalCharges: number;
    totalDiscount: number;
    netPayable: number;
    totalPaid: number;
    totalRefunded: number;
    securityDepositHeld?: number;
    securityDepositApplied?: number;
    advanceCreditBalance?: number;
    outstandingBalance?: number;
    balance: number;
  };
  chargesBySource: Record<string, PatientPaymentSourceSummary>;
  remainingBySource: Record<string, PatientPaymentSourceSummary>;
  encounters: Encounter[];
  items: PatientPaymentDetailItem[];
  payments: PatientPaymentDetailPayment[];
  primaryEncounterId?: string | null;
}

export interface ChargeCatalogItem {
  _id: string;
  name: string;
  code?: string;
  category: string;
  defaultAmount: number;
  isOptional: boolean;
  manualAmountAllowed: boolean;
  reasonRequired: boolean;
  department?: string;
  active: boolean;
}

export interface Payment {
  _id: string;
  companyId?: string;
  storeId?: string | null;
  warehouseId?: string | null;
  referenceType: string;
  referenceId: string;
  method: string;
  amount: string;
  paymentDate: string;
  referenceNo: string;
  bankName?: string | null;
  note?: string | null;
  createdBy?: string | null;
  createdAt?: string;
}

export interface Expense {
  _id: string;
  companyId: string;
  storeId?: string | null;
  warehouseId?: string | null;
  registerSessionId?: string | null;
  title: string;
  category: string;
  amount: number | string;
  expenseDate: string;
  paymentMethod?: SalePaymentMethod | null;
  paymentReferenceNo?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductDiscountType = 'amount' | 'percentage';

export interface ProductCatalogItem {
  _id: string;
  companyId?: string;
  categoryId?: string | null;
  name: string;
  sku: string;
  barcode?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  mfdDate?: string | null;
  description?: string | null;
  strengthValue?: string | null;
  strengthUnit?: string | null;
  brand?: string | null;
  unit?: string | null;
  costPrice?: string | null;
  sellingPrice?: string | null;
  reorderLevel?: string | null;
  storeId?: string | null;
  stockQuantity?: string | null;
  reservedQuantity?: string | null;
  availableQuantity?: string | null;
  discountEligible?: boolean;
  maxDiscountType?: ProductDiscountType | null;
  maxDiscountValue?: number | string | null;
  stockScopeCity?: string | null;
  stockLocationCount?: number;
  isActive?: boolean;
}

export type SalePaymentMethod = 'cash' | 'card' | 'bank' | 'online' | 'wallet' | 'check';
export type SaleStatus = 'draft' | 'quotation' | 'suspended' | 'completed' | 'cancelled' | 'returned';

export interface SaleItem {
  productId: string;
  name?: string;
  sku?: string;
  qty: string | number;
  unitPrice?: string | number;
  discount?: string | number;
  tax?: string | number;
  total?: string | number;
}

export interface Sale {
  _id: string;
  companyId?: string;
  storeId: string;
  customerId?: string | null;
  userId?: string;
  registerSessionId?: string | null;
  invoiceNo: string;
  saleDate: string;
  items: SaleItem[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  paidAmount: string;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  status: SaleStatus;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransferItem {
  productId: string;
  name?: string;
  sku?: string;
  qty: number | string;
}

export interface Transfer {
  _id: string;
  companyId?: string;
  transferNo: string;
  fromLocationType: 'store' | 'warehouse';
  fromLocationId: string;
  toLocationType: 'store' | 'warehouse';
  toLocationId: string;
  status: 'draft' | 'pending' | 'approved' | 'dispatched' | 'received' | 'cancelled';
  items: TransferItem[];
  note?: string | null;
  approvedAt?: string | null;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateSalePayload {
  storeId: string;
  customerId?: string;
  saleDate: string;
  items: SaleItem[];
  status?: 'draft' | 'quotation' | 'suspended' | 'completed';
  registerSessionId?: string;
  paidAmount?: string | number;
  paymentMethod?: SalePaymentMethod;
  paymentReferenceNo?: string;
  bankName?: string;
  note?: string;
  settlementMode?: 'COUNTER' | 'ENCOUNTER';
  patientId?: string;
  encounterId?: string;
  hospitalId?: string;
  prescriptionId?: string;
  attributedDoctorId?: string;
}

export interface CreateSaleResponse {
  sale: Sale;
  payment?: Payment | null;
  payments?: Payment[];
}

export interface CreateHeldSalePayload {
  storeId: string;
  customerId?: string;
  items: SaleItem[];
  note?: string;
}

export interface HeldSale {
  _id: string;
  companyId?: string;
  storeId: string;
  customerId?: string | null;
  userId?: string;
  holdNo: string;
  items: SaleItem[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  paidAmount?: string;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RestoreHeldSaleResponse {
  heldSale: HeldSale;
  salePayload: CreateSalePayload;
}

export interface ReturnItem {
  productId: string;
  name?: string;
  sku?: string;
  qty: number | string;
  unitPrice?: number | string;
  unitCost?: number | string;
  total?: number | string;
  reason?: string;
}

export interface SalesReturn {
  _id: string;
  companyId?: string;
  saleId: string;
  invoiceNo?: string | null;
  storeId: string;
  customerId?: string | null;
  returnNo: string;
  returnDate: string;
  items: ReturnItem[];
  total: number | string;
  refundAmount: number | string;
  status: string;
  createdBy?: string | null;
  createdAt?: string;
}

export interface CreateSalesReturnPayload {
  saleId: string;
  returnDate: string;
  items: Array<{
    productId: string;
    qty: number;
    reason?: string;
  }>;
  refundAmount?: number;
  paymentMethod?: Exclude<SalePaymentMethod, 'check'>;
  paymentReferenceNo?: string;
}

export interface RegisterSessionSummary {
  salesCount: number;
  totalSales: number | string;
  cashSales: number | string;
  cardSales: number | string;
  checkSales: number | string;
  bankSales: number | string;
  onlineSales: number | string;
  walletSales: number | string;
  creditSales: number | string;
  partialSales: number | string;
  totalPaid: number | string;
  totalUnpaidBalance: number | string;
  totalExpenses: number | string;
  cashExpenses: number | string;
  expectedCashInDrawer: number | string;
}

export interface RegisterSession {
  _id: string;
  companyId: string;
  storeId: string;
  cashierId: string;
  businessDate: string;
  openingAmount: number | string;
  openingNote?: string | null;
  openedAt: string;
  status: 'open' | 'closed';
  closingAmount?: number | string | null;
  expectedCashAmount?: number | string | null;
  cashDifference?: number | string | null;
  closeNote?: string | null;
  closedAt?: string | null;
  summary?: RegisterSessionSummary;
  store?: Pick<Store, '_id' | 'name' | 'code' | 'phone' | 'email' | 'address' | 'city'> | null;
  cashier?: Pick<User, '_id' | 'name' | 'email' | 'phone'> | null;
}

export interface OpenRegisterPayload {
  storeId: string;
  businessDate?: string;
  openingAmount: number;
  openingNote?: string;
}

export interface CloseRegisterPayload {
  closingAmount: number;
  closeNote?: string;
}

export interface RegisterSessionDetail {
  registerSession: RegisterSession;
  sales: Sale[];
  expenses: Expense[];
  paymentsBreakdown: Record<string, number | string>;
  payments?: Array<{
    _id: string;
    method: string;
    amount: number | string;
    paymentDate: string;
    referenceNo?: string | null;
    bankName?: string | null;
    note?: string | null;
    referenceType: string;
    referenceId: string;
    registerSessionId?: string | null;
  }>;
  summary: RegisterSessionSummary;
}

export interface StockMovement {
  _id: string;
  companyId?: string;
  productId?: string;
  locationType?: 'store' | 'warehouse';
  locationId?: string;
  movementType?: string;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  quantityChange?: number | string;
  stockBefore?: number | string;
  stockAfter?: number | string;
  qty?: number | string;
  quantity?: number | string;
  balanceQty?: number | string;
  unitCost?: number | string;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
  product?: {
    _id?: string;
    name?: string;
    sku?: string;
    barcode?: string | null;
    unit?: string;
  } | null;
  location?: {
    _id?: string;
    type?: string;
    name?: string;
    code?: string;
  } | null;
  [key: string]: unknown;
}

export interface DashboardStatusBreakdown {
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface DashboardActivityItem {
  _id: string;
  action: string;
  module: string;
  summary: string;
  createdAt: string;
  userName?: string | null;
}

export interface DashboardSummary {
  totalPatients: number;
  totalDoctors: number;
  todayAppointments: number;
  todayPendingAppointments?: number;
  todayConfirmedAppointments?: number;
  todayCompletedAppointments?: number;
  todayCancelledAppointments?: number;
  pendingAppointments: number;
  completedAppointments: number;
  totalRevenue: number;
  todayRevenue?: number;
  todayFeesCollected?: number;
  todayLabOrders?: number;
  todayPrescriptions?: number;
  totalPrescriptions?: number;
  appointmentBreakdown?: DashboardStatusBreakdown;
  todayAppointmentBreakdown?: DashboardStatusBreakdown;
  recentPatients: Patient[];
  upcomingAppointments: Appointment[];
  todayAppointmentsList?: Appointment[];
  activityFeed?: DashboardActivityItem[];
}

export interface DataTablesResponse<T> {
  data: {
    data: T[];
    recordsTotal: number;
    recordsFiltered: number;
  };
}

export interface ListResult<T> {
  items: T[];
  pagination: Pagination;
}

export interface AuditLog {
  _id: string;
  companyId?: string;
  hospitalId?: string | null;
  hospital?: { _id: string; name: string } | null;
  userId?: string;
  user?: { _id: string; name: string; email?: string | null } | null;
  action: string;
  module: string;
  summary?: string;
  recordId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string;
}
