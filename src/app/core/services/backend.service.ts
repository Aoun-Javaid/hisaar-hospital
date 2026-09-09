import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, tap } from 'rxjs';
import { CONFIG } from '../../../../config';
import { AuthService } from './auth.service';
import { normalizeEmail } from '../utils/email.util';
import {
  isDoctorRole,
  normalizeAccessKey,
  readStoredPermissions,
  readStoredRole,
} from '../../modules/auth/access-control';
import {
  ApiResponse,
  PaginatedResponse,
  Pagination,
} from '../../shared/models/api-response.model';
import {
  CompanyProfile,
  UpdateCompanyProfilePayload,
} from '../../shared/models/company.model';
import {
  Appointment,
  Bill,
  Category,
  ChargeCatalogItem,
  CloseRegisterPayload,
  Customer,
  CreateHeldSalePayload,
  CreateSalesReturnPayload,
  CreateSalePayload,
  CreateSaleResponse,
  DashboardSummary,
  DataTablesResponse,
  Department,
  Doctor,
  DoctorMedicine,
  Encounter,
  EncounterLedger,
  Expense,
  OperationSchedule,
  TreatmentCatalogItem,
  Hospital,
  ListResult,
  Patient,
  PatientPaymentDetail,
  PatientPaymentSummary,
  PatientHistory,
  PatientLastVisit,
  Payment,
  ProductCatalogItem,
  Prescription,
  LabOrder,
  LabTestCatalog,
  LabDashboardStats,
  LabComparisonRow,
  LabSettingsResponse,
  HospitalWard,
  WardFloor,
  HeldSale,
  LedgerItem,
  LedgerPayment,
  AuditLog,
  OpenRegisterPayload,
  RegisterSession,
  RegisterSessionDetail,
  RegisterSessionSummary,
  Role,
  Room,
  RoomAllotment,
  Sale,
  StockMovement,
  Store,
  RestoreHeldSaleResponse,
  SalesReturn,
  Supplier,
  Transfer,
  User,
  Warehouse,
} from '../../shared/models/hospital.model';
import {
  BirthCertificateCorrectResult,
  BirthCertificateDetail,
  BirthCertificateIssueResult,
  BirthCertificateVerificationResult,
  BirthRecordMotherContext,
} from '../../shared/models/birth-records.model';

interface AvailableAppointmentSlotsResponse {
  date: string;
  durationMinutes: number;
  slots: Array<{
    startTime: string;
    endTime: string;
    durationMinutes: number;
  }>;
  reason?: string;
}

@Injectable({
  providedIn: 'root',
})
export class BackendService {
  private readonly authService = inject(AuthService);
  private readonly lookupCache = new Map<string, Observable<unknown>>();

  constructor(private http: HttpClient) { }

  private lookupKey(name: string, params?: Record<string, unknown>): string {
    return `${name}:${JSON.stringify(params || {})}`;
  }

  private cachedLookup<T>(key: string, factory: () => Observable<T>): Observable<T> {
    const existing = this.lookupCache.get(key);
    if (existing) {
      return existing as Observable<T>;
    }

    const stream$ = factory().pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.lookupCache.set(key, stream$);
    return stream$;
  }

  private invalidateLookup(prefix: string): void {
    for (const key of [...this.lookupCache.keys()]) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        this.lookupCache.delete(key);
      }
    }
  }

  private cleanParams(params?: Record<string, unknown>): HttpParams {
    let httpParams = new HttpParams();

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return;
      }

      httpParams = httpParams.set(key, String(value));
    });

    return httpParams;
  }

  private get<T>(url: string, params?: Record<string, unknown>): Observable<ApiResponse<T>> {
    return this.http.get<ApiResponse<T>>(url, {
      params: this.cleanParams(params),
    });
  }

  private post<T>(url: string, body: unknown, extraHeaders?: Record<string, string>): Observable<ApiResponse<T>> {
    const headers = extraHeaders || this.idempotencyHeaders();
    return this.http.post<ApiResponse<T>>(url, this.cleanBody(body), { headers });
  }

  private idempotencyHeaders(): Record<string, string> {
    return {
      'X-Idempotency-Key': `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };
  }

  private patch<T>(url: string, body: unknown): Observable<ApiResponse<T>> {
    return this.http.patch<ApiResponse<T>>(url, this.cleanBody(body));
  }

  private delete<T>(url: string): Observable<ApiResponse<T>> {
    return this.http.delete<ApiResponse<T>>(url);
  }

  private cleanBody(body: unknown): unknown {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return body;
    }

    const cleaned = Object.fromEntries(
      Object.entries(body as Record<string, unknown>).filter(
        ([, value]) => value !== undefined
      )
    );

    if (typeof cleaned['email'] === 'string') {
      cleaned['email'] = normalizeEmail(cleaned['email']);
    }

    const owner = cleaned['owner'];
    if (owner && typeof owner === 'object' && !Array.isArray(owner)) {
      const ownerRecord = { ...(owner as Record<string, unknown>) };
      if (typeof ownerRecord['email'] === 'string') {
        ownerRecord['email'] = normalizeEmail(ownerRecord['email']);
      }
      cleaned['owner'] = ownerRecord;
    }

    return cleaned;
  }

  private withNormalizedEmail(payload: Record<string, unknown>): Record<string, unknown> {
    if (typeof payload['email'] !== 'string') {
      return payload;
    }
    return {
      ...payload,
      email: normalizeEmail(payload['email']),
    };
  }

  unwrapList<T>(response: ApiResponse<PaginatedResponse<T>>): T[] {
    return response.data?.items || [];
  }

  unwrapPagination<T>(response: ApiResponse<PaginatedResponse<T>>) {
    return response.data?.pagination;
  }

  unwrapData<T>(response: ApiResponse<T>): T {
    return response.data;
  }

  private unwrapListResult<T>(
    response: ApiResponse<PaginatedResponse<T> | T[] | Record<string, unknown>>
  ): ListResult<T> {
    const data = response.data as unknown;

    if (Array.isArray(data)) {
      return {
        items: data as T[],
        pagination: {
          page: 1,
          limit: data.length,
          total: data.length,
          totalPages: 1,
        },
      };
    }

    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (Array.isArray(record['items'])) {
        return {
          items: record['items'] as T[],
          pagination: (record['pagination'] as Pagination) || {
            page: 1,
            limit: (record['items'] as T[]).length,
            total: (record['items'] as T[]).length,
            totalPages: 1,
          },
        };
      }
      if (Array.isArray(record['data'])) {
        const items = record['data'] as T[];
        return {
          items,
          pagination: {
            page: 1,
            limit: items.length,
            total: items.length,
            totalPages: 1,
          },
        };
      }
    }

    return {
      items: [],
      pagination: {
        page: 1,
        limit: 0,
        total: 0,
        totalPages: 0,
      },
    };
  }

  toDataTablesParams(dataTablesParameters?: any): Record<string, unknown> {
    const length = Number(dataTablesParameters?.length || 10);
    const start = Number(dataTablesParameters?.start || 0);

    return {
      page: Math.floor(start / length) + 1,
      limit: length,
      search: dataTablesParameters?.search?.value || '',
    };
  }

  toDataTablesResponse<T>(
    result: ListResult<T> | T[],
    fallbackTotal?: number
  ): DataTablesResponse<T> {
    const items = Array.isArray(result) ? result : result.items;
    const total = Array.isArray(result)
      ? fallbackTotal ?? result.length
      : result.pagination.total;

    return {
      data: {
        data: items,
        recordsTotal: total,
        recordsFiltered: total,
      },
    };
  }

  login(payload: { email: string; password: string }): Observable<ApiResponse<{ token: string; user: User }>> {
    return this.post<{ token: string; user: User }>(CONFIG.auth.login, {
      ...payload,
      email: normalizeEmail(payload.email),
    });
  }

  getMe(): Observable<User> {
    return this.authService.me() as Observable<User>;
  }

  updateMe(payload: {
    name?: string;
    email?: string;
    phone?: string;
  }): Observable<ApiResponse<User>> {
    const body = { ...payload };
    if (typeof body.email === 'string') {
      body.email = normalizeEmail(body.email);
    }
    return this.patch<User>(CONFIG.auth.me, body);
  }

  getMyCompany(): Observable<CompanyProfile> {
    return this.get<CompanyProfile>(`${CONFIG.companies}/me`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  updateMyCompany(payload: UpdateCompanyProfilePayload): Observable<ApiResponse<CompanyProfile>> {
    return this.patch<CompanyProfile>(`${CONFIG.companies}/me`, payload);
  }

  forgetPass(payload: { email: string }): Observable<
    ApiResponse<{ expiresInSeconds: number; resendAfterSeconds: number }>
  > {
    return this.post<{ expiresInSeconds: number; resendAfterSeconds: number }>(
      CONFIG.auth.forgotPassword,
      payload
    );
  }

  verifyOtp(payload: {
    email: string;
    otp: string;
    newPassword: string;
  }): Observable<ApiResponse<null>> {
    return this.post<null>(CONFIG.auth.resetPassword, payload);
  }

  changePass(payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Observable<ApiResponse<null>> {
    return this.post<null>(CONFIG.auth.changePassword, payload);
  }

  getHospitalDashboardSummary(): Observable<DashboardSummary> {
    if (!this.hasPermission('hospital_dashboard.read')) {
      return of({} as DashboardSummary);
    }

    return this.get<DashboardSummary>(CONFIG.hospitalDashboard.summary).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDoctorDashboardSummary(): Observable<DashboardSummary> {
    if (
      !this.hasPermission('appointments.read') &&
      !this.hasPermission('hospital_dashboard.read')
    ) {
      return of({} as DashboardSummary);
    }

    return this.get<DashboardSummary>(CONFIG.hospitalDashboard.doctorSummary).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  sendDoctorDailySummaryEmail(payload?: { doctorId?: string; date?: string }): Observable<ApiResponse<{
    recipientEmail: string;
    doctorName: string;
    date: string;
    shiftLabel: string;
    totalPatients: number;
    checkedPatients: number;
    netCollected: number;
  }>> {
    return this.post(CONFIG.hospitalDashboard.doctorSummaryEmail, payload || {});
  }

  private emptyListResult<T>(): ListResult<T> {
    return {
      items: [],
      pagination: { page: 1, limit: 0, total: 0, totalPages: 0 },
    };
  }

  private assignedHospital(): Hospital | null {
    return (this.authService.getCurrentUser()?.hospital as Hospital | null) || null;
  }

  private selfDoctorAsList(): Observable<ListResult<Doctor>> {
    const currentRole = this.authService.getCurrentUser()?.role?.name || readStoredRole();
    if (!isDoctorRole(String(currentRole || ''))) {
      return of(this.emptyListResult<Doctor>());
    }

    return this.getMyDoctorProfile().pipe(
      map((item) => ({
        items: item ? [item] : [],
        pagination: { page: 1, limit: 1, total: item ? 1 : 0, totalPages: 1 },
      })),
      catchError(() => of(this.emptyListResult<Doctor>()))
    );
  }

  getHospitals(params?: Record<string, unknown>): Observable<ListResult<Hospital>> {
    if (!this.hasPermission('hospitals.read')) {
      const hospital = this.assignedHospital();
      return of({
        items: hospital ? [hospital] : [],
        pagination: {
          page: 1,
          limit: 1,
          total: hospital ? 1 : 0,
          totalPages: hospital ? 1 : 0,
        },
      });
    }

    return this.cachedLookup(this.lookupKey('hospitals', params), () =>
      this.get<PaginatedResponse<Hospital>>(CONFIG.hospitals, params).pipe(
        map((response) => this.unwrapData(response))
      )
    );
  }

  getHospital(id: string): Observable<Hospital> {
    if (!this.hasPermission('hospitals.read')) {
      const hospital = this.assignedHospital();
      if (hospital) {
        return of(hospital);
      }

      return of({
        _id: id,
        name: '',
        code: '',
        status: 'active',
      } as Hospital);
    }

    return this.get<Hospital>(`${CONFIG.hospitals}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createHospital(payload: Record<string, unknown>): Observable<ApiResponse<Hospital>> {
    return this.post<Hospital>(CONFIG.hospitals, payload).pipe(
      tap(() => this.invalidateLookup('hospitals'))
    );
  }

  updateHospital(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Hospital>> {
    return this.patch<Hospital>(`${CONFIG.hospitals}/${id}`, payload).pipe(
      tap(() => this.invalidateLookup('hospitals'))
    );
  }

  deleteHospital(id: string): Observable<ApiResponse<Hospital>> {
    return this.delete<Hospital>(`${CONFIG.hospitals}/${id}`).pipe(
      tap(() => this.invalidateLookup('hospitals'))
    );
  }

  getDepartments(params?: Record<string, unknown>): Observable<ListResult<Department>> {
    if (!this.hasPermission('departments.read')) {
      return of(this.emptyListResult<Department>());
    }

    return this.cachedLookup(this.lookupKey('departments', params), () =>
      this.get<PaginatedResponse<Department>>(CONFIG.departments, params).pipe(
        map((response) => this.unwrapData(response))
      )
    );
  }

  getDepartment(id: string): Observable<Department> {
    return this.get<Department>(`${CONFIG.departments}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createDepartment(payload: Partial<Department>): Observable<ApiResponse<Department>> {
    return this.post<Department>(CONFIG.departments, payload).pipe(
      tap(() => this.invalidateLookup('departments'))
    );
  }

  updateDepartment(id: string, payload: Partial<Department>): Observable<ApiResponse<Department>> {
    return this.patch<Department>(`${CONFIG.departments}/${id}`, payload).pipe(
      tap(() => this.invalidateLookup('departments'))
    );
  }

  deleteDepartment(id: string): Observable<ApiResponse<Department>> {
    return this.delete<Department>(`${CONFIG.departments}/${id}`).pipe(
      tap(() => this.invalidateLookup('departments'))
    );
  }

  getTreatmentCatalog(params?: Record<string, unknown>): Observable<ListResult<TreatmentCatalogItem> & { kpis?: Record<string, number> }> {
    if (
      !this.hasPermission('treatment_catalog.read') &&
      !this.hasPermission('ward.admissions.recommend') &&
      !this.hasPermission('operations.read') &&
      !this.hasPermission('hospitals.update') &&
      !this.hasPermission('departments.update') &&
      !this.hasPermission('*')
    ) {
      return of(this.emptyListResult<TreatmentCatalogItem>());
    }

    return this.get<PaginatedResponse<TreatmentCatalogItem> & { kpis?: Record<string, number> }>(
      CONFIG.treatmentCatalog,
      params
    ).pipe(map((response) => this.unwrapData(response)));
  }

  getTreatmentCatalogItem(id: string): Observable<TreatmentCatalogItem> {
    return this.get<TreatmentCatalogItem>(`${CONFIG.treatmentCatalog}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createTreatmentCatalogItem(payload: Partial<TreatmentCatalogItem>): Observable<ApiResponse<TreatmentCatalogItem>> {
    return this.post<TreatmentCatalogItem>(CONFIG.treatmentCatalog, payload);
  }

  updateTreatmentCatalogItem(
    id: string,
    payload: Partial<TreatmentCatalogItem>
  ): Observable<ApiResponse<TreatmentCatalogItem>> {
    return this.patch<TreatmentCatalogItem>(`${CONFIG.treatmentCatalog}/${id}`, payload);
  }

  deactivateTreatmentCatalogItem(id: string): Observable<ApiResponse<TreatmentCatalogItem>> {
    return this.delete<TreatmentCatalogItem>(`${CONFIG.treatmentCatalog}/${id}`);
  }

  getOperationSchedules(params?: Record<string, unknown>): Observable<ListResult<OperationSchedule>> {
    if (!this.hasPermission('operations.read') && !this.hasPermission('operations.read_all') && !this.hasPermission('*')) {
      return of(this.emptyListResult<OperationSchedule>());
    }

    return this.get<PaginatedResponse<OperationSchedule>>(CONFIG.operationSchedules, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getOperationScheduleCalendar(params?: Record<string, unknown>): Observable<OperationSchedule[]> {
    return this.get<OperationSchedule[]>(`${CONFIG.operationSchedules}/calendar`, params).pipe(
      map((response) => {
        const data = this.unwrapData(response) as unknown;
        return Array.isArray(data) ? data : ((data as { items?: OperationSchedule[] })?.items || []);
      })
    );
  }

  getOperationScheduleKpis(params?: Record<string, unknown>): Observable<Record<string, number>> {
    return this.get<Record<string, number>>(`${CONFIG.operationSchedules}/kpi`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getOperationSchedule(id: string): Observable<OperationSchedule> {
    return this.get<OperationSchedule>(`${CONFIG.operationSchedules}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createOperationSchedule(payload: Record<string, unknown>): Observable<ApiResponse<OperationSchedule>> {
    return this.post<OperationSchedule>(CONFIG.operationSchedules, payload);
  }

  updateOperationSchedule(id: string, payload: Record<string, unknown>): Observable<ApiResponse<OperationSchedule>> {
    return this.patch<OperationSchedule>(`${CONFIG.operationSchedules}/${id}`, payload);
  }

  updateOperationScheduleStatus(id: string, status: string): Observable<ApiResponse<OperationSchedule>> {
    return this.post<OperationSchedule>(`${CONFIG.operationSchedules}/${id}/status`, { status });
  }

  completeOperationSchedule(id: string): Observable<ApiResponse<OperationSchedule>> {
    return this.post<OperationSchedule>(`${CONFIG.operationSchedules}/${id}/complete`, {});
  }

  cancelOperationSchedule(id: string, payload?: Record<string, unknown>): Observable<ApiResponse<OperationSchedule>> {
    return this.post<OperationSchedule>(`${CONFIG.operationSchedules}/${id}/cancel`, payload || {});
  }

  getDoctors(params?: Record<string, unknown>): Observable<ListResult<Doctor>> {
    if (!this.hasPermission('doctors.read')) {
      return this.selfDoctorAsList();
    }

    return this.get<PaginatedResponse<Doctor>>(CONFIG.doctors, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDoctor(id: string): Observable<Doctor> {
    if (!this.hasPermission('doctors.read')) {
      return this.getMyDoctorProfile();
    }

    return this.get<Doctor>(`${CONFIG.doctors}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getMyDoctorProfile(): Observable<Doctor> {
    return this.get<Doctor>(`${CONFIG.doctors}/me`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getAccessibleDoctors(params?: Record<string, unknown>): Observable<ListResult<Doctor>> {
    return this.getDoctors(params);
  }

  createDoctor(payload: Record<string, unknown>): Observable<ApiResponse<Doctor>> {
    return this.post<Doctor>(CONFIG.doctors, payload);
  }

  updateDoctor(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Doctor>> {
    return this.patch<Doctor>(`${CONFIG.doctors}/${id}`, payload);
  }

  updateMyPrescriptionTemplate(payload: { prescriptionTemplate: string }): Observable<ApiResponse<Doctor>> {
    return this.patch<Doctor>(`${CONFIG.doctors}/me/prescription-template`, payload);
  }

  updateMyDoctorSchedule(payload: Record<string, unknown>): Observable<ApiResponse<Doctor>> {
    return this.patch<Doctor>(`${CONFIG.doctors}/me/schedule`, payload);
  }

  deleteDoctor(id: string): Observable<ApiResponse<Doctor>> {
    return this.delete<Doctor>(`${CONFIG.doctors}/${id}`);
  }

  uploadDoctorPhoto(id: string, file: File): Observable<ApiResponse<Doctor>> {
    const body = new FormData();
    body.append('photo', file);
    return this.http.post<ApiResponse<Doctor>>(`${CONFIG.doctors}/${id}/photo`, body);
  }

  deleteDoctorPhoto(id: string): Observable<ApiResponse<Doctor>> {
    return this.delete<Doctor>(`${CONFIG.doctors}/${id}/photo`);
  }

  uploadMyDoctorPhoto(file: File): Observable<ApiResponse<Doctor>> {
    const body = new FormData();
    body.append('photo', file);
    return this.http.post<ApiResponse<Doctor>>(`${CONFIG.doctors}/me/photo`, body);
  }

  deleteMyDoctorPhoto(): Observable<ApiResponse<Doctor>> {
    return this.delete<Doctor>(`${CONFIG.doctors}/me/photo`);
  }

  uploadMyPhoto(file: File): Observable<ApiResponse<User>> {
    const body = new FormData();
    body.append('photo', file);
    return this.http.post<ApiResponse<User>>(`${CONFIG.auth.me}/photo`, body);
  }

  deleteMyPhoto(): Observable<ApiResponse<User>> {
    return this.delete<User>(`${CONFIG.auth.me}/photo`);
  }

  getDoctorPatients(id: string, params?: Record<string, unknown>): Observable<ListResult<Patient>> {
    return this.get<PaginatedResponse<Patient>>(`${CONFIG.doctors}/${id}/patients`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDoctorAppointments(id: string, params?: Record<string, unknown>): Observable<ListResult<Appointment>> {
    return this.get<PaginatedResponse<Appointment>>(
      `${CONFIG.doctors}/${id}/appointments`,
      params
    ).pipe(map((response) => this.unwrapData(response)));
  }

  getPatients(params?: Record<string, unknown>): Observable<ListResult<Patient>> {
    return this.get<PaginatedResponse<Patient>>(CONFIG.patients, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatient(id: string): Observable<Patient> {
    return this.get<Patient>(`${CONFIG.patients}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientProfile(id: string): Observable<Patient> {
    return this.get<Patient>(`${CONFIG.patients}/${id}/profile`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createPatient(payload: Record<string, unknown>): Observable<ApiResponse<Patient>> {
    return this.post<Patient>(CONFIG.patients, payload);
  }

  updatePatient(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Patient>> {
    return this.patch<Patient>(`${CONFIG.patients}/${id}`, payload);
  }

  deletePatient(id: string): Observable<ApiResponse<Patient>> {
    return this.delete<Patient>(`${CONFIG.patients}/${id}`);
  }

  getPatientHistory(id: string, params?: Record<string, unknown>): Observable<ListResult<PatientHistory>> {
    return this.get<PaginatedResponse<PatientHistory>>(`${CONFIG.patients}/${id}/history`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientPrescriptions(id: string, params?: Record<string, unknown>): Observable<ListResult<Prescription>> {
    return this.get<PaginatedResponse<Prescription>>(
      `${CONFIG.patients}/${id}/prescriptions`,
      params
    ).pipe(map((response) => this.unwrapData(response)));
  }

  getPatientBills(id: string, params?: Record<string, unknown>): Observable<ListResult<Bill>> {
    return this.get<PaginatedResponse<Bill>>(`${CONFIG.patients}/${id}/bills`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientLabOrders(id: string): Observable<LabOrder[]> {
    return this.get<LabOrder[]>(`${CONFIG.patients}/${id}/lab-orders`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientHistoryRecords(params?: Record<string, unknown>): Observable<ListResult<PatientHistory>> {
    return this.get<PaginatedResponse<PatientHistory>>(CONFIG.patientHistory, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getCareRecordsBootstrap(params?: Record<string, unknown>): Observable<{
    history: ListResult<PatientHistory>;
    patients: Patient[];
    doctors: Doctor[];
    appointments: Appointment[];
    activeAllotments: RoomAllotment[];
    permissions?: Record<string, boolean>;
  }> {
    return this.get<{
      history: ListResult<PatientHistory> | PaginatedResponse<PatientHistory>;
      patients: Patient[];
      doctors: Doctor[];
      appointments: Appointment[];
      activeAllotments: RoomAllotment[];
      permissions?: Record<string, boolean>;
    }>(`${CONFIG.patientHistory}/bootstrap`, params).pipe(
      map((response) => {
        const data = this.unwrapData(response);
        return {
          history: this.unwrapListResult({
            data: data.history,
          } as ApiResponse<PaginatedResponse<PatientHistory>>),
          patients: Array.isArray(data.patients) ? data.patients : [],
          doctors: Array.isArray(data.doctors) ? data.doctors : [],
          appointments: Array.isArray(data.appointments) ? data.appointments : [],
          activeAllotments: Array.isArray(data.activeAllotments) ? data.activeAllotments : [],
          permissions: data.permissions,
        };
      })
    );
  }

  createPatientHistory(payload: Record<string, unknown>): Observable<ApiResponse<PatientHistory>> {
    return this.post<PatientHistory>(CONFIG.patientHistory, payload);
  }

  updatePatientHistory(id: string, payload: Record<string, unknown>): Observable<ApiResponse<PatientHistory>> {
    return this.patch<PatientHistory>(`${CONFIG.patientHistory}/${id}`, payload);
  }

  deletePatientHistory(id: string): Observable<ApiResponse<PatientHistory>> {
    return this.delete<PatientHistory>(`${CONFIG.patientHistory}/${id}`);
  }

  getAppointments(params?: Record<string, unknown>): Observable<ListResult<Appointment>> {
    return this.get<PaginatedResponse<Appointment>>(CONFIG.appointments, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientLastVisit(
    patientId: string,
    params?: Record<string, unknown>
  ): Observable<PatientLastVisit> {
    return this.get<PatientLastVisit>(`${CONFIG.appointments}/patients/${patientId}/last-visit`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getAppointment(id: string): Observable<Appointment> {
    return this.get<Appointment>(`${CONFIG.appointments}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getAppointmentCalendar(params?: Record<string, unknown>): Observable<Appointment[]> {
    return this.get<Appointment[]>(`${CONFIG.appointments}/calendar`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getAvailableAppointmentSlots(
    params: { doctorId: string; date: string }
  ): Observable<AvailableAppointmentSlotsResponse> {
    return this.get<AvailableAppointmentSlotsResponse>(
      `${CONFIG.appointments}/available-slots`,
      params
    ).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createAppointment(payload: Record<string, unknown>): Observable<ApiResponse<Appointment>> {
    return this.post<Appointment>(CONFIG.appointments, payload);
  }

  updateAppointment(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Appointment>> {
    return this.patch<Appointment>(`${CONFIG.appointments}/${id}`, payload);
  }

  updateAppointmentStatus(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Appointment>> {
    return this.patch<Appointment>(`${CONFIG.appointments}/${id}/status`, payload);
  }

  deleteAppointment(id: string): Observable<ApiResponse<Appointment>> {
    return this.delete<Appointment>(`${CONFIG.appointments}/${id}`);
  }

  getPrescriptions(params?: Record<string, unknown>): Observable<ListResult<Prescription>> {
    return this.get<PaginatedResponse<Prescription>>(CONFIG.prescriptions, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPrescription(id: string): Observable<Prescription> {
    return this.get<Prescription>(`${CONFIG.prescriptions}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createPrescription(payload: Record<string, unknown>): Observable<ApiResponse<Prescription>> {
    return this.post<Prescription>(CONFIG.prescriptions, payload);
  }

  updatePrescription(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Prescription>> {
    return this.patch<Prescription>(`${CONFIG.prescriptions}/${id}`, payload);
  }

  deletePrescription(id: string): Observable<ApiResponse<Prescription>> {
    return this.delete<Prescription>(`${CONFIG.prescriptions}/${id}`);
  }

  getDoctorMedicines(params?: Record<string, unknown>): Observable<DoctorMedicine[]> {
    return this.get<DoctorMedicine[]>(`${CONFIG.prescriptions}/doctor-medicines`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createDoctorMedicine(payload: Record<string, unknown>): Observable<ApiResponse<DoctorMedicine>> {
    return this.post<DoctorMedicine>(`${CONFIG.prescriptions}/doctor-medicines`, payload);
  }

  getLabTests(params?: Record<string, unknown>): Observable<ListResult<LabTestCatalog>> {
    return this.get<PaginatedResponse<LabTestCatalog>>(`${CONFIG.laboratory}/tests`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createLabTest(payload: Record<string, unknown>): Observable<ApiResponse<LabTestCatalog>> {
    return this.post<LabTestCatalog>(`${CONFIG.laboratory}/tests`, payload);
  }

  updateLabTest(id: string, payload: Record<string, unknown>): Observable<ApiResponse<LabTestCatalog>> {
    return this.patch<LabTestCatalog>(`${CONFIG.laboratory}/tests/${id}`, payload);
  }

  seedDefaultLabTests(): Observable<ApiResponse<{ seeded: number }>> {
    return this.post<{ seeded: number }>(`${CONFIG.laboratory}/tests/seed-defaults`, {});
  }

  getLabDashboardStats(params?: Record<string, unknown>): Observable<LabDashboardStats> {
    return this.get<LabDashboardStats>(`${CONFIG.laboratory}/dashboard/stats`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getLabSettings(): Observable<LabSettingsResponse> {
    return this.get<LabSettingsResponse>(`${CONFIG.laboratory}/settings`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  updateLabSettings(payload: Record<string, unknown>): Observable<ApiResponse<LabSettingsResponse>> {
    return this.patch<LabSettingsResponse>(`${CONFIG.laboratory}/settings`, payload);
  }

  getLabOrders(params?: Record<string, unknown>): Observable<ListResult<LabOrder>> {
    return this.get<PaginatedResponse<LabOrder>>(`${CONFIG.laboratory}/orders`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getLabOrder(id: string): Observable<LabOrder> {
    return this.get<LabOrder>(`${CONFIG.laboratory}/orders/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createLabOrder(payload: Record<string, unknown>): Observable<ApiResponse<LabOrder>> {
    return this.post<LabOrder>(`${CONFIG.laboratory}/orders`, payload);
  }

  updateLabOrder(id: string, payload: Record<string, unknown>): Observable<ApiResponse<LabOrder>> {
    return this.patch<LabOrder>(`${CONFIG.laboratory}/orders/${id}`, payload);
  }

  addTestsToLabOrder(id: string, payload: Record<string, unknown>): Observable<ApiResponse<LabOrder>> {
    return this.post<LabOrder>(`${CONFIG.laboratory}/orders/${id}/tests`, payload);
  }

  collectLabSample(id: string, payload: Record<string, unknown>): Observable<ApiResponse<LabOrder>> {
    return this.post<LabOrder>(`${CONFIG.laboratory}/orders/${id}/collect-sample`, payload);
  }

  rejectLabSample(orderId: string, sampleId: string, payload: Record<string, unknown>): Observable<ApiResponse<LabOrder>> {
    return this.post<LabOrder>(`${CONFIG.laboratory}/orders/${orderId}/samples/${sampleId}/reject`, payload);
  }

  saveLabItemResults(orderId: string, itemId: string, payload: Record<string, unknown>): Observable<ApiResponse<LabOrder>> {
    return this.post<LabOrder>(`${CONFIG.laboratory}/orders/${orderId}/items/${itemId}/results`, payload);
  }

  uploadLabItemReport(orderId: string, itemId: string, payload: Record<string, unknown>): Observable<ApiResponse<LabOrder>> {
    return this.post<LabOrder>(`${CONFIG.laboratory}/orders/${orderId}/items/${itemId}/upload-report`, payload);
  }

  verifyLabOrderItem(orderId: string, itemId: string, payload: Record<string, unknown>): Observable<ApiResponse<LabOrder>> {
    return this.post<LabOrder>(`${CONFIG.laboratory}/orders/${orderId}/items/${itemId}/verify`, payload);
  }

  collectLabOrderPayment(orderId: string, payload: Record<string, unknown> = {}): Observable<ApiResponse<LabOrder>> {
    return this.post<LabOrder>(`${CONFIG.laboratory}/orders/${orderId}/collect-payment`, payload);
  }

  getPatientLabComparison(patientId: string, params?: Record<string, unknown>): Observable<LabComparisonRow[]> {
    return this.get<LabComparisonRow[]>(`${CONFIG.laboratory}/patients/${patientId}/comparison`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientLabHistory(patientId: string): Observable<LabOrder[]> {
    return this.get<LabOrder[]>(`${CONFIG.laboratory}/patients/${patientId}/history`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getCategories(params?: Record<string, unknown>): Observable<ListResult<Category>> {
    return this.get<PaginatedResponse<Category>>(CONFIG.categories, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createCategory(payload: Record<string, unknown>): Observable<ApiResponse<Category>> {
    return this.post<Category>(CONFIG.categories, payload);
  }

  getCustomers(params?: Record<string, unknown>): Observable<ListResult<Customer>> {
    return this.get<PaginatedResponse<Customer>>(CONFIG.customers, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createCustomer(payload: Record<string, unknown>): Observable<ApiResponse<Customer>> {
    return this.post<Customer>(CONFIG.customers, payload);
  }

  updateCustomer(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Customer>> {
    return this.patch<Customer>(`${CONFIG.customers}/${id}`, payload);
  }

  deleteCustomer(id: string): Observable<ApiResponse<Customer>> {
    return this.delete<Customer>(`${CONFIG.customers}/${id}`);
  }

  getSuppliers(params?: Record<string, unknown>): Observable<ListResult<Supplier>> {
    return this.get<PaginatedResponse<Supplier>>(CONFIG.suppliers, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createSupplier(payload: Record<string, unknown>): Observable<ApiResponse<Supplier>> {
    return this.post<Supplier>(CONFIG.suppliers, payload);
  }

  updateSupplier(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Supplier>> {
    return this.patch<Supplier>(`${CONFIG.suppliers}/${id}`, payload);
  }

  deleteSupplier(id: string): Observable<ApiResponse<Supplier>> {
    return this.delete<Supplier>(`${CONFIG.suppliers}/${id}`);
  }

  getProducts(params?: Record<string, unknown>): Observable<ListResult<ProductCatalogItem>> {
    return this.get<PaginatedResponse<ProductCatalogItem>>(CONFIG.products, params).pipe(
      map((response) => this.unwrapListResult<ProductCatalogItem>(response))
    );
  }

  getPrescriptionProductSuggestions(params?: Record<string, unknown>): Observable<ListResult<ProductCatalogItem>> {
    return this.get<PaginatedResponse<ProductCatalogItem>>(`${CONFIG.products}/prescription-suggestions`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createProduct(payload: Record<string, unknown>): Observable<ApiResponse<ProductCatalogItem>> {
    return this.post<ProductCatalogItem>(CONFIG.products, payload);
  }

  bulkCreateProducts(payload: Record<string, unknown>): Observable<ApiResponse<{
    createdCount: number;
    products: Array<{ _id: string; name: string; sku: string; storeId?: string; openingStock?: number }>;
    inventoryCreated: number;
    stockMovementsCreated: number;
  }>> {
    return this.post(CONFIG.productsBulk, payload, {
      ...this.idempotencyHeaders(),
      'X-Skip-Loader': '1',
    });
  }

  updateProduct(id: string, payload: Record<string, unknown>): Observable<ApiResponse<ProductCatalogItem>> {
    return this.patch<ProductCatalogItem>(`${CONFIG.products}/${id}`, payload);
  }

  deleteProduct(id: string): Observable<ApiResponse<ProductCatalogItem>> {
    return this.delete<ProductCatalogItem>(`${CONFIG.products}/${id}`);
  }

  adjustInventory(payload: Record<string, unknown>): Observable<ApiResponse<unknown>> {
    return this.post<unknown>(`${CONFIG.inventory}/adjust`, payload);
  }

  getStores(params?: Record<string, unknown>): Observable<ListResult<Store>> {
    return this.get<PaginatedResponse<Store>>(CONFIG.stores, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getWarehouses(params?: Record<string, unknown>): Observable<ListResult<Warehouse>> {
    return this.get<PaginatedResponse<Warehouse>>(CONFIG.warehouses, params).pipe(
      map((response) => this.unwrapListResult<Warehouse>(response))
    );
  }

  createWarehouse(payload: Record<string, unknown>): Observable<ApiResponse<Warehouse>> {
    return this.post<Warehouse>(CONFIG.warehouses, payload);
  }

  getStockMovements(params?: Record<string, unknown>): Observable<ListResult<StockMovement>> {
    return this.get<PaginatedResponse<StockMovement>>(CONFIG.stockMovements, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createSale(payload: CreateSalePayload): Observable<ApiResponse<CreateSaleResponse>> {
    return this.post<CreateSaleResponse>(CONFIG.sales, payload);
  }

  getSaleById(id: string): Observable<Sale> {
    return this.get<Sale>(`${CONFIG.sales}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getSales(params?: Record<string, unknown>): Observable<ListResult<Sale>> {
    return this.get<PaginatedResponse<Sale>>(CONFIG.sales, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  cancelSale(id: string): Observable<ApiResponse<Sale>> {
    return this.post<Sale>(`${CONFIG.sales}/${id}/cancel`, {});
  }

  createHeldSale(payload: CreateHeldSalePayload): Observable<ApiResponse<HeldSale>> {
    return this.post<HeldSale>(`${CONFIG.sales}/holds`, payload);
  }

  listHeldSales(params?: Record<string, unknown>): Observable<ListResult<HeldSale>> {
    return this.get<PaginatedResponse<HeldSale>>(`${CONFIG.sales}/holds`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  restoreHeldSale(id: string): Observable<RestoreHeldSaleResponse> {
    return this.post<RestoreHeldSaleResponse>(`${CONFIG.sales}/holds/${id}/restore`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  deleteHeldSale(id: string): Observable<ApiResponse<{ deleted: boolean }>> {
    return this.delete<{ deleted: boolean }>(`${CONFIG.sales}/holds/${id}`);
  }

  createSalesReturn(payload: CreateSalesReturnPayload): Observable<SalesReturn> {
    return this.post<SalesReturn | { salesReturn?: SalesReturn }>(CONFIG.returns.sales, payload).pipe(
      map((response) => {
        const data = response.data;
        return ('salesReturn' in data ? data.salesReturn : data) as SalesReturn;
      })
    );
  }

  listSalesReturns(params?: Record<string, unknown>): Observable<ListResult<SalesReturn>> {
    return this.get<PaginatedResponse<SalesReturn>>(CONFIG.returns.sales, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDashboardReport(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(CONFIG.reports.dashboard, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getSalesReport(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(CONFIG.reports.sales, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getInventoryReport(params?: Record<string, unknown>): Observable<unknown[] | Record<string, unknown>> {
    return this.get<unknown[] | Record<string, unknown>>(CONFIG.reports.inventory, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getProfitLossReport(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(CONFIG.reports.profitLoss, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getStockMovementsReport(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(CONFIG.reports.stockMovements, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPaymentsReport(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(CONFIG.reports.payments, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getExpensesReport(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(CONFIG.reports.expenses, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getCurrentRegister(params?: Record<string, unknown>): Observable<RegisterSession | null> {
    return this.get<{ registerSession: RegisterSession | null }>(`${CONFIG.registerSessions}/current`, params).pipe(
      map((response) => response.data?.registerSession || null)
    );
  }

  getRegisterSessions(params?: Record<string, unknown>): Observable<ListResult<RegisterSession>> {
    return this.get<PaginatedResponse<RegisterSession>>(CONFIG.registerSessions, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getRegisterSessionById(id: string): Observable<RegisterSessionDetail> {
    return this.get<RegisterSessionDetail>(`${CONFIG.registerSessions}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  openRegister(payload: OpenRegisterPayload): Observable<ApiResponse<{ registerSession: RegisterSession }>> {
    return this.post<{ registerSession: RegisterSession }>(`${CONFIG.registerSessions}/open`, payload);
  }

  closeRegister(
    id: string,
    payload: CloseRegisterPayload
  ): Observable<ApiResponse<{ registerSession: RegisterSession; summary?: RegisterSessionSummary }>> {
    return this.post<{ registerSession: RegisterSession; summary?: RegisterSessionSummary }>(
      `${CONFIG.registerSessions}/${id}/close`,
      payload
    );
  }

  getTransfers(params?: Record<string, unknown>): Observable<ListResult<Transfer>> {
    return this.get<PaginatedResponse<Transfer>>(CONFIG.transfers, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getTransferById(id: string): Observable<Transfer> {
    return this.get<Transfer>(`${CONFIG.transfers}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createTransfer(payload: Record<string, unknown>): Observable<ApiResponse<Transfer>> {
    return this.post<Transfer>(CONFIG.transfers, payload);
  }

  approveTransfer(id: string): Observable<ApiResponse<Transfer>> {
    return this.post<Transfer>(`${CONFIG.transfers}/${id}/approve`, {});
  }

  dispatchTransfer(id: string): Observable<ApiResponse<Transfer>> {
    return this.post<Transfer>(`${CONFIG.transfers}/${id}/dispatch`, {});
  }

  receiveTransfer(id: string): Observable<ApiResponse<Transfer>> {
    return this.post<Transfer>(`${CONFIG.transfers}/${id}/receive`, {});
  }

  cancelTransfer(id: string): Observable<ApiResponse<Transfer>> {
    return this.post<Transfer>(`${CONFIG.transfers}/${id}/cancel`, {});
  }

  getRooms(params?: Record<string, unknown>): Observable<ListResult<Room>> {
    return this.get<PaginatedResponse<Room>>(CONFIG.rooms, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getRoom(id: string): Observable<Room> {
    return this.get<Room>(`${CONFIG.rooms}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createRoom(payload: Record<string, unknown>): Observable<ApiResponse<Room>> {
    return this.post<Room>(CONFIG.rooms, payload);
  }

  updateRoom(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Room>> {
    return this.patch<Room>(`${CONFIG.rooms}/${id}`, payload);
  }

  deleteRoom(id: string): Observable<ApiResponse<Room>> {
    return this.delete<Room>(`${CONFIG.rooms}/${id}`);
  }

  getHospitalWards(params?: Record<string, unknown>): Observable<ListResult<HospitalWard>> {
    return this.cachedLookup(this.lookupKey('hospitalWards', params), () =>
      this.get<PaginatedResponse<HospitalWard> | HospitalWard[]>(CONFIG.hospitalWards, params).pipe(
        map((response) => this.unwrapListResult(response))
      )
    );
  }

  createHospitalWard(payload: Record<string, unknown>): Observable<ApiResponse<HospitalWard>> {
    return this.post<HospitalWard>(CONFIG.hospitalWards, payload).pipe(
      tap(() => this.invalidateLookup('hospitalWards'))
    );
  }

  updateHospitalWard(id: string, payload: Record<string, unknown>): Observable<ApiResponse<HospitalWard>> {
    return this.patch<HospitalWard>(`${CONFIG.hospitalWards}/${id}`, payload).pipe(
      tap(() => this.invalidateLookup('hospitalWards'))
    );
  }

  deleteHospitalWard(id: string): Observable<ApiResponse<HospitalWard>> {
    return this.delete<HospitalWard>(`${CONFIG.hospitalWards}/${id}`).pipe(
      tap(() => this.invalidateLookup('hospitalWards'))
    );
  }

  getWardFloors(wardId: string, params?: Record<string, unknown>): Observable<ListResult<WardFloor>> {
    return this.get<PaginatedResponse<WardFloor> | WardFloor[]>(
      `${CONFIG.hospitalWards}/${wardId}/floors`,
      params
    ).pipe(map((response) => this.unwrapListResult(response)));
  }

  createWardFloor(wardId: string, payload: Record<string, unknown>): Observable<ApiResponse<WardFloor>> {
    return this.post<WardFloor>(`${CONFIG.hospitalWards}/${wardId}/floors`, payload);
  }

  updateWardFloor(
    wardId: string,
    floorId: string,
    payload: Record<string, unknown>
  ): Observable<ApiResponse<WardFloor>> {
    return this.patch<WardFloor>(`${CONFIG.hospitalWards}/${wardId}/floors/${floorId}`, payload);
  }

  deleteWardFloor(wardId: string, floorId: string): Observable<ApiResponse<WardFloor>> {
    return this.delete<WardFloor>(`${CONFIG.hospitalWards}/${wardId}/floors/${floorId}`);
  }

  getRoomAllotments(params?: Record<string, unknown>): Observable<ListResult<RoomAllotment>> {
    return this.get<PaginatedResponse<RoomAllotment>>(CONFIG.roomAllotments, params).pipe(
      map((response) => this.unwrapListResult(response))
    );
  }

  getRoomAllotment(id: string): Observable<RoomAllotment> {
    return this.get<RoomAllotment>(`${CONFIG.roomAllotments}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createRoomAllotment(payload: Record<string, unknown>): Observable<ApiResponse<RoomAllotment>> {
    return this.post<RoomAllotment>(CONFIG.roomAllotments, payload);
  }

  dischargeRoomAllotment(id: string, payload: Record<string, unknown>): Observable<ApiResponse<RoomAllotment>> {
    return this.patch<RoomAllotment>(`${CONFIG.roomAllotments}/${id}/discharge`, payload);
  }

  transferRoomAllotment(id: string, payload: Record<string, unknown>): Observable<ApiResponse<RoomAllotment>> {
    return this.patch<RoomAllotment>(`${CONFIG.roomAllotments}/${id}/transfer`, payload);
  }

  assignNurseToAllotment(id: string, payload: Record<string, unknown>): Observable<ApiResponse<RoomAllotment>> {
    return this.patch<RoomAllotment>(`${CONFIG.roomAllotments}/${id}/assign-nurse`, payload);
  }

  getWardBeds(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(`${CONFIG.ward}/beds`, params).pipe(
      map((response) => this.unwrapListResult(response))
    );
  }

  createWardBed(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/beds`, payload);
  }

  updateWardBed(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.patch<Record<string, unknown>>(`${CONFIG.ward}/beds/${id}`, payload);
  }

  deleteWardBed(id: string): Observable<ApiResponse<Record<string, unknown>>> {
    return this.delete<Record<string, unknown>>(`${CONFIG.ward}/beds/${id}`);
  }

  getWardActivities(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(`${CONFIG.ward}/activities`, params).pipe(
      map((response) => this.unwrapListResult(response))
    );
  }

  createWardActivity(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/activities`, payload);
  }

  updateWardActivity(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.patch<Record<string, unknown>>(`${CONFIG.ward}/activities/${id}`, payload);
  }

  createWardAdmission(payload: Record<string, unknown>): Observable<ApiResponse<RoomAllotment>> {
    return this.post<RoomAllotment>(`${CONFIG.ward}/admissions`, payload);
  }

  recordWardVitals(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/vitals`, payload);
  }

  recordWardDose(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/mar/record-dose`, payload);
  }

  wardDripAction(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/drips/action`, payload);
  }

  createWardOrder(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/orders`, payload);
  }

  getWardReports(): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.ward}/reports`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getWardStaff(): Observable<User[]> {
    return this.get<PaginatedResponse<User> | User[]>(`${CONFIG.ward}/staff`).pipe(
      map((response) => this.unwrapListResult(response).items)
    );
  }

  getWardDashboard(): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.ward}/dashboard`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getWardControlCenter(): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.ward}/control-center`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientUpdates(admissionId: string): Observable<{ items: Record<string, unknown>[] }> {
    return this.get<{ items: Record<string, unknown>[] }>(`${CONFIG.ward}/admissions/${admissionId}/updates`).pipe(
      map((response) => this.unwrapData(response) as { items: Record<string, unknown>[] })
    );
  }

  getPatientAdmissionHistory(
    patientId: string,
    excludeAdmissionId?: string
  ): Observable<{ items: Record<string, unknown>[] }> {
    const query = excludeAdmissionId ? `?excludeAdmissionId=${excludeAdmissionId}` : '';
    return this.get<{ items: Record<string, unknown>[] }>(`${CONFIG.ward}/patients/${patientId}/admission-history${query}`).pipe(
      map((response) => this.unwrapData(response) as { items: Record<string, unknown>[] })
    );
  }

  listNotifications(params: Record<string, unknown> = {}): Observable<{ items: unknown[]; unreadCount?: number }> {
    return this.get<{ items: unknown[]; unreadCount?: number }>(`${CONFIG.notifications}`, params).pipe(
      map((response) => this.unwrapData(response) as { items: unknown[]; unreadCount?: number })
    );
  }

  markNotificationRead(id: string): Observable<unknown> {
    return this.patch<unknown>(`${CONFIG.notifications}/${id}/read`, {});
  }

  markAllNotificationsRead(): Observable<unknown> {
    return this.patch<unknown>(`${CONFIG.notifications}/read-all`, {});
  }

  acknowledgeWardActivity(id: string): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/activities/${id}/acknowledge`, {});
  }

  completeWardActivity(id: string, payload: Record<string, unknown> = {}): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/activities/${id}/complete`, payload);
  }

  acceptWardHandover(id: string): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/activities/${id}/accept`, {});
  }

  createWardAssignment(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/assignments`, payload);
  }

  getBills(params?: Record<string, unknown>): Observable<ListResult<Bill>> {
    return this.get<PaginatedResponse<Bill>>(CONFIG.bills, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getBill(id: string): Observable<Bill> {
    return this.get<Bill>(`${CONFIG.bills}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createBill(payload: Record<string, unknown>): Observable<ApiResponse<Bill>> {
    return this.post<Bill>(CONFIG.bills, payload);
  }

  updateBillPayment(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Bill>> {
    return this.patch<Bill>(`${CONFIG.bills}/${id}/payment`, payload);
  }

  getEncounters(params?: Record<string, unknown>): Observable<ListResult<Encounter>> {
    return this.get<PaginatedResponse<Encounter>>(CONFIG.encounters, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientPaymentSummaries(params?: Record<string, unknown>): Observable<ListResult<PatientPaymentSummary>> {
    return this.get<PaginatedResponse<PatientPaymentSummary>>(`${CONFIG.encounters}/patient-payments`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientPaymentDetail(patientId: string): Observable<PatientPaymentDetail> {
    return this.get<PatientPaymentDetail>(`${CONFIG.encounters}/patient-payments/${patientId}/detail`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  applyEncounterDiscount(encounterId: string, payload: Record<string, unknown>): Observable<ApiResponse<LedgerItem>> {
    return this.post<LedgerItem>(`${CONFIG.encounters}/${encounterId}/apply-discount`, payload);
  }

  getEncounter(id: string): Observable<Encounter> {
    return this.get<Encounter>(`${CONFIG.encounters}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getEncounterLedger(id: string): Observable<EncounterLedger> {
    return this.get<EncounterLedger>(`${CONFIG.encounters}/${id}/ledger`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createEncounterFromAppointment(appointmentId: string): Observable<ApiResponse<Encounter>> {
    return this.post<Encounter>(`${CONFIG.encounters}/from-appointment`, { appointmentId });
  }

  addEncounterLedgerItem(encounterId: string, payload: Record<string, unknown>): Observable<ApiResponse<LedgerItem>> {
    return this.post<LedgerItem>(`${CONFIG.encounters}/${encounterId}/ledger-items`, payload);
  }

  recordEncounterPayment(encounterId: string, payload: Record<string, unknown>): Observable<ApiResponse<LedgerPayment>> {
    return this.post<LedgerPayment>(`${CONFIG.encounters}/${encounterId}/payments`, payload);
  }

  getChargeCatalog(params?: Record<string, unknown>): Observable<ListResult<ChargeCatalogItem>> {
    return this.get<PaginatedResponse<ChargeCatalogItem>>(`${CONFIG.encounters}/charge-catalog`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPayments(params?: Record<string, unknown>): Observable<ListResult<Payment>> {
    return this.get<PaginatedResponse<Payment>>(CONFIG.payments, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPayment(id: string): Observable<Payment> {
    return this.get<Payment>(`${CONFIG.payments}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createPayment(payload: Record<string, unknown>): Observable<ApiResponse<Payment>> {
    return this.post<Payment>(CONFIG.payments, payload);
  }

  getExpenses(params?: Record<string, unknown>): Observable<ListResult<Expense>> {
    return this.get<PaginatedResponse<Expense>>(CONFIG.expenses, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createExpense(payload: Record<string, unknown>): Observable<ApiResponse<Expense>> {
    return this.post<Expense>(CONFIG.expenses, payload);
  }

  updateExpense(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Expense>> {
    return this.patch<Expense>(`${CONFIG.expenses}/${id}`, payload);
  }

  deleteExpense(id: string): Observable<ApiResponse<Expense>> {
    return this.delete<Expense>(`${CONFIG.expenses}/${id}`);
  }

  getRoles(params?: Record<string, unknown>): Observable<Role[]> {
    if (!this.hasPermission('roles.read')) {
      return of([]);
    }

    return this.cachedLookup(this.lookupKey('roles', params), () =>
      this.get<Role[]>(CONFIG.roles, params).pipe(map((response) => this.unwrapData(response)))
    );
  }

  getRole(): Observable<{ data: Role[] }> {
    return this.getRoles().pipe(map((roles) => ({ data: roles })));
  }

  createRole(payload: Record<string, unknown>): Observable<ApiResponse<Role>> {
    return this.post<Role>(CONFIG.roles, payload).pipe(tap(() => this.invalidateLookup('roles')));
  }

  updateRole(
    id: string,
    payload: Record<string, unknown>,
    params?: Record<string, unknown>
  ): Observable<ApiResponse<Role>> {
    const url = params ? `${CONFIG.roles}/${id}?${this.cleanParams(params).toString()}` : `${CONFIG.roles}/${id}`;
    return this.patch<Role>(url, payload).pipe(tap(() => this.invalidateLookup('roles')));
  }

  deleteRole(id: string, params?: Record<string, unknown>): Observable<ApiResponse<Role>> {
    const url = params ? `${CONFIG.roles}/${id}?${this.cleanParams(params).toString()}` : `${CONFIG.roles}/${id}`;
    return this.delete<Role>(url).pipe(tap(() => this.invalidateLookup('roles')));
  }

  getUsers(params?: Record<string, unknown>): Observable<User[]> {
    if (!this.hasPermission('users.read')) {
      return of([]);
    }

    return this.get<User[]>(CONFIG.users, params).pipe(map((response) => this.unwrapData(response)));
  }

  getAllUsers(dataTablesParameters?: any): Observable<DataTablesResponse<User>> {
    return this.getUsers().pipe(
      map((users) => {
        const search = String(dataTablesParameters?.search?.value || '').toLowerCase();
        const filtered = search
          ? users.filter((user) =>
            [user.name, user.email, user.phone, user.role?.name, user.status]
              .join(' ')
              .toLowerCase()
              .includes(search)
          )
          : users;

        return this.toDataTablesResponse(filtered, users.length);
      })
    );
  }

  createUser(payload: Record<string, unknown>): Observable<ApiResponse<User>> {
    return this.post<User>(CONFIG.users, this.withNormalizedEmail(payload));
  }

  getUser(id: string, params?: Record<string, unknown>): Observable<User> {
    return this.get<User>(`${CONFIG.users}/${id}`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  updateUser(
    id: string,
    payload: Record<string, unknown>,
    params?: Record<string, unknown>
  ): Observable<ApiResponse<User>> {
    const url = params ? `${CONFIG.users}/${id}?${this.cleanParams(params).toString()}` : `${CONFIG.users}/${id}`;
    return this.patch<User>(url, this.withNormalizedEmail(payload));
  }

  deleteUser(id: string, params?: Record<string, unknown>): Observable<ApiResponse<User>> {
    const url = params ? `${CONFIG.users}/${id}?${this.cleanParams(params).toString()}` : `${CONFIG.users}/${id}`;
    return this.delete<User>(url);
  }

  uploadUserPhoto(id: string, file: File, params?: Record<string, unknown>): Observable<ApiResponse<User>> {
    const body = new FormData();
    body.append('photo', file);
    const url = params
      ? `${CONFIG.users}/${id}/photo?${this.cleanParams(params).toString()}`
      : `${CONFIG.users}/${id}/photo`;
    return this.http.post<ApiResponse<User>>(url, body);
  }

  deleteUserPhoto(id: string, params?: Record<string, unknown>): Observable<ApiResponse<User>> {
    const url = params
      ? `${CONFIG.users}/${id}/photo?${this.cleanParams(params).toString()}`
      : `${CONFIG.users}/${id}/photo`;
    return this.delete<User>(url);
  }

  getAccountsDashboard(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/dashboard`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getChartOfAccounts(params?: Record<string, unknown>): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.accounts}/chart-of-accounts`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getJournals(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/journals`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createJournal(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.accounts}/journals`, payload);
  }

  getGeneralLedger(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/general-ledger`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getCashBook(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/cash-book`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getBankBook(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/bank-book`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getTrialBalance(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/trial-balance`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getProfitLoss(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/profit-loss`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDailyCollections(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/daily-collections`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDoctorPerformance(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/doctor-performance`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDepartmentPerformance(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/department-performance`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getReportDoctors(params?: Record<string, unknown>): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.accounts}/report-doctors`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPatientProfitability(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/patient-profitability`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getWardAdmissionBill(admissionId: string): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.wardBilling}/admissions/${admissionId}/bill`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getWardDischargeStatement(admissionId: string): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.wardBilling}/admissions/${admissionId}/discharge-statement`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  collectWardPayment(admissionId: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/admissions/${admissionId}/payments`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  collectWardSecurityDeposit(admissionId: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/admissions/${admissionId}/security-deposit`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  addWardCharge(admissionId: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/admissions/${admissionId}/charges`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  listAdmissionRecommendations(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(`${CONFIG.wardBilling}/admission-recommendations`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createAdmissionRecommendation(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/admission-recommendations`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getAdmissionRecommendation(recommendationId: string): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.wardBilling}/admission-recommendations/${recommendationId}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  updateAdmissionRecommendation(recommendationId: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.patch<Record<string, unknown>>(`${CONFIG.wardBilling}/admission-recommendations/${recommendationId}`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  cancelAdmissionRecommendation(recommendationId: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/admission-recommendations/${recommendationId}/cancel`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  acknowledgeAdmissionRecommendation(recommendationId: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/admission-recommendations/${recommendationId}/acknowledge`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getAdmissionRecommendationLookups(params?: Record<string, unknown>): Observable<{
    doctors: Doctor[];
    departments: Department[];
    wards: HospitalWard[];
  }> {
    return this.get<{ doctors: Doctor[]; departments: Department[]; wards: HospitalWard[] }>(
      `${CONFIG.wardBilling}/admission-recommendations/lookups`,
      params
    ).pipe(map((response) => this.unwrapData(response)));
  }

  getHospitalMasterDataOverview(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.baseUrl}/hospital-master-data/overview`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  syncHospitalMasterDataTemplates(payload?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.baseUrl}/hospital-master-data/sync-templates`, payload || {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getNurseryDashboard(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.baseUrl}/nursery/dashboard`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  listNurseryNewborns(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(`${CONFIG.baseUrl}/nursery`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  registerNurseryNewborn(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.baseUrl}/nursery`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getNurseryNewborn(id: string): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.baseUrl}/nursery/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createNurseryFeeding(id: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.baseUrl}/nursery/${id}/feedings`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getBirthRecordsDashboard(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.baseUrl}/birth-records/dashboard`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  listBirthRecords(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(`${CONFIG.baseUrl}/birth-records`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createBirthRecord(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.baseUrl}/birth-records`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getBirthRecord(id: string): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.baseUrl}/birth-records/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  updateBirthRecord(id: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.patch<Record<string, unknown>>(`${CONFIG.baseUrl}/birth-records/${id}`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  verifyBirthRecord(id: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.baseUrl}/birth-records/${id}/verify`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getBirthRecordMotherContext(motherPatientId: string): Observable<BirthRecordMotherContext> {
    return this.get<BirthRecordMotherContext>(`${CONFIG.baseUrl}/birth-records/mother/${motherPatientId}/context`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getMotherNewborns(motherPatientId: string): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.baseUrl}/birth-records/mother/${motherPatientId}/newborns`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  issueBirthCertificate(birthRecordId: string): Observable<BirthCertificateIssueResult> {
    return this.post<BirthCertificateIssueResult>(`${CONFIG.baseUrl}/birth-records/${birthRecordId}/certificates`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getBirthCertificate(id: string): Observable<BirthCertificateDetail> {
    return this.get<BirthCertificateDetail>(`${CONFIG.baseUrl}/birth-records/certificates/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  correctBirthCertificate(id: string, payload: Record<string, unknown>): Observable<BirthCertificateCorrectResult> {
    return this.post<BirthCertificateCorrectResult>(`${CONFIG.baseUrl}/birth-records/certificates/${id}/correct`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  revokeBirthCertificate(id: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.baseUrl}/birth-records/certificates/${id}/revoke`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  recordBirthCertificatePrint(id: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.baseUrl}/birth-records/certificates/${id}/print`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  verifyBirthCertificatePublic(code: string): Observable<BirthCertificateVerificationResult> {
    return this.get<BirthCertificateVerificationResult>(`${CONFIG.baseUrl}/public/birth-certificates/verify/${encodeURIComponent(code)}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  /** Public form verify by certificate number (HBC-…). */
  verifyBirthCertificateByNumber(certificateNo: string): Observable<BirthCertificateVerificationResult> {
    return this.post<BirthCertificateVerificationResult>(`${CONFIG.baseUrl}/public/birth-certificates/verify`, {
      certificateNo: String(certificateNo || '').trim(),
    }).pipe(map((response) => this.unwrapData(response)));
  }

  listWardDoctorVisits(admissionId: string): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.wardBilling}/admissions/${admissionId}/doctor-visits`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createWardDoctorVisit(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/doctor-visits`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  completeWardDoctorVisit(visitId: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/doctor-visits/${visitId}/complete`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  listWardRoster(params?: Record<string, unknown>): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.wardBilling}/roster`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createWardRosterShift(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/roster`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDutyRosterBootstrap(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/bootstrap`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getDutyRosterWeekMatrix(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/week-matrix`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  upsertDutyRosterCoverage(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/coverage`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  previewCopyDutyRosterWeek(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/copy-week/preview`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  copyDutyRosterWeek(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/copy-week`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  publishDutyRosterRange(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/publish`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  previewBulkDutyRoster(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/bulk/preview`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  bulkCreateDutyRoster(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/bulk`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  listPharmacyWardSettlements(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(`${CONFIG.wardBilling}/pharmacy-settlements`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  verifyPharmacyWardSettlement(settlementId: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/pharmacy-settlements/${settlementId}/verify`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  listWardMedicineRequests(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(`${CONFIG.wardBilling}/medicine-requests`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createWardMedicineRequest(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/medicine-requests`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  issueWardMedicineRequest(requestId: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/medicine-requests/${requestId}/issue`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  listWardProcedures(admissionId: string): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.wardBilling}/admissions/${admissionId}/procedures`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createWardProcedure(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/procedures`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  completeWardProcedure(procedureId: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/procedures/${procedureId}/complete`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  cancelWardProcedure(procedureId: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/procedures/${procedureId}/cancel`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  listWardOperations(admissionId: string): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.wardBilling}/admissions/${admissionId}/operations`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createWardOperation(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/operations`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  completeWardOperation(operationId: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/operations/${operationId}/complete`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  cancelWardOperation(operationId: string): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(`${CONFIG.wardBilling}/operations/${operationId}/cancel`, {}).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  updateWardRosterShift(shiftId: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.patch<Record<string, unknown>>(`${CONFIG.wardBilling}/roster/${shiftId}`, payload).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getReceivables(params?: Record<string, unknown>): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.accounts}/receivables`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getPayables(params?: Record<string, unknown>): Observable<Array<Record<string, unknown>>> {
    return this.get<Array<Record<string, unknown>>>(`${CONFIG.accounts}/payables`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getFinancialReconciliation(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.accounts}/reconciliation`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  repairMissingReconciliationJournals(
    payload: Record<string, unknown> = {}
  ): Observable<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(
      `${CONFIG.accounts}/reconciliation/repair-missing-journals`,
      payload
    ).pipe(map((response) => this.unwrapData(response)));
  }

  getPurchases(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(CONFIG.purchases, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createPurchase(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(CONFIG.purchases, payload);
  }

  getPurchaseById(id: string): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.purchases}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  cancelPurchase(id: string, payload: Record<string, unknown> = {}): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.purchases}/${id}/cancel`, payload);
  }

  getPurchaseReturns(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(CONFIG.returns.purchases, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getInventory(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(CONFIG.inventory, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getWardRequisitions(params?: Record<string, unknown>): Observable<ListResult<Record<string, unknown>>> {
    return this.get<PaginatedResponse<Record<string, unknown>>>(`${CONFIG.ward}/requisitions`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createWardRequisition(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/requisitions`, payload);
  }

  issueWardRequisition(id: string): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/requisitions/${id}/issue`, {});
  }

  consumeWardStock(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/stock/consume`, payload);
  }

  reverseExpense(id: string, payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.expenses}/${id}/reverse`, payload);
  }

  receivePurchase(id: string, payload: Record<string, unknown> = {}): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.purchases}/${id}/receive`, payload);
  }

  getPharmacyDashboard(): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.sales}/dashboard`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getWardIo(params?: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`${CONFIG.ward}/io`, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  createWardIo(payload: Record<string, unknown>): Observable<ApiResponse<Record<string, unknown>>> {
    return this.post<Record<string, unknown>>(`${CONFIG.ward}/io`, payload);
  }

  hasPermission(permission: string): boolean {
    const normalizedPermission = normalizeAccessKey(permission);
    const permissions = readStoredPermissions();
    const normalizedPermissions = new Set(
      permissions.map((storedPermission) => normalizeAccessKey(storedPermission))
    );

    return normalizedPermissions.has('*') || normalizedPermissions.has(normalizedPermission);
  }

  getAuditLogs(params?: Record<string, unknown>): Observable<ListResult<AuditLog>> {
    return this.get<PaginatedResponse<AuditLog>>(CONFIG.auditLogs, params).pipe(
      map((response) => this.unwrapData(response))
    );
  }

  getAuditLogById(id: string): Observable<AuditLog> {
    return this.get<AuditLog>(`${CONFIG.auditLogs}/${id}`).pipe(
      map((response) => this.unwrapData(response))
    );
  }

}
