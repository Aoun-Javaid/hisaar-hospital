import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, finalize, Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import {
  ApexDataLabels,
  ApexGrid,
  ApexTooltip,
  ApexYAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { AppDialogService } from '../../../core/services/app-dialog.service';
import { BackendService } from '../../../core/services/backend.service';
import { toCalendarYmd, todayYmd } from '../../../core/utils/calendar-date';
import { resolveAssetUrl } from '../../../core/utils/asset.util';
import { MooliOfflineService, MooliQueuedWork, MooliSyncResult } from '../../../core/services/mooli-offline.service';
import {
  Appointment,
  AdmissionOrderItem,
  Doctor,
  DoctorMedicine,
  Hospital,
  Patient,
  PatientDocumentItem,
  PatientHistory,
  LabOrder,
  PrescriptionTemplate,
  PrescriptionPrintSettings,
  ProductCatalogItem,
  Prescription,
  User,
} from '../../../shared/models/hospital.model';
import {
  buildSidebarVitalItems,
  buildVitalAlerts,
  buildVitalDisplayItems,
  buildVitalHistoryRows,
  buildVitalMiniCharts,
  buildVitalTrendVisits,
  filterVitalTrendVisitsByRange,
  getPatientAgeYears,
  isArbitraryCustomVitalKey,
  SidebarVitalItem,
  VitalAlert,
  VitalDisplayItem,
  VitalHistoryRow,
  VitalMiniChartData,
  VitalStatus,
  VitalTrendVisit,
  VitalsTrendRange,
} from './vitals-analytics';
import {
  buildLabTestDisplayRows,
  filterLabTestRows,
  LAB_TEST_CATALOG,
  LabTestDisplayRow,
  LabTestFilter,
  labParameterStatusLabel,
  labStatusLabel,
  PatientLabTestRecord,
} from './lab-test-data';
import { buildLabOrderReportHtml } from '../laboratory/lab-order-report.builder';
import {
  buildIvFluidDisplayRows,
  countActiveIvFluids,
  IV_FLUID_OPTIONS,
  IvFluidDisplayRow,
  IvFluidStatus,
  ivFluidStatusLabel as formatIvFluidStatusLabel,
  PatientIvFluidRecord,
} from './iv-fluid-data';
import {
  legacyAdmissionOrdersToItems,
  PatientAdmissionOrderRecord,
} from './admission-order-data';
import { AdmissionRecommendationDrawerComponent } from './admission-recommendation-drawer.component';
import {
  AdmissionRecommendationRecord,
  admissionRecommendationStatusLabel,
  doctorDisplayName,
  mapAdmissionRecommendationRecord,
} from './admission-recommendation.models';
import {
  buildAdmissionRecommendationPrintHtml,
  printAdmissionRecommendationHtml,
} from './admission-recommendation-print.builder';
import {
  inferSpecialtyTemplateKey,
  resolvePrintSpecialtyRows,
  resolvePrintSpecialtyTemplate,
  SPECIALTY_FIELDS,
  SPECIALTY_TEMPLATES,
  SpecialtyField,
  SpecialtyTemplate,
  SpecialtyTemplateKey,
} from './prescription-specialty-print';
import {
  buildGynaeEditSamplePatch,
  buildGynaeConsentSummary,
  buildGynaeHistorySummary,
  calculateEddFromLmp,
  calculateGestationalAgeFromLmp,
  GYNAE_ADVICE_TEMPLATES,
  GYNAE_CONSULT_MODES,
  GYNAE_LAB_CATALOG,
  GYNAE_LAB_CATEGORIES,
  GYNAE_ULTRASOUND_STUDIES,
  GYNAE_VITAL_FIELDS,
  GynaeConsultMode,
  GynaeLabCategory,
  isPregnancyRiskyMedicine,
  ANTEPARTUM_DANGER_SIGNS,
  ANTEPARTUM_DEFAULT_NOTE_TO_PATIENT,
  GYNAE_PROBLEM_COMPLAINTS,
  GYNAE_PROBLEM_RED_FLAGS,
  mergeGynaeLabCatalog,
  POSTNATAL_DANGER_SIGNS,
  POSTNATAL_DEFAULT_COUNSELLING,
  POSTNATAL_DEFAULT_LACTATION,
  POSTNATAL_LAB_TESTS,
  resolveGynaeConsultationStripRows,
  normalizeGynaeConsultMode,
  resolveGynaePatientNote,
  splitGynaePrintRows,
  resolvePrescriptionConsultationPrintRows,
  visibleGynaeFieldKeys,
} from './gynae-prescription-data';
import { GynaeClinicalPrintPageComponent } from './gynae-clinical-print-page.component';
import { GynaeWomensHealthPrintPageComponent } from './gynae-womens-health-print-page.component';
import { PrescriptionTemplateGynaeModernComponent } from './prescription-template-gynae-modern.component';
import {
  normalizeGynaePrescriptionTemplate,
  usesGynaeClinicalBluePrint,
  usesGynaeClinicalPrint,
  usesGynaeModernPrint,
  usesGynaeWomensHealthPrint,
} from './gynae-print-routing';
import { formatApiValidationError, sanitizePrescriptionPayload } from './prescription-payload';
import { canEditPrescriptionInPlace, resolvePrescriptionOwnerUserId } from './prescription-edit-policy';
import {
  buildPatientDocumentDisplayRows,
  countPatientDocuments,
  DOCUMENT_TYPES,
  PatientDocumentDisplayRow,
  PatientDocumentRecord,
} from './patient-document-data';
import {
  buildGynaeDocumentCategoryViews,
  documentPreviewLabel,
  findGynaeDocumentCategory,
  formatGynaeDocumentTimestamp,
  GYNAE_DOCUMENT_CATEGORIES,
  GynaeDocumentCategoryKey,
  GynaeDocumentCategoryView,
  isImageDocumentUrl,
  normalizeGynaeDocumentPayload,
} from './gynae-document-data';
import {
  formatEnglishDoctorName,
  formatEnglishDoctorTitle,
  formatEnglishOrganizationName,
  formatEnglishAddress,
  formatUrduDoctorName,
  formatUrduDoctorTitle,
  formatUrduQualification,
  formatUrduAddress,
  formatUrduOrganizationName,
  stripDoctorPrefix,
  toPrescriptionUrduText,
} from './prescription-print-urdu';
import { transliterateLatinToUrdu } from '../../../shared/utils/urdu-transliteration';
import {
  buildMedicineInstructions,
  containsFrequencyPattern,
  detectFrequencyKey,
  getFrequencySchedule,
  mapFrequencyToTimings as resolveFrequencyTimings,
  resolvePrintSlotDose,
  stripFrequencyPatterns,
} from './medicine-instruction-formatter';
import {
  buildClinicalRxPrintPages,
  ClinicalRxPrintPage,
} from './clinical-rx-print-pages';

interface PrintPreviewData {
  template: PrescriptionTemplate;
  patient: Patient;
  patientName: string;
  patientAge: string;
  patientGender: string;
  patientNo: string;
  patientAddress: string;
  patientPhone: string;
  doctorName: string;
  doctorNamePlain: string;
  doctorNameUrdu: string;
  doctorQualification: string;
  doctorQualificationUrdu: string;
  doctorTitleEnglish: string;
  doctorTitleUrdu: string;
  hospitalName: string;
  hospitalNameUrdu: string;
  hospitalAddress: string;
  hospitalAddressUrdu: string;
  hospitalLogoUrl: string;
  showHospitalLogo: boolean;
  hospitalLogoScale: number;
  prescriptionRevisionNote: string;
  prescriptionFollowUpLine: string;
  prescriptionFooterLines: string[];
  prescriptionNo: string;
  date: string;
  disease: string;
  vitals: Record<string, string>;
  vitalRows: Array<{ label: string; value: string }>;
  labTests: Array<{ name: string; category: string }>;
  ivFluids: Array<{ name: string; rate: string; quantity: string; route: string }>;
  medicines: Array<Record<string, unknown>>;
  specialtyTitle: string;
  specialtySection: SpecialtyTemplateKey | '';
  specialtyRows: Array<{ label: string; value: string; wide?: boolean }>;
  consultationRows: Array<{ label: string; value: string; wide?: boolean }>;
  gynaeConsultationRows: Array<{ label: string; value: string }>;
  gynaeSidebarRows: Array<{ label: string; value: string; wide?: boolean }>;
  gynaeExtendedRows: Array<{ label: string; value: string; wide?: boolean }>;
  gynaeSummaryRows: Array<{ label: string; value: string }>;
  ultrasoundRows: Array<{ label: string; value: string }>;
  followUpDate: string;
  patientNote: string;
  consultation: string;
  admissionOrderLines: string[];
  clinicalPages: ClinicalRxPrintPage[];
  gynaeMode: GynaeConsultMode;
  patientBloodGroup: string;
}

type PrescriptionDateGroup = {
  dateKey: string;
  dateLabel: string;
  items: Prescription[];
};

type DoseSlot = 'morning' | 'noon' | 'evening' | 'night';
type MedicineNavField = 'name' | 'dosage' | 'frequency' | 'duration' | DoseSlot | 'instructions';

interface ParsedMedicineCommand {
  medicineName: string;
  genericName: string;
  dose: string;
  frequency: string;
  duration: string;
  afterMeal: boolean;
  beforeMeal: boolean;
  morning: boolean;
  morningDose: string;
  noon: boolean;
  noonDose: string;
  evening: boolean;
  eveningDose: string;
  night: boolean;
  nightDose: string;
  instruction: string;
}

interface MedicineSuggestionOption {
  source: 'doctor' | 'store';
  value: string;
  meta: string;
  doctorMedicine?: DoctorMedicine;
  storeMedicine?: ProductCatalogItem;
}

@Component({
  selector: 'app-prescription',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgApexchartsModule, RouterLink, GynaeClinicalPrintPageComponent, GynaeWomensHealthPrintPageComponent, PrescriptionTemplateGynaeModernComponent, AdmissionRecommendationDrawerComponent],
  templateUrl: './prescription.component.html',
  styleUrl: './prescription.component.scss',
})
export class PrescriptionComponent implements OnInit, OnDestroy {
  @ViewChild('printContent', { static: false }) printContent!: ElementRef;
  @ViewChild('documentFileInput', { static: false }) documentFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('smartMedicineInputRef', { static: false }) smartMedicineInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('saveValidationSummary', { static: false }) saveValidationSummary?: ElementRef<HTMLElement>;
  @ViewChildren('medicineNameInput') medicineNameInputs?: QueryList<ElementRef<HTMLInputElement>>;

  prescriptions: Prescription[] = [];
  patientHistoryGroups: PrescriptionDateGroup[] = [];
  patientHistorySearch = '';
  patientHistoryDateFrom = '';
  patientHistoryDateTo = '';
  patientHistoryLoading = false;
  patientHistoryPage = 1;
  patientHistoryTotalPages = 0;
  readonly patientHistoryPageSize = 10;
  patients: Patient[] = [];
  doctors: Doctor[] = [];
  appointments: Appointment[] = [];
  doctorMedicines: DoctorMedicine[] = [];
  storeMedicines: ProductCatalogItem[] = [];
  storeMedicineSearchDisabled = false;
  medicineRowSuggestions: Record<number, MedicineSuggestionOption[]> = {};
  prescriptionForm: FormGroup;
  doctorMedicineForm: FormGroup;
  vitalsModalForm: FormGroup;
  appointmentsLoading = false;
  saving = false;
  saveValidationMessages: string[] = [];
  sendingDaySummary = false;
  private patientContextRequestId = 0;
  private offlineSyncSubscription?: Subscription;
  private offlineSyncToast: boolean | null = null;
  selectedPatientId = '';
  selectedAppointmentId = '';
  editingId: string | null = null;
  private editingInPlace = false;
  private editingPrescriptionOwnerId: string | null = null;
  currentHospitalId: string | null = null;
  currentHospital: Hospital | null = null;
  currentUserId: string | null = null;
  currentRole = '';
  routePatientId = '';
  routeDoctorId = '';
  routeAppointmentId = '';
  routePrescriptionTemplate: PrescriptionTemplate | null = null;
  activeTab = 'prescription';
  patientSearch = '';
  printPreviewOpen = false;
  printPreviewLoading = false;
  previewPrescription: Prescription | null = null;
  printPreviewData: PrintPreviewData | null = null;
  selectedPrescriptionTemplate: PrescriptionTemplate = 'classic';
  draftPrescriptionTemplate: PrescriptionTemplate | null = null;
  private prescriptionThemeTouched = false;
  savingPrescriptionTemplate = false;
  themeModalOpen = false;
  prescriptionThemeConfirmed = false;
  private themeModalInitialized = false;
  readonly prescriptionTemplates: Array<{
    id: PrescriptionTemplate;
    name: string;
    description: string;
  }> = [
    {
      id: 'classic',
      name: 'Classic',
      description: 'Traditional bilingual layout',
    },
    {
      id: 'clinical-blue',
      name: 'Clinical Blue',
      description: 'Detailed hospital style',
    },
    {
      id: 'gynae-clinical',
      name: "Gynae Theme 1 · Clinical Teal",
      description: 'Professional teal gynae prescription layout',
    },
    {
      id: 'gynae-womens-health',
      name: "Gynae Theme 2 · Women's Health",
      description: 'Bilingual women\'s health clinic layout',
    },
    {
      id: 'gynae-modern',
      name: "Gynae Theme 3 · Modern Purple",
      description: 'Premium pink & purple women\'s health layout',
    },
    {
      id: 'minimal-teal',
      name: 'Structure B · Green',
      description: 'Stacked card layout · Forest green',
    },
    {
      id: 'compact-mono',
      name: 'Structure C · Purple',
      description: 'Sectioned blocks · Deep purple',
    },
  ];
  smartMedicineInput = '';
  smartMedicinePreview: string | null = null;
  smartMedicineSuggestions: MedicineSuggestionOption[] = [];
  activeMedicineSuggestionIndex = -1;
  medicineLibraryOpen = false;
  medicineLibraryLoading = false;
  savingDoctorMedicine = false;
  selectedMedicineRowIndex: number | null = null;
  vitalsModalOpen = false;
  vitalsTrendModalOpen = false;
  vitalDisplayItems: VitalDisplayItem[] = [];
  sidebarVitalItems: SidebarVitalItem[] = [];
  vitalAlerts: VitalAlert[] = [];
  vitalTrendVisits: VitalTrendVisit[] = [];
  filteredVitalTrendVisits: VitalTrendVisit[] = [];
  vitalMiniCharts: VitalMiniChartData[] = [];
  vitalHistoryRows: VitalHistoryRow[] = [];
  vitalsTrendRange: VitalsTrendRange = '1m';
  readonly vitalsTrendRanges: Array<{ key: VitalsTrendRange; label: string }> = [
    { key: '7d', label: '7 Days' },
    { key: '1m', label: '1 Month' },
    { key: '3m', label: '3 Months' },
    { key: '6m', label: '6 Months' },
  ];
  readonly vitalChartSharedYAxis: ApexYAxis = {
    labels: {
      style: { fontSize: '10px', colors: '#94a3b8' },
    },
  };
  readonly vitalChartSharedGrid: ApexGrid = {
    borderColor: '#eef2f7',
    strokeDashArray: 4,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
    padding: { left: 8, right: 8 },
  };
  readonly vitalChartSharedDataLabels: ApexDataLabels = { enabled: false };
  readonly vitalChartSharedTooltip: ApexTooltip = {
    theme: 'light',
    x: { show: true },
  };
  today = new Date();
  private medicineInputSearchTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private smartMedicineSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private smartMedicineBlurTimer: ReturnType<typeof setTimeout> | null = null;
  private printPreviewRequestId = 0;
  private patientLabHistoryRequestId = 0;
  readonly durationOptions = [
    '1 Day',
    '3 Days',
    '5 Days',
    '7 Days',
    '10 Days',
    '14 Days',
    '1 Week',
    '2 Weeks',
    '4 Weeks',
    '1 Month',
    '2 Months',
    '3 Months',
    'Continue',
  ];

  readonly labTestCatalog = mergeGynaeLabCatalog([
    { name: 'CBC', category: 'Hematology' },
    { name: 'ESR', category: 'Hematology' },
    { name: 'CRP', category: 'Serology' },
    { name: 'Blood Sugar Fasting', category: 'Biochemistry' },
    { name: 'Chest X-Ray', category: 'Radiology' },
    { name: 'Sputum Culture', category: 'Microbiology' },
    ...POSTNATAL_LAB_TESTS,
  ]);
  readonly gynaeConsultModes = GYNAE_CONSULT_MODES;
  readonly gynaeLabCategories = GYNAE_LAB_CATEGORIES;
  readonly gynaeUltrasoundStudies = GYNAE_ULTRASOUND_STUDIES;
  readonly gynaeVitalFields = GYNAE_VITAL_FIELDS;
  readonly gynaeAdviceTemplates = GYNAE_ADVICE_TEMPLATES;
  readonly postnatalDangerSigns = POSTNATAL_DANGER_SIGNS;
  readonly antenatalDangerSigns = ANTEPARTUM_DANGER_SIGNS;
  readonly gynaeProblemComplaints = GYNAE_PROBLEM_COMPLAINTS;
  readonly gynaeProblemRedFlags = GYNAE_PROBLEM_RED_FLAGS;
  readonly antenatalDefaultNote = ANTEPARTUM_DEFAULT_NOTE_TO_PATIENT;
  readonly postnatalLabTests = POSTNATAL_LAB_TESTS;
  readonly postnatalDefaultLactation = POSTNATAL_DEFAULT_LACTATION;
  readonly postnatalDefaultCounselling = POSTNATAL_DEFAULT_COUNSELLING;
  gynaeLabCategoryFilter: GynaeLabCategory | 'all' = 'all';
  readonly labCatalogItems = LAB_TEST_CATALOG;
  labTestFilter: LabTestFilter = 'all';
  labTestRows: LabTestDisplayRow[] = [];
  patientLabOrders: LabOrder[] = [];
  selectedLabTestId: string | null = 'demo-CBC';
  labTestModalOpen = false;
  labTestDetailModalOpen = false;
  labTestCustomInput = '';
  readonly labTestFilters: Array<{ key: LabTestFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];
  ivFluidRows: IvFluidDisplayRow[] = [];
  ivFluidModalOpen = false;
  editingIvFluidIndex: number | null = null;
  ivFluidModalForm: FormGroup;
  readonly ivFluidOptions = IV_FLUID_OPTIONS;
  admissionRecommendations: AdmissionRecommendationRecord[] = [];
  admissionRecommendationsLoading = false;
  admissionRecommendationDrawerOpen = false;
  editingAdmissionRecommendation: AdmissionRecommendationRecord | null = null;
  patientDocumentRows: PatientDocumentDisplayRow[] = [];
  patientHistoryRecords: PatientHistory[] = [];
  documentModalOpen = false;
  editingDocumentIndex: number | null = null;
  pendingDocumentCategory: GynaeDocumentCategoryKey | null = null;
  activeDocumentMenuId: string | null = null;
  documentModalForm: FormGroup;
  readonly documentTypes = DOCUMENT_TYPES;
  readonly gynaeDocumentCategories = GYNAE_DOCUMENT_CATEGORIES;
  currentUserName = '';
  readonly defaultVitalKeys = new Set(['bp', 'pulse', 'weight', 'temperature', 'spo2']);
  readonly defaultVitalLabels: Record<string, string> = {
    bp: 'BP',
    pulse: 'Pulse',
    weight: 'Weight',
    temperature: 'Temperature',
    spo2: 'SpO2',
  };
  readonly vitalTrendKeys = ['weight', 'bp', 'temperature', 'pulse', 'spo2'];
  readonly specialtyTemplateOptions = Object.values(SPECIALTY_TEMPLATES);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private backend: BackendService,
    readonly offline: MooliOfflineService,
    private toastr: ToastrService,
    private dialog: AppDialogService
  ) {
    this.prescriptionForm = this.fb.group({
      patientId: ['', Validators.required],
      doctorId: ['', Validators.required],
      appointmentId: [''],
      visitType: ['opd'],
      chiefComplaint: [''],
      history: [''],
      examination: [''],
      diagnosis: [''],
      medicines: this.fb.array([this.createMedicineGroup()]),
      labTests: this.fb.array(this.labTestCatalog.map((test) => this.createLabTestGroup(test))),
      customLabTest: [''],
      ivFluids: this.fb.array([this.createIvFluidGroup()]),
      admissionOrders: this.fb.group({
        regularDiet: [false],
        npo: [false],
        consultation: [''],
        monitoring: this.fb.group({
          bp: [false],
          pulse: [false],
          spo2: [false],
          rbs: [false],
        }),
        notes: [''],
      }),
      admissionOrderItems: this.fb.array([]),
      patientDocuments: this.fb.array([]),
      vitals: this.fb.group({
        bp: [''],
        pulse: [''],
        weight: [''],
        temperature: [''],
        spo2: [''],
      }),
      customVitals: this.fb.array([]),
      specialtySection: [''],
      specialtyData: this.createSpecialtyDataGroup(),
      advice: [''],
      followUpDate: [''],
    });
    this.doctorMedicineForm = this.fb.group({
      name: ['', Validators.required],
      type: ['', Validators.required],
    });
    this.vitalsModalForm = this.fb.group({
      bp: [''],
      pulse: [''],
      weight: [''],
      height: [''],
      temperature: [''],
      spo2: [''],
      respiratoryRate: [''],
      bloodSugar: [''],
      notes: [''],
      customRows: this.fb.array([]),
    });
    this.ivFluidModalForm = this.fb.group({
      name: ['', Validators.required],
      rate: ['80 ml/hr'],
      quantity: ['500 ml'],
      route: ['IV'],
      startDateTime: [this.currentDateTimeLocalValue()],
      status: ['planned' as IvFluidStatus],
    });
    this.documentModalForm = this.fb.group({
      name: ['', Validators.required],
      type: ['Other'],
      category: [''],
      notes: [''],
      url: [''],
    });
  }

  ngOnInit(): void {
    const currentUser = JSON.parse(localStorage.getItem('user') || 'null') as
      | { _id?: string; hospitalId?: string | null; hospital?: Hospital | null; role?: { name?: string | null } | null }
      | null;
    this.currentHospitalId = currentUser?.hospitalId || null;
    this.currentHospital = currentUser?.hospital || null;
    this.currentUserId = currentUser?._id || null;
    this.currentRole = String(localStorage.getItem('role') || currentUser?.role?.name || '');
    this.currentUserName = String((currentUser as { name?: string } | null)?.name || localStorage.getItem('userName') || 'Staff');
    this.patientHistoryDateFrom = this.defaultPatientHistoryDateFrom();
    this.patientHistoryDateTo = this.todayValue();
    this.refreshCurrentHospital();

    this.route.queryParamMap.subscribe((params) => {
      this.routePatientId = params.get('patientId') || '';
      this.routeDoctorId = params.get('doctorId') || '';
      this.routeAppointmentId = params.get('appointmentId') || '';
      this.routePrescriptionTemplate = this.readPrescriptionTemplateParam(params.get('template'));
      this.selectedPatientId = this.routePatientId;
      this.selectedAppointmentId = this.routeAppointmentId;
      this.applyRouteDefaults();
      this.loadPatientContextPrescriptions();
      this.selectInitialAppointment();
      this.handlePrescriptionRouteAction(params.get('prescriptionId') || '', params.get('mode') || '');
    });

    this.loadLookups();
    this.offlineSyncSubscription = this.offline.syncCompleted$.subscribe((result) => {
      void this.handleOfflineSyncCompleted(result);
    });
    void this.syncOfflineWork(false);

    this.vitalsGroup.valueChanges.pipe(debounceTime(80)).subscribe(() => this.refreshVitalAnalytics());
    this.customVitals.valueChanges.pipe(debounceTime(80)).subscribe(() => this.refreshVitalAnalytics());
    this.labTests.valueChanges.subscribe(() => this.refreshLabTestRows());
    this.ivFluids.valueChanges.subscribe(() => this.refreshIvFluidRows());
    this.admissionOrderItems.valueChanges.subscribe(() => this.refreshAdmissionOrderRows());
    this.patientDocuments.valueChanges.subscribe(() => this.refreshPatientDocumentRows());
    this.refreshLabTestRows();
    this.refreshIvFluidRows();
    this.refreshAdmissionOrderRows();
    this.refreshPatientDocumentRows();
    this.prescriptionForm.get('doctorId')?.valueChanges.subscribe(() => this.applyGynaeDoctorDefaults());
    this.specialtyDataGroup.get('lmp')?.valueChanges.pipe(debounceTime(120)).subscribe(() => this.onGynaeLmpChange());
    [
      'gravida',
      'para',
      'abortion',
      'living',
      'cycleRegularity',
      'pregnancyStatus',
      'patientConsentTaken',
      'chaperonePresent',
      'pelvicExamDone',
    ].forEach((key) => {
      this.specialtyDataGroup.get(key)?.valueChanges.pipe(debounceTime(120)).subscribe(() => {
        this.refreshGynaeHistoryField();
        this.refreshGynaeExaminationConsent();
      });
    });
    window.setTimeout(() => this.initializePrescriptionTheme(), 0);
  }

  ngOnDestroy(): void {
    this.offlineSyncSubscription?.unsubscribe();
  }

  get medicines(): FormArray {
    return this.prescriptionForm.get('medicines') as FormArray;
  }

  get labTests(): FormArray {
    return this.prescriptionForm.get('labTests') as FormArray;
  }

  get ivFluids(): FormArray {
    return this.prescriptionForm.get('ivFluids') as FormArray;
  }

  get admissionOrderItems(): FormArray {
    return this.prescriptionForm.get('admissionOrderItems') as FormArray;
  }

  get patientDocuments(): FormArray {
    return this.prescriptionForm.get('patientDocuments') as FormArray;
  }

  get vitalsGroup(): FormGroup {
    return this.prescriptionForm.get('vitals') as FormGroup;
  }

  get customVitals(): FormArray {
    return this.prescriptionForm.get('customVitals') as FormArray;
  }

  get specialtyDataGroup(): FormGroup {
    return this.prescriptionForm.get('specialtyData') as FormGroup;
  }

  get vitalsModalCustomVitals(): FormArray {
    return this.vitalsModalForm.get('customRows') as FormArray;
  }

  get canCreatePrescriptions(): boolean {
    return this.backend.hasPermission('prescriptions.create');
  }

  get canReadPrescriptions(): boolean {
    return this.backend.hasPermission('prescriptions.read');
  }

  get canUpdatePrescriptions(): boolean {
    return this.backend.hasPermission('prescriptions.update');
  }

  get canReadPatients(): boolean {
    return this.backend.hasPermission('patients.read');
  }

  get canReadAppointments(): boolean {
    return this.backend.hasPermission('appointments.read');
  }

  get canReadPatientHistory(): boolean {
    return this.backend.hasPermission('patients_history.read');
  }

  get canReadLabOrders(): boolean {
    return this.backend.hasPermission('lab_orders.read');
  }

  get canSendDoctorDaySummary(): boolean {
    return (
      this.canReadPrescriptions ||
      this.canReadAppointments ||
      this.backend.hasPermission('hospital_dashboard.read')
    );
  }

  get isPrintPreviewViewOnly(): boolean {
    const previewId = String(this.previewPrescription?._id || '').trim();
    return Boolean(previewId) && previewId !== String(this.editingId || '').trim();
  }

  get activePrescriptionTemplateLabel(): string {
    return (
      this.prescriptionTemplates.find((template) => template.id === this.getActivePrescriptionTheme())?.name ||
      'Classic'
    );
  }

  get availablePrescriptionTemplates(): Array<{
    id: PrescriptionTemplate;
    name: string;
    description: string;
  }> {
    if (this.isGynaeDoctor()) {
      return this.prescriptionTemplates.filter((template) =>
        ['gynae-clinical', 'gynae-womens-health', 'gynae-modern', 'clinical-blue'].includes(template.id)
      );
    }

    return this.prescriptionTemplates.filter(
      (template) => !['gynae-clinical', 'gynae-womens-health', 'gynae-modern'].includes(template.id)
    );
  }

  get printPreviewTemplate(): PrescriptionTemplate {
    const template = this.printPreviewData?.template || this.getActivePrescriptionTheme();
    const specialtySection = this.printPreviewData?.specialtySection || this.activeSpecialtyTemplate().key;
    return normalizeGynaePrescriptionTemplate(template, specialtySection);
  }

  usesGynaeClinicalPrint(preview: PrintPreviewData): boolean {
    return usesGynaeClinicalPrint(preview.specialtySection, preview.template);
  }

  usesGynaeWomensHealthPrint(preview: PrintPreviewData): boolean {
    return usesGynaeWomensHealthPrint(preview.specialtySection, preview.template);
  }

  usesGynaeModernPrint(preview: PrintPreviewData): boolean {
    return usesGynaeModernPrint(preview.specialtySection, preview.template);
  }

  usesGynaeClinicalBluePrint(preview: PrintPreviewData): boolean {
    return usesGynaeClinicalBluePrint(preview.specialtySection, preview.template);
  }

  get printPreviewTemplateLabel(): string {
    return (
      this.prescriptionTemplates.find((template) => template.id === this.printPreviewTemplate)?.name ||
      'Classic'
    );
  }

  get canDeletePrescriptions(): boolean {
    return this.backend.hasPermission('prescriptions.delete');
  }

  createMedicineGroup(medicine?: Record<string, unknown>): FormGroup {
    const morningDose = String(medicine?.['morningDose'] || '').trim();
    const noonDose = String(medicine?.['noonDose'] || '').trim();
    const eveningDose = String(medicine?.['eveningDose'] || '').trim();
    const nightDose = String(medicine?.['nightDose'] || '').trim();

    return this.fb.group({
      name: [medicine?.['name'] || ''],
      dosage: [medicine?.['dosage'] || ''],
      frequency: [medicine?.['frequency'] || ''],
      duration: [medicine?.['duration'] || '1 Month'],
      afterMeal: [Boolean(medicine?.['afterMeal'])],
      beforeMeal: [Boolean(medicine?.['beforeMeal'])],
      morning: [Boolean(medicine?.['morning']) || Boolean(morningDose)],
      morningDose: [morningDose],
      noon: [Boolean(medicine?.['noon']) || Boolean(noonDose)],
      noonDose: [noonDose],
      evening: [Boolean(medicine?.['evening']) || Boolean(eveningDose)],
      eveningDose: [eveningDose],
      night: [Boolean(medicine?.['night']) || Boolean(nightDose)],
      nightDose: [nightDose],
      instructions: [medicine?.['instructions'] || ''],
    });
  }

  createSpecialtyDataGroup(): FormGroup {
    return this.fb.group(
      SPECIALTY_FIELDS.reduce((controls, field) => {
        controls[field.key] = [''];
        return controls;
      }, {} as Record<string, any>)
    );
  }

  createLabTestGroup(test?: { name?: string; category?: string; selected?: boolean }): FormGroup {
    return this.fb.group({
      selected: [Boolean(test?.selected)],
      name: [test?.name || ''],
      category: [test?.category || ''],
    });
  }

  createIvFluidGroup(
    fluid?: {
      name?: string;
      rate?: string;
      duration?: string;
      route?: string;
      status?: IvFluidStatus;
      startDateTime?: string;
    }
  ): FormGroup {
    return this.fb.group({
      name: [fluid?.name || ''],
      rate: [fluid?.rate || ''],
      duration: [fluid?.duration || ''],
      route: [fluid?.route || 'IV'],
      status: [(fluid?.status || 'planned') as IvFluidStatus],
      startDateTime: [fluid?.startDateTime || this.currentDateTimeLocalValue()],
    });
  }

  createAdmissionOrderGroup(item?: AdmissionOrderItem): FormGroup {
    return this.fb.group({
      order: [item?.order || ''],
      category: [item?.category || 'General'],
      orderedOn: [item?.orderedOn || this.currentDateTimeLocalValue()],
      priority: [item?.priority || 'normal'],
      status: [item?.status || 'active'],
    });
  }

  createPatientDocumentGroup(item?: PatientDocumentItem): FormGroup {
    return this.fb.group({
      name: [item?.name || ''],
      type: [item?.type || 'Other'],
      category: [item?.category || ''],
      notes: [item?.notes || ''],
      uploadedOn: [item?.uploadedOn || this.currentDateTimeLocalValue()],
      uploadedBy: [item?.uploadedBy || this.currentUploaderName()],
      url: [item?.url || ''],
    });
  }

  private currentUploaderName(): string {
    return this.selectedDoctorName() || this.currentUserName || 'Staff';
  }

  createCustomVitalGroup(key = '', value = ''): FormGroup {
    return this.fb.group({
      key: [key],
      value: [value],
    });
  }

  addMedicine(): void {
    this.medicines.push(this.createMedicineGroup());
  }

  addMedicineShortcutLabel(): string {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    return isMac ? 'Cmd+Shift+M' : 'Ctrl+Shift+M';
  }

  @HostListener('document:keydown', ['$event'])
  handlePrescriptionShortcut(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const hasPrimaryModifier = event.ctrlKey || event.metaKey;

    if (!hasPrimaryModifier || !event.shiftKey || key !== 'm' || this.isPrescriptionShortcutBlocked()) {
      return;
    }

    event.preventDefault();
    this.addMedicineFromShortcut();
  }

  addMedicineFromShortcut(): void {
    const newIndex = this.medicines.length;
    this.addMedicine();
    this.focusMedicineRow(newIndex);
  }

  private isPrescriptionShortcutBlocked(): boolean {
    return Boolean(
      this.themeModalOpen ||
      this.printPreviewOpen ||
      this.medicineLibraryOpen ||
      this.vitalsModalOpen ||
      this.vitalsTrendModalOpen ||
      this.labTestModalOpen ||
      this.labTestDetailModalOpen ||
      this.ivFluidModalOpen ||
      this.admissionRecommendationDrawerOpen ||
      this.documentModalOpen,
    );
  }

  addCustomVital(): void {
    this.openVitalsModal();
    this.addVitalsModalCustomRow();
  }

  openVitalsModal(): void {
    const vitals = this.vitalsGroup.getRawValue() as Record<string, string>;
    const customMap = this.customVitalsToMap();
    const gynaeData = this.specialtyDataGroup.getRawValue() as Record<string, string>;

    this.vitalsModalForm.reset({
      bp: vitals['bp'] || gynaeData['gynaeBp'] || '',
      pulse: vitals['pulse'] || '',
      weight: vitals['weight'] || gynaeData['gynaeWeight'] || '',
      height: customMap['height'] || '',
      temperature: vitals['temperature'] || '',
      spo2: vitals['spo2'] || '',
      respiratoryRate: customMap['respiratoryRate'] || customMap['respiratory_rate'] || '',
      bloodSugar: customMap['bloodSugar'] || customMap['blood_sugar'] || customMap['urineSugar'] || gynaeData['urineSugar'] || '',
      notes: customMap['notes'] || '',
    });
    this.loadVitalsModalCustomRows();
    this.vitalsModalOpen = true;
  }

  openVitalsModalWithCustomRow(): void {
    this.openVitalsModal();
    this.addVitalsModalCustomRow();
  }

  addVitalsModalCustomRow(): void {
    this.vitalsModalCustomVitals.push(this.createCustomVitalGroup());
  }

  removeVitalsModalCustomRow(index: number): void {
    this.vitalsModalCustomVitals.removeAt(index);
  }

  arbitraryCustomVitals(): Array<{ key: string; value: string; index: number }> {
    return this.customVitals.controls
      .map((control, index) => ({
        key: String(control.get('key')?.value || '').trim(),
        value: String(control.get('value')?.value || '').trim(),
        index,
      }))
      .filter((item) => isArbitraryCustomVitalKey(item.key));
  }

  formatCustomVitalLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  closeVitalsModal(): void {
    this.vitalsModalOpen = false;
  }

  saveVitalsModal(): void {
    const value = this.vitalsModalForm.getRawValue() as Record<string, string>;

    this.vitalsGroup.patchValue({
      bp: value['bp'] || '',
      pulse: value['pulse'] || '',
      weight: value['weight'] || '',
      temperature: value['temperature'] || '',
      spo2: value['spo2'] || '',
    });

    this.rebuildCustomVitalsFromModal(value);

    if (this.isGynaeDoctor()) {
      this.specialtyDataGroup.patchValue(
        {
          gynaeBp: value['bp'] || '',
          gynaeWeight: value['weight'] || '',
          urineSugar: this.customVitalsToMap()['urineSugar'] || this.customVitalsToMap()['urine_sugar'] || '',
          urineAlbumin: this.customVitalsToMap()['urineAlbumin'] || this.customVitalsToMap()['urine_albumin'] || '',
          hemoglobin: this.customVitalsToMap()['hemoglobin'] || this.customVitalsToMap()['hb'] || '',
          fundalHeight: this.customVitalsToMap()['fundalHeight'] || this.customVitalsToMap()['fundal_height'] || '',
          fetalHeartRate: this.customVitalsToMap()['fetalHeartRate'] || this.customVitalsToMap()['fetal_heart_rate'] || '',
        },
        { emitEvent: false }
      );
    }

    this.vitalsModalOpen = false;
    this.refreshVitalAnalytics();
  }

  openVitalsTrendsModal(): void {
    this.refreshVitalAnalytics();
    this.activeTab = 'vitals';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  closeVitalsTrendsModal(): void {
    this.vitalsTrendModalOpen = false;
  }

  openVitalsTab(): void {
    this.activeTab = 'vitals';
  }

  setVitalsTrendRange(range: VitalsTrendRange): void {
    this.vitalsTrendRange = range;
    this.refreshVitalAnalytics();
  }

  trackVitalChart(_index: number, chart: VitalMiniChartData): string {
    return chart.key;
  }

  historyTrendArrow(trend: 'up' | 'down' | 'flat' | 'none' | undefined): string {
    if (trend === 'up') {
      return '↑';
    }

    if (trend === 'down') {
      return '↓';
    }

    return '';
  }

  historyTrendClass(trend: 'up' | 'down' | 'flat' | 'none' | undefined): string {
    if (trend === 'up') {
      return 'up';
    }

    if (trend === 'down') {
      return 'down';
    }

    return 'flat';
  }

  vitalStatusClass(status: VitalStatus): string {
    return `vital-status-${status}`;
  }

  trendClass(item: VitalDisplayItem): string {
    if (!item.trendText) {
      return 'unknown';
    }

    if (item.status === 'critical') {
      return 'critical';
    }

    if (item.status === 'warning') {
      return 'warning';
    }

    if (item.status === 'watch') {
      return 'watch';
    }

    if (item.trendDirection === 'up') {
      return 'normal';
    }

    if (item.trendDirection === 'down') {
      return item.key === 'weight' ? 'warning' : 'watch';
    }

    return 'normal';
  }

  trendVitalValue(visit: VitalTrendVisit, key: string): string {
    const value = String(visit.vitals[key] || '').trim();
    return value || '—';
  }

  trendSectionHasData(key: string): boolean {
    return this.vitalTrendVisits.some((visit) => Boolean(String(visit.vitals[key] || '').trim()));
  }

  vitalTrendSectionLabel(key: string): string {
    return this.defaultVitalLabels[key] || key;
  }

  hasVitalTrendData(): boolean {
    return this.vitalTrendVisits.length > 0;
  }

  hasRecordedVitals(): boolean {
    return this.vitalDisplayItems.some((item) => Boolean(item.value));
  }

  patientPrescriptionHistory(): Prescription[] {
    const patientId = this.prescriptionForm.getRawValue().patientId || this.selectedPatientId;
    if (!patientId) {
      return [];
    }

    return [...this.prescriptions]
      .filter((prescription) => prescription.patientId === patientId)
      .sort(
        (first, second) =>
          new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime()
      );
  }

  hasAssignedPatient(): boolean {
    return Boolean(this.prescriptionForm.getRawValue().patientId || this.selectedPatientId);
  }

  private patientSavedLabTests(): PatientLabTestRecord[] {
    return this.patientPrescriptionHistory()
      .filter((prescription) => prescription._id !== this.editingId)
      .flatMap((prescription) =>
        (prescription.labTests || [])
          .filter((test) => Boolean(test.selected) && String(test.name || '').trim())
          .map((test) => ({
            prescriptionId: prescription._id,
            orderedAt: prescription.createdAt,
            name: String(test.name || '').trim(),
            category: test.category,
          }))
      );
  }

  private patientSavedIvFluids(): PatientIvFluidRecord[] {
    return this.patientPrescriptionHistory()
      .filter((prescription) => prescription._id !== this.editingId)
      .flatMap((prescription) =>
        (prescription.ivFluids || [])
          .filter((fluid) => String(fluid.name || '').trim())
          .map((fluid) => ({
            prescriptionId: prescription._id,
            orderedAt: prescription.createdAt,
            name: String(fluid.name || '').trim(),
            rate: fluid.rate,
            duration: fluid.duration,
            route: fluid.route,
            status: fluid.status,
            startDateTime: fluid.startDateTime,
          }))
      );
  }

  private patientSavedAdmissionOrders(): PatientAdmissionOrderRecord[] {
    return this.patientPrescriptionHistory()
      .filter((prescription) => prescription._id !== this.editingId)
      .flatMap((prescription) =>
        (prescription.admissionOrderItems || [])
          .filter((item) => String(item.order || '').trim())
          .map((item) => ({
            prescriptionId: prescription._id,
            order: String(item.order || '').trim(),
            category: item.category,
            orderedOn: item.orderedOn || prescription.createdAt,
            priority: item.priority,
            status: item.status,
          }))
      );
  }

  private patientLegacyAdmissionOrders(): Array<{
    prescriptionId: string;
    orderedAt?: string;
    legacy: Prescription['admissionOrders'];
  }> {
    return this.patientPrescriptionHistory()
      .filter((prescription) => prescription._id !== this.editingId)
      .filter(
        (prescription) =>
          (prescription.admissionOrderItems || []).length === 0 && Boolean(prescription.admissionOrders)
      )
      .map((prescription) => ({
        prescriptionId: prescription._id,
        orderedAt: prescription.createdAt,
        legacy: prescription.admissionOrders,
      }));
  }

  private patientSavedDocuments(): PatientDocumentRecord[] {
    const fromPrescriptions = this.patientPrescriptionHistory()
      .filter((prescription) => prescription._id !== this.editingId)
      .flatMap((prescription) =>
        (prescription.patientDocuments || [])
          .filter((document) => String(document.name || '').trim())
          .map((document) => ({
            prescriptionId: prescription._id,
            sourceType: 'prescription' as const,
            name: String(document.name || '').trim(),
            type: document.type,
            uploadedOn: document.uploadedOn || prescription.createdAt,
            uploadedBy: document.uploadedBy,
            url: document.url,
          }))
      );

    const fromHistory = this.patientHistoryRecords.flatMap((record) =>
      (record.attachments || [])
        .filter((attachment) => String(attachment.url || '').trim())
        .map((attachment) => ({
          historyId: record._id,
          sourceType: 'history' as const,
          name: String(attachment.name || record.title || 'Document').trim(),
          type: this.historyDocumentType(record),
          uploadedOn: record.createdAt,
          uploadedBy: record.doctor?.name || 'Staff',
          url: String(attachment.url || '').trim(),
        }))
    );

    return [...fromPrescriptions, ...fromHistory];
  }

  private historyDocumentType(record: PatientHistory): string {
    if (record.recordType === 'laboratory') {
      return 'Lab Report';
    }

    const title = String(record.title || '').toLowerCase();
    if (title.includes('x-ray') || title.includes('radiology')) {
      return 'Radiology';
    }

    if (title.includes('prescription')) {
      return 'Prescription';
    }

    return 'Other';
  }

  loadPatientHistoryRecords(): void {
    const patientId = this.prescriptionForm.getRawValue().patientId || this.selectedPatientId;
    if (!patientId || !this.canReadPatientHistory) {
      this.patientHistoryRecords = [];
      this.refreshPatientDocumentRows();
      return;
    }

    this.backend.getPatientHistoryRecords({ patientId, limit: 100 }).subscribe({
      next: (result) => {
        this.patientHistoryRecords = result.items;
        this.refreshPatientDocumentRows();
      },
      error: () => {
        this.patientHistoryRecords = [];
        this.refreshPatientDocumentRows();
      },
    });
  }

  private patientVitalHistory(): Array<{
    sourceId?: string;
    sourceType?: 'appointment' | 'prescription';
    createdAt?: string;
    vitals?: Record<string, string> | null;
    diagnosis?: string | null;
  }> {
    const patientId = this.prescriptionForm.getRawValue().patientId || this.selectedPatientId;
    if (!patientId) {
      return [];
    }

    const fromPrescriptions = this.patientPrescriptionHistory()
      .filter((prescription) => prescription._id !== this.editingId)
      .map((prescription) => ({
        sourceId: prescription._id,
        sourceType: 'prescription' as const,
        createdAt: prescription.createdAt,
        vitals: prescription.vitals || {},
        diagnosis: prescription.diagnosis || null,
      }));

    const fromAppointments = [...this.appointments]
      .filter(
        (appointment) =>
          appointment.patientId === patientId &&
          appointment.vitals &&
          Object.values(appointment.vitals).some((value) => String(value || '').trim())
      )
      .map((appointment) => ({
        sourceId: appointment._id,
        sourceType: 'appointment' as const,
        createdAt: appointment.appointmentDate || appointment.createdAt,
        vitals: appointment.vitals || {},
        diagnosis: appointment.reason || null,
      }));

    return [...fromPrescriptions, ...fromAppointments].sort(
      (first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime()
    );
  }

  private getPreviousVisitVitals(
    history: Array<{
      sourceId?: string;
      sourceType?: 'appointment' | 'prescription';
      vitals?: Record<string, string> | null;
    }>
  ): Record<string, string> {
    const previousVisit = history.find(
      (visit) =>
        !(
          visit.sourceType === 'appointment' &&
          visit.sourceId &&
          visit.sourceId === this.selectedAppointmentId
        )
    );

    return (previousVisit?.vitals as Record<string, string> | undefined) || {};
  }

  refreshVitalAnalytics(): void {
    const current = this.buildVitalsPayload(
      this.vitalsGroup.getRawValue() as Record<string, unknown>,
      this.customVitals.getRawValue() as Array<Record<string, unknown>>
    );
    const history = this.patientVitalHistory();
    const previous = this.getPreviousVisitVitals(history);
    const patient = this.selectedPatient();
    const patientAge = getPatientAgeYears(patient?.dateOfBirth || null);

    this.vitalDisplayItems = buildVitalDisplayItems(current, previous, patientAge);
    this.sidebarVitalItems = buildSidebarVitalItems(current, previous, patientAge);
    this.vitalAlerts = buildVitalAlerts(this.sidebarVitalItems);
    this.vitalTrendVisits = buildVitalTrendVisits(history);
    this.filteredVitalTrendVisits = filterVitalTrendVisitsByRange(this.vitalTrendVisits, this.vitalsTrendRange);
    this.vitalMiniCharts = buildVitalMiniCharts(this.filteredVitalTrendVisits, current, previous);
    this.vitalHistoryRows = buildVitalHistoryRows(this.filteredVitalTrendVisits, current);
  }

  private customVitalsToMap(): Record<string, string> {
    return (this.customVitals.getRawValue() as Array<Record<string, string>>).reduce(
      (map, entry) => {
        const key = String(entry['key'] || '').trim();
        if (key) {
          map[key] = String(entry['value'] || '').trim();
        }
        return map;
      },
      {} as Record<string, string>
    );
  }

  private loadVitalsModalCustomRows(): void {
    this.vitalsModalCustomVitals.clear();

    (this.customVitals.getRawValue() as Array<Record<string, string>>).forEach((entry) => {
      const key = String(entry['key'] || '').trim();
      const value = String(entry['value'] || '').trim();
      if (isArbitraryCustomVitalKey(key)) {
        this.vitalsModalCustomVitals.push(this.createCustomVitalGroup(key, value));
      }
    });
  }

  private rebuildCustomVitalsFromModal(modalValue: Record<string, string>): void {
    this.customVitals.clear();

    const entries: Array<{ key: string; value: string }> = [];
    const addEntry = (key: string, value: string): void => {
      const normalizedKey = key.trim();
      const normalizedValue = String(value || '').trim();
      if (normalizedKey && normalizedValue) {
        entries.push({ key: normalizedKey, value: normalizedValue });
      }
    };

    addEntry('height', modalValue['height'] || '');
    addEntry('respiratoryRate', modalValue['respiratoryRate'] || '');
    addEntry('bloodSugar', modalValue['bloodSugar'] || '');
    addEntry('notes', modalValue['notes'] || '');

    (this.vitalsModalCustomVitals.getRawValue() as Array<Record<string, string>>).forEach((entry) => {
      addEntry(String(entry['key'] || ''), String(entry['value'] || ''));
    });

    entries.forEach((entry) => this.customVitals.push(this.createCustomVitalGroup(entry.key, entry.value)));
  }

  private syncCustomVitalValue(key: string, value: string): void {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return;
    }

    const index = (this.customVitals.getRawValue() as Array<Record<string, string>>).findIndex(
      (entry) => String(entry['key'] || '').trim() === normalizedKey
    );

    if (!String(value || '').trim()) {
      if (index >= 0) {
        this.customVitals.removeAt(index);
      }
      return;
    }

    if (index >= 0) {
      this.customVitals.at(index).patchValue({ key: normalizedKey, value });
      return;
    }

    this.customVitals.push(this.createCustomVitalGroup(normalizedKey, value));
  }

  removeCustomVital(index: number): void {
    this.customVitals.removeAt(index);
  }

  onSmartMedicineInputChange(): void {
    this.cancelSmartMedicineBlurClose();
    this.refreshSmartMedicinePreview();
    const query = this.extractMedicineQuery(this.smartMedicineInput);
    if (this.smartMedicineSearchTimer) {
      clearTimeout(this.smartMedicineSearchTimer);
      this.smartMedicineSearchTimer = null;
    }

    if (!query) {
      this.clearSmartMedicineSuggestions();
      return;
    }

    this.refreshSmartMedicineSuggestions(query);
    this.smartMedicineSearchTimer = setTimeout(() => {
      this.smartMedicineSearchTimer = null;
      const latestQuery = this.extractMedicineQuery(this.smartMedicineInput);
      if (latestQuery !== query) {
        return;
      }

      this.loadDoctorMedicines(query, true);
      this.loadStoreMedicines(query, true);
    }, 250);
  }

  scheduleSmartMedicineBlurClose(): void {
    this.cancelSmartMedicineBlurClose();
    this.smartMedicineBlurTimer = setTimeout(() => {
      this.smartMedicineBlurTimer = null;
      this.clearSmartMedicineSuggestions();
    }, 120);
  }

  cancelSmartMedicineBlurClose(): void {
    if (!this.smartMedicineBlurTimer) {
      return;
    }

    clearTimeout(this.smartMedicineBlurTimer);
    this.smartMedicineBlurTimer = null;
  }

  handleSmartMedicineKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveMedicineSuggestion(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveMedicineSuggestion(-1);
      return;
    }

    if (event.key === 'Escape') {
      this.clearSmartMedicineSuggestions();
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    const selected = this.smartMedicineSuggestions[this.activeMedicineSuggestionIndex];
    if (selected && !this.hasSmartMedicineCommand(this.smartMedicineInput)) {
      this.addMedicineFromSuggestion(selected);
      return;
    }

    this.addSmartMedicineFromInput();
  }

  addSmartMedicineFromInput(): void {
    const command = this.smartMedicineInput.trim();
    if (!command) {
      this.toastr.error('Enter medicine name or shortcut');
      return;
    }

    const parsed = this.parseMedicineCommand(command);
    this.appendMedicineRow(this.createMedicineRow(parsed));
    this.resetSmartMedicineInput();
  }

  addMedicineFromLibrary(medicine: DoctorMedicine): void {
    const parsed = this.parseMedicineCommand(this.doctorMedicineDisplayName(medicine));
    this.appendMedicineRow(this.createMedicineRow(parsed));
    this.resetSmartMedicineInput();
  }

  addMedicineFromSuggestion(suggestion: MedicineSuggestionOption): void {
    if (suggestion.doctorMedicine) {
      this.addMedicineFromLibrary(suggestion.doctorMedicine);
      return;
    }

    if (suggestion.storeMedicine) {
      this.appendMedicineRow({
        name: this.storeMedicineDisplayName(suggestion.storeMedicine),
        dosage: this.defaultStoreMedicineDose(suggestion.storeMedicine),
        duration: '1 Month',
      });
      this.resetSmartMedicineInput();
    }
  }

  duplicateMedicine(index: number): void {
    const value = this.medicines.at(index)?.getRawValue();
    if (!value) {
      return;
    }

    this.medicines.insert(index + 1, this.createMedicineGroup(value));
  }

  focusMedicineRow(index: number): void {
    setTimeout(() => this.medicineNameInputs?.get(index)?.nativeElement.focus());
  }

  parseMedicineCommand(input: string): ParsedMedicineCommand {
    const tokens = input.trim().split(/\s+/).filter(Boolean);
    const frequencyKey =
      detectFrequencyKey(input) || tokens.map((token) => detectFrequencyKey(token)).find(Boolean) || null;
    const frequencyToken = tokens.find((token) => this.mapFrequencyToTimings(token).label);
    const mealToken = tokens.find((token) => ['pc', 'ac'].includes(token.toLowerCase()));
    const durationToken =
      tokens.find((token) => this.formatDuration(token)) ||
      tokens.find((token) => token.toLowerCase() === 'continue');
    const strengthToken = tokens.find((token) => /^\d+(\.\d+)?\s*(mg|ml|g|iu)?$/i.test(token));
    const medicineQuery = stripFrequencyPatterns(
      tokens
        .filter((token) => {
          const lower = token.toLowerCase();
          return (
            !detectFrequencyKey(token) &&
            lower !== mealToken?.toLowerCase() &&
            lower !== durationToken?.toLowerCase() &&
            lower !== strengthToken?.toLowerCase()
          );
        })
        .join(' ')
    );
    const savedMedicineMatch =
      this.findDoctorMedicineMatch(medicineQuery) || this.findDoctorMedicineMatch(tokens[0] || '');
    const schedule = frequencyKey ? getFrequencySchedule(frequencyKey) : null;
    const timings = schedule
      ? {
          label: schedule.label,
          instruction: schedule.instructionNote,
          morning: schedule.slots.morning,
          noon: schedule.slots.noon,
          evening: schedule.slots.evening,
          night: schedule.slots.night,
        }
      : this.mapFrequencyToTimings(frequencyToken || '');
    const duration = this.formatDuration(durationToken || '') || '1 Month';
    const afterMeal = mealToken?.toLowerCase() === 'pc';
    const beforeMeal = mealToken?.toLowerCase() === 'ac';
    const fallbackName = this.toTitleCase(medicineQuery || stripFrequencyPatterns(input));
    const strength = this.formatStrength(strengthToken || '');
    const dose = this.resolveMedicineDose(savedMedicineMatch, strengthToken || '');
    const defaultSlotDose = this.defaultSlotDose(savedMedicineMatch);
    const formattedInstructions = buildMedicineInstructions({
      dosage: dose || defaultSlotDose || '1 tablet',
      frequency: schedule?.label || timings.label || frequencyKey || '',
      morning: timings.morning,
      noon: timings.noon,
      evening: timings.evening,
      night: timings.night,
      morningDose: timings.morning ? defaultSlotDose || '1' : '',
      noonDose: timings.noon ? defaultSlotDose || '1' : '',
      eveningDose: timings.evening ? defaultSlotDose || '1' : '',
      nightDose: timings.night ? defaultSlotDose || '1' : '',
      beforeMeal,
      afterMeal,
    });

    return {
      medicineName: savedMedicineMatch ? this.doctorMedicineDisplayName(savedMedicineMatch) : fallbackName,
      genericName: '',
      dose,
      frequency: timings.label || '',
      duration,
      afterMeal,
      beforeMeal,
      morning: timings.morning,
      morningDose: timings.morning ? defaultSlotDose : '',
      noon: timings.noon,
      noonDose: timings.noon ? defaultSlotDose : '',
      evening: timings.evening,
      eveningDose: timings.evening ? defaultSlotDose : '',
      night: timings.night,
      nightDose: timings.night ? defaultSlotDose : '',
      instruction: formattedInstructions?.combined || strength || '',
    };
  }

  mapFrequencyToTimings(shortcut = ''): {
    label: string;
    instruction: string;
    morning: boolean;
    noon: boolean;
    evening: boolean;
    night: boolean;
  } {
    return resolveFrequencyTimings(shortcut);
  }

  onMedicineFrequencyInput(index: number): void {
    this.applyMedicineInstructionAssistant(index, { resetSlotsWhenNoSchedule: true });
  }

  onMedicineDosageInput(index: number): void {
    this.applyMedicineInstructionAssistant(index);
  }

  onMedicineMealTimingChange(index: number): void {
    this.applyMedicineInstructionAssistant(index);
  }

  formatDuration(token = ''): string {
    const value = token.toLowerCase();
    if (value === 'continue') {
      return 'Continue';
    }

    const match = /^(\d+)(d|w|m)$/.exec(value);
    if (!match) {
      return '';
    }

    const amount = Number(match[1]);
    const unitMap: Record<string, string> = {
      d: amount === 1 ? 'Day' : 'Days',
      w: amount === 1 ? 'Week' : 'Weeks',
      m: amount === 1 ? 'Month' : 'Months',
    };

    return `${amount} ${unitMap[match[2]]}`;
  }

  createMedicineRow(parsedData: ParsedMedicineCommand): Record<string, unknown> {
    return {
      name: parsedData.medicineName,
      dosage: parsedData.dose,
      frequency: parsedData.frequency,
      duration: parsedData.duration,
      afterMeal: parsedData.afterMeal,
      beforeMeal: parsedData.beforeMeal,
      morning: parsedData.morning,
      morningDose: parsedData.morningDose,
      noon: parsedData.noon,
      noonDose: parsedData.noonDose,
      evening: parsedData.evening,
      eveningDose: parsedData.eveningDose,
      night: parsedData.night,
      nightDose: parsedData.nightDose,
      instructions: parsedData.instruction,
    };
  }

  openDoctorMedicineModal(rowIndex: number | null = null): void {
    if (!this.canCreatePrescriptions) {
      this.toastr.error('You do not have permission to add doctor medicines.');
      return;
    }

    this.selectedMedicineRowIndex = rowIndex;
    const source =
      rowIndex !== null ? (this.medicines.at(rowIndex)?.getRawValue() as Record<string, unknown>) : {};
    const parsedMedicine = this.parseMedicineTypeAndName(String(source['name'] || ''));

    this.doctorMedicineForm.reset({
      name: parsedMedicine.name,
      type: parsedMedicine.type,
    });
    this.medicineLibraryOpen = true;
  }

  closeDoctorMedicineModal(): void {
    if (this.savingDoctorMedicine) {
      return;
    }

    this.medicineLibraryOpen = false;
    this.selectedMedicineRowIndex = null;
  }

  saveDoctorMedicine(useInPrescription = false): void {
    if (!this.canCreatePrescriptions) {
      this.toastr.error('You do not have permission to add doctor medicines.');
      return;
    }

    if (this.doctorMedicineForm.invalid) {
      this.doctorMedicineForm.markAllAsTouched();
      return;
    }

    const doctorId = this.activeDoctorId();
    if (!doctorId) {
      this.toastr.error('Select an appointment doctor before adding medicine');
      return;
    }

    const payload: Record<string, unknown> = {
      ...this.doctorMedicineForm.getRawValue(),
      doctorId,
      hospitalId: this.currentHospitalId || undefined,
    };

    this.savingDoctorMedicine = true;
    this.backend
      .createDoctorMedicine(payload)
      .pipe(finalize(() => (this.savingDoctorMedicine = false)))
      .subscribe({
        next: (response) => {
          const medicine = response.data;
          this.upsertDoctorMedicine(medicine);
          if (useInPrescription) {
            this.useDoctorMedicine(medicine);
          }
          this.toastr.success(response.message || 'Medicine added successfully');
          this.savingDoctorMedicine = false;
          this.closeDoctorMedicineModal();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to add medicine'),
      });
  }

  removeMedicine(index: number): void {
    this.clearMedicineRowSuggestion(index);

    if (this.medicines.length > 1) {
      this.medicines.removeAt(index);
      return;
    }

    this.medicines.at(index).reset({
      duration: '1 Month',
      morningDose: '',
      noonDose: '',
      eveningDose: '',
      nightDose: '',
    });
  }

  slotDose(medicine: Record<string, unknown> | null | undefined, slot: DoseSlot): string {
    return resolvePrintSlotDose(medicine, slot);
  }

  trackClinicalPage(_index: number, page: ClinicalRxPrintPage): number {
    return page.pageNumber;
  }

  printMedicineDensityClass(medicineCount: number): string {
    if (medicineCount >= 9) {
      return 'medicine-density-ultra';
    }

    if (medicineCount >= 6) {
      return 'medicine-density-dense';
    }

    if (medicineCount >= 4) {
      return 'medicine-density-compact';
    }

    return 'medicine-density-normal';
  }

  onSlotDoseInput(index: number, slot: DoseSlot): void {
    const group = this.medicines.at(index);
    const dose = String(group.get(`${slot}Dose`)?.value || '').trim();

    if (dose && !group.get(slot)?.value) {
      group.get(slot)?.setValue(true, { emitEvent: false });
    }

    this.applyMedicineInstructionAssistant(index);
  }

  handleSlotDoseKeydown(event: KeyboardEvent, rowIndex: number, slot: DoseSlot): void {
    this.handleMedicineFieldKeydown(event, rowIndex, slot);
  }

  handleMedicineFieldKeydown(event: KeyboardEvent, rowIndex: number, field: MedicineNavField): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!target) {
      return;
    }

    const isEmpty =
      target instanceof HTMLSelectElement ? false : !String(target.value || '').trim();

    if (event.key === 'Tab') {
      event.preventDefault();
      const next = event.shiftKey
        ? this.previousMedicineFieldTarget(rowIndex, field)
        : this.nextMedicineFieldTarget(rowIndex, field);

      if (next) {
        this.focusMedicineField(next.rowIndex, next.field);
      }
      return;
    }

    if (event.key === 'Backspace' && isEmpty) {
      event.preventDefault();
      const previous = this.previousMedicineFieldTarget(rowIndex, field);
      if (previous) {
        this.focusMedicineField(previous.rowIndex, previous.field);
      }
    }
  }

  private readonly medicineNavFields: MedicineNavField[] = [
    'name',
    'dosage',
    'frequency',
    'duration',
    'morning',
    'noon',
    'evening',
    'night',
    'instructions',
  ];

  private nextMedicineFieldTarget(
    rowIndex: number,
    field: MedicineNavField
  ): { rowIndex: number; field: MedicineNavField } | null {
    const fieldIndex = this.medicineNavFields.indexOf(field);

    if (fieldIndex < this.medicineNavFields.length - 1) {
      return { rowIndex, field: this.medicineNavFields[fieldIndex + 1] };
    }

    if (rowIndex < this.medicines.length - 1) {
      return { rowIndex: rowIndex + 1, field: 'name' };
    }

    return null;
  }

  private previousMedicineFieldTarget(
    rowIndex: number,
    field: MedicineNavField
  ): { rowIndex: number; field: MedicineNavField } | null {
    const fieldIndex = this.medicineNavFields.indexOf(field);

    if (fieldIndex > 0) {
      return { rowIndex, field: this.medicineNavFields[fieldIndex - 1] };
    }

    if (rowIndex > 0) {
      return { rowIndex: rowIndex - 1, field: 'instructions' };
    }

    return null;
  }

  private focusMedicineField(rowIndex: number, field: MedicineNavField): void {
    if (field === 'morning' || field === 'noon' || field === 'evening' || field === 'night') {
      this.focusSlotDoseInput(rowIndex, field);
      return;
    }

    const element = document.querySelector(
      `[data-medicine-field="${rowIndex}-${field}"]`
    ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;

    element?.focus();

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.select();
    }
  }

  private focusSlotDoseInput(rowIndex: number, slot: DoseSlot): void {
    const selector = `input.slot-dose-input[data-slot-dose="${rowIndex}-${slot}"]`;
    const element = document.querySelector(selector) as HTMLInputElement | null;
    element?.focus();
    element?.select();
  }

  onSlotToggle(index: number, slot: DoseSlot): void {
    const group = this.medicines.at(index);

    if (!group.get(slot)?.value) {
      group.get(`${slot}Dose`)?.setValue('');
    }

    this.applyMedicineInstructionAssistant(index);
  }

  addCustomLabTest(): void {
    const name = String(this.labTestCustomInput || this.prescriptionForm.value.customLabTest || '').trim();
    if (!name) {
      return;
    }

    this.orderLabTest(name, 'Other');
    this.labTestCustomInput = '';
    this.prescriptionForm.patchValue({ customLabTest: '' });
  }

  openLabTestModal(): void {
    this.labTestModalOpen = true;
  }

  closeLabTestModal(): void {
    this.labTestModalOpen = false;
  }

  openLabTestDetail(row: LabTestDisplayRow): void {
    this.selectLabTestRow(row);
    this.labTestDetailModalOpen = true;
  }

  closeLabTestDetail(): void {
    this.labTestDetailModalOpen = false;
  }

  canViewLabReportPdf(row: LabTestDisplayRow | null | undefined): boolean {
    return row?.source === 'lab-order' && Boolean(row.labOrderId);
  }

  openLabReportPdf(row: LabTestDisplayRow): void {
    const order = this.patientLabOrders.find((item) => String(item._id) === String(row.labOrderId || ''));
    if (!order) {
      this.toastr.error('Lab report is not available for this test.');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Lab report PDF');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      border: '0',
      height: '0',
      left: '-10000px',
      opacity: '0',
      pointerEvents: 'none',
      position: 'fixed',
      top: '0',
      width: '100vw',
    });

    document.body.appendChild(iframe);

    const printWindow = iframe.contentWindow;
    const printDocument = iframe.contentDocument || printWindow?.document;
    if (!printWindow || !printDocument) {
      iframe.remove();
      this.toastr.error('Unable to open lab report PDF.');
      return;
    }

    printDocument.open();
    printDocument.write(
      buildLabOrderReportHtml({
        order,
        hospital: this.currentHospital,
        comparison: [],
        reportGeneratedBy: this.currentUserForLabReport(),
      })
    );
    printDocument.close();

    let handled = false;
    const finish = () => {
      if (handled) {
        return;
      }

      handled = true;
      iframe.remove();
    };

    printWindow.onafterprint = finish;

    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        finish();
      }
    }, 250);

    window.setTimeout(finish, 30000);
  }

  orderLabTest(name: string, category = 'Other'): void {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return;
    }

    const existingIndex = this.labTests.controls.findIndex(
      (control) => String(control.get('name')?.value || '').trim().toLowerCase() === normalizedName.toLowerCase()
    );

    if (existingIndex >= 0) {
      this.labTests.at(existingIndex).patchValue({ selected: true });
    } else {
      this.labTests.push(this.createLabTestGroup({ name: normalizedName, category, selected: true }));
    }

    this.refreshLabTestRows();
    this.labTestModalOpen = false;
  }

  setLabTestFilter(filter: LabTestFilter): void {
    this.labTestFilter = filter;
  }

  selectLabTestRow(row: LabTestDisplayRow): void {
    this.selectedLabTestId = row.id;
  }

  filteredLabTestRows(): LabTestDisplayRow[] {
    return filterLabTestRows(this.labTestRows, this.labTestFilter);
  }

  selectedLabTestRow(): LabTestDisplayRow | null {
    return this.labTestRows.find((row) => row.id === this.selectedLabTestId) || this.filteredLabTestRows()[0] || null;
  }

  labStatusLabel(status: LabTestDisplayRow['status']): string {
    return labStatusLabel(status);
  }

  labStatusClass(status: LabTestDisplayRow['status']): string {
    return `lab-status-${status}`;
  }

  labParameterStatusLabel(status: LabTestDisplayRow['parameters'][number]['status']): string {
    return labParameterStatusLabel(status);
  }

  labParameterStatusClass(status: LabTestDisplayRow['parameters'][number]['status']): string {
    return `lab-param-${status}`;
  }

  trackLabTestRow(_index: number, row: LabTestDisplayRow): string {
    return row.id;
  }

  refreshLabTestRows(): void {
    const orderedTests = this.labTests.getRawValue() as Array<{ name?: string; category?: string; selected?: boolean }>;
    this.labTestRows = this.hasAssignedPatient()
      ? buildLabTestDisplayRows(this.patientSavedLabTests(), orderedTests, this.patientLabOrders)
      : [];

    if (!this.selectedLabTestId || !this.labTestRows.some((row) => row.id === this.selectedLabTestId)) {
      this.selectedLabTestId = this.labTestRows[0]?.id || null;
    }
  }

  removeLabTestRow(row: LabTestDisplayRow): void {
    if (row.source === 'saved' || row.formIndex === undefined) {
      return;
    }

    const control = this.labTests.at(row.formIndex);
    if (!control) {
      return;
    }

    const isCatalogItem = this.labTestCatalog.some(
      (item) => item.name.toLowerCase() === String(control.get('name')?.value || '').trim().toLowerCase()
    );

    if (isCatalogItem) {
      control.patchValue({ selected: false });
    } else {
      this.labTests.removeAt(row.formIndex);
    }

    this.refreshLabTestRows();
  }

  isLabTestAlreadyOrdered(name: string): boolean {
    return this.labTests.controls.some(
      (control) =>
        Boolean(control.get('selected')?.value) &&
        String(control.get('name')?.value || '').trim().toLowerCase() === name.trim().toLowerCase()
    );
  }

  addIvFluid(): void {
    this.ivFluids.push(this.createIvFluidGroup());
    this.refreshIvFluidRows();
  }

  removePatientDocument(index: number): void {
    if (index < 0 || index >= this.patientDocuments.length) {
      return;
    }

    this.patientDocuments.removeAt(index);
    this.refreshPatientDocumentRows();
  }

  openIvFluidModal(formIndex: number | null = null): void {
    this.editingIvFluidIndex = formIndex;

    if (formIndex !== null && this.ivFluids.at(formIndex)) {
      const fluid = this.ivFluids.at(formIndex).getRawValue() as Record<string, string>;
      this.ivFluidModalForm.reset({
        name: fluid['name'] || '',
        rate: fluid['rate'] || '',
        quantity: fluid['duration'] || '',
        route: fluid['route'] || 'IV',
        startDateTime: fluid['startDateTime'] || this.currentDateTimeLocalValue(),
        status: (fluid['status'] || 'planned') as IvFluidStatus,
      });
    } else {
      this.ivFluidModalForm.reset({
        name: '',
        rate: '80 ml/hr',
        quantity: '500 ml',
        route: 'IV',
        startDateTime: this.currentDateTimeLocalValue(),
        status: 'planned',
      });
    }

    this.ivFluidModalOpen = true;
  }

  closeIvFluidModal(): void {
    this.ivFluidModalOpen = false;
    this.editingIvFluidIndex = null;
  }

  saveIvFluidModal(): void {
    if (this.ivFluidModalForm.invalid) {
      this.ivFluidModalForm.markAllAsTouched();
      return;
    }

    const value = this.ivFluidModalForm.getRawValue() as Record<string, string>;
    const payload = {
      name: String(value['name'] || '').trim(),
      rate: String(value['rate'] || '').trim(),
      duration: String(value['quantity'] || '').trim(),
      route: String(value['route'] || 'IV').trim(),
      status: (value['status'] || 'planned') as IvFluidStatus,
      startDateTime: String(value['startDateTime'] || '').trim(),
    };

    if (!payload.name) {
      return;
    }

    if (this.editingIvFluidIndex !== null) {
      this.ivFluids.at(this.editingIvFluidIndex).patchValue(payload);
    } else {
      this.ivFluids.push(this.createIvFluidGroup(payload));
    }

    this.closeIvFluidModal();
    this.refreshIvFluidRows();
  }

  editIvFluidRow(row: IvFluidDisplayRow): void {
    if (row.source === 'form' && row.formIndex !== undefined) {
      this.openIvFluidModal(row.formIndex);
      return;
    }

    this.openIvFluidModal();
    this.ivFluidModalForm.patchValue({
      name: row.name,
      rate: row.rate,
      quantity: row.quantity,
      route: row.route,
      startDateTime: this.currentDateTimeLocalValue(),
      status: row.status,
    });
  }

  deleteIvFluidRow(row: IvFluidDisplayRow): void {
    if (row.source !== 'form' || row.formIndex === undefined) {
      return;
    }

    this.ivFluids.removeAt(row.formIndex);
    this.refreshIvFluidRows();
  }

  refreshIvFluidRows(): void {
    this.ivFluidRows = this.hasAssignedPatient()
      ? buildIvFluidDisplayRows(
          this.patientSavedIvFluids(),
          this.ivFluids.getRawValue() as Array<Record<string, string>>
        )
      : [];
  }

  totalActiveIvFluids(): number {
    return countActiveIvFluids(this.ivFluidRows);
  }

  ivFluidStatusClass(status: IvFluidStatus): string {
    return `iv-status-${status}`;
  }

  ivFluidStatusLabel(status: IvFluidStatus): string {
    return formatIvFluidStatusLabel(status);
  }

  trackIvFluidRow(_index: number, row: IvFluidDisplayRow): string {
    return row.id;
  }

  openAdmissionOrderModal(record: AdmissionRecommendationRecord | null = null): void {
    if (!this.hasAssignedPatient()) {
      this.toastr.info('Assign a patient appointment before creating an admission recommendation.');
      return;
    }

    if (!this.backend.hasPermission('ward.admissions.recommend') && !this.backend.hasPermission('ward.admissions.create')) {
      this.toastr.error('You do not have permission to recommend admission.');
      return;
    }

    this.editingAdmissionRecommendation = record;
    this.admissionRecommendationDrawerOpen = true;
  }

  admissionDrawerPatient(): Patient | null {
    return this.selectedPatient() || this.buildAdmissionPatientStub();
  }

  admissionDrawerAppointment(): Appointment | null {
    return this.selectedAppointment() || this.buildRouteAppointmentStub();
  }

  private admissionPatientStubCache: { key: string; value: Patient } | null = null;
  private admissionAppointmentStubCache: { key: string; value: Appointment } | null = null;
  private admissionDoctorStubCache: { key: string; value: Doctor } | null = null;

  private buildRouteAppointmentStub(): Appointment | null {
    const appointmentId = String(this.routeAppointmentId || this.selectedAppointmentId || '').trim();
    if (!appointmentId) {
      return null;
    }

    const patient = this.admissionDrawerPatient();
    const doctorId = String(
      this.prescriptionForm.getRawValue().doctorId || this.routeDoctorId || this.resolvedDoctorProfileId() || ''
    ).trim();
    const cacheKey = `${appointmentId}|${patient?._id || ''}|${doctorId}|${this.currentHospitalId || ''}`;
    if (this.admissionAppointmentStubCache?.key === cacheKey) {
      return this.admissionAppointmentStubCache.value;
    }

    const value = {
      _id: appointmentId,
      hospitalId: this.currentHospitalId || '',
      appointmentNo: '—',
      patientId: String(patient?._id || this.routePatientId || this.selectedPatientId || ''),
      patient,
      doctorId,
      departmentId: null,
      appointmentDate: this.todayValue(),
      startTime: '—',
      endTime: '—',
      status: 'confirmed',
    } as Appointment;
    this.admissionAppointmentStubCache = { key: cacheKey, value };
    return value;
  }

  private buildAdmissionPatientStub(): Patient | null {
    const patientId = String(this.prescriptionForm.getRawValue().patientId || this.selectedPatientId || '').trim();
    if (!patientId) {
      return null;
    }

    const appointmentPatient = this.selectedAppointment()?.patient;
    if (appointmentPatient?._id) {
      return appointmentPatient;
    }

    const cacheKey = `${patientId}|${this.currentHospitalId || ''}`;
    if (this.admissionPatientStubCache?.key === cacheKey) {
      return this.admissionPatientStubCache.value;
    }

    const value = {
      _id: patientId,
      hospitalId: this.currentHospitalId || '',
      patientNo: '—',
      firstName: 'Patient',
      lastName: '',
      gender: 'male',
    } as Patient;
    this.admissionPatientStubCache = { key: cacheKey, value };
    return value;
  }

  closeAdmissionRecommendationDrawer(): void {
    this.admissionRecommendationDrawerOpen = false;
    this.editingAdmissionRecommendation = null;
  }

  onAdmissionRecommendationSaved(record: AdmissionRecommendationRecord): void {
    const index = this.admissionRecommendations.findIndex((item) => item._id === record._id);
    if (index >= 0) {
      this.admissionRecommendations[index] = record;
    } else {
      this.admissionRecommendations = [record, ...this.admissionRecommendations];
    }
    this.editingAdmissionRecommendation = record;
    this.refreshAdmissionRecommendations();
  }

  printAdmissionRecommendation(record: AdmissionRecommendationRecord): void {
    const html = buildAdmissionRecommendationPrintHtml({
      hospital: this.currentHospital,
      patient: this.selectedPatient(),
      appointment: this.selectedAppointment(),
      doctor: this.resolvePreviewDoctorProfile(),
      record,
    });
    printAdmissionRecommendationHtml(html);
  }

  admissionRecommendationStatusLabel(status?: string): string {
    return admissionRecommendationStatusLabel(status);
  }

  recommendationDoctorName(record: AdmissionRecommendationRecord): string {
    const doctor = record.recommendedByDoctorId;
    if (doctor && typeof doctor === 'object') {
      return doctorDisplayName(doctor);
    }
    return this.selectedDoctorName();
  }

  canEditAdmissionRecommendation(record: AdmissionRecommendationRecord): boolean {
    return ['draft', 'pending', 'acknowledged'].includes(record.status);
  }

  trackAdmissionRecommendation(_index: number, record: AdmissionRecommendationRecord): string {
    return record._id;
  }

  refreshAdmissionRecommendations(): void {
    const patientId = this.prescriptionForm.getRawValue().patientId || this.selectedPatientId;
    if (!patientId || !this.offline.online()) {
      this.admissionRecommendations = [];
      return;
    }

    this.admissionRecommendationsLoading = true;
    this.backend
      .listAdmissionRecommendations({ patientId, limit: 50 })
      .pipe(finalize(() => (this.admissionRecommendationsLoading = false)))
      .subscribe({
        next: (result) => {
          this.admissionRecommendations = (result.items || []).map(mapAdmissionRecommendationRecord);
        },
        error: () => {
          this.admissionRecommendations = [];
        },
      });
  }

  refreshAdmissionOrderRows(): void {
    this.refreshAdmissionRecommendations();
  }

  totalActiveAdmissionOrders(): number {
    return this.admissionRecommendations.filter((item) => ['draft', 'pending', 'acknowledged'].includes(item.status)).length;
  }

  openDocumentModal(formIndex: number | null = null, categoryKey: GynaeDocumentCategoryKey | null = null): void {
    if (!this.hasAssignedPatient()) {
      this.toastr.warning('Select a patient appointment from the left panel first.');
      return;
    }

    this.editingDocumentIndex = formIndex;
    this.pendingDocumentCategory = categoryKey;
    this.activeDocumentMenuId = null;
    const categoryMeta = findGynaeDocumentCategory(categoryKey);

    if (formIndex !== null && this.patientDocuments.at(formIndex)) {
      const document = this.patientDocuments.at(formIndex).getRawValue() as PatientDocumentItem;
      this.documentModalForm.reset({
        name: document.name || '',
        type: document.type || categoryMeta?.defaultType || 'Other',
        category: document.category || categoryKey || '',
        notes: document.notes || '',
        url: document.url || '',
      });
    } else {
      this.documentModalForm.reset({
        name: '',
        type: categoryMeta?.defaultType || 'Other',
        category: categoryKey || '',
        notes: '',
        url: '',
      });
    }

    this.documentModalOpen = true;
  }

  triggerDocumentUpload(categoryKey: GynaeDocumentCategoryKey | null = null): void {
    if (!this.hasAssignedPatient()) {
      this.toastr.warning('Select a patient appointment from the left panel first.');
      return;
    }

    this.pendingDocumentCategory = categoryKey;
    this.documentFileInput?.nativeElement.click();
  }

  async onDocumentFileInputChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (this.isGynaeDoctor() && this.pendingDocumentCategory) {
      await this.uploadGynaeCategoryDocument(this.pendingDocumentCategory, file);
      this.pendingDocumentCategory = null;
      return;
    }

    const dataUrl = await this.readDocumentFileAsDataUrl(file);
    this.openDocumentModal(null, this.pendingDocumentCategory);
    this.documentModalForm.patchValue({
      name: file.name,
      url: dataUrl,
    });
    this.pendingDocumentCategory = null;
  }

  closeDocumentModal(): void {
    this.documentModalOpen = false;
    this.editingDocumentIndex = null;
    this.pendingDocumentCategory = null;
  }

  onDocumentFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    void this.readDocumentFileAsDataUrl(file).then((dataUrl) => {
      this.documentModalForm.patchValue({
        name: file.name,
        url: dataUrl,
      });
    });
  }

  private readDocumentFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(String(reader.result || ''));
      };

      reader.onerror = () => {
        reject(reader.error || new Error('Unable to read file'));
      };

      reader.readAsDataURL(file);
    });
  }

  saveDocumentModal(): void {
    if (this.documentModalForm.invalid) {
      this.documentModalForm.markAllAsTouched();
      return;
    }

    const value = this.documentModalForm.getRawValue() as PatientDocumentItem;
    const payload = normalizeGynaeDocumentPayload(
      {
        name: String(value.name || '').trim(),
        type: String(value.type || 'Other').trim(),
        category: String(value.category || this.pendingDocumentCategory || '').trim(),
        notes: String(value.notes || '').trim(),
        uploadedOn: this.currentDateTimeLocalValue(),
        uploadedBy: this.currentUploaderName(),
        url: String(value.url || '').trim(),
      },
      (String(value.category || this.pendingDocumentCategory || '').trim() as GynaeDocumentCategoryKey) || null
    );

    if (!payload.name) {
      return;
    }

    if (this.isGynaeDoctor() && !payload.category) {
      this.toastr.warning('Please select a document category.');
      return;
    }

    if (this.editingDocumentIndex !== null) {
      this.patientDocuments.at(this.editingDocumentIndex).patchValue(payload);
    } else {
      this.patientDocuments.push(this.createPatientDocumentGroup(payload));
    }

    this.closeDocumentModal();
    this.refreshPatientDocumentRows();
    this.toastr.success('Document added. Save Draft or Save & Print to keep it.');
  }

  deleteDocumentRow(row: PatientDocumentDisplayRow): void {
    if (row.source !== 'form' || row.formIndex === undefined) {
      return;
    }

    this.patientDocuments.removeAt(row.formIndex);
    this.refreshPatientDocumentRows();
  }

  downloadDocument(row: PatientDocumentDisplayRow): void {
    if (!row.url) {
      this.toastr.info('No file link available for this document.');
      return;
    }

    window.open(row.url, '_blank');
  }

  refreshPatientDocumentRows(): void {
    this.patientDocumentRows = this.hasAssignedPatient()
      ? buildPatientDocumentDisplayRows(
          this.patientSavedDocuments(),
          this.patientDocuments.getRawValue() as PatientDocumentItem[]
        )
      : [];
  }

  totalPatientDocuments(): number {
    return countPatientDocuments(this.patientDocumentRows);
  }

  trackPatientDocumentRow(_index: number, row: PatientDocumentDisplayRow): string {
    return row.id;
  }

  gynaeDocumentCategoryViews(): GynaeDocumentCategoryView[] {
    return buildGynaeDocumentCategoryViews(this.patientDocumentRows);
  }

  gynaeDocumentTimestamp(value: string): string {
    return formatGynaeDocumentTimestamp(value);
  }

  gynaeDocumentPreviewLabel(name: string): string {
    return documentPreviewLabel(name);
  }

  isGynaeDocumentImage(url: string): boolean {
    return isImageDocumentUrl(url);
  }

  openGynaeDocumentUpload(categoryKey: GynaeDocumentCategoryKey): void {
    this.triggerDocumentUpload(categoryKey);
  }

  onGynaeCategoryFileSelected(categoryKey: GynaeDocumentCategoryKey, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    void this.uploadGynaeCategoryDocument(categoryKey, file);
    input.value = '';
  }

  async uploadGynaeCategoryDocument(categoryKey: GynaeDocumentCategoryKey, file: File): Promise<void> {
    if (!this.hasAssignedPatient()) {
      this.toastr.warning('Select a patient appointment from the left panel first.');
      return;
    }

    try {
      const dataUrl = await this.readDocumentFileAsDataUrl(file);
      const categoryMeta = findGynaeDocumentCategory(categoryKey);
      const payload = normalizeGynaeDocumentPayload(
        {
          name: file.name,
          type: categoryMeta?.defaultType || 'Other',
          category: categoryKey,
          uploadedOn: this.currentDateTimeLocalValue(),
          uploadedBy: this.currentUploaderName(),
          url: dataUrl,
          notes: '',
        },
        categoryKey
      );

      this.patientDocuments.push(this.createPatientDocumentGroup(payload));
      this.refreshPatientDocumentRows();
      this.toastr.success(`${categoryMeta?.title || 'Document'} uploaded. Save the prescription to keep it.`);
    } catch {
      this.toastr.error('File upload failed. Please try again.');
    }
  }

  toggleDocumentMenu(rowId: string): void {
    this.activeDocumentMenuId = this.activeDocumentMenuId === rowId ? null : rowId;
  }

  editDocumentRow(row: PatientDocumentDisplayRow): void {
    if (row.source !== 'form' || row.formIndex === undefined) {
      return;
    }

    this.openDocumentModal(row.formIndex, (row.category as GynaeDocumentCategoryKey) || null);
  }

  private currentDateTimeLocalValue(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  }

  removeIvFluid(index: number): void {
    if (this.ivFluids.length > 1) {
      this.ivFluids.removeAt(index);
      this.refreshIvFluidRows();
    }
  }

  loadLookups(): void {
    if (this.canReadPatients) {
      this.backend.getPatients({ limit: 100, status: 'active' }).subscribe({
        next: (result) => {
          this.patients = result.items;
          void this.offline.cacheValue(this.patientsCacheKey(), this.patients);
        },
        error: () => {
          void this.loadCachedPatients();
        },
      });
    } else {
      this.patients = [];
    }

    this.backend.getAccessibleDoctors({ limit: 100, status: 'active' }).subscribe({
      next: (result) => {
        this.doctors = result.items;
        void this.offline.cacheValue(this.doctorsCacheKey(), this.doctors);
        this.syncDoctorProfileRouteDefaults();
        this.initializePrescriptionTheme();
        this.refreshOpenPreviewData();
        this.applyGynaeDoctorDefaults();
        this.maybeRedirectToPhysiotherapyRoute();
      },
      error: () => {
        void this.loadCachedDoctors();
      },
    });

    this.loadAppointments();
  }

  refreshAppointments(): void {
    this.loadAppointments(true);
  }

  private loadAppointments(showToast = false): void {
    if (!this.canReadAppointments) {
      this.appointments = [];
      this.appointmentsLoading = false;
      return;
    }

    this.appointmentsLoading = true;
    const appointmentDate = this.todayValue();

    this.backend
      .getAppointments({
        limit: 100,
        doctorId: this.isDoctorUser() ? this.resolvedDoctorProfileId() || undefined : undefined,
        dateFrom: appointmentDate,
        dateTo: appointmentDate,
      })
      .pipe(finalize(() => (this.appointmentsLoading = false)))
      .subscribe({
        next: (result) => {
          void this.offline.cacheValue(this.appointmentsCacheKey(), result.items);
          void this.applyAppointmentList(result.items);
          this.selectInitialAppointment();
          if (showToast) {
            this.toastr.success('Appointments refreshed.');
          }
        },
        error: () => {
          void this.loadCachedAppointments();
          if (showToast) {
            this.toastr.error('Unable to refresh appointments.');
          }
        },
      });
  }

  loadDoctorMedicines(search = '', updateSmartSuggestions = false, afterLoad?: () => void): void {
    const doctorId = this.activeDoctorId();
    if (!doctorId || !this.canReadPrescriptions) {
      this.doctorMedicines = [];
      if (updateSmartSuggestions) {
        this.clearSmartMedicineSuggestions();
      }
      afterLoad?.();
      return;
    }

    this.medicineLibraryLoading = true;
    this.backend
      .getDoctorMedicines({
        doctorId,
        q: search.trim() || undefined,
        limit: 50,
      })
      .pipe(finalize(() => (this.medicineLibraryLoading = false)))
      .subscribe({
        next: (items) => {
          this.doctorMedicines = this.mergeDoctorMedicines(items);
          void this.offline.cacheValue(this.doctorMedicinesCacheKey(search), this.doctorMedicines);
          if (updateSmartSuggestions) {
            this.refreshSmartMedicineSuggestions(search);
          }
          afterLoad?.();
        },
        error: () => {
          void this.loadCachedDoctorMedicines(search, updateSmartSuggestions, afterLoad);
        },
      });
  }

  loadStoreMedicines(search = '', updateSmartSuggestions = false, afterLoad?: () => void): void {
    if (this.storeMedicineSearchDisabled) {
      afterLoad?.();
      return;
    }

    this.backend
      .getPrescriptionProductSuggestions({
        limit: 50,
        isActive: true,
        search: search.trim() || undefined,
      })
      .subscribe({
        next: (result) => {
          this.storeMedicines = result.items;
          void this.offline.cacheValue(this.storeMedicinesCacheKey(search), this.storeMedicines);
          if (updateSmartSuggestions) {
            this.refreshSmartMedicineSuggestions(search);
          }
          afterLoad?.();
        },
        error: (err) => {
          void this.loadCachedStoreMedicines(search, updateSmartSuggestions, afterLoad);
          if (err?.status === 403) {
            this.storeMedicineSearchDisabled = true;
          }
        },
      });
  }

  onMedicineNameInput(index: number): void {
    const query = String(this.medicines.at(index).get('name')?.value || '').trim();
    const existingTimer = this.medicineInputSearchTimers.get(index);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (!query) {
      this.clearMedicineRowSuggestion(index);
      return;
    }

    this.refreshMedicineRowSuggestions(index, query);
    const timer = setTimeout(() => {
      this.medicineInputSearchTimers.delete(index);
      const latestQuery = String(this.medicines.at(index)?.get('name')?.value || '').trim();
      if (latestQuery !== query) {
        return;
      }

      this.loadDoctorMedicines(query, false, () => this.refreshMedicineRowSuggestions(index, query));
      this.loadStoreMedicines(query, false, () => this.refreshMedicineRowSuggestions(index, query));
    }, 250);

    this.medicineInputSearchTimers.set(index, timer);
  }

  private buildMedicineSuggestionOptions(query: string, limit = 10): MedicineSuggestionOption[] {
    const suggestions: MedicineSuggestionOption[] = [];
    const seen = new Set<string>();

    this.searchMedicineLibrary(query).forEach((medicine) => {
      const value = this.doctorMedicineDisplayName(medicine);
      const key = this.normalizeMedicineSuggestionKey(value);
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      suggestions.push({
        source: 'doctor',
        value,
        meta: this.doctorMedicineMeta(medicine),
        doctorMedicine: medicine,
      });
    });

    this.searchStoreMedicines(query).forEach((medicine) => {
      const value = this.storeMedicineDisplayName(medicine);
      const key = this.normalizeMedicineSuggestionKey(value);
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      suggestions.push({
        source: 'store',
        value,
        meta: this.storeMedicineMeta(medicine),
        storeMedicine: medicine,
      });
    });

    return suggestions.slice(0, limit);
  }

  private refreshSmartMedicineSuggestions(search: string): void {
    const query = this.extractMedicineQuery(search);
    this.smartMedicineSuggestions = this.buildMedicineSuggestionOptions(query, 8);
    this.activeMedicineSuggestionIndex = this.smartMedicineSuggestions.length ? 0 : -1;
  }

  private refreshMedicineRowSuggestions(index: number, search: string): void {
    const query = search.trim();
    if (!query) {
      this.clearMedicineRowSuggestion(index);
      return;
    }

    this.medicineRowSuggestions = {
      ...this.medicineRowSuggestions,
      [index]: this.buildMedicineSuggestionOptions(query, 10),
    };
  }

  private clearMedicineRowSuggestion(index: number): void {
    const timer = this.medicineInputSearchTimers.get(index);
    if (timer) {
      clearTimeout(timer);
      this.medicineInputSearchTimers.delete(index);
    }

    if (!this.medicineRowSuggestions[index]) {
      return;
    }

    const nextSuggestions = { ...this.medicineRowSuggestions };
    delete nextSuggestions[index];
    this.medicineRowSuggestions = nextSuggestions;
  }

  applyMedicineSuggestion(index: number): void {
    const query = String(this.medicines.at(index).get('name')?.value || '')
      .trim()
      .toLowerCase();
    const suggestion = (this.medicineRowSuggestions[index] || this.buildMedicineSuggestionOptions(query, 10)).find(
      (item) => item.value.trim().toLowerCase() === query
    );

    if (suggestion?.doctorMedicine) {
      this.useDoctorMedicine(suggestion.doctorMedicine, index);
      return;
    }

    if (suggestion?.storeMedicine) {
      this.useStoreMedicine(suggestion.storeMedicine, index);
    }
  }

  doctorMedicineDisplayName(medicine: Pick<DoctorMedicine, 'name' | 'type'>): string {
    const type = String(medicine.type || '').trim();
    const name = String(medicine.name || '').trim();

    return [type, name].filter(Boolean).join(' ');
  }

  doctorMedicineMeta(medicine: DoctorMedicine): string {
    const type = String(medicine.type || '').trim();
    const common = [medicine.dosage, medicine.frequency].filter(Boolean).join(' ');

    return [type || 'Saved medicine', common ? `Common: ${common}` : ''].filter(Boolean).join(' | ');
  }

  storeMedicineDisplayName(medicine: ProductCatalogItem): string {
    const unit = String(medicine.unit || '').trim();
    const name = String(medicine.name || '').trim();
    const strength = this.storeMedicineStrength(medicine);

    return [unit, name, strength ? `(${strength})` : ''].filter(Boolean).join(' ');
  }

  storeMedicineMeta(medicine: ProductCatalogItem): string {
    const brand = String(medicine.brand || '').trim();
    const sku = String(medicine.sku || '').trim();
    const stock = String(medicine.availableQuantity ?? medicine.stockQuantity ?? '').trim();

    return [
      'Hospital store',
      brand,
      sku ? `SKU: ${sku}` : '',
      stock ? `Stock: ${stock}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }

  loadPatientContextPrescriptions(): void {
    const patientId = this.prescriptionForm.getRawValue().patientId || this.selectedPatientId;
    if (!patientId) {
      this.loadPatientLabHistory('');
      void this.applyPatientContextPrescriptions([], 0);
      return;
    }

    this.loadPatientLabHistory(patientId);
    if (!this.canReadPrescriptions) {
      this.patientContextRequestId += 1;
      this.patientHistoryLoading = false;
      void this.applyPatientContextPrescriptions([], 0);
      return;
    }

    const requestId = ++this.patientContextRequestId;
    this.patientHistoryLoading = true;
    const params: Record<string, unknown> = {
      page: 1,
      limit: 100,
      patientId,
      doctorId: this.isDoctorUser() ? this.currentUserId || undefined : undefined,
      dateFrom: this.patientHistoryDateFrom || undefined,
      dateTo: this.patientHistoryDateTo || undefined,
      search: this.patientHistorySearch.trim() || undefined,
    };

    this.backend
      .getPrescriptions(params)
      .pipe(finalize(() => {
        if (requestId === this.patientContextRequestId) {
          this.patientHistoryLoading = false;
        }
      }))
      .subscribe({
        next: (result) => {
          if (requestId !== this.patientContextRequestId) {
            return;
          }

          void this.offline.cacheValue(this.prescriptionsCacheKey(patientId), {
            items: result.items,
            totalPages: result.pagination.totalPages,
          });
          void this.applyPatientContextPrescriptions(result.items, result.pagination.totalPages);
        },
        error: (err) => {
          if (requestId !== this.patientContextRequestId) {
            return;
          }

          void this.loadCachedPatientContextPrescriptions(patientId, err);
        },
      });
  }

  private loadPatientLabHistory(patientId: string): void {
    const resolvedPatientId = String(patientId || '').trim();
    const requestId = ++this.patientLabHistoryRequestId;

    if (!resolvedPatientId || !this.canReadLabOrders || !this.offline.online()) {
      this.patientLabOrders = [];
      this.refreshLabTestRows();
      return;
    }

    this.backend.getPatientLabHistory(resolvedPatientId).subscribe({
      next: (orders) => {
        if (requestId !== this.patientLabHistoryRequestId) {
          return;
        }

        this.patientLabOrders = orders || [];
        this.refreshLabTestRows();
      },
      error: () => {
        if (requestId !== this.patientLabHistoryRequestId) {
          return;
        }

        this.patientLabOrders = [];
        this.refreshLabTestRows();
      },
    });
  }

  applyPatientHistoryFilters(): void {
    this.patientHistoryPage = 1;
    this.loadPatientContextPrescriptions();
  }

  clearPatientHistoryFilters(): void {
    this.patientHistorySearch = '';
    this.patientHistoryDateFrom = this.defaultPatientHistoryDateFrom();
    this.patientHistoryDateTo = this.todayValue();
    this.patientHistoryPage = 1;
    this.loadPatientContextPrescriptions();
  }

  changePatientHistoryPage(nextPage: number): void {
    const totalPages = this.patientHistoryTotalPages;
    if (nextPage < 1 || (totalPages > 0 && nextPage > totalPages)) {
      return;
    }

    this.patientHistoryPage = nextPage;
    this.rebuildPatientHistoryGroups();
  }

  patientHistoryHasCustomFilters(): boolean {
    return Boolean(
      this.patientHistorySearch.trim() ||
        this.patientHistoryDateFrom !== this.defaultPatientHistoryDateFrom() ||
        this.patientHistoryDateTo !== this.todayValue()
    );
  }

  visiblePatientHistoryPrescriptions(): Prescription[] {
    return this.prescriptions.filter((prescription) => prescription._id !== this.editingId);
  }

  private paginatedPatientHistoryPrescriptions(): Prescription[] {
    const items = this.visiblePatientHistoryPrescriptions();
    const start = (this.patientHistoryPage - 1) * this.patientHistoryPageSize;
    return items.slice(start, start + this.patientHistoryPageSize);
  }

  trackPatientHistoryGroup(_index: number, group: PrescriptionDateGroup): string {
    return group.dateKey;
  }

  prescriptionAppointmentNo(prescription: Prescription): string {
    return prescription.appointment?.appointmentNo || '';
  }

  openPatientHistoryView(prescription: Prescription): void {
    this.openPrintPreviewWithFreshData(prescription);
  }

  openPatientHistoryEdit(prescription: Prescription): void {
    this.editPrescription(prescription);
  }

  private maybeRedirectToPhysiotherapyRoute(): void {
    const prescriptionId = this.route.snapshot.queryParamMap.get('prescriptionId');
    if (prescriptionId) {
      return;
    }

    const doctor = this.selectedDoctorProfile();
    if (!doctor || inferSpecialtyTemplateKey(doctor) !== 'physiotherapy') {
      return;
    }

    void this.router.navigate(['/prescriptions/physiotherapy'], {
      queryParams: this.route.snapshot.queryParams,
      replaceUrl: true,
    });
  }

  private handlePrescriptionRouteAction(prescriptionId: string, mode: string): void {
    if (!prescriptionId || !mode) {
      this.maybeRedirectToPhysiotherapyRoute();
      return;
    }

    if (!this.canReadPrescriptions) {
      this.toastr.error('You do not have permission to view prescriptions.');
      return;
    }

    if (mode === 'view') {
      this.backend.getPrescription(prescriptionId).subscribe({
        next: (prescription) => {
          if (prescription.specialtySection === 'physiotherapy') {
            void this.router.navigate(['/prescriptions/physiotherapy'], {
              queryParams: this.route.snapshot.queryParams,
            });
            return;
          }
          this.openPrintPreviewWithFreshData(prescription);
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Unable to load prescription.'),
      });
      return;
    }

    const cached = this.prescriptions.find((item) => item._id === prescriptionId);
    if (cached) {
      this.applyPrescriptionRouteAction(cached, mode);
      return;
    }

    this.backend.getPrescription(prescriptionId).subscribe({
      next: (prescription) => this.applyPrescriptionRouteAction(prescription, mode),
      error: (err) => this.toastr.error(err?.error?.message || 'Unable to load prescription.'),
    });
  }

  private applyPrescriptionRouteAction(prescription: Prescription, mode: string): void {
    if (prescription.specialtySection === 'physiotherapy') {
      void this.router.navigate(['/prescriptions/physiotherapy'], {
        queryParams: {
          prescriptionId: prescription._id,
          patientId: prescription.patientId,
          doctorId: prescription.doctorId,
          appointmentId: prescription.appointmentId || undefined,
          mode,
        },
      });
      return;
    }

    if (mode === 'view') {
      this.openPrintPreview(prescription);
      return;
    }

    if (mode === 'edit' && (this.canUpdatePrescriptions || this.canCreatePrescriptions)) {
      this.editPrescription(prescription);
    }
  }

  submitPrescription(printAfterSave = false): void {
    this.dismissSaveValidation();

    let shouldUpdate = Boolean(this.editingId && this.editingInPlace);
    if (
      shouldUpdate &&
      this.editingPrescriptionOwnerId &&
      this.editingPrescriptionOwnerId !== String(this.currentUserId || '').trim()
    ) {
      shouldUpdate = false;
      this.editingInPlace = false;
      this.editingId = null;
      this.editingPrescriptionOwnerId = null;
    }

    if (!shouldUpdate && !this.canCreatePrescriptions) {
      this.showSaveValidation([
        'You do not have permission to create prescriptions. Ask an administrator for Prescriptions Create access.',
      ]);
      return;
    }

    if (shouldUpdate && !this.canUpdatePrescriptions) {
      this.showSaveValidation([
        'You do not have permission to update this prescription. Ask an administrator for Prescriptions Update access.',
      ]);
      return;
    }

    const value = this.prescriptionForm.getRawValue();
    const missingFields: string[] = [];

    if (!String(value.patientId || '').trim()) {
      missingFields.push('Patient is missing. Select an appointment from Today\'s Appointments.');
    }

    if (!String(value.doctorId || '').trim()) {
      missingFields.push('Doctor is missing. Select an appointment assigned to a doctor.');
    }

    if (this.isDoctorUser() && !String(value.appointmentId || '').trim()) {
      missingFields.push('Appointment is missing. Select an assigned appointment before saving.');
    }

    if (missingFields.length) {
      this.prescriptionForm.markAllAsTouched();
      this.showSaveValidation(missingFields);
      return;
    }

    if (this.prescriptionForm.invalid) {
      this.prescriptionForm.markAllAsTouched();
      this.showSaveValidation([
        'One or more required fields are invalid. Review the highlighted fields and try again.',
      ]);
      return;
    }

    const medicines = this.normalizeMedicinesForSave(value.medicines);

    const payload: Record<string, unknown> = {
      patientId: value.patientId,
      doctorId: value.doctorId,
      appointmentId: value.appointmentId || undefined,
      visitType: value.visitType || 'opd',
      chiefComplaint: value.chiefComplaint || undefined,
      history: value.history || undefined,
      examination: value.examination || undefined,
      diagnosis: value.diagnosis || undefined,
      medicines,
      labTests: value.labTests.filter((test: Record<string, unknown>) => test['selected'] && test['name']),
      ivFluids: value.ivFluids
        .filter((fluid: Record<string, unknown>) => String(fluid['name'] || '').trim())
        .map((fluid: Record<string, unknown>) => ({
          name: String(fluid['name'] || '').trim(),
          rate: String(fluid['rate'] || '').trim(),
          duration: String(fluid['duration'] || '').trim(),
          route: String(fluid['route'] || 'IV').trim(),
          status: (String(fluid['status'] || 'planned') as IvFluidStatus),
          startDateTime: String(fluid['startDateTime'] || '').trim(),
        })),
      admissionOrderItems: value.admissionOrderItems
        .filter((item: Record<string, unknown>) => String(item['order'] || '').trim())
        .map((item: Record<string, unknown>) => ({
          order: String(item['order'] || '').trim(),
          category: String(item['category'] || 'General').trim(),
          orderedOn: String(item['orderedOn'] || '').trim(),
          priority: String(item['priority'] || 'normal'),
          status: String(item['status'] || 'active'),
        })),
      admissionOrders: value.admissionOrders,
      patientDocuments: value.patientDocuments
        .filter((document: Record<string, unknown>) => String(document['name'] || '').trim())
        .map((document: Record<string, unknown>) => ({
          name: String(document['name'] || '').trim(),
          type: String(document['type'] || 'Other').trim(),
          uploadedOn: String(document['uploadedOn'] || '').trim(),
          uploadedBy: String(document['uploadedBy'] || '').trim(),
          url: String(document['url'] || '').trim(),
        })),
      vitals: this.buildVitalsPayload(
        value.vitals as Record<string, unknown>,
        value.customVitals as Array<Record<string, unknown>>
      ),
      specialtySection: this.activeSpecialtyTemplate().key,
      specialtyData: this.buildSpecialtyDataPayload(value.specialtyData as Record<string, unknown>),
      advice: value.advice || undefined,
      followUpDate: value.followUpDate || undefined,
      prescriptionTemplate: this.getActivePrescriptionTheme(),
    };

    if (!shouldUpdate) {
      payload['hospitalId'] = this.currentHospitalId || undefined;
    }

    const apiPayload = sanitizePrescriptionPayload(payload, { includeHospitalId: !shouldUpdate });

    if (!this.offline.online() && !shouldUpdate) {
      void this.queuePrescription(apiPayload, printAfterSave);
      return;
    }

    const isCreate = !shouldUpdate;
    this.saving = true;
    const request$ = shouldUpdate
      ? this.backend.updatePrescription(this.editingId!, apiPayload)
      : this.backend.createPrescription(apiPayload);

    request$.pipe(finalize(() => (this.saving = false))).subscribe({
      next: (response) => {
        this.dismissSaveValidation();
        this.toastr.success(response.message);
        const savedPrescription = this.enrichPrescriptionTemplate(response.data, {
          allowFallback: true,
          fallbackTemplate: this.getActivePrescriptionTheme(),
        });
        if (savedPrescription?.prescriptionTemplate) {
          this.draftPrescriptionTemplate = savedPrescription.prescriptionTemplate;
          this.selectedPrescriptionTemplate = savedPrescription.prescriptionTemplate;
        }
        this.editingId = savedPrescription?._id || this.editingId;
        this.editingInPlace = Boolean(this.editingId);
        this.editingPrescriptionOwnerId = isCreate
          ? resolvePrescriptionOwnerUserId(savedPrescription)
          : this.editingPrescriptionOwnerId;
        this.markAppointmentCompleted(
          savedPrescription?.appointmentId || value.appointmentId,
          isCreate,
        );
        if (savedPrescription) {
          this.prescriptions = this.mergePrescriptions([savedPrescription, ...this.prescriptions]);
        }
        if (!isCreate) {
          this.loadPatientContextPrescriptions();
        }
        if (printAfterSave && savedPrescription) {
          this.openPrintPreview(savedPrescription);
        }
      },
      error: (err) => {
        if (!shouldUpdate && this.offline.shouldQueue(err)) {
          void this.queuePrescription(apiPayload, printAfterSave);
          return;
        }

        this.showSaveValidation(
          [formatApiValidationError(err) || 'The prescription could not be saved. Please try again.'],
          'Save failed'
        );
      },
    });
  }

  dismissSaveValidation(): void {
    this.saveValidationMessages = [];
  }

  private showSaveValidation(messages: string[], title = 'Cannot save prescription'): void {
    this.saveValidationMessages = [...new Set(messages.map((message) => message.trim()).filter(Boolean))];

    if (!this.saveValidationMessages.length) {
      return;
    }

    this.toastr.error(this.saveValidationMessages.join(' '), title, {
      closeButton: true,
      timeOut: 8000,
    });

    window.setTimeout(() => {
      const summary = this.saveValidationSummary?.nativeElement;
      summary?.focus({ preventScroll: true });
      summary?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  selectAppointment(appointment: Appointment): void {
    if (this.isCancelledAppointment(appointment)) {
      return;
    }

    if (!this.editingId && appointment.status === 'completed') {
      return;
    }

    this.selectedAppointmentId = appointment._id;
    this.selectedPatientId = appointment.patientId;
    this.dismissSaveValidation();
    this.patientHistoryPage = 1;
    this.prescriptionForm.patchValue({
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      appointmentId: appointment._id,
      chiefComplaint: appointment.reason || this.prescriptionForm.value.chiefComplaint || '',
    });

    if (!this.editingId) {
      this.applyAppointmentVitalsToForm(appointment);
    }

    this.loadDoctorMedicines();
    this.loadPatientHistoryRecords();
    this.refreshVitalAnalytics();
    this.refreshLabTestRows();
    this.refreshIvFluidRows();
    this.refreshAdmissionOrderRows();
    this.refreshPatientDocumentRows();
    this.refreshSelectedAppointment(appointment._id);
    this.loadPatientContextPrescriptions();

    if (!this.editingId && !this.prescriptionThemeTouched) {
      this.applyDoctorPrescriptionTheme();
    }
  }

  private refreshSelectedAppointment(appointmentId: string): void {
    if (!this.canReadAppointments || !this.offline.online()) {
      return;
    }

    this.backend.getAppointment(appointmentId).subscribe({
      next: (freshAppointment) => {
        if (this.isCancelledAppointment(freshAppointment)) {
          this.appointments = this.appointments.filter((item) => item._id !== freshAppointment._id);
          if (this.selectedAppointmentId === freshAppointment._id) {
            this.clearCancelledAppointmentSelection();
          }
          return;
        }

        this.appointments = this.appointments.map((item) =>
          item._id === freshAppointment._id ? { ...item, ...freshAppointment } : item
        );

        if (this.selectedAppointmentId !== freshAppointment._id) {
          return;
        }

        if (this.editingId) {
          const currentVitals = this.buildVitalsPayload(
            this.vitalsGroup.getRawValue() as Record<string, unknown>,
            this.customVitals.getRawValue() as Array<Record<string, unknown>>
          );
          if (!this.hasAnyVitals(currentVitals) && this.hasAnyVitals(freshAppointment.vitals)) {
            this.applyVitalsToForm(this.mergeVitalRecords(currentVitals, freshAppointment.vitals || {}));
          }
          return;
        }

        this.applyAppointmentVitalsToForm(freshAppointment);
        this.refreshVitalAnalytics();
      },
      error: () => {},
    });
  }

  private applyAppointmentVitalsToForm(appointment: Appointment): void {
    this.applyVitalsToForm((appointment.vitals || {}) as Record<string, string>);
  }

  private applyVitalsToForm(vitals: Record<string, string>): void {
    this.vitalsGroup.patchValue(this.extractDefaultVitals(vitals), { emitEvent: false });
    this.customVitals.clear({ emitEvent: false });
    this.extractCustomVitals(vitals).forEach((entry) =>
      this.customVitals.push(this.createCustomVitalGroup(entry.key, entry.value), { emitEvent: false })
    );
    this.refreshVitalAnalytics();
  }

  private hasAnyVitals(vitals?: Record<string, string> | null): boolean {
    return Boolean(vitals && Object.values(vitals).some((value) => String(value || '').trim()));
  }

  private mergeVitalRecords(
    primary?: Record<string, string> | null,
    fallback?: Record<string, string> | null
  ): Record<string, string> {
    const merged: Record<string, string> = { ...(fallback || {}) };
    Object.entries(primary || {}).forEach(([key, value]) => {
      if (String(value || '').trim()) {
        merged[key] = String(value);
      }
    });
    return merged;
  }

  private syncEditModeVitals(prescription: Prescription): void {
    const prescriptionVitals = (prescription.vitals || {}) as Record<string, string>;
    const appointmentVitals = (prescription.appointment?.vitals || {}) as Record<string, string>;
    const mergedFromPrescription = this.mergeVitalRecords(prescriptionVitals, appointmentVitals);

    if (this.hasAnyVitals(mergedFromPrescription)) {
      this.applyVitalsToForm(mergedFromPrescription);
      return;
    }

    const appointmentId = prescription.appointmentId || '';
    if (!appointmentId || !this.canReadAppointments || !this.offline.online()) {
      this.applyVitalsToForm(prescriptionVitals);
      return;
    }

    this.backend.getAppointment(appointmentId).subscribe({
      next: (appointment) => {
        this.rememberAppointment(appointment);
        const merged = this.mergeVitalRecords(prescriptionVitals, appointment.vitals || {});
        this.applyVitalsToForm(merged);
      },
      error: () => {
        this.applyVitalsToForm(prescriptionVitals);
      },
    });
  }

  private rememberAppointment(appointment: Appointment): void {
    if (this.appointments.some((item) => item._id === appointment._id)) {
      return;
    }

    this.appointments = [...this.appointments, appointment];
  }

  private ensureEditAppointmentLoaded(appointmentId: string): void {
    if (!appointmentId || !this.canReadAppointments || !this.offline.online()) {
      return;
    }

    if (this.appointments.some((item) => item._id === appointmentId)) {
      return;
    }

    this.backend.getAppointment(appointmentId).subscribe({
      next: (appointment) => this.rememberAppointment(appointment),
      error: () => undefined,
    });
  }

  editPrescription(prescription: Prescription): void {
    const editInPlace = canEditPrescriptionInPlace(prescription, this.currentUserId);

    if (!editInPlace) {
      if (!this.canCreatePrescriptions) {
        this.toastr.error('You cannot modify another doctor\'s prescription.');
        return;
      }

      this.editingInPlace = false;
      this.editingId = null;
      this.editingPrescriptionOwnerId = null;
      this.populatePrescriptionForm(prescription);
      if (this.isDoctorUser()) {
        this.prescriptionForm.patchValue({
          doctorId: this.currentUserId || '',
          appointmentId: '',
        });
        this.selectedAppointmentId = '';
      }
      this.toastr.info('This prescription belongs to another doctor. Saving will create a new prescription; the original stays unchanged.');
      return;
    }

    if (!this.canUpdatePrescriptions) {
      return;
    }

    this.editingInPlace = true;
    this.editingId = prescription._id;
    this.editingPrescriptionOwnerId = resolvePrescriptionOwnerUserId(prescription);
    this.populatePrescriptionForm(prescription);
  }

  private populatePrescriptionForm(prescription: Prescription): void {
    this.selectedPatientId = prescription.patientId;
    this.selectedAppointmentId = prescription.appointmentId || '';
    if (prescription.prescriptionTemplate) {
      this.selectedPrescriptionTemplate = prescription.prescriptionTemplate;
      this.draftPrescriptionTemplate = prescription.prescriptionTemplate;
      this.prescriptionThemeConfirmed = true;
    }
    this.prescriptionForm.patchValue({
      patientId: prescription.patientId,
      doctorId: prescription.doctorId,
      appointmentId: prescription.appointmentId || '',
      visitType: prescription.visitType || 'opd',
      chiefComplaint: prescription.chiefComplaint || '',
      history: prescription.history || '',
      examination: prescription.examination || '',
      diagnosis: prescription.diagnosis || '',
      advice: prescription.advice || '',
      followUpDate: prescription.followUpDate ? String(prescription.followUpDate).slice(0, 10) : '',
      specialtySection: prescription.specialtySection || '',
      specialtyData: {
        ...this.createSpecialtyDataGroup().getRawValue(),
        ...(prescription.specialtyData || {}),
      },
      admissionOrders: {
        ...this.defaultAdmissionOrders(),
        ...(prescription.admissionOrders || {}),
        monitoring: {
          ...this.defaultAdmissionOrders()?.monitoring,
          ...(prescription.admissionOrders?.monitoring || {}),
        },
      },
    });
    this.customVitals.clear();

    this.medicines.clear();
    (prescription.medicines || []).forEach((medicine) => this.medicines.push(this.createMedicineGroup(medicine as any)));
    if (this.medicines.length === 0) {
      this.addMedicine();
    }

    this.labTests.clear();
    const savedTests = prescription.labTests || [];
    const savedNames = new Set(savedTests.map((test) => test.name));
    this.labTestCatalog.forEach((test) => {
      const saved = savedTests.find((item) => item.name === test.name);
      this.labTests.push(this.createLabTestGroup({ ...test, selected: Boolean(saved) }));
    });
    savedTests
      .filter((test) => !savedNames.has(test.name) || !this.labTestCatalog.some((item) => item.name === test.name))
      .forEach((test) => this.labTests.push(this.createLabTestGroup({ ...test, selected: true })));

    this.ivFluids.clear();
    (prescription.ivFluids || []).forEach((fluid) =>
      this.ivFluids.push(
        this.createIvFluidGroup({
          name: fluid.name,
          rate: fluid.rate || '',
          duration: fluid.duration || '',
          route: fluid.route || 'IV',
          status: fluid.status || 'planned',
          startDateTime: fluid.startDateTime || prescription.createdAt || this.currentDateTimeLocalValue(),
        })
      )
    );
    if (this.ivFluids.length === 0) {
      this.addIvFluid();
    }

    this.admissionOrderItems.clear();
    (prescription.admissionOrderItems || []).forEach((item) =>
      this.admissionOrderItems.push(this.createAdmissionOrderGroup(item))
    );

    this.patientDocuments.clear();
    (prescription.patientDocuments || []).forEach((document) =>
      this.patientDocuments.push(this.createPatientDocumentGroup(document))
    );

    this.ensureEditAppointmentLoaded(prescription.appointmentId || '');
    this.syncEditModeVitals(prescription);
    this.ensureGynaeEditDefaults();
    this.loadDoctorMedicines();
    this.loadPatientHistoryRecords();
    this.loadPatientLabHistory(prescription.patientId);
    this.refreshVitalAnalytics();
    this.refreshLabTestRows();
    this.refreshIvFluidRows();
    this.refreshAdmissionOrderRows();
    this.refreshPatientDocumentRows();
  }

  resetForm(): void {
    this.editingId = null;
    this.editingInPlace = false;
    this.editingPrescriptionOwnerId = null;
    this.prescriptionForm.reset({
      visitType: 'opd',
      specialtySection: '',
      specialtyData: this.createSpecialtyDataGroup().getRawValue(),
      admissionOrders: this.defaultAdmissionOrders(),
    });
    this.customVitals.clear();
    this.medicines.clear();
    this.addMedicine();
    this.labTests.clear();
    this.labTestCatalog.forEach((test) => this.labTests.push(this.createLabTestGroup(test)));
    this.ivFluids.clear();
    this.ivFluids.push(this.createIvFluidGroup());
    this.admissionOrderItems.clear();
    this.patientDocuments.clear();
    this.applyRouteDefaults();
    this.selectInitialAppointment();
    this.loadDoctorMedicines();
    this.loadPatientHistoryRecords();
    this.loadPatientLabHistory(this.prescriptionForm.getRawValue().patientId || this.selectedPatientId);
    this.refreshVitalAnalytics();
    this.refreshLabTestRows();
    this.refreshIvFluidRows();
    this.refreshAdmissionOrderRows();
    this.refreshPatientDocumentRows();
  }

  patientName(patient?: Patient | null): string {
    return patient ? `${patient.firstName} ${patient.lastName}`.trim() : '-';
  }

  doctorName(doctor?: Doctor | null): string {
    return doctor?.user?.name || doctor?.specialization || '-';
  }

  appointmentStatusLabel(status: string): string {
    return status.replace(/_/g, ' ');
  }

  appointmentStatusClass(status: string): string {
    return `status-${status.replace(/_/g, '-')}`;
  }

  initials(value?: string | null): string {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return words.length
      ? words
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase()
      : 'NA';
  }

  shortDate(value: string | Date): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '-'
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  currentTime(): string {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  ageLabel(patient?: Patient | null): string {
    if (!patient?.dateOfBirth) {
      return '-';
    }

    const birthDate = new Date(patient.dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) {
      return '-';
    }

    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    const monthDelta = today.getMonth() - birthDate.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
      years -= 1;
    }

    return `${Math.max(years, 0)} Y`;
  }

  selectedAppointment(): Appointment | null {
    return this.appointments.find((appointment) => appointment._id === this.selectedAppointmentId) || null;
  }

  selectedPatient(): Patient | null {
    const patientId = this.prescriptionForm.getRawValue().patientId || this.selectedPatientId;
    return (
      this.selectedAppointment()?.patient ||
      this.patients.find((patient) => patient._id === patientId) ||
      null
    );
  }

  selectedDoctorName(): string {
    const appointment = this.selectedAppointment();
    if (appointment?.doctor?.name) {
      return appointment.doctor.name;
    }

    const doctorId = this.prescriptionForm.getRawValue().doctorId;
    const doctor = this.doctors.find((item) => item.userId === doctorId);
    return this.doctorName(doctor);
  }

  sendDoctorDaySummaryEmail(): void {
    if (!this.canSendDoctorDaySummary) {
      this.toastr.error('You do not have permission to send the doctor day summary.');
      return;
    }

    const doctorId = this.activeDoctorId();
    if (!doctorId) {
      this.toastr.error('Select a doctor before sending the day summary.');
      return;
    }

    const doctor = this.resolvePrescriptionDoctor({ doctorId });
    const doctorEmail = doctor?.user?.email || this.selectedAppointment()?.doctor?.email;
    if (!doctorEmail) {
      this.toastr.error('Doctor email is not configured. Update the doctor profile first.');
      return;
    }

    this.sendingDaySummary = true;
    const payload = this.isDoctorUser() ? {} : { doctorId };
    this.backend
      .sendDoctorDailySummaryEmail(payload)
      .pipe(finalize(() => (this.sendingDaySummary = false)))
      .subscribe({
        next: (response) => {
          const recipient = response.data?.recipientEmail || doctorEmail;
          this.toastr.success(response.message || `Daily summary sent to ${recipient}`);
        },
        error: (error) => {
          this.toastr.error(error?.error?.message || 'Failed to send daily summary email.');
        },
      });
  }

  selectedDoctorProfile(): Doctor | null {
    const doctorId = this.prescriptionForm.getRawValue().doctorId;
    return this.resolvePrescriptionDoctor({ doctorId }) || null;
  }

  activeSpecialtyTemplate(): SpecialtyTemplate {
    const explicitSection = String(this.prescriptionForm.getRawValue().specialtySection || '').trim() as SpecialtyTemplateKey;
    if (explicitSection && SPECIALTY_TEMPLATES[explicitSection]) {
      return SPECIALTY_TEMPLATES[explicitSection];
    }

    return SPECIALTY_TEMPLATES[inferSpecialtyTemplateKey(this.selectedDoctorProfile())];
  }

  isGynaeDoctor(): boolean {
    return this.activeSpecialtyTemplate().key === 'gynae';
  }

  specialtyTabLabel(): string {
    return this.isGynaeDoctor() ? 'Gynae / OBS' : 'Specialty Notes';
  }

  gynaeConsultMode(): GynaeConsultMode {
    const mode = String(this.specialtyDataGroup.get('gynaeMode')?.value || 'antenatal').trim();
    if (mode === 'gynae_problem' || mode === 'postnatal') {
      return mode;
    }

    return 'antenatal';
  }

  setGynaeConsultMode(mode: GynaeConsultMode): void {
    this.specialtyDataGroup.patchValue({ gynaeMode: mode });
    if (mode === 'postnatal') {
      this.ensurePostnatalDefaults();
    } else if (mode === 'antenatal') {
      this.ensureAntenatalDefaults();
    }
  }

  ensureAntenatalDefaults(): void {
    this.ensureGynaeEditDefaults();
  }

  ensurePostnatalDefaults(): void {
    this.ensureGynaeEditDefaults();
  }

  ensureGynaeEditDefaults(): void {
    if (!this.isGynaeDoctor()) {
      return;
    }

    const data = this.specialtyDataGroup.getRawValue() as Record<string, unknown>;
    const patch = buildGynaeEditSamplePatch(this.gynaeConsultMode(), data);

    if (Object.keys(patch).length > 0) {
      this.specialtyDataGroup.patchValue(patch, { emitEvent: false });
    }

    const formPatch: Record<string, string> = {};
    const raw = this.prescriptionForm.getRawValue();

    if (!String(raw.chiefComplaint || '').trim()) {
      formPatch['chiefComplaint'] = 'Postpartum follow-up / routine antenatal visit / gynae complaint';
    }

    if (!String(raw.history || '').trim()) {
      formPatch['history'] = buildGynaeHistorySummary(data) || 'Obstetric and gynaecological history as documented.';
    }

    if (!String(raw.examination || '').trim()) {
      formPatch['examination'] = buildGynaeConsentSummary(data) || 'General and systemic examination documented.';
    }

    if (!String(raw.diagnosis || '').trim()) {
      formPatch['diagnosis'] =
        this.gynaeConsultMode() === 'postnatal'
          ? 'Postnatal follow-up'
          : this.gynaeConsultMode() === 'gynae_problem'
            ? 'Gynaecological problem under evaluation'
            : 'Intrauterine pregnancy';
    }

    if (!String(raw.advice || '').trim()) {
      formPatch['advice'] = 'Take medicines as prescribed. Follow diet and rest advice. Return if symptoms worsen.';
    }

    if (!String(raw.followUpDate || '').trim()) {
      const followUp = new Date();
      followUp.setDate(followUp.getDate() + 14);
      formPatch['followUpDate'] = followUp.toISOString().slice(0, 10);
    }

    if (Object.keys(formPatch).length > 0) {
      this.prescriptionForm.patchValue(formPatch, { emitEvent: false });
    }

    this.refreshGynaeHistoryField();
    this.refreshGynaeExaminationConsent();
  }

  isPostnatalDangerSignCounselled(key: string): boolean {
    return this.isGynaeCounselledField(key);
  }

  togglePostnatalDangerSignCounselled(key: string, checked: boolean): void {
    this.toggleGynaeCounselledField(key, checked);
  }

  isGynaeCounselledField(key: string): boolean {
    return String(this.specialtyDataGroup.get(key)?.value || '').trim() === 'Yes';
  }

  toggleGynaeCounselledField(key: string, checked: boolean): void {
    this.specialtyDataGroup.patchValue({ [key]: checked ? 'Yes' : 'No' });
  }

  isGynaeYesField(key: string): boolean {
    return String(this.specialtyDataGroup.get(key)?.value || '').trim() === 'Yes';
  }

  toggleGynaeYesField(key: string, checked: boolean): void {
    this.specialtyDataGroup.patchValue({ [key]: checked ? 'Yes' : 'No' });
  }

  isGynaeFetalMovementYes(): boolean {
    const value = String(this.specialtyDataGroup.get('fetalMovement')?.value || '').trim();
    return value === 'Present' || value === 'Yes';
  }

  toggleGynaeFetalMovement(checked: boolean): void {
    this.specialtyDataGroup.patchValue({ fetalMovement: checked ? 'Present' : 'No' });
  }

  isGynaeComplaintSelected(key: string): boolean {
    return this.isGynaeYesField(key);
  }

  toggleGynaeComplaint(key: string, selected: boolean): void {
    this.toggleGynaeYesField(key, selected);
  }

  shouldShowPostnatalLabTest(index: number): boolean {
    const name = String(this.labTests.at(index)?.get('name')?.value || '').trim();
    return this.postnatalLabTests.some((test) => test.name.toLowerCase() === name.toLowerCase());
  }

  postnatalLabTestIndex(name: string): number {
    return this.labTests.controls.findIndex(
      (control) => String(control.get('name')?.value || '').trim().toLowerCase() === name.trim().toLowerCase()
    );
  }

  visibleGynaeFields(): SpecialtyField[] {
    const keys = visibleGynaeFieldKeys(this.gynaeConsultMode());
    return this.activeSpecialtyTemplate().fields.filter((field) => keys.has(field.key));
  }

  gynaeChiefComplaintPlaceholder(): string {
    return 'Lower abdominal pain / missed periods / bleeding / pregnancy follow-up / discharge';
  }

  gynaeHistoryPlaceholder(): string {
    return 'LMP, cycle, pregnancy status and obstetric history summary';
  }

  onGynaeLmpChange(): void {
    if (!this.isGynaeDoctor()) {
      return;
    }

    const lmp = String(this.specialtyDataGroup.get('lmp')?.value || '').trim();
    this.specialtyDataGroup.patchValue(
      {
        edd: calculateEddFromLmp(lmp),
        gestationalAge: calculateGestationalAgeFromLmp(lmp),
      },
      { emitEvent: false }
    );
    this.refreshGynaeHistoryField();
  }

  refreshGynaeHistoryField(): void {
    if (!this.isGynaeDoctor()) {
      return;
    }

    const summary = buildGynaeHistorySummary(this.specialtyDataGroup.getRawValue() as Record<string, unknown>);
    if (summary) {
      this.prescriptionForm.patchValue({ history: summary }, { emitEvent: false });
    }
  }

  refreshGynaeExaminationConsent(): void {
    if (!this.isGynaeDoctor()) {
      return;
    }

    const consent = buildGynaeConsentSummary(this.specialtyDataGroup.getRawValue() as Record<string, unknown>);
    if (consent) {
      this.prescriptionForm.patchValue({ examination: consent }, { emitEvent: false });
    }
  }

  applyGynaeAdviceTemplate(text: string): void {
    const current = String(this.prescriptionForm.get('advice')?.value || '').trim();
    this.prescriptionForm.patchValue({
      advice: current ? `${current}\n${text}` : text,
    });
  }

  shouldShowSidebarLabTest(index: number): boolean {
    if (!this.isGynaeDoctor() || this.gynaeLabCategoryFilter === 'all') {
      return true;
    }

    const name = String(this.labTests.at(index)?.get('name')?.value || '').trim();
    const item = GYNAE_LAB_CATALOG.find((test) => test.name.toLowerCase() === name.toLowerCase());

    if (!item) {
      return this.gynaeLabCategoryFilter === 'common';
    }

    return item.gynaeGroup === this.gynaeLabCategoryFilter;
  }

  medicinePregnancyWarning(index: number): string | null {
    if (!this.isGynaeDoctor() || this.gynaeConsultMode() !== 'antenatal') {
      return null;
    }

    const medicine = this.medicines.at(index)?.getRawValue() as Record<string, unknown> | undefined;
    const name = String(medicine?.['name'] || '').trim();
    const instructions = String(medicine?.['instructions'] || '').trim();

    if (!name || !isPregnancyRiskyMedicine(name, instructions)) {
      return null;
    }

    return 'Review medicine safety in pregnancy';
  }

  patchGynaeVitalField(key: string, value: string): void {
    this.specialtyDataGroup.patchValue({ [key]: value });
  }

  toggleUltrasoundStudy(key: string, checked: boolean): void {
    this.specialtyDataGroup.patchValue({ [key]: checked ? 'Yes' : 'No' });
  }

  isUltrasoundStudySelected(key: string): boolean {
    return String(this.specialtyDataGroup.get(key)?.value || '').trim() === 'Yes';
  }

  private applyGynaeDoctorDefaults(): void {
    if (!this.isGynaeDoctor()) {
      return;
    }

    const section = String(this.prescriptionForm.getRawValue().specialtySection || '').trim();
    if (!section) {
      this.prescriptionForm.patchValue({ specialtySection: 'gynae' }, { emitEvent: false });
    }

    if (!String(this.specialtyDataGroup.get('gynaeMode')?.value || '').trim()) {
      this.specialtyDataGroup.patchValue({ gynaeMode: 'antenatal' }, { emitEvent: false });
    }

    if (this.gynaeConsultMode() === 'postnatal') {
      this.ensurePostnatalDefaults();
    } else if (this.gynaeConsultMode() === 'antenatal') {
      this.ensureAntenatalDefaults();
    }
  }

  specialtyFieldControl(field: SpecialtyField): string {
    return field.key;
  }

  applySpecialtySection(section: string): void {
    const key = String(section || '').trim() as SpecialtyTemplateKey;
    if (!SPECIALTY_TEMPLATES[key]) {
      return;
    }

    this.prescriptionForm.patchValue({ specialtySection: key });
  }

  loadImagingTemplate(): void {
    const studyType = String(this.specialtyDataGroup.get('studyType')?.value || '').trim();
    if (/usg abdomen/i.test(studyType)) {
      this.specialtyDataGroup.patchValue({
        findings:
          'Liver:\nGall Bladder:\nCBD:\nPancreas:\nSpleen:\nRight Kidney:\nLeft Kidney:\nUrinary Bladder:\nProstate / Uterus:',
        impression: '',
      });
      return;
    }

    if (/x-?ray|ct|mri/i.test(studyType)) {
      this.specialtyDataGroup.patchValue({
        technique: '',
        findings: '',
        impression: '',
        recommendation: '',
      });
    }
  }

  selectedDoctorQualification(doctorId = this.prescriptionForm.getRawValue().doctorId): string {
    const doctor = this.doctors.find((item) => item.userId === doctorId);
    return doctor?.qualification || doctor?.specialization || 'M.B.B.S., F.C.P.S.';
  }

  prescriptionPatientName(prescription: Prescription): string {
    const patient = prescription.patient || this.patients.find((item) => item._id === prescription.patientId);
    return this.patientName(patient || null);
  }

  prescriptionDoctorName(prescription: Prescription): string {
    if (prescription.doctor?.name) {
      return prescription.doctor.name;
    }

    const doctor = this.doctors.find((item) => item.userId === prescription.doctorId);
    return this.doctorName(doctor);
  }

  prescriptionDate(prescription: Prescription): string {
    return this.shortDate(prescription.createdAt || prescription.followUpDate || new Date());
  }

  prescriptionMedicineCount(prescription: Prescription): number {
    return prescription.medicines?.length || 0;
  }

  prescriptionIvFluidCount(prescription: Prescription): number {
    return (prescription.ivFluids || []).filter((fluid) => String(fluid.name || '').trim()).length;
  }

  prescriptionIvFluidSummary(prescription: Prescription): string {
    return (prescription.ivFluids || [])
      .map((fluid) => String(fluid.name || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  genderShort(patient?: Patient | null): string {
    if (!patient?.gender) {
      return '-';
    }

    return patient.gender.charAt(0).toUpperCase();
  }

  openPrintPreview(prescription: Prescription | null = null): void {
    const requestId = ++this.printPreviewRequestId;
    const resolvedPrescription = prescription
      ? this.enrichPrescriptionTemplate(prescription, {
          allowFallback: prescription._id === this.editingId,
          fallbackTemplate: this.getActivePrescriptionTheme(),
        })
      : null;

    if (resolvedPrescription?.prescriptionTemplate && this.isPrintPreviewViewOnly) {
      this.selectedPrescriptionTemplate = resolvedPrescription.prescriptionTemplate;
      this.draftPrescriptionTemplate = resolvedPrescription.prescriptionTemplate;
    }

    this.previewPrescription = resolvedPrescription;
    this.printPreviewData = null;
    this.printPreviewLoading = true;
    this.printPreviewOpen = true;

    window.setTimeout(() => {
      if (requestId !== this.printPreviewRequestId || !this.printPreviewOpen) {
        return;
      }

      try {
        const previewData = resolvedPrescription
          ? this.buildPrintPreviewData(resolvedPrescription)
          : this.buildPrintPreviewData();

        if (!previewData) {
          this.printPreviewOpen = false;
          this.toastr.error('Unable to build prescription preview.');
          return;
        }

        this.printPreviewData = previewData;

        if (!this.isPrintPreviewViewOnly) {
          this.selectedPrescriptionTemplate = this.getActivePrescriptionTheme();
          this.draftPrescriptionTemplate = this.selectedPrescriptionTemplate;
        } else {
          this.selectedPrescriptionTemplate = previewData.template;
          this.draftPrescriptionTemplate = previewData.template;
        }
      } catch (error) {
        console.error('Unable to build prescription preview', error);
        this.printPreviewOpen = false;
        this.toastr.error('Unable to build prescription preview.');
      } finally {
        this.printPreviewLoading = false;
      }
    }, 0);
  }

  closePrintPreview(): void {
    this.printPreviewRequestId += 1;
    this.printPreviewOpen = false;
    this.printPreviewLoading = false;
    this.previewPrescription = null;
    this.printPreviewData = null;
  }

  printPrescription(): void {
    if (!this.printContent?.nativeElement) {
      return;
    }

    this.openPrescriptionPrintWindow(this.printContent.nativeElement.outerHTML);
  }

  selectPrescriptionTemplate(template: PrescriptionTemplate): void {
    if (this.isPrintPreviewViewOnly) {
      return;
    }

    this.prescriptionThemeTouched = true;
    this.selectedPrescriptionTemplate = template;
    this.draftPrescriptionTemplate = template;
    this.persistDraftPrescriptionTheme();

    if (this.printPreviewData) {
      this.printPreviewData = {
        ...this.printPreviewData,
        template: normalizeGynaePrescriptionTemplate(template, this.printPreviewData.specialtySection),
      };
    }
  }

  openPrescriptionThemeModal(): void {
    if (!this.canCreatePrescriptions && !this.editingId) {
      return;
    }

    this.themeModalOpen = true;
  }

  confirmPrescriptionTheme(): void {
    this.prescriptionThemeTouched = true;
    this.draftPrescriptionTemplate = this.selectedPrescriptionTemplate;
    this.prescriptionThemeConfirmed = true;
    this.themeModalOpen = false;
    this.persistDraftPrescriptionTheme();

    if (this.printPreviewData) {
      this.printPreviewData = {
        ...this.printPreviewData,
        template: normalizeGynaePrescriptionTemplate(
          this.selectedPrescriptionTemplate,
          this.printPreviewData.specialtySection
        ),
      };
    }
  }

  closePrescriptionThemeModal(): void {
    this.themeModalOpen = false;
  }

  canSavePrescriptionTemplate(): boolean {
    return this.isDoctorUser() || (Boolean(this.resolvePreviewDoctorProfile()) && this.backend.hasPermission('doctors.update'));
  }

  savePrescriptionTemplate(): void {
    const doctor = this.resolvePreviewDoctorProfile();

    if (!doctor && !this.isDoctorUser()) {
      this.toastr.error('Doctor profile is not available for this prescription.');
      return;
    }

    if (!this.isDoctorUser() && !this.backend.hasPermission('doctors.update')) {
      return;
    }

    this.savingPrescriptionTemplate = true;
    const request$ = this.isDoctorUser()
      ? this.backend.updateMyPrescriptionTemplate({
          prescriptionTemplate: this.selectedPrescriptionTemplate,
        })
      : this.backend.updateDoctor(doctor!._id, {
          prescriptionTemplate: this.selectedPrescriptionTemplate,
        });

    request$
      .pipe(finalize(() => (this.savingPrescriptionTemplate = false)))
      .subscribe({
        next: (response) => {
          const updatedDoctor = response.data;
          this.upsertPrescriptionTemplateDoctor(updatedDoctor || doctor || null);
          this.draftPrescriptionTemplate = this.selectedPrescriptionTemplate;
          this.prescriptionThemeTouched = true;
          this.persistDraftPrescriptionTheme();

          if (this.printPreviewData) {
            this.printPreviewData = {
              ...this.printPreviewData,
              template: this.selectedPrescriptionTemplate,
            };
          }

          void this.offline.cacheValue(this.doctorsCacheKey(), this.doctors);
          this.toastr.success('Default prescription design updated.');
        },
        error: (err) => {
          this.toastr.error(err?.error?.message || 'Unable to save prescription design.');
        },
      });
  }

  private upsertPrescriptionTemplateDoctor(doctor: Doctor | null): void {
    if (!doctor?._id) {
      return;
    }

    const resolvedDoctor = {
      ...doctor,
      prescriptionTemplate: doctor.prescriptionTemplate || this.selectedPrescriptionTemplate,
    };
    const index = this.doctors.findIndex((item) => item._id === resolvedDoctor._id);

    if (index >= 0) {
      this.doctors = this.doctors.map((item) =>
        item._id === resolvedDoctor._id ? resolvedDoctor : item
      );
      return;
    }

    this.doctors = [...this.doctors, resolvedDoctor];
  }

  visibleAppointments(): Appointment[] {
    const query = this.patientSearch.trim().toLowerCase();
    const source = this.appointments.filter((appointment) => this.isPrescriptionAppointment(appointment));

    if (!query) {
      return source;
    }

    return source.filter((appointment) =>
      `${this.patientName(appointment.patient)} ${appointment.appointmentNo}`.toLowerCase().includes(query),
    );
  }

  async deletePrescription(id: string): Promise<void> {
    if (!this.canDeletePrescriptions) {
      return;
    }

    const confirmed = await this.dialog.confirm({
      title: 'Delete Prescription',
      message: 'Delete this prescription? This action cannot be undone.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    this.backend.deletePrescription(id).subscribe({
      next: (response) => {
        this.toastr.success(response.message);
        this.loadPatientContextPrescriptions();
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Something went wrong'),
    });
  }

  async syncOfflineWork(showToast = true): Promise<void> {
    if (!this.offline.online()) {
      if (showToast) {
        this.toastr.info('Prescriptions will sync when internet is back.');
      }
      return;
    }

    this.offlineSyncToast = showToast;
    await this.offline.syncQueuedWork();
  }

  private async handleOfflineSyncCompleted(result: MooliSyncResult): Promise<void> {
    const showToast = this.offlineSyncToast ?? true;
    this.offlineSyncToast = null;

    if (result.syncedCount > 0) {
      await this.remapLocalEditingPrescriptionId();
      this.loadLookups();
      this.loadPatientContextPrescriptions();
      this.rebuildPatientHistoryGroups();
    }

    if (!showToast) {
      return;
    }

    if (result.syncedCount > 0) {
      this.toastr.success(`${result.syncedCount} offline item(s) synced.`);
      return;
    }

    if (result.failedCount > 0) {
      this.toastr.error(`${result.failedCount} offline item(s) failed to sync. Tap Sync to retry.`);
      return;
    }

    if (this.offline.pendingCount() === 0) {
      this.toastr.info('No offline prescriptions are waiting to sync.');
    }
  }

  private async remapLocalEditingPrescriptionId(): Promise<void> {
    if (!this.editingId?.startsWith('local-')) {
      return;
    }

    const syncedId = await this.offline.getSyncedRemoteId(this.editingId);
    if (syncedId) {
      this.editingId = syncedId;
    }
  }

  private async loadCachedPatients(): Promise<void> {
    const cached = await this.offline.readCachedValue<Patient[]>(this.patientsCacheKey(), []);
    const localPatients = (await this.offline.getQueuedWork('patient'))
      .filter((entry) => entry.operation === 'create')
      .map((entry) => this.patientFromQueuedWork(entry));
    this.patients = this.mergePatients([...localPatients, ...cached]);
  }

  private async loadCachedDoctors(): Promise<void> {
    this.doctors = await this.offline.readCachedValue<Doctor[]>(this.doctorsCacheKey(), []);
    this.refreshOpenPreviewData();
  }

  private async loadCachedAppointments(): Promise<void> {
    const cached = await this.offline.readCachedValue<Appointment[]>(this.appointmentsCacheKey(), []);
    await this.applyAppointmentList(cached);
    this.selectInitialAppointment();
  }

  private async applyAppointmentList(items: Appointment[]): Promise<void> {
    const localAppointments = await this.localQueuedAppointments();
    this.appointments = this.mergeAppointments([...localAppointments, ...items]).filter((appointment) =>
      this.isPrescriptionAppointment(appointment),
    );
  }

  private async loadCachedDoctorMedicines(
    search: string,
    updateSmartSuggestions: boolean,
    afterLoad?: () => void,
  ): Promise<void> {
    const cached = await this.offline.readCachedValue<DoctorMedicine[]>(
      this.doctorMedicinesCacheKey(search),
      [],
    );
    this.doctorMedicines = this.mergeDoctorMedicines(cached);
    if (updateSmartSuggestions) {
      if (cached.length) {
        this.refreshSmartMedicineSuggestions(search);
      } else {
        this.clearSmartMedicineSuggestions();
      }
    }
    afterLoad?.();
  }

  private async loadCachedStoreMedicines(
    search: string,
    updateSmartSuggestions: boolean,
    afterLoad?: () => void,
  ): Promise<void> {
    this.storeMedicines = await this.offline.readCachedValue<ProductCatalogItem[]>(
      this.storeMedicinesCacheKey(search),
      [],
    );
    if (updateSmartSuggestions) {
      this.refreshSmartMedicineSuggestions(search);
    }
    afterLoad?.();
  }

  private async loadCachedPatientContextPrescriptions(patientId: string, error: unknown): Promise<void> {
    const cached = await this.offline.readCachedValue<{ items: Prescription[]; totalPages: number }>(
      this.prescriptionsCacheKey(patientId),
      { items: [], totalPages: 0 },
    );
    await this.applyPatientContextPrescriptions(cached.items, cached.totalPages);
    if (!this.offline.shouldQueue(error) && cached.items.length === 0) {
      this.toastr.error((error as { error?: { message?: string } })?.error?.message || 'Something went wrong');
    }
  }

  private async applyPatientContextPrescriptions(items: Prescription[], totalPages: number): Promise<void> {
    const localPrescriptions = await this.localQueuedPrescriptions();
    this.prescriptions = this.filterPatientContextPrescriptions(
      this.mergePrescriptions([...localPrescriptions, ...items]),
    );
    this.patientHistoryTotalPages = Math.max(1, Math.ceil(this.visiblePatientHistoryPrescriptions().length / this.patientHistoryPageSize));
    this.rebuildPatientHistoryGroups();
    this.loadPatientHistoryRecords();
    this.refreshVitalAnalytics();
    this.refreshLabTestRows();
    this.refreshIvFluidRows();
    this.refreshAdmissionOrderRows();
    this.refreshPatientDocumentRows();
  }

  private rebuildPatientHistoryGroups(): void {
    const groups = new Map<string, Prescription[]>();
    const visibleCount = this.visiblePatientHistoryPrescriptions().length;
    this.patientHistoryTotalPages = Math.max(1, Math.ceil(visibleCount / this.patientHistoryPageSize));

    if (this.patientHistoryPage > this.patientHistoryTotalPages) {
      this.patientHistoryPage = this.patientHistoryTotalPages;
    }

    this.paginatedPatientHistoryPrescriptions().forEach((prescription) => {
      const dateKey = this.prescriptionHistoryDateKey(prescription);
      const bucket = groups.get(dateKey) || [];
      bucket.push(prescription);
      groups.set(dateKey, bucket);
    });

    this.patientHistoryGroups = Array.from(groups.entries()).map(([dateKey, items]) => ({
      dateKey,
      dateLabel: this.formatPatientHistoryDateLabel(dateKey),
      items,
    }));
  }

  private prescriptionHistoryDateKey(prescription: Prescription): string {
    const createdAt = prescription.createdAt ? new Date(prescription.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) {
      return 'unknown';
    }

    return this.dateOnly(createdAt);
  }

  private formatPatientHistoryDateLabel(dateKey: string): string {
    if (dateKey === 'unknown') {
      return 'Unknown Date';
    }

    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return dateKey;
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private defaultPatientHistoryDateFrom(): string {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return this.dateOnly(date);
  }

  private async queuePrescription(payload: Record<string, unknown>, printAfterSave: boolean): Promise<void> {
    this.saving = true;
    const localId = this.offline.buildLocalId('prescription');
    const prescription = this.buildLocalPrescription(localId, payload);

    await this.offline.enqueueWork({
      id: localId,
      entity: 'prescription',
      operation: 'create',
      localId,
      payload,
      meta: { prescription },
    });

    this.prescriptions = this.filterPatientContextPrescriptions(
      this.mergePrescriptions([prescription, ...this.prescriptions]),
    );
    this.editingId = localId;
    this.markAppointmentCompleted(prescription.appointmentId, true);
    this.refreshLabTestRows();
    this.refreshIvFluidRows();
    this.refreshAdmissionOrderRows();
    this.refreshPatientDocumentRows();
    this.saving = false;
    this.toastr.success('Prescription saved offline and queued for sync.');
    if (printAfterSave) {
      this.openPrintPreview(prescription);
    }
  }

  private defaultAdmissionOrders(): Prescription['admissionOrders'] {
    return {
      regularDiet: false,
      npo: false,
      consultation: '',
      monitoring: {
        bp: false,
        pulse: false,
        spo2: false,
        rbs: false,
      },
      notes: '',
    };
  }

  private buildLocalPrescription(localId: string, payload: Record<string, unknown>): Prescription {
    const appointment = this.selectedAppointment();
    const patient = this.selectedPatient();

    return {
      _id: localId,
      hospitalId: String(payload['hospitalId'] || this.currentHospitalId || ''),
      patientId: String(payload['patientId'] || patient?._id || ''),
      patient,
      doctorId: String(payload['doctorId'] || ''),
      doctor: appointment?.doctor || null,
      appointmentId: (payload['appointmentId'] as string | undefined) || null,
      appointment,
      medicines: (payload['medicines'] as Prescription['medicines']) || [],
      chiefComplaint: (payload['chiefComplaint'] as string | undefined) || null,
      history: (payload['history'] as string | undefined) || null,
      examination: (payload['examination'] as string | undefined) || null,
      diagnosis: (payload['diagnosis'] as string | undefined) || null,
      labTests: (payload['labTests'] as Prescription['labTests']) || [],
      ivFluids: (payload['ivFluids'] as Prescription['ivFluids']) || [],
      admissionOrderItems: (payload['admissionOrderItems'] as Prescription['admissionOrderItems']) || [],
      admissionOrders: (payload['admissionOrders'] as Prescription['admissionOrders']) || null,
      patientDocuments: (payload['patientDocuments'] as Prescription['patientDocuments']) || [],
      vitals: (payload['vitals'] as Record<string, string> | undefined) || {},
      specialtySection: (payload['specialtySection'] as string | undefined) || null,
      specialtyData: (payload['specialtyData'] as Record<string, unknown> | undefined) || {},
      advice: (payload['advice'] as string | undefined) || null,
      visitType: (payload['visitType'] as string | undefined) || 'opd',
      followUpDate: (payload['followUpDate'] as string | undefined) || null,
      prescriptionTemplate:
        (payload['prescriptionTemplate'] as PrescriptionTemplate | undefined) || this.getActivePrescriptionTheme(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private async localQueuedAppointments(): Promise<Appointment[]> {
    const entries = await this.offline.getQueuedWork('appointment');
    return entries
      .filter((entry) => entry.operation === 'create')
      .map((entry) => this.appointmentFromQueuedWork(entry));
  }

  private appointmentFromQueuedWork(entry: MooliQueuedWork): Appointment {
    const metaAppointment = entry.meta?.['appointment'] as Appointment | undefined;
    if (metaAppointment) {
      return metaAppointment;
    }

    const payload = entry.payload as Record<string, unknown>;
    const doctor = this.doctors.find((item) => item.userId === payload['doctorId']);
    const patient = (entry.meta?.['patient'] as Patient | null) ||
      this.patients.find((item) => item._id === payload['patientId']) ||
      null;

    return {
      _id: entry.localId || entry.id,
      hospitalId: String(payload['hospitalId'] || this.currentHospitalId || ''),
      appointmentNo: `OFF-${(entry.localId || entry.id).slice(-6).toUpperCase()}`,
      patientId: String(payload['patientId'] || ''),
      patient,
      doctorId: String(payload['doctorId'] || ''),
      doctor: doctor?.user || null,
      departmentId: String(payload['departmentId'] || doctor?.departmentId || ''),
      department: doctor?.department || null,
      appointmentDate: String(payload['appointmentDate'] || new Date().toISOString()),
      startTime: String(payload['startTime'] || ''),
      endTime: String(payload['endTime'] || ''),
      reason: (payload['reason'] as string | undefined) || null,
      status: (payload['status'] as Appointment['status']) || 'confirmed',
      notes: (payload['notes'] as string | undefined) || 'Saved offline',
    };
  }

  private async localQueuedPrescriptions(): Promise<Prescription[]> {
    const entries = await this.offline.getQueuedWork('prescription');
    return entries
      .filter((entry) => entry.operation === 'create')
      .map((entry) => {
        const metaPrescription = entry.meta?.['prescription'] as Prescription | undefined;
        return metaPrescription || this.buildLocalPrescription(entry.localId || entry.id, entry.payload as Record<string, unknown>);
      });
  }

  private patientFromQueuedWork(entry: MooliQueuedWork): Patient {
    const metaPatient = entry.meta?.['patient'] as Patient | undefined;
    if (metaPatient) {
      return metaPatient;
    }

    const payload = entry.payload as Record<string, unknown>;
    return {
      _id: entry.localId || entry.id,
      hospitalId: String(payload['hospitalId'] || this.currentHospitalId || ''),
      patientNo: `OFF-${(entry.localId || entry.id).slice(-6).toUpperCase()}`,
      assignedDoctorId: String(payload['assignedDoctorId'] || ''),
      firstName: String(payload['firstName'] || ''),
      lastName: String(payload['lastName'] || ''),
      email: (payload['email'] as string | undefined) || null,
      phone: (payload['phone'] as string | undefined) || null,
      gender: (payload['gender'] as Patient['gender']) || 'other',
      dateOfBirth: (payload['dateOfBirth'] as string | undefined) || null,
      bloodGroup: (payload['bloodGroup'] as string | undefined) || null,
      address: (payload['address'] as string | undefined) || null,
      emergencyContactName: (payload['emergencyContactName'] as string | undefined) || null,
      emergencyContactPhone: (payload['emergencyContactPhone'] as string | undefined) || null,
      allergies: (payload['allergies'] as string[]) || [],
      chronicDiseases: (payload['chronicDiseases'] as string[]) || [],
      currentMedications: (payload['currentMedications'] as string[]) || [],
      status: 'active',
    };
  }

  private mergePatients(items: Patient[]): Patient[] {
    const map = new Map<string, Patient>();
    items.forEach((item) => {
      if (item?._id) {
        map.set(item._id, item);
      }
    });
    return Array.from(map.values());
  }

  private mergeAppointments(items: Appointment[]): Appointment[] {
    const map = new Map<string, Appointment>();
    items.forEach((item) => {
      if (item?._id) {
        map.set(item._id, item);
      }
    });
    return Array.from(map.values()).sort((first, second) =>
      `${first.appointmentDate} ${first.startTime}`.localeCompare(`${second.appointmentDate} ${second.startTime}`),
    );
  }

  private filterPatientContextPrescriptions(items: Prescription[]): Prescription[] {
    const patientId = this.prescriptionForm.getRawValue().patientId || this.selectedPatientId;
    if (!patientId) {
      return items;
    }

    return items.filter((item) => item.patientId === patientId);
  }

  private mergePrescriptions(items: Prescription[]): Prescription[] {
    const map = new Map<string, Prescription>();
    items.forEach((item) => {
      if (item?._id) {
        map.set(item._id, item);
      }
    });
    return Array.from(map.values()).sort((first, second) =>
      String(second.createdAt || '').localeCompare(String(first.createdAt || '')),
    );
  }

  private patientsCacheKey(): string {
    return this.offline.cacheKey('patients');
  }

  private doctorsCacheKey(): string {
    return this.offline.cacheKey('prescription-doctors');
  }

  private appointmentsCacheKey(): string {
    return this.offline.cacheKey(
      'prescription-appointments',
      this.isDoctorUser() ? this.currentUserId || 'doctor' : 'all',
      this.todayValue(),
    );
  }

  private prescriptionsCacheKey(patientId: string): string {
    return this.offline.cacheKey(
      'prescription-patient-context',
      patientId,
      this.isDoctorUser() ? this.currentUserId || 'doctor' : 'all',
      this.patientHistoryPage,
      this.patientHistoryPageSize,
      'page',
      this.patientHistorySearch.trim() || 'all',
      this.patientHistoryDateFrom || 'from',
      this.patientHistoryDateTo || 'to',
    );
  }

  private doctorMedicinesCacheKey(search = ''): string {
    return this.offline.cacheKey('doctor-medicines', this.activeDoctorId() || 'doctor', search.trim() || 'all');
  }

  private storeMedicinesCacheKey(search = ''): string {
    return this.offline.cacheKey('store-medicine-suggestions', search.trim() || 'all');
  }

  private applyRouteDefaults(): void {
    if (this.editingId) {
      return;
    }

    this.prescriptionForm.patchValue({
      patientId: this.routePatientId,
      doctorId:
        this.routeDoctorId ||
        (this.isDoctorUser() ? this.resolvedDoctorProfileId() || this.currentUserId || '' : ''),
      appointmentId: this.routeAppointmentId,
    });

    if (this.isDoctorUser()) {
      this.prescriptionForm.get('doctorId')?.disable({ emitEvent: false });
    } else {
      this.prescriptionForm.get('doctorId')?.enable({ emitEvent: false });
    }

    this.loadDoctorMedicines();
  }

  private selectInitialAppointment(): void {
    if (this.selectedAppointmentId) {
      const appointment = this.appointments.find((item) => item._id === this.selectedAppointmentId);
      if (appointment && !this.isCancelledAppointment(appointment)) {
        if (this.editingId) {
          this.rememberAppointment(appointment);
          return;
        }

        this.selectAppointment(appointment);
        return;
      }

      if (appointment && this.isCancelledAppointment(appointment)) {
        this.clearCancelledAppointmentSelection();
      }

      if (this.editingId) {
        this.ensureEditAppointmentLoaded(this.selectedAppointmentId);
      }

      return;
    }

    const visibleAppointments = this.visibleAppointments();
    const patientId = String(
      this.routePatientId || this.prescriptionForm.getRawValue().patientId || ''
    ).trim();
    const matchingAppointment = patientId
      ? visibleAppointments.find((appointment) => appointment.patientId === patientId)
      : undefined;

    if (matchingAppointment) {
      this.selectAppointment(matchingAppointment);
      return;
    }

    const firstAppointment = visibleAppointments[0];
    if (firstAppointment && !patientId) {
      this.selectAppointment(firstAppointment);
    }
  }

  private clearCancelledAppointmentSelection(): void {
    this.selectedAppointmentId = '';
    this.prescriptionForm.patchValue({
      appointmentId: '',
      patientId: this.routePatientId || '',
      doctorId: this.isDoctorUser() ? this.currentUserId || '' : this.routeDoctorId || '',
    });
    this.loadPatientContextPrescriptions();
  }

  private isCancelledAppointment(appointment: Appointment): boolean {
    return appointment.status === 'cancelled';
  }

  private isPrescriptionAppointment(appointment: Appointment): boolean {
    return (
      this.isTodayAppointment(appointment) &&
      !this.isCancelledAppointment(appointment) &&
      appointment.status !== 'completed'
    );
  }

  private getTodayAppointmentQueue(): Appointment[] {
    return this.appointments
      .filter(
        (appointment) =>
          this.isTodayAppointment(appointment) && !this.isCancelledAppointment(appointment),
      )
      .sort((first, second) =>
        `${first.startTime || ''}`.localeCompare(`${second.startTime || ''}`),
      );
  }

  private prepareNextAppointment(appointment: Appointment): void {
    this.editingId = null;
    this.prescriptionForm.reset({
      visitType: 'opd',
      specialtySection: '',
      specialtyData: this.createSpecialtyDataGroup().getRawValue(),
      admissionOrders: this.defaultAdmissionOrders(),
    });
    this.customVitals.clear();
    this.medicines.clear();
    this.addMedicine();
    this.labTests.clear();
    this.labTestCatalog.forEach((test) => this.labTests.push(this.createLabTestGroup(test)));
    this.ivFluids.clear();
    this.ivFluids.push(this.createIvFluidGroup());
    this.admissionOrderItems.clear();
    this.patientDocuments.clear();

    if (this.isDoctorUser()) {
      this.prescriptionForm.get('doctorId')?.disable({ emitEvent: false });
    } else {
      this.prescriptionForm.get('doctorId')?.enable({ emitEvent: false });
    }

    this.selectAppointment(appointment);
  }

  private selectNextAppointmentAfterComplete(completedAppointmentId: string): void {
    const queue = this.getTodayAppointmentQueue();
    const completedIndex = queue.findIndex((appointment) => appointment._id === completedAppointmentId);
    const nextAppointment =
      queue
        .slice(completedIndex + 1)
        .find((appointment) => appointment.status !== 'completed') ||
      queue.find(
        (appointment) =>
          appointment._id !== completedAppointmentId && appointment.status !== 'completed',
      );

    if (!nextAppointment) {
      this.clearCompletedAppointmentSelection();
      return;
    }

    this.prepareNextAppointment(nextAppointment);
  }

  private clearCompletedAppointmentSelection(): void {
    this.selectedAppointmentId = '';
    this.selectedPatientId = this.routePatientId || '';
    this.editingId = null;
    this.prescriptionForm.patchValue({
      appointmentId: '',
      patientId: this.routePatientId || '',
      doctorId: this.isDoctorUser() ? this.currentUserId || '' : this.routeDoctorId || '',
    });
    this.loadPatientContextPrescriptions();
    this.toastr.info('All appointments for today are completed.');
  }

  private isTodayAppointment(appointment: Appointment): boolean {
    return toCalendarYmd(appointment.appointmentDate) === todayYmd();
  }

  private dateOnly(value: string | Date): string {
    return toCalendarYmd(value);
  }

  private todayValue(): string {
    return todayYmd();
  }

  private isDoctorUser(): boolean {
    return this.currentRole.trim().replace(/[\s_-]/g, '').toLowerCase() === 'doctor';
  }

  private activeDoctorId(): string {
    return String(
      this.prescriptionForm.getRawValue().doctorId ||
      this.resolvedDoctorProfileId() ||
      (this.isDoctorUser() ? this.currentUserId : '') ||
      ''
    ).trim();
  }

  private resolvedDoctorProfileId(): string {
    if (!this.isDoctorUser()) {
      return String(this.prescriptionForm.getRawValue().doctorId || '').trim();
    }

    const formDoctorId = String(this.prescriptionForm.getRawValue().doctorId || '').trim();
    if (formDoctorId && this.doctors.some((doctor) => doctor._id === formDoctorId)) {
      return formDoctorId;
    }

    const matched = this.doctors.find((doctor) => String(doctor.userId || '') === String(this.currentUserId || ''));
    return String(matched?._id || formDoctorId || '').trim();
  }

  private syncDoctorProfileRouteDefaults(): void {
    if (!this.isDoctorUser()) {
      return;
    }

    const profileId = this.resolvedDoctorProfileId();
    if (!profileId) {
      return;
    }

    this.prescriptionForm.patchValue({ doctorId: profileId }, { emitEvent: false });
    if (this.routeAppointmentId || this.routePatientId) {
      this.loadAppointments();
    }
  }

  private mergeDoctorMedicines(items: DoctorMedicine[]): DoctorMedicine[] {
    const map = new Map<string, DoctorMedicine>();
    [...this.doctorMedicines, ...items].forEach((medicine) => {
      if (medicine?._id) {
        map.set(medicine._id, medicine);
      }
    });

    return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  private extractMedicineQuery(value: string): string {
    return stripFrequencyPatterns(
      value
        .trim()
        .split(/\s+/)
        .filter((token) => {
          const lower = token.toLowerCase();
          return (
            !detectFrequencyKey(token) &&
            !this.mapFrequencyToTimings(lower).label &&
            !['pc', 'ac', 'continue'].includes(lower) &&
            !this.formatDuration(lower) &&
            !/^\d+(\.\d+)?\s*(mg|ml|g|iu)?$/i.test(token)
          );
        })
        .join(' ')
    );
  }

  private applyMedicineInstructionAssistant(
    index: number,
    options: { resetSlotsWhenNoSchedule?: boolean } = {}
  ): void {
    const group = this.medicines.at(index);
    if (!group) {
      return;
    }

    const raw = group.getRawValue() as Record<string, unknown>;
    const frequencyKey = detectFrequencyKey(String(raw['frequency'] || ''));
    const schedule = frequencyKey ? getFrequencySchedule(frequencyKey) : null;
    const patch: Record<string, unknown> = {};

    if (schedule) {
      patch['frequency'] = schedule.label;
      patch['morning'] = schedule.slots.morning;
      patch['noon'] = schedule.slots.noon;
      patch['evening'] = schedule.slots.evening;
      patch['night'] = schedule.slots.night;

      const defaultDose = String(raw['dosage'] || '').trim() || '1';
      (['morning', 'noon', 'evening', 'night'] as DoseSlot[]).forEach((slot) => {
        if (schedule.slots[slot] && !String(raw[`${slot}Dose`] || '').trim()) {
          patch[`${slot}Dose`] = defaultDose;
        }
      });
    } else if (options.resetSlotsWhenNoSchedule) {
      patch['morning'] = false;
      patch['noon'] = false;
      patch['evening'] = false;
      patch['night'] = false;
      patch['morningDose'] = '';
      patch['noonDose'] = '';
      patch['eveningDose'] = '';
      patch['nightDose'] = '';
      patch['instructions'] = '';
    }

    const nextValue = { ...raw, ...patch };
    const formatted = buildMedicineInstructions({
      dosage: String(nextValue['dosage'] || '').trim(),
      frequency: String(nextValue['frequency'] || '').trim(),
      morning: Boolean(nextValue['morning']),
      noon: Boolean(nextValue['noon']),
      evening: Boolean(nextValue['evening']),
      night: Boolean(nextValue['night']),
      morningDose: String(nextValue['morningDose'] || '').trim(),
      noonDose: String(nextValue['noonDose'] || '').trim(),
      eveningDose: String(nextValue['eveningDose'] || '').trim(),
      nightDose: String(nextValue['nightDose'] || '').trim(),
      beforeMeal: Boolean(nextValue['beforeMeal']),
      afterMeal: Boolean(nextValue['afterMeal']),
    });

    if (formatted) {
      patch['instructions'] = formatted.combined;
    }

    if (Object.keys(patch).length) {
      group.patchValue(patch, { emitEvent: false });
    }
  }

  private refreshSmartMedicinePreview(): void {
    const command = this.smartMedicineInput.trim();
    if (!command || !containsFrequencyPattern(command)) {
      this.smartMedicinePreview = null;
      return;
    }

    const parsed = this.parseMedicineCommand(command);
    const formatted = buildMedicineInstructions({
      dosage: parsed.dose || parsed.morningDose || '1 tablet',
      frequency: parsed.frequency,
      morning: parsed.morning,
      noon: parsed.noon,
      evening: parsed.evening,
      night: parsed.night,
      morningDose: parsed.morningDose,
      noonDose: parsed.noonDose,
      eveningDose: parsed.eveningDose,
      nightDose: parsed.nightDose,
      beforeMeal: parsed.beforeMeal,
      afterMeal: parsed.afterMeal,
    });

    if (!formatted) {
      this.smartMedicinePreview = null;
      return;
    }

    this.smartMedicinePreview = `${parsed.medicineName}\n${formatted.combined}`;
  }

  private findDoctorMedicineMatch(query: string): DoctorMedicine | undefined {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return undefined;
    }

    const matches = this.searchMedicineLibrary(normalizedQuery);
    return (
      matches.find((medicine) =>
        [medicine.name, this.doctorMedicineDisplayName(medicine)]
          .filter(Boolean)
          .some((value) => value.trim().toLowerCase() === normalizedQuery)
      ) || matches[0]
    );
  }

  private searchMedicineLibrary(query: string): DoctorMedicine[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return this.doctorMedicines.filter((medicine) => {
      const searchText = [medicine.name, medicine.type, this.doctorMedicineDisplayName(medicine)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }

  private searchStoreMedicines(query: string): ProductCatalogItem[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return this.storeMedicines.filter((medicine) => {
      const searchText = [
        medicine.name,
        medicine.unit,
        medicine.brand,
        medicine.sku,
        medicine.barcode,
        medicine.strengthValue,
        medicine.strengthUnit,
        this.storeMedicineDisplayName(medicine),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }

  private storeMedicineStrength(medicine: Pick<ProductCatalogItem, 'strengthValue' | 'strengthUnit'>): string {
    const value = String(medicine.strengthValue || '').trim();
    const unit = String(medicine.strengthUnit || '').trim();

    return [value, unit].filter(Boolean).join(' ');
  }

  private defaultStoreMedicineDose(medicine: ProductCatalogItem): string {
    const unit = String(medicine.unit || '').trim();
    const strength = this.storeMedicineStrength(medicine);

    return [unit ? `1 ${unit}` : '', strength ? `(${strength})` : ''].filter(Boolean).join(' ');
  }

  private normalizeMedicineSuggestionKey(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private appendMedicineRow(row: Record<string, unknown>): void {
    const firstEmptyIndex = this.medicines.controls.findIndex(
      (control) => !String(control.get('name')?.value || '').trim()
    );

    if (firstEmptyIndex >= 0) {
      this.medicines.at(firstEmptyIndex).patchValue(row);
      return;
    }

    this.medicines.push(this.createMedicineGroup(row));
  }

  private normalizeMedicinesForSave(rawMedicines: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return rawMedicines
      .filter((medicine) => String(medicine['name'] || '').trim())
      .map((medicine) => {
        const normalized = { ...medicine };

        (['morning', 'noon', 'evening', 'night'] as DoseSlot[]).forEach((slot) => {
          const doseKey = `${slot}Dose`;
          const dose = String(normalized[doseKey] || '').trim();

          normalized[doseKey] = dose;
          normalized[slot] = Boolean(normalized[slot]) || Boolean(dose);
        });

        return normalized;
      });
  }

  private resetSmartMedicineInput(): void {
    this.smartMedicineInput = '';
    this.smartMedicinePreview = null;
    this.clearSmartMedicineSuggestions();
    this.focusSmartMedicineInput();
  }

  private focusSmartMedicineInput(): void {
    setTimeout(() => this.smartMedicineInputRef?.nativeElement.focus());
  }

  private clearSmartMedicineSuggestions(): void {
    this.smartMedicineSuggestions = [];
    this.activeMedicineSuggestionIndex = -1;
  }

  private moveMedicineSuggestion(direction: 1 | -1): void {
    if (!this.smartMedicineSuggestions.length) {
      return;
    }

    const nextIndex = this.activeMedicineSuggestionIndex + direction;
    this.activeMedicineSuggestionIndex =
      (nextIndex + this.smartMedicineSuggestions.length) % this.smartMedicineSuggestions.length;
  }

  private hasSmartMedicineCommand(value: string): boolean {
    if (containsFrequencyPattern(value)) {
      return true;
    }

    return value
      .trim()
      .split(/\s+/)
      .some((token) => {
        const lower = token.toLowerCase();
        return (
          Boolean(this.mapFrequencyToTimings(lower).label) ||
          ['pc', 'ac', 'continue'].includes(lower) ||
          Boolean(this.formatDuration(lower)) ||
          /^\d+(\.\d+)?\s*(mg|ml|g|iu)?$/i.test(token)
        );
      });
  }

  private resolveMedicineDose(medicine: DoctorMedicine | undefined, strengthToken: string): string {
    const strength = this.formatStrength(strengthToken);
    if (!medicine) {
      return strength;
    }

    const type = String(medicine.type || '').trim();
    return [type ? `1 ${type}` : '', strength ? `(${strength})` : ''].filter(Boolean).join(' ');
  }

  private defaultSlotDose(medicine: Pick<DoctorMedicine, 'type'> | undefined): string {
    const type = String(medicine?.type || '').trim();
    return type ? `1 ${type}` : '';
  }

  private formatStrength(value: string): string {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return '';
    }

    if (/^\d+(\.\d+)?$/i.test(trimmedValue)) {
      return `${trimmedValue}mg`;
    }

    return trimmedValue;
  }

  private toTitleCase(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
      .join(' ');
  }

  private upsertDoctorMedicine(medicine: DoctorMedicine): void {
    const index = this.doctorMedicines.findIndex((item) => item._id === medicine._id);
    if (index >= 0) {
      this.doctorMedicines[index] = medicine;
      this.doctorMedicines = [...this.doctorMedicines];
      return;
    }

    this.doctorMedicines = [...this.doctorMedicines, medicine].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }

  private useDoctorMedicine(medicine: DoctorMedicine, rowIndex = this.selectedMedicineRowIndex): void {
    let targetIndex = rowIndex;

    if (targetIndex === null) {
      targetIndex = this.medicines.controls.findIndex((control) => {
        const value = String(control.get('name')?.value || '').trim();
        return !value;
      });
    }

    if (targetIndex === null || targetIndex < 0) {
      this.addMedicine();
      targetIndex = this.medicines.length - 1;
    }

    const control = this.medicines.at(targetIndex);
    const current = control.getRawValue() as Record<string, unknown>;
    const defaultDose = this.defaultSlotDose(medicine);

    control.patchValue({
      name: this.doctorMedicineDisplayName(medicine),
      type: medicine.type || current['type'] || '',
      morningDose: current['morning'] && !current['morningDose'] ? defaultDose : current['morningDose'],
      noonDose: current['noon'] && !current['noonDose'] ? defaultDose : current['noonDose'],
      eveningDose: current['evening'] && !current['eveningDose'] ? defaultDose : current['eveningDose'],
      nightDose: current['night'] && !current['nightDose'] ? defaultDose : current['nightDose'],
    });
  }

  private useStoreMedicine(medicine: ProductCatalogItem, rowIndex = this.selectedMedicineRowIndex): void {
    let targetIndex = rowIndex;

    if (targetIndex === null) {
      targetIndex = this.medicines.controls.findIndex((control) => {
        const value = String(control.get('name')?.value || '').trim();
        return !value;
      });
    }

    if (targetIndex === null || targetIndex < 0) {
      this.addMedicine();
      targetIndex = this.medicines.length - 1;
    }

    const control = this.medicines.at(targetIndex);
    const current = control.getRawValue() as Record<string, unknown>;
    const defaultDose = this.defaultStoreMedicineDose(medicine);

    control.patchValue({
      name: this.storeMedicineDisplayName(medicine),
      dosage: current['dosage'] || defaultDose,
      morningDose: current['morning'] && !current['morningDose'] ? defaultDose : current['morningDose'],
      noonDose: current['noon'] && !current['noonDose'] ? defaultDose : current['noonDose'],
      eveningDose: current['evening'] && !current['eveningDose'] ? defaultDose : current['eveningDose'],
      nightDose: current['night'] && !current['nightDose'] ? defaultDose : current['nightDose'],
    });
  }

  private parseMedicineTypeAndName(value: string): { name: string; type: string } {
    const trimmedValue = value.trim();
    const savedMedicine = this.doctorMedicines.find((medicine) => {
      const displayName = this.doctorMedicineDisplayName(medicine).toLowerCase();
      const medicineName = String(medicine.name || '').trim().toLowerCase();
      const normalizedValue = trimmedValue.toLowerCase();
      return displayName === normalizedValue || medicineName === normalizedValue;
    });

    if (savedMedicine) {
      return {
        name: savedMedicine.name,
        type: savedMedicine.type || '',
      };
    }

    return {
      name: trimmedValue,
      type: '',
    };
  }

  private markAppointmentCompleted(appointmentId?: string | null, advanceToNext = false): void {
    if (!appointmentId) {
      return;
    }

    this.appointments = this.appointments.map((appointment) =>
      appointment._id === appointmentId
        ? {
          ...appointment,
          status: 'completed',
        }
        : appointment
    );

    if (advanceToNext) {
      this.selectNextAppointmentAfterComplete(appointmentId);
    }
  }

  private initializePrescriptionTheme(): void {
    if (!this.canCreatePrescriptions || this.editingId || this.themeModalInitialized) {
      return;
    }

    const prescriptionId = this.route.snapshot.queryParamMap.get('prescriptionId');
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (prescriptionId && mode) {
      return;
    }

    if (!this.prescriptionThemeTouched) {
      const storedTheme = this.readStoredDraftPrescriptionTheme();
      this.selectedPrescriptionTemplate = storedTheme || this.resolveDefaultPrescriptionTemplate();
      this.draftPrescriptionTemplate = this.selectedPrescriptionTemplate;
      this.persistDraftPrescriptionTheme();
    }

    this.prescriptionThemeConfirmed = true;
    this.themeModalInitialized = true;
  }

  private getActivePrescriptionTheme(): PrescriptionTemplate {
    return this.draftPrescriptionTemplate || this.selectedPrescriptionTemplate || 'classic';
  }

  private persistDraftPrescriptionTheme(): void {
    try {
      sessionStorage.setItem(this.prescriptionThemeStorageKey(), this.getActivePrescriptionTheme());
    } catch {
      // Ignore storage failures in private mode or restricted contexts.
    }
  }

  private readStoredDraftPrescriptionTheme(): PrescriptionTemplate | null {
    try {
      const stored = sessionStorage.getItem(this.prescriptionThemeStorageKey());
      if (stored && this.prescriptionTemplates.some((template) => template.id === stored)) {
        return stored as PrescriptionTemplate;
      }
    } catch {
      return null;
    }

    return null;
  }

  private prescriptionThemeStorageKey(): string {
    return `prescription-theme:${this.currentHospitalId || 'default'}:${this.currentUserId || 'user'}`;
  }

  private readPrescriptionTemplateParam(value: string | null): PrescriptionTemplate | null {
    return this.isPrescriptionTemplate(value) ? value : null;
  }

  private isPrescriptionTemplate(value: unknown): value is PrescriptionTemplate {
    return this.prescriptionTemplates.some((template) => template.id === value);
  }

  private openPrintPreviewWithFreshData(prescription: Prescription): void {
    if (!prescription?._id || prescription._id.startsWith('local-') || !this.canReadPrescriptions) {
      this.openPrintPreview(prescription);
      return;
    }

    this.printPreviewLoading = true;
    this.printPreviewOpen = true;
    this.backend.getPrescription(prescription._id).subscribe({
      next: (freshPrescription) => {
        this.openPrintPreview(freshPrescription);
      },
      error: (err) => {
        this.printPreviewOpen = false;
        this.printPreviewLoading = false;
        this.toastr.error(err?.error?.message || 'Unable to load prescription preview.');
      },
    });
  }

  private enrichPrescriptionTemplate(
    prescription: Prescription | null | undefined,
    options: { fallbackTemplate?: PrescriptionTemplate; allowFallback?: boolean } = {},
  ): Prescription | null {
    if (!prescription) {
      return null;
    }

    if (prescription.prescriptionTemplate) {
      return prescription;
    }

    const allowFallback = options.allowFallback ?? prescription._id === this.editingId;
    const template = options.fallbackTemplate || this.getActivePrescriptionTheme();
    if (!allowFallback || !template) {
      return prescription;
    }

    return {
      ...prescription,
      prescriptionTemplate: template,
    };
  }

  private resolveDefaultPrescriptionTemplate(): PrescriptionTemplate {
    const doctor = this.resolvePrescriptionDoctor({ doctorId: this.activeDoctorId() });
    const template = doctor?.prescriptionTemplate || 'classic';

    if (this.isGynaeDoctor()) {
      if (['gynae-clinical', 'gynae-womens-health', 'gynae-modern', 'clinical-blue'].includes(template)) {
        return template;
      }

      return 'gynae-womens-health';
    }

    if (['gynae-clinical', 'gynae-womens-health', 'gynae-modern'].includes(template)) {
      return 'clinical-blue';
    }

    return template;
  }

  private applyDoctorPrescriptionTheme(): void {
    const template = this.resolveDefaultPrescriptionTemplate();
    this.selectedPrescriptionTemplate = template;
    this.draftPrescriptionTemplate = template;
    this.persistDraftPrescriptionTheme();
  }

  private resolvePrescriptionSourceId(
    source?: Prescription | Record<string, unknown> | null,
  ): string {
    if (!source || !('_id' in source)) {
      return '';
    }

    return String(source['_id'] || '').trim();
  }

  private resolvePrescriptionDoctorIds(
    source?: Prescription | Record<string, unknown> | null,
  ): string[] {
    const doctorRecord = source?.['doctor'] as { _id?: string } | null | undefined;
    const doctorId = source?.['doctorId'];

    return [
      typeof doctorId === 'object' && doctorId && '_id' in doctorId
        ? String((doctorId as { _id?: string })._id || '')
        : String(doctorId || ''),
      doctorRecord?._id,
      this.activeDoctorId(),
      this.isDoctorUser() ? this.currentUserId : null,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  private resolvePrescriptionDoctor(
    source?: Prescription | Record<string, unknown> | null,
  ): Doctor | null {
    const ids = this.resolvePrescriptionDoctorIds(source);
    if (ids.length === 0) {
      return null;
    }

    return (
      this.doctors.find((doctor) => {
        const doctorProfileId = String(doctor._id || '').trim();
        const doctorUserId = String(doctor.userId || '').trim();
        return ids.includes(doctorProfileId) || ids.includes(doctorUserId);
      }) || null
    );
  }

  private resolvePrescriptionTemplate(
    source?: Prescription | Record<string, unknown> | null,
    doctor?: Doctor | null,
  ): PrescriptionTemplate {
    const savedTemplate = source?.['prescriptionTemplate'] as PrescriptionTemplate | undefined | null;
    const sourceId = this.resolvePrescriptionSourceId(source);
    const isSavedPrescription = Boolean(sourceId) && !sourceId.startsWith('local-');
    const isEditingCurrentPrescription = isSavedPrescription && sourceId === this.editingId;
    const resolvedDoctor = doctor || this.resolvePrescriptionDoctor(source);
    const doctorTemplate = resolvedDoctor?.prescriptionTemplate;
    const activeTheme = this.getActivePrescriptionTheme();

    if (!isSavedPrescription || isEditingCurrentPrescription) {
      if (this.isPrescriptionTemplate(activeTheme)) {
        return normalizeGynaePrescriptionTemplate(
          activeTheme,
          String(source?.['specialtySection'] || '') as SpecialtyTemplateKey | ''
        );
      }
    }

    if (isSavedPrescription) {
      if (this.isPrescriptionTemplate(savedTemplate)) {
        return normalizeGynaePrescriptionTemplate(
          savedTemplate,
          String(source?.['specialtySection'] || '') as SpecialtyTemplateKey | ''
        );
      }

      if (this.isPrescriptionTemplate(doctorTemplate) && doctorTemplate !== 'classic') {
        return normalizeGynaePrescriptionTemplate(
          doctorTemplate,
          String(source?.['specialtySection'] || '') as SpecialtyTemplateKey | ''
        );
      }

      if (this.isPrescriptionTemplate(this.routePrescriptionTemplate)) {
        return normalizeGynaePrescriptionTemplate(
          this.routePrescriptionTemplate,
          String(source?.['specialtySection'] || '') as SpecialtyTemplateKey | ''
        );
      }

      return normalizeGynaePrescriptionTemplate(
        'classic',
        String(source?.['specialtySection'] || '') as SpecialtyTemplateKey | ''
      );
    }

    if (this.isPrescriptionTemplate(doctorTemplate)) {
      return normalizeGynaePrescriptionTemplate(
        doctorTemplate,
        String(source?.['specialtySection'] || '') as SpecialtyTemplateKey | ''
      );
    }

    if (this.isPrescriptionTemplate(savedTemplate)) {
      return normalizeGynaePrescriptionTemplate(
        savedTemplate,
        String(source?.['specialtySection'] || '') as SpecialtyTemplateKey | ''
      );
    }

    return normalizeGynaePrescriptionTemplate(
      'classic',
      String(source?.['specialtySection'] || '') as SpecialtyTemplateKey | ''
    );
  }

  private buildPrintPreviewData(prescription: Prescription | null = null): PrintPreviewData | null {
    const source: Record<string, any> = prescription || this.prescriptionForm.getRawValue();
    const patient = this.resolvePrintPatient(source);

    if (!patient) {
      return null;
    }

    const doctor = this.resolvePrescriptionDoctor(source);
    const hospital = this.resolvePrintHospital(source);
    const settings = this.resolvePrescriptionSettings(hospital);
    const doctorDisplayName =
      source['doctor']?.name || (doctor ? this.doctorName(doctor) : this.selectedDoctorName());
    const doctorQualification =
      doctor?.qualification ||
      (doctor?.specialization && !/consultant|physician/i.test(doctor.specialization)
        ? doctor.specialization
        : 'M.B.B.S., F.C.P.S.');
    const hospitalName = hospital?.name || 'MediLink City Care Hospital';
    const hospitalAddress = this.hospitalAddressLine(hospital);
    const hospitalLogoUrl = this.safeHospitalLogoUrl(hospital?.logoUrl);
    const createdAt = source['createdAt'] || new Date();
    const followUpDate = source['followUpDate'];
    const vitals = this.safeStringRecord(source['vitals']);
    const labTests = this.dedupePrintLabTests(
      this.safeArray(source['labTests'])
        .map((test) => this.normalizePrintLabTest(test))
        .filter((test): test is { name: string; category: string; selected?: boolean } =>
          Boolean(test?.name) && Boolean(prescription || test?.selected)
        )
        .slice(0, 80)
        .map((test) => ({
          name: test.name,
          category: test.category,
        }))
    );
    const medicines = this.safeArray(source['medicines'])
      .map((medicine) => this.normalizePrintMedicine(medicine))
      .filter((medicine): medicine is Record<string, unknown> => Boolean(medicine))
      .slice(0, 80);
    const ivFluids = this.safeArray(source['ivFluids'])
      .map((fluid) => {
        const record = fluid as Record<string, unknown>;
        const name = String(record['name'] || '').trim();
        if (!name) {
          return null;
        }

        return {
          name,
          rate: String(record['rate'] || '').trim() || '—',
          quantity: String(record['duration'] || '').trim() || '—',
          route: String(record['route'] || 'IV').trim() || 'IV',
        };
      })
      .filter((fluid): fluid is { name: string; rate: string; quantity: string; route: string } => Boolean(fluid))
      .slice(0, 20);
    const specialtyTemplate = resolvePrintSpecialtyTemplate(source, doctor);
    const specialtyRows = resolvePrintSpecialtyRows(source, specialtyTemplate);
    const consultationRows = resolvePrescriptionConsultationPrintRows(source);
    const specialtyData = (source['specialtyData'] || {}) as Record<string, unknown>;
    const isGynaePrint = specialtyTemplate.key === 'gynae';
    const gynaeMode = normalizeGynaeConsultMode(specialtyData['gynaeMode']);
    const gynaeSplit = isGynaePrint ? splitGynaePrintRows(specialtyRows, gynaeMode) : { sidebar: [], extended: [] };
    const gynaeConsultationRows = isGynaePrint ? resolveGynaeConsultationStripRows(source) : [];
    const gynaeSummaryRows = isGynaePrint
      ? gynaeSplit.sidebar.map((row) => ({ label: row.label, value: row.value }))
      : [];
    const ultrasoundRows = GYNAE_ULTRASOUND_STUDIES.filter(
      (study) => String(specialtyData[study.key] || '').trim() === 'Yes'
    ).map((study) => ({
      label: study.label,
      value: String(specialtyData['ultrasoundNotes'] || '').trim() || 'Ordered',
    }));

    return {
      template: this.resolvePrescriptionTemplate(source, doctor),
      patient,
      patientName: this.patientName(patient),
      patientAge: this.ageLabel(patient),
      patientGender: this.genderShort(patient),
      patientNo: patient.patientNo || '-',
      patientAddress: formatEnglishAddress(patient.address) || '-',
      patientPhone: patient.phone || '-',
      doctorName: formatEnglishDoctorName(doctorDisplayName),
      doctorNamePlain: stripDoctorPrefix(doctorDisplayName),
      doctorNameUrdu: formatUrduDoctorName(doctorDisplayName, doctor?.nameUrdu),
      doctorQualification,
      doctorQualificationUrdu: formatUrduQualification(doctorQualification),
      doctorTitleEnglish: formatEnglishDoctorTitle(),
      doctorTitleUrdu: formatUrduDoctorTitle(),
      hospitalName: formatEnglishOrganizationName(hospitalName) || hospitalName,
      hospitalNameUrdu:
        formatUrduOrganizationName(hospitalName, hospital?.nameUrdu) ||
        transliterateLatinToUrdu(hospitalName),
      hospitalAddress: formatEnglishAddress(hospitalAddress),
      hospitalAddressUrdu: formatUrduAddress(hospitalAddress) || formatEnglishAddress(hospitalAddress),
      hospitalLogoUrl,
      showHospitalLogo: settings.showLogo !== false && Boolean(hospitalLogoUrl),
      hospitalLogoScale: settings.logoScale,
      prescriptionRevisionNote: settings.revisionNote || '* Rx to be revised after Reports.',
      prescriptionFollowUpLine:
        settings.followUpLine || `For appointment and follow up, contact ${hospitalName}.`,
      prescriptionFooterLines: this.prescriptionFooterLines(hospital, settings),
      prescriptionNo: this.formatPrescriptionNumber(source['_id']),
      date: this.formatPrintDate(createdAt),
      disease: source['diagnosis'] || source['chiefComplaint'] || source['history'] || '-',
      vitals,
      vitalRows: this.vitalEntries(vitals),
      labTests,
      ivFluids,
      medicines,
      specialtyTitle: specialtyTemplate.title,
      specialtySection: specialtyTemplate.key,
      specialtyRows: isGynaePrint ? gynaeSplit.sidebar : specialtyRows,
      consultationRows,
      gynaeConsultationRows,
      gynaeSidebarRows: gynaeSplit.sidebar,
      gynaeExtendedRows: gynaeSplit.extended,
      gynaeSummaryRows,
      ultrasoundRows,
      followUpDate: followUpDate ? this.shortDate(followUpDate) : '-',
      patientNote: isGynaePrint
        ? resolveGynaePatientNote(source, specialtyData)
        : String(source['advice'] || '').trim(),
      consultation: String(source['admissionOrders']?.consultation || '').trim(),
      admissionOrderLines: this.resolvePrintAdmissionOrderLines(source),
      gynaeMode,
      patientBloodGroup: patient.bloodGroup || '-',
      clinicalPages: buildClinicalRxPrintPages({
        medicines,
        specialtySection: specialtyTemplate.key,
        prescriptionTemplate: this.resolvePrescriptionTemplate(source, doctor),
        gynaeConsultationRows,
        gynaeSidebarRows: gynaeSplit.sidebar,
        gynaeExtendedRows: gynaeSplit.extended,
        ivFluids,
        labTests,
        patientNote: isGynaePrint
          ? resolveGynaePatientNote(source, specialtyData)
          : String(source['advice'] || '').trim(),
      }),
    };
  }

  private resolvePrintAdmissionOrderLines(source: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const consultation = String((source['admissionOrders'] as Record<string, unknown> | undefined)?.['consultation'] || '').trim();

    this.safeArray(source['admissionOrderItems']).forEach((item) => {
      const order = String((item as Record<string, unknown>)['order'] || '').trim();
      if (order && !lines.includes(order)) {
        lines.push(order);
      }
    });

    const legacy = source['admissionOrders'] as Prescription['admissionOrders'];
    if (legacy) {
      legacyAdmissionOrdersToItems(legacy).forEach((item) => {
        const order = String(item.order || '').trim();
        if (order && order !== consultation && !lines.includes(order)) {
          lines.push(order);
        }
      });
    }

    return lines.slice(0, 12);
  }

  getAdmissionDrawerDoctor(): Doctor | null {
    const doctorId = String(this.resolvedDoctorProfileId() || this.prescriptionForm.getRawValue().doctorId || '').trim();
    if (doctorId) {
      const resolved =
        this.doctors.find((doctor) => doctor._id === doctorId) ||
        this.resolvePrescriptionDoctor({ doctorId }) ||
        null;
      if (resolved) {
        return resolved;
      }

      const doctorName = this.selectedDoctorName() !== '-' ? this.selectedDoctorName() : 'Doctor';
      const cacheKey = `${doctorId}|${doctorName}`;
      if (this.admissionDoctorStubCache?.key === cacheKey) {
        return this.admissionDoctorStubCache.value;
      }
      const value = {
        _id: doctorId,
        user: { name: doctorName },
      } as Doctor;
      this.admissionDoctorStubCache = { key: cacheKey, value };
      return value;
    }

    const resolved =
      this.resolvePreviewDoctorProfile() ||
      this.resolvePrescriptionDoctor({ doctorId: this.selectedAppointment()?.doctorId }) ||
      null;

    if (resolved) {
      return resolved;
    }

    if (this.isDoctorUser() && this.currentUserId) {
      return (
        this.doctors.find((doctor) => String(doctor.userId || '') === String(this.currentUserId)) || null
      );
    }

    return null;
  }

  private resolvePreviewDoctorProfile(): Doctor | null {
    return (
      this.resolvePrescriptionDoctor(this.previewPrescription) ||
      this.resolvePrescriptionDoctor(this.prescriptionForm.getRawValue()) ||
      null
    );
  }

  private formatPrescriptionNumber(value: unknown): string {
    const rawValue = String(value || '').trim();

    if (!rawValue) {
      return 'DRAFT';
    }

    const compactValue = rawValue.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `RX-${compactValue.slice(-6).padStart(6, '0')}`;
  }

  private safeArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim() ? [value] : [];
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    const record = value as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(record, 'name')
      ? [record]
      : Object.values(record).filter((entry) => entry !== null && entry !== undefined);
  }

  private safeStringRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.entries(value as Record<string, unknown>).reduce((record, [key, entryValue]) => {
      const safeKey = String(key || '').trim();
      if (!safeKey) {
        return record;
      }

      record[safeKey] = String(entryValue ?? '').trim();
      return record;
    }, {} as Record<string, string>);
  }

  private normalizePrintLabTest(test: unknown): { name: string; category: string; selected?: boolean } | null {
    if (typeof test === 'string') {
      const name = test.trim();
      return name ? { name, category: '', selected: true } : null;
    }

    if (!test || typeof test !== 'object' || Array.isArray(test)) {
      return null;
    }

    const record = test as Record<string, unknown>;
    const name = String(record['name'] ?? '').trim();

    if (!name) {
      return null;
    }

    return {
      name,
      category: String(record['category'] ?? '').trim(),
      selected: record['selected'] === undefined ? true : this.toBoolean(record['selected']),
    };
  }

  private dedupePrintLabTests(
    tests: Array<{ name: string; category: string }>
  ): Array<{ name: string; category: string }> {
    const seen = new Set<string>();

    return tests.filter((test) => {
      const key = test.name.trim().toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private normalizePrintMedicine(medicine: unknown): Record<string, unknown> | null {
    if (typeof medicine === 'string') {
      const name = medicine.trim();
      return name ? { name } : null;
    }

    if (!medicine || typeof medicine !== 'object' || Array.isArray(medicine)) {
      return null;
    }

    const record = medicine as Record<string, unknown>;
    const name = String(record['name'] || '').trim();
    if (!name) {
      return null;
    }

    return record;
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private safeHospitalLogoUrl(value: unknown): string {
    const logoUrl = String(value || '').trim();
    if (!logoUrl) {
      return '';
    }

    return resolveAssetUrl(logoUrl.startsWith('data:image/') && logoUrl.length > 1000000 ? '' : logoUrl);
  }

  vitalEntries(vitals: Record<string, string> | null | undefined): Array<{ label: string; value: string }> {
    const source = vitals || {};
    const orderedDefaultEntries = ['bp', 'weight', 'pulse', 'temperature', 'spo2']
      .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
      .map((key) => ({
        label: this.defaultVitalLabels[key] || key,
        value: String(source[key] || '').trim() || '-',
      }));

    const customEntries = Object.entries(source)
      .filter(([key]) => !this.defaultVitalKeys.has(key))
      .map(([key, value]) => ({
        label: this.formatVitalLabel(key),
        value: String(value || '').trim() || '-',
      }));

    return [...orderedDefaultEntries, ...customEntries];
  }

  private resolvePrintPatient(source: Record<string, any>): Patient | null {
    const patientId = String(source['patientId'] || '');
    const patient =
      this.patients.find((item) => item._id === patientId) ||
      source['patient'] ||
      this.selectedPatient() ||
      this.selectedAppointment()?.patient ||
      null;

    if (patient) {
      return patient as Patient;
    }

    if (!patientId) {
      return null;
    }

    return {
      _id: patientId,
      hospitalId: String(source['hospitalId'] || ''),
      patientNo: '-',
      assignedDoctorId: '',
      firstName: 'Patient',
      lastName: '',
      phone: null,
      gender: 'other',
      dateOfBirth: null,
      address: null,
      bloodGroup: null,
      allergies: [],
      chronicDiseases: [],
      currentMedications: [],
      status: 'active',
    } as Patient;
  }

  private refreshCurrentHospital(): void {
    this.backend.getMe().subscribe({
      next: (user) => {
        const storedUser = JSON.parse(localStorage.getItem('user') || 'null') as Record<string, unknown> | null;
        localStorage.setItem('user', JSON.stringify({ ...(storedUser || {}), ...user }));
        this.currentHospitalId = user.hospitalId || this.currentHospitalId;
        this.currentHospital = user.hospital || this.currentHospital;
        this.refreshOpenPreviewData();

        if (!this.currentHospital && this.currentHospitalId && this.backend.hasPermission('hospitals.read')) {
          this.loadCurrentHospitalById();
        }
      },
      error: () => {
        if (this.currentHospitalId && this.backend.hasPermission('hospitals.read')) {
          this.loadCurrentHospitalById();
        }
      },
    });
  }

  private loadCurrentHospitalById(): void {
    if (!this.currentHospitalId) {
      return;
    }

    this.backend.getHospital(this.currentHospitalId).subscribe({
      next: (hospital) => {
        this.currentHospital = hospital;
        this.updateStoredHospital(hospital);
        this.refreshOpenPreviewData();
      },
      error: () => undefined,
    });
  }

  private currentUserForLabReport(): User | null {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null') as User | null;
    } catch {
      return null;
    }
  }

  private updateStoredHospital(hospital: Hospital): void {
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null') as Record<string, unknown> | null;

    if (!storedUser) {
      return;
    }

    localStorage.setItem(
      'user',
      JSON.stringify({
        ...storedUser,
        hospitalId: hospital._id,
        hospital,
      }),
    );
  }

  private refreshOpenPreviewData(): void {
    if (!this.printPreviewOpen || !this.printPreviewData) {
      return;
    }

    try {
      const previewData =
        this.buildPrintPreviewData(this.previewPrescription) ||
        this.printPreviewData;

      if (previewData) {
        this.printPreviewData = previewData;

        if (this.isPrintPreviewViewOnly) {
          this.selectedPrescriptionTemplate = previewData.template;
          this.draftPrescriptionTemplate = previewData.template;
        }
      }
    } catch (error) {
      console.error('Unable to refresh prescription preview', error);
    }
  }

  private resolvePrintHospital(source: Record<string, any>): Hospital | null {
    return (source['hospital'] as Hospital | null) || this.currentHospital || null;
  }

  private resolvePrescriptionSettings(hospital: Hospital | null): PrescriptionPrintSettings {
    return {
      showLogo: hospital?.prescriptionSettings?.showLogo !== false,
      logoScale: Math.min(200, Math.max(50, Number(hospital?.prescriptionSettings?.logoScale) || 100)),
      revisionNote: hospital?.prescriptionSettings?.revisionNote || '* Rx to be revised after Reports.',
      followUpLine: hospital?.prescriptionSettings?.followUpLine || '',
      contactLine: hospital?.prescriptionSettings?.contactLine || '',
      footerLines: hospital?.prescriptionSettings?.footerLines || [],
    };
  }

  private hospitalAddressLine(hospital: Hospital | null): string {
    return [hospital?.address, hospital?.city, hospital?.country].filter(Boolean).join(', ');
  }

  private prescriptionFooterLines(hospital: Hospital | null, settings: PrescriptionPrintSettings): string[] {
    const configuredLines = (settings.footerLines || []).filter((line) => Boolean(line?.trim()));

    if (configuredLines.length > 0) {
      return configuredLines;
    }

    const contactLine = settings.contactLine || this.defaultHospitalContactLine(hospital);
    return contactLine ? [contactLine] : [];
  }

  private defaultHospitalContactLine(hospital: Hospital | null): string {
    const parts = [
      hospital?.email ? `Email: ${hospital.email}` : '',
      hospital?.phone ? `Phone: ${hospital.phone}` : '',
    ].filter(Boolean);

    return parts.join(' | ') || 'Email: info@medilink.local | Phone: 0300-0000000';
  }

  private formatPrintDate(value: string | Date): string {
    const date = new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

    return safeDate
      .toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      .replace(/ /g, '-')
      .toUpperCase();
  }

  private openPrescriptionPrintWindow(content: string): void {
    const iframe = document.createElement('iframe');
    const baseHref = document.baseURI || window.location.href;
    const styles = this.collectDocumentStyles();
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const printDocument = iframe.contentWindow?.document;
    const printWindow = iframe.contentWindow;

    if (!printDocument || !printWindow) {
      iframe.remove();
      this.toastr.error('Unable to open prescription print view.');
      return;
    }

    printDocument.open();
    printDocument.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <base href="${baseHref}" />
          <title>Prescription Print</title>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" rel="stylesheet" />
          ${styles}
          <style>
            body {
              background: #ffffff;
              height: auto;
              margin: 0;
              min-height: auto;
              padding: 0;
            }

            @page {
              margin: 8mm;
              size: A4 portrait;
            }

            @media print {
              html,
              body {
                height: auto !important;
                min-height: auto !important;
                overflow: visible !important;
              }

              .prescription-print-host {
                display: block !important;
                height: auto !important;
                margin: 0 auto !important;
                max-width: 210mm !important;
                min-height: auto !important;
                overflow: visible !important;
                width: 100% !important;
              }

              .prescription-print-sheet.prescription-template-gynae-womens-health,
              .prescription-print-sheet.gynae-modern-prescription {
                height: auto !important;
                margin: 0 auto !important;
                max-width: 210mm !important;
                min-height: auto !important;
                overflow: visible !important;
                padding: 0 !important;
                width: 100% !important;
              }

              .prescription-print-sheet {
                height: auto !important;
                min-height: auto !important;
              }
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    printDocument.close();
    printWindow.onafterprint = () => iframe.remove();

    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => {
        if (document.body.contains(iframe)) {
          iframe.remove();
        }
      }, 15000);
    }, 300);
  }

  private collectDocumentStyles(): string {
    const inlineStyles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.outerHTML)
      .join('\n');
    const linkedStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((style) => style.outerHTML)
      .join('\n');

    return `${linkedStyles}\n${inlineStyles}`;
  }

  private buildVitalsPayload(
    vitals: Record<string, unknown>,
    customVitals: Array<Record<string, unknown>>
  ): Record<string, string> {
    const payload: Record<string, string> = {};

    Object.entries(vitals || {}).forEach(([key, value]) => {
      payload[key] = String(value || '').trim();
    });

    (customVitals || []).forEach((entry) => {
      const key = String(entry['key'] || '').trim();
      const value = String(entry['value'] || '').trim();
      if (!key) {
        return;
      }
      payload[key] = value;
    });

    return payload;
  }

  private buildSpecialtyDataPayload(data: Record<string, unknown>): Record<string, string> {
    const payload: Record<string, string> = {};

    Object.entries(data || {}).forEach(([key, value]) => {
      const normalizedValue = String(value || '').trim();
      if (normalizedValue) {
        payload[key] = normalizedValue;
      }
    });

    return payload;
  }

  private extractDefaultVitals(vitals: Record<string, string>): Record<string, string> {
    return {
      bp: String(vitals['bp'] || ''),
      pulse: String(vitals['pulse'] || ''),
      weight: String(vitals['weight'] || ''),
      temperature: String(vitals['temperature'] || ''),
      spo2: String(vitals['spo2'] || ''),
    };
  }

  private extractCustomVitals(vitals: Record<string, string>): Array<{ key: string; value: string }> {
    return Object.entries(vitals || {})
      .filter(([key]) => !this.defaultVitalKeys.has(key))
      .map(([key, value]) => ({
        key,
        value: String(value || ''),
      }));
  }

  private formatVitalLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (letter) => letter.toUpperCase());
  }
}
