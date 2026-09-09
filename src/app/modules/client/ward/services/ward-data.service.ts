import { Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap, timeout } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BackendService } from '../../../../core/services/backend.service';
import {
  Doctor,
  Encounter,
  LabOrder,
  Patient,
  PatientHistory,
  Prescription,
  Room,
  RoomAllotment,
  HospitalWard,
  WardFloor,
  ListResult,
  ProductCatalogItem,
  Store,
  User,
} from '../../../../shared/models/hospital.model';
import { WardBedRecord, WardGalleryOption, WardRoomRecord } from '../ward-bed-management.models';
import {
  MonitoringCard,
  NursingSummaryRow,
  TodaySummaryRow,
  WardAlertRow,
  WardKpiCard,
  WardSection,
  WardTaskRow,
} from '../ward-dashboard.models';
import { WardModuleKey, WardModuleReportCard, WardModuleRow, WardModuleFilters } from '../ward-module.models';
import { WardPatient } from '../ward-patient-list.models';
import {
  buildFloorOptions,
  buildDashboardAlerts,
  buildDashboardKpis,
  buildDashboardSections,
  buildDashboardTasks,
  getWardOptionsFromCatalog,
  getWardOptionsFromRooms,
  mapAdmissionRows,
  mapAdmissionRecommendationRows,
  mapAllotmentToWardPatient,
  mapDripRows,
  mapMarRows,
  mapNursingRows,
  mapOrderRows,
  mapServiceOrderRows,
  mapRoomToWardBed,
  mapRoomToWardRoom,
  mapVitalsRows,
  mapWardActivityRows,
  mapWardApiBedToRecord,
  filterModuleRows,
  WardActivityRecord,
  matchesWardFilter,
  normalizeHospitalWardRecord,
  normalizeHospitalWardRecords,
  normalizeWardFloorRecord,
  normalizeWardFloorRecords,
  normalizeWardVitalsRecord,
  normalizeEntityId,
  resolvePrescriptionPatientId,
  wardRoomPayloadFromForm,
  WardVitalTimelineEntry,
} from './ward-api.mapper';

export interface WardBedManagementData {
  rooms: WardRoomRecord[];
  beds: WardBedRecord[];
  wardOptions: string[];
  hospitalWards: HospitalWard[];
  wardFloors: WardFloor[];
  floorOptions: WardGalleryOption[];
}

export interface WardDashboardData {
  kpiCards: WardKpiCard[];
  bedSections: WardSection[];
  todaySummary: TodaySummaryRow[];
  todayAlerts: WardAlertRow[];
  nursingTasks: WardTaskRow[];
  nursingSummary: NursingSummaryRow[];
  monitoringCards: MonitoringCard[];
  wardOptions: string[];
}

export interface WardClinicalBundle {
  allotments: RoomAllotment[];
  rooms: Room[];
  hospitalWards: HospitalWard[];
  doctors: Doctor[];
  patients: Patient[];
  history: PatientHistory[];
  prescriptions: Prescription[];
  encounters: Encounter[];
  labOrders: LabOrder[];
  activities: WardActivityRecord[];
  wardBeds: Record<string, unknown>[];
}

@Injectable({ providedIn: 'root' })
export class WardDataService {
  constructor(private backend: BackendService) {}

  private emptyList<T>(): ListResult<T> {
    return {
      items: [],
      pagination: { page: 1, limit: 0, total: 0, totalPages: 0 },
    };
  }

  private safeList<T>(request: Observable<ListResult<T>>): Observable<ListResult<T>> {
    return request.pipe(
      timeout(12000),
      catchError(() => of(this.emptyList<T>()))
    );
  }

  loadClinicalBundle(): Observable<WardClinicalBundle> {
    return forkJoin({
      allotments: this.safeList(this.backend.getRoomAllotments({ limit: 100 })),
      rooms: this.safeList(this.backend.getRooms({ limit: 100 })),
      hospitalWards: this.safeList(this.backend.getHospitalWards({ limit: 100 })),
      doctors: this.safeList(this.backend.getDoctors({ limit: 100 })),
      patients: this.safeList(this.backend.getPatients({ limit: 100 })),
      history: this.safeList(this.backend.getPatientHistoryRecords({ recordType: 'ward', limit: 100 })),
      prescriptions: this.safeList(this.backend.getPrescriptions({ limit: 100 })),
      encounters: this.safeList(this.backend.getEncounters({ type: 'admission', limit: 100 })),
      labOrders: this.safeList(this.backend.getLabOrders({ limit: 100 })),
      activities: this.safeList(this.backend.getWardActivities({ limit: 100 })),
      wardBeds: this.safeList(this.backend.getWardBeds({ limit: 100 })),
    }).pipe(
      map((result) => ({
        allotments: result.allotments.items,
        rooms: result.rooms.items,
        hospitalWards: normalizeHospitalWardRecords(result.hospitalWards.items),
        doctors: result.doctors.items,
        patients: result.patients.items,
        history: result.history.items,
        prescriptions: result.prescriptions.items,
        encounters: result.encounters.items,
        labOrders: result.labOrders.items,
        activities: result.activities.items as unknown as WardActivityRecord[],
        wardBeds: result.wardBeds.items,
      })),
      catchError(() =>
        of({
          allotments: [],
          rooms: [],
          hospitalWards: [],
          doctors: [],
          patients: [],
          history: [],
          prescriptions: [],
          encounters: [],
          labOrders: [],
          activities: [],
          wardBeds: [],
        })
      )
    );
  }

  loadAdmittedPatients(wardFilter = ''): Observable<WardPatient[]> {
    return this.loadClinicalBundle().pipe(
      map((bundle) => {
        const roomById = new Map(bundle.rooms.map((room) => [String(room._id), room]));
        return bundle.allotments
          .map((allotment) => ({
            ...allotment,
            room: roomById.get(String(allotment.roomId)) || allotment.room || null,
          }))
          .filter((allotment) => matchesWardFilter(allotment.room, wardFilter))
          .map((allotment) =>
            mapAllotmentToWardPatient(
              allotment,
              bundle.doctors,
              bundle.history,
              bundle.prescriptions,
              bundle.encounters,
              bundle.hospitalWards
            )
          );
      })
    );
  }

  loadPatientByAdmission(admissionId: string): Observable<WardPatient | null> {
    return forkJoin({
      allotment: this.backend.getRoomAllotment(admissionId),
      doctors: this.backend.getDoctors({ limit: 100 }),
      history: this.backend.getPatientHistoryRecords({ recordType: 'ward', limit: 100 }),
      prescriptions: this.backend.getPrescriptions({ limit: 100 }),
      encounters: this.backend.getEncounters({ type: 'admission', limit: 100 }),
    }).pipe(
      map((result) =>
        mapAllotmentToWardPatient(
          result.allotment,
          result.doctors.items,
          result.history.items,
          result.prescriptions.items,
          result.encounters.items
        )
      ),
      catchError(() => of(null))
    );
  }

  loadBedManagement(wardFilter = ''): Observable<WardBedManagementData> {
    return this.safeList(this.backend.getHospitalWards({ limit: 100 })).pipe(
      switchMap((hospitalWards) => {
        const wards = normalizeHospitalWardRecords(hospitalWards.items);
        const floors$ =
          wards.length === 0
            ? of([] as WardFloor[])
            : forkJoin(
                wards.map((ward) =>
                  this.safeList(this.backend.getWardFloors(ward._id, { limit: 100 })).pipe(
                    map((response) => normalizeWardFloorRecords(response.items, ward._id))
                  )
                )
              ).pipe(map((groups) => groups.flat()));

        return forkJoin({
          wards: of(wards),
          floors: floors$,
          rooms: this.safeList(this.backend.getRooms({ limit: 100 })),
          allotments: this.safeList(this.backend.getRoomAllotments({ status: 'admitted', limit: 100 })),
          wardBeds: this.safeList(this.backend.getWardBeds({ limit: 100 })),
        });
      }),
      map(({ wards, floors, rooms, allotments, wardBeds }) => {
        const wardFloors = floors as WardFloor[];
        const activeWard = wards.find((ward) => ward.name === wardFilter) || wards[0];
        const allRooms = rooms.items;
        const wardRooms = allRooms.map((room) => {
          const allotment = allotments.items.find((item) => item.roomId === room._id && item.status === 'admitted');
          return mapRoomToWardRoom(room, allotment);
        });

        const roomIds = new Set(allRooms.map((room) => String(room._id)));
        const admittedAllotments = allotments.items.filter((item) => item.status === 'admitted');
        const claimedLegacyAllotments = new Set<string>();
        const findAllotmentForBed = (bed: Record<string, unknown>): RoomAllotment | undefined => {
          const bedId = normalizeEntityId(bed['_id']);
          const roomId = String(bed['roomId'] || '');
          const direct = admittedAllotments.find((item) => normalizeEntityId(item.bedId) === bedId);
          if (direct) {
            return direct;
          }

          const legacyInRoom = admittedAllotments.filter(
            (item) =>
              !normalizeEntityId(item.bedId) &&
              String(item.roomId) === roomId &&
              !claimedLegacyAllotments.has(normalizeEntityId(item._id))
          );
          const bedNo = String(bed['bedNo'] || '');
          const legacy =
            legacyInRoom.find((item) => String(item.bedLabel || '') === bedNo) ||
            legacyInRoom[0];
          if (legacy) {
            claimedLegacyAllotments.add(normalizeEntityId(legacy._id));
          }
          return legacy;
        };
        const apiBedsByRoom = new Map<string, WardBedRecord[]>();
        wardBeds.items
          .filter((bed) => roomIds.has(String(bed['roomId'])))
          .forEach((bed) => {
            const allotment = findAllotmentForBed(bed);
            const record = mapWardApiBedToRecord(bed, allotment);
            const roomKey = String(record.roomId);
            const group = apiBedsByRoom.get(roomKey) || [];
            group.push(record);
            apiBedsByRoom.set(roomKey, group);
          });

        const fallbackBeds = allRooms.flatMap((room) => {
          const persisted = apiBedsByRoom.get(String(room._id));
          if (persisted?.length) {
            return persisted;
          }

          const allotment = admittedAllotments.find(
            (item) => item.roomId === room._id && !normalizeEntityId(item.bedId)
          );
          return [mapRoomToWardBed(room, allotment)];
        });

        return {
          rooms: wardRooms,
          beds: fallbackBeds,
          wardOptions: wards.length
            ? getWardOptionsFromCatalog(wards)
            : getWardOptionsFromRooms(rooms.items, wards),
          hospitalWards: wards,
          wardFloors,
          floorOptions: buildFloorOptions(wardFloors, activeWard?._id || ''),
        };
      })
    );
  }

  refreshHospitalWards(search = ''): Observable<HospitalWard[]> {
    const params: Record<string, unknown> = { limit: 100 };
    const query = search.trim();
    if (query) {
      params['search'] = query;
    }

    return this.safeList(this.backend.getHospitalWards(params)).pipe(
      map((result) => normalizeHospitalWardRecords(result.items)),
      switchMap((wards) => {
        if (wards.length || !query) {
          return of(wards);
        }

        return this.safeList(this.backend.getHospitalWards({ limit: 100 })).pipe(
          map((fallback) =>
            normalizeHospitalWardRecords(fallback.items).filter(
              (ward) => ward.name.toLowerCase() === query.toLowerCase()
            )
          )
        );
      })
    );
  }

  createHospitalWard(payload: Record<string, unknown>) {
    return this.backend.createHospitalWard(payload);
  }

  createWardFloor(wardId: string, payload: Record<string, unknown>) {
    return this.backend.createWardFloor(wardId, payload);
  }

  loadWardFloors(wardId: string) {
    return this.backend.getWardFloors(wardId, { limit: 100, status: 'active' });
  }

  loadWardFilterOptions(): Observable<string[]> {
    return this.refreshHospitalWards().pipe(
      map((wards) => (wards.length ? getWardOptionsFromCatalog(wards) : [])),
      catchError(() => of([] as string[]))
    );
  }

  fetchWardFloors(wardId: string): Observable<WardFloor[]> {
    const id = String(wardId || '').trim();
    if (!id) {
      return of([]);
    }

    return this.backend.getWardFloors(id, { limit: 100 }).pipe(
      map((result) => normalizeWardFloorRecords(result.items, id)),
      catchError(() => of([] as WardFloor[]))
    );
  }

  loadDashboard(wardFilter = ''): Observable<WardDashboardData> {
    return forkJoin({
      summary: this.backend.getWardDashboard().pipe(catchError(() => of({} as Record<string, unknown>))),
      allotments: this.safeList(this.backend.getRoomAllotments({ limit: 100, status: 'admitted' })),
      rooms: this.safeList(this.backend.getRooms({ limit: 100 })),
      hospitalWards: this.safeList(this.backend.getHospitalWards({ limit: 100 })),
      wardBeds: this.safeList(this.backend.getWardBeds({ limit: 100 })),
    }).pipe(
      map((result) => {
        const wards = normalizeHospitalWardRecords(result.hospitalWards.items);
        const allRooms = result.rooms.items;
        const allAllotments = result.allotments.items;
        const scopedRooms = wardFilter
          ? allRooms.filter((room) => matchesWardFilter(room, wardFilter, wards))
          : allRooms;
        const scopedAllotments = wardFilter
          ? allAllotments.filter((item) => matchesWardFilter(item.room, wardFilter, wards))
          : allAllotments;
        const summary = ((result.summary as Record<string, unknown>)['summary'] || {}) as Record<string, number>;
        const bundleContext = {
          doctors: [],
          history: [],
          prescriptions: [],
          encounters: [],
          labOrders: [],
          activities: [],
        };
        const dashboardRooms = wardFilter ? scopedRooms : allRooms;
        const dashboardAllotments = wardFilter ? scopedAllotments : allAllotments;
        const dashboardRoomIds = new Set(dashboardRooms.map((room) => String(room._id)));
        const dashboardWardBeds = result.wardBeds.items.filter((bed) =>
          dashboardRoomIds.has(normalizeEntityId(bed['roomId']) || normalizeEntityId((bed['room'] as Record<string, unknown> | undefined)?.['_id']))
        );
        const kpiValue = (key: string, fallback: number) => Number(summary[key] ?? fallback);
        return {
          kpiCards: [
            { key: 'occupied', label: 'Occupied Beds', value: kpiValue('occupiedBeds', dashboardAllotments.length), icon: 'fa-bed', tone: 'blue', route: '/ward/bed-management' },
            { key: 'available', label: 'Available Beds', value: kpiValue('availableBeds', 0), icon: 'fa-check', tone: 'green', route: '/ward/bed-management' },
            { key: 'occupancy', label: 'Occupancy', value: kpiValue('occupancyPercent', 0), percent: kpiValue('occupancyPercent', 0), icon: 'fa-pie-chart', tone: 'purple', route: '/ward/reports' },
            { key: 'admissions', label: 'Admissions Today', value: kpiValue('admissionsToday', 0), icon: 'fa-user-plus', tone: 'teal', route: '/ward/admissions' },
            { key: 'discharges', label: 'Discharges Today', value: kpiValue('dischargesToday', 0), icon: 'fa-sign-out', tone: 'amber', route: '/ward/admissions' },
            { key: 'orders', label: 'Pending Orders', value: kpiValue('pendingOrders', 0), icon: 'fa-list', tone: 'red', route: '/ward/orders-services' },
            { key: 'mar', label: 'MAR Overdue', value: kpiValue('medicationOverdue', 0), icon: 'fa-medkit', tone: 'red', route: '/ward/mar' },
            { key: 'unassigned', label: 'Unassigned', value: kpiValue('patientsWithoutNurse', 0), icon: 'fa-user', tone: 'amber', route: '/ward/nurses-staff' },
          ],
          bedSections: buildDashboardSections(dashboardRooms, dashboardAllotments, wards, bundleContext, dashboardWardBeds),
          todaySummary: [
            { label: 'Admitted Patients', value: kpiValue('myActivePatients', dashboardAllotments.length), route: '/ward/patient-list' },
            { label: 'Admissions Today', value: kpiValue('admissionsToday', 0), route: '/ward/admissions' },
            { label: 'Transfers Today', value: kpiValue('transfersToday', 0), route: '/ward/reports' },
            { label: 'Discharges Today', value: kpiValue('dischargesToday', 0), route: '/ward/admissions' },
          ],
          todayAlerts: [],
          nursingTasks: [],
          nursingSummary: [
            { label: 'Pending Handovers', value: kpiValue('pendingHandovers', 0), tone: 'amber', route: '/ward/shift-handover' },
            { label: 'Pending Orders', value: kpiValue('pendingOrders', 0), tone: 'red', route: '/ward/orders-services' },
            { label: 'MAR Recorded', value: kpiValue('medicationRecorded', 0), tone: 'green', route: '/ward/mar' },
            { label: 'MAR Overdue', value: kpiValue('medicationOverdue', 0), tone: 'red', route: '/ward/mar' },
          ],
          monitoringCards: [
            { key: 'admissions', label: 'Admitted Patients', value: kpiValue('myActivePatients', dashboardAllotments.length), actionLabel: 'View List', route: '/ward/patient-list', icon: 'fa-user-plus', tone: 'blue' },
            { key: 'occupancy', label: 'Occupancy', value: kpiValue('occupancyPercent', 0), actionLabel: 'Beds', route: '/ward/bed-management', icon: 'fa-bed', tone: 'green' },
            { key: 'orders', label: 'Pending Orders', value: kpiValue('pendingOrders', 0), actionLabel: 'Open Orders', route: '/ward/orders-services', icon: 'fa-list', tone: 'teal' },
            { key: 'alerts', label: 'Unassigned Nurses', value: kpiValue('patientsWithoutNurse', 0), actionLabel: 'Assign', route: '/ward/nurses-staff', icon: 'fa-exclamation-triangle', tone: 'red' },
          ],
          wardOptions: getWardOptionsFromRooms(allRooms, wards),
        } as WardDashboardData;
      })
    );
  }

  loadModuleRows(
    moduleKey: WardModuleKey,
    tab: string,
    search: string,
    filters: WardModuleFilters = {}
  ): Observable<WardModuleRow[]> {
    if (moduleKey === 'io-chart') {
      return forkJoin({
        io: this.backend.getWardIo({ limit: 200, ...filters }),
        patients: this.safeList(this.backend.getPatients({ limit: 100 })),
      }).pipe(
        map(({ io, patients }) => {
          const nameById = new Map(
            patients.items.map((patient) => [
              String(patient._id),
              `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.patientNo || '',
            ])
          );
          const items = ((io['items'] as Array<Record<string, unknown>>) || []) as Array<Record<string, unknown>>;
          return items.map((entry) => {
            const direction = String(entry['direction'] || '');
            const volume = String(entry['volumeMl'] || 0);
            const rawPatientId = entry['patientId'];
            const patientId =
              rawPatientId && typeof rawPatientId === 'object'
                ? String((rawPatientId as { _id?: string })._id || '')
                : String(rawPatientId || '');
            const patient = entry['patient'] as { name?: string; firstName?: string; lastName?: string } | undefined;
            const patientName =
              String(entry['patientName'] || '').trim() ||
              String(patient?.name || '').trim() ||
              `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() ||
              nameById.get(patientId) ||
              '';
            return {
              id: String(entry['_id']),
              cells: {
                patient: patientName || '—',
                intake: direction === 'INTAKE' ? volume : '0',
                output: direction === 'OUTPUT' ? volume : '0',
                balance: '',
                shift: String(entry['shift'] || ''),
                status: 'Recorded',
                _tab: String(entry['shift'] || 'all'),
              },
              badgeTone: { status: 'completed' },
              meta: {
                patientId,
                admissionId: String(entry['admissionId'] || ''),
              },
            } as WardModuleRow;
          });
        }),
        catchError(() => this.loadClinicalBundle().pipe(
          map((bundle) => this.rowsFromClinicalBundle(bundle, moduleKey, tab, search, filters))
        ))
      );
    }

    if (moduleKey === 'inventory') {
      return forkJoin({
        inventory: this.backend.getInventory({ locationType: 'ward', limit: 100 }).pipe(
          catchError(() => of({ items: [] as Array<Record<string, unknown>> }))
        ),
        requisitions: this.backend.getWardRequisitions({ limit: 100 }).pipe(
          catchError(() => of({ items: [] as Array<Record<string, unknown>> }))
        ),
        wards: this.backend.getHospitalWards({ limit: 100 }).pipe(
          catchError(() => of({ items: [] as HospitalWard[], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } }))
        ),
      }).pipe(
        map(({ inventory, requisitions, wards }) => {
          const wardNameById = new Map(
            (wards.items || []).map((ward) => [String(ward._id), ward.name])
          );
          const stockRows = (inventory.items || []).map((item) => {
            const product = item['product'] as {
              name?: string;
              sku?: string;
              productCode?: string;
              unit?: string;
              category?: string;
            } | undefined;
            const location = item['location'] as { name?: string } | undefined;
            const qty = Number(item['availableQuantity'] || item['quantity'] || item['qty'] || 0);
            const reorder = Number(item['reorderLevel'] || 0);
            const out = qty <= 0;
            const low = !out && reorder > 0 && qty <= reorder;
            const status = out ? 'Out of Stock' : low ? 'Low Stock' : 'In Stock';
            const updated = item['updatedAt'] || item['lastUpdated'];
            return {
              id: String(item['_id']),
              cells: {
                item: String(item['productName'] || product?.name || item['name'] || item['productId'] || 'Stock'),
                code: String(item['sku'] || item['productCode'] || product?.sku || product?.productCode || '—'),
                category: String(product?.category || item['category'] || item['locationType'] || 'ward'),
                stock: String(qty),
                reorder: reorder ? String(reorder) : String(item['reorderLevel'] || '—'),
                unit: String(item['unit'] || product?.unit || 'pcs'),
                location: String(item['locationName'] || location?.name || item['locationId'] || 'Ward'),
                status,
                updatedAt: updated ? new Date(String(updated)).toLocaleString() : '—',
                _tab: out ? 'out' : low ? 'low' : 'stock',
                _kind: 'stock',
                _productId: String(item['productId'] || product && (product as { _id?: string })._id || ''),
              },
              badgeTone: { status: out ? 'critical' : low ? 'low' : 'completed' },
            };
          });
          const reqRows = (requisitions.items || []).map((item) => {
            const statusRaw = String(item['status'] || 'requested').toLowerCase();
            const wardRef = item['wardId'] as { _id?: string; name?: string } | string | undefined;
            const wardId = typeof wardRef === 'object' && wardRef ? String(wardRef._id || '') : String(wardRef || '');
            const wardName =
              String(item['wardName'] || '').trim() ||
              (typeof wardRef === 'object' ? String(wardRef?.name || '') : '') ||
              wardNameById.get(wardId) ||
              wardId;
            const firstItem = ((item['items'] as Array<Record<string, unknown>>) || [])[0];
            return {
              id: String(item['_id']),
              cells: {
                item: String(firstItem?.['productName'] || item['requisitionNo'] || 'WRQ'),
                code: String(item['requisitionNo'] || '—'),
                category: 'Requisition',
                stock: String(((item['items'] as unknown[]) || []).length),
                reorder: '—',
                unit: 'req',
                location: wardName || 'Ward',
                status: statusRaw === 'issued' || statusRaw === 'received' ? 'Issued' : 'Requested',
                updatedAt: item['updatedAt'] ? new Date(String(item['updatedAt'])).toLocaleString() : '—',
                _tab: 'requested',
                _kind: 'requisition',
              },
              badgeTone: { status: statusRaw === 'issued' || statusRaw === 'received' ? 'completed' : 'pending' },
            };
          });
          return [...stockRows, ...reqRows] as WardModuleRow[];
        })
      );
    }

    if (moduleKey === 'admissions') {
      return forkJoin({
        bundle: this.loadClinicalBundle(),
        recommendations: this.backend.listAdmissionRecommendations({ limit: 100 }).pipe(
          map((result) => result.items || []),
          catchError(() => of([] as Array<Record<string, unknown>>))
        ),
      }).pipe(
        map(({ bundle, recommendations }) => {
          const baseRows = this.rowsFromClinicalBundle(bundle, moduleKey, tab, search, filters);
          const pendingRecommendations = recommendations.filter(
            (item) => !['admitted'].includes(String(item['status'] || ''))
          );
          const recommendationRows = mapAdmissionRecommendationRows(pendingRecommendations, bundle.doctors);
          return [...recommendationRows, ...baseRows];
        }),
        catchError(() =>
          this.backend.listAdmissionRecommendations({ limit: 100 }).pipe(
            map((result) =>
              mapAdmissionRecommendationRows(
                (result.items || []).filter((item) => !['admitted'].includes(String(item['status'] || ''))),
                []
              )
            ),
            catchError(() => of([] as WardModuleRow[]))
          )
        )
      );
    }

    return this.loadClinicalBundle().pipe(
      map((bundle) => this.rowsFromClinicalBundle(bundle, moduleKey, tab, search, filters)),
      catchError(() => of([] as WardModuleRow[]))
    );
  }

  rowsFromClinicalBundle(
    bundle: WardClinicalBundle,
    moduleKey: WardModuleKey,
    tab: string,
    search: string,
    filters: WardModuleFilters = {}
  ): WardModuleRow[] {
        let rows: WardModuleRow[] = [];
        const roomById = new Map(bundle.rooms.map((room) => [String(room._id), room]));
        const enrichedAllotments = bundle.allotments.map((allotment) => ({
          ...allotment,
          room: roomById.get(String(allotment.roomId)) || allotment.room || null,
        }));

        switch (moduleKey) {
          case 'admissions': {
            const admitted = mapAdmissionRows(enrichedAllotments, bundle.doctors);
            const pending = mapWardActivityRows(
              bundle.activities.filter((item) => item.activityType === 'admission_request'),
              'admission_request'
            );
            rows = [...admitted, ...pending];
            break;
          }
          case 'nursing-care':
            rows = [
              ...mapWardActivityRows(
                bundle.activities.filter(
                  (item) => item.activityType === 'nursing_task' || item.activityType === 'care_plan'
                ),
                'nursing_task'
              ),
              ...mapNursingRows(bundle.history),
            ];
            break;
          case 'mar':
            rows = [
              ...mapWardActivityRows(
                bundle.activities.filter((item) => item.activityType === 'mar_dose'),
                'mar_dose'
              ),
              ...mapMarRows(bundle.prescriptions),
            ];
            break;
          case 'drips-iv':
            rows = mapDripRows(bundle.prescriptions);
            break;
          case 'vitals':
            rows = mapVitalsRows(bundle.history, bundle.prescriptions, enrichedAllotments);
            break;
          case 'io-chart':
            rows = mapWardActivityRows(
              bundle.activities.filter((item) => item.activityType === 'io_entry'),
              'io_entry'
            );
            break;
          case 'orders-services':
            rows = [
              ...mapOrderRows(bundle.labOrders, bundle.prescriptions),
              ...mapServiceOrderRows(
                bundle.activities.filter(
                  (item) =>
                    item.activityType === 'nursing_task' &&
                    Boolean((item.metadata as Record<string, unknown> | undefined)?.['orderType'])
                )
              ),
            ];
            break;
          case 'shift-handover':
            rows = mapWardActivityRows(
              bundle.activities.filter((item) => item.activityType === 'handover'),
              'handover'
            );
            break;
          case 'inventory':
            rows = mapWardActivityRows(
              bundle.activities.filter((item) => item.activityType === 'inventory'),
              'inventory'
            );
            break;
          default:
            rows = [];
        }

        rows = filterModuleRows(rows, enrichedAllotments, filters);

        const admissionByPatient = new Map(
          enrichedAllotments
            .filter((item) => item.status === 'admitted')
            .map((item) => [String(item.patientId), String(item._id)])
        );
        rows = rows.map((row) => {
          const patientId = row.meta?.patientId;
          const admissionId =
            row.meta?.admissionId || (patientId ? admissionByPatient.get(String(patientId)) : undefined);
          if (!admissionId) {
            return row;
          }
          return {
            ...row,
            linkRoute: `/ward/patient-detail/${admissionId}`,
            meta: { ...row.meta, admissionId },
          };
        });

        const normalizedSearch = search.trim().toLowerCase();
        return rows.filter((row) => {
          const tabValue = row.cells['_tab'] || 'all';
          if (tab !== 'all' && tabValue !== tab) {
            return false;
          }
          if (!normalizedSearch) {
            return true;
          }
          return Object.values(row.cells).join(' ').toLowerCase().includes(normalizedSearch);
        });
  }

  loadPatientDetail(admissionId: string): Observable<{
    patient: WardPatient | null;
    vitals: WardModuleRow[];
    mar: WardModuleRow[];
    drips: WardModuleRow[];
    nursing: WardModuleRow[];
    orders: WardModuleRow[];
    io: WardModuleRow[];
    handover: WardModuleRow[];
    prescriptions: Prescription[];
    marActivities: WardActivityRecord[];
  }> {
    return this.loadClinicalBundle().pipe(
      switchMap((bundle) => {
        const fromList = bundle.allotments.find((item) => String(item._id) === String(admissionId));
        const allotment$ = fromList
          ? of(fromList)
          : this.backend.getRoomAllotment(admissionId).pipe(catchError(() => of(null)));

        return allotment$.pipe(
          map((allotment) => {
            const roomById = new Map(bundle.rooms.map((room) => [String(room._id), room]));
            const enriched = allotment
              ? {
                  ...allotment,
                  room: roomById.get(String(allotment.roomId)) || allotment.room || null,
                }
              : null;
            const patient = enriched
              ? mapAllotmentToWardPatient(
                  enriched,
                  bundle.doctors,
                  bundle.history,
                  bundle.prescriptions,
                  bundle.encounters,
                  bundle.hospitalWards
                )
              : null;
            const filters = { admissionId, patientId: patient?.patientId || '' };
            const marActivities = bundle.activities.filter(
              (item) =>
                item.activityType === 'mar_dose' &&
                (String(item.admissionId || '') === String(admissionId) ||
                  String(item.patientId || '') === String(patient?.patientId || ''))
            );
            const prescriptions = bundle.prescriptions.filter(
              (item) => String(resolvePrescriptionPatientId(item) || '') === String(patient?.patientId || '')
            );
            return {
              patient,
              vitals: this.rowsFromClinicalBundle(bundle, 'vitals', 'all', '', filters),
              mar: this.rowsFromClinicalBundle(bundle, 'mar', 'all', '', filters),
              drips: this.rowsFromClinicalBundle(bundle, 'drips-iv', 'all', '', filters),
              nursing: this.rowsFromClinicalBundle(bundle, 'nursing-care', 'all', '', filters),
              orders: this.rowsFromClinicalBundle(bundle, 'orders-services', 'all', '', filters),
              io: this.rowsFromClinicalBundle(bundle, 'io-chart', 'all', '', filters),
              handover: this.rowsFromClinicalBundle(bundle, 'shift-handover', 'all', '', filters),
              prescriptions,
              marActivities,
            };
          })
        );
      })
    );
  }

  loadReportCards(tab: string, search: string): Observable<WardModuleReportCard[]> {
    return this.backend.getWardReports().pipe(
      map((data) => {
        const cards: WardModuleReportCard[] = (data['reports'] as Array<Record<string, string>> | undefined)?.map(
          (item) => ({
            id: item['id'] || '',
            title: item['title'] || '',
            description: item['description'] || '',
            actionLabel: 'Open Report',
            category: item['category'] || '',
          })
        ) || [];

        const normalizedSearch = search.trim().toLowerCase();
        return cards.filter(
          (card) => !normalizedSearch || `${card.title} ${card.description}`.toLowerCase().includes(normalizedSearch)
        );
      }),
      catchError(() => this.loadClinicalBundle().pipe(
        map((bundle) => [
          { id: 'occupancy', title: 'Ward Occupancy Summary', description: `${bundle.allotments.length} admitted patients`, actionLabel: 'Open Report', category: 'occupancy' },
          { id: 'records', title: 'Ward Clinical Records', description: `${bundle.history.length} ward notes`, actionLabel: 'Open Report', category: 'nursing' },
        ])
      ))
    );
  }

  loadActionOptions(): Observable<WardClinicalBundle> {
    return forkJoin({
      allotments: this.safeList(this.backend.getRoomAllotments({ status: 'admitted', limit: 100 })),
      rooms: this.safeList(this.backend.getRooms({ limit: 100 })),
      doctors: this.safeList(this.backend.getDoctors({ limit: 100 })),
      patients: this.safeList(this.backend.getPatients({ limit: 100 })),
      prescriptions: this.safeList(this.backend.getPrescriptions({ limit: 100 })),
    }).pipe(
      map((result) => ({
        allotments: result.allotments.items,
        rooms: result.rooms.items,
        hospitalWards: [],
        doctors: result.doctors.items,
        patients: result.patients.items,
        history: [],
        prescriptions: result.prescriptions.items,
        encounters: [],
        labOrders: [],
        activities: [],
        wardBeds: [],
      })),
      catchError(() =>
        of({
          allotments: [],
          rooms: [],
          hospitalWards: [],
          doctors: [],
          patients: [],
          history: [],
          prescriptions: [],
          encounters: [],
          labOrders: [],
          activities: [],
          wardBeds: [],
        })
      )
    );
  }

  loadPatientVitalsTimeline(patientId: string): Observable<WardVitalTimelineEntry[]> {
    const normalizedPatientId = normalizeEntityId(patientId);
    if (!normalizedPatientId) {
      return of([]);
    }

    return this.loadClinicalBundle().pipe(
      map((bundle) => {
        const fromHistory = bundle.history
          .filter(
            (item) =>
              normalizeEntityId(item.patientId) === normalizedPatientId &&
              item.vitals &&
              Object.values(item.vitals).some((value) => String(value || '').trim())
          )
          .map((item) => ({
            createdAt: item.createdAt,
            vitals: normalizeWardVitalsRecord(item.vitals || {}),
          }));

        const fromPrescriptions = bundle.prescriptions
          .filter(
            (prescription) =>
              resolvePrescriptionPatientId(prescription) === normalizedPatientId &&
              prescription.vitals &&
              Object.values(prescription.vitals).some((value) => String(value || '').trim())
          )
          .map((prescription) => ({
            createdAt: prescription.createdAt,
            vitals: normalizeWardVitalsRecord(prescription.vitals || {}),
          }));

        return [...fromHistory, ...fromPrescriptions].sort(
          (first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime()
        );
      })
    );
  }

  findPatient(patientId: string): Observable<Patient | null> {
    const normalizedPatientId = normalizeEntityId(patientId);
    return this.loadClinicalBundle().pipe(
      map((bundle) => bundle.patients.find((patient) => normalizeEntityId(patient._id) === normalizedPatientId) || null)
    );
  }

  loadInventoryFormOptions(): Observable<{
    products: ProductCatalogItem[];
    stores: Store[];
    wards: HospitalWard[];
  }> {
    return forkJoin({
      products: this.backend.getProducts({ limit: 200, isActive: true }).pipe(
        map((result) => result.items || []),
        catchError(() => of([] as ProductCatalogItem[]))
      ),
      stores: this.backend.getStores({ limit: 100, isActive: true }).pipe(
        map((result) => result.items || []),
        catchError(() => of([] as Store[]))
      ),
      wards: this.backend.getHospitalWards({ limit: 100 }).pipe(
        map((result) => result.items || []),
        catchError(() => of([] as HospitalWard[]))
      ),
    });
  }

  submitModuleAction(moduleKey: WardModuleKey, payload: Record<string, unknown>): Observable<unknown> {
    switch (moduleKey) {
      case 'admissions':
        return this.backend.createWardAdmission(payload);
      case 'nursing-care':
        return this.backend.createWardActivity({
          activityType: payload['activityType'] === 'care_plan' ? 'care_plan' : 'nursing_task',
          patientId: payload['patientId'],
          admissionId: payload['admissionId'] || undefined,
          title: payload['title'],
          description: payload['description'] || undefined,
          priority: payload['priority'] || 'normal',
          shift: payload['shift'] || undefined,
          status: 'due',
          metadata: {
            noteType: payload['noteType'] || 'routine',
          },
        });
      case 'mar':
        return this.backend.recordWardDose(payload);
      case 'drips-iv':
        return this.backend.wardDripAction({ action: 'start', ...payload });
      case 'vitals':
        return this.backend.recordWardVitals(payload);
      case 'io-chart':
        return this.backend.createWardIo({
          patientId: payload['patientId'],
          admissionId: payload['admissionId'] || undefined,
          direction: payload['direction'] || (Number(payload['intake'] || 0) > 0 ? 'INTAKE' : 'OUTPUT'),
          category: payload['ioCategory'] || payload['category'] || 'Other',
          volumeMl: payload['volumeMl'] || payload['intake'] || payload['output'] || 0,
          shift: payload['shift'] || undefined,
          notes: payload['notes'] || payload['description'] || '',
        });
      case 'orders-services':
        return this.backend.createWardOrder(payload);
      case 'shift-handover':
        return this.backend.createWardActivity({
          activityType: 'handover',
          patientId: payload['patientId'],
          admissionId: payload['admissionId'] || undefined,
          title: payload['title'] || 'Handover',
          description: payload['description'] || undefined,
          shift: payload['shift'] || undefined,
          status: 'completed',
          metadata: {
            nurseName: payload['nurseName'],
            pending: payload['pending'],
            patientCondition: payload['patientCondition'],
            pendingMedicines: payload['pendingMedicines'],
            pendingLabs: payload['pendingLabs'],
            runningDrips: payload['runningDrips'],
            specialInstructions: payload['specialInstructions'],
            riskAlerts: payload['riskAlerts'],
            doctorInformed: payload['doctorInformed'],
          },
        });
      case 'inventory':
        if (payload['productId'] && payload['wardId'] && payload['fromLocationId']) {
          return this.backend.createWardRequisition({
            wardId: payload['wardId'],
            fromLocationType: payload['fromLocationType'] || 'store',
            fromLocationId: payload['fromLocationId'],
            notes: payload['notes'] || payload['description'] || '',
            items: [
              {
                productId: payload['productId'],
                requestedQty: payload['quantity'] || payload['qty'] || 1,
              },
            ],
          });
        }
        return this.backend.consumeWardStock({
          productId: payload['productId'],
          wardId: payload['wardId'] || payload['location'],
          quantity: payload['quantity'],
          reason: payload['category'] === 'Damage' ? 'WARD_DAMAGE' : 'WARD_CONSUME',
          notes: payload['description'],
        });
      default:
        return this.backend.createWardActivity(payload);
    }
  }

  createWardBed(payload: Record<string, unknown>) {
    return this.backend.createWardBed(payload);
  }

  issueWardRequisition(id: string) {
    return this.backend.issueWardRequisition(id);
  }

  updateWardBed(id: string, payload: Record<string, unknown>) {
    return this.backend.updateWardBed(id, payload);
  }

  deleteWardBed(id: string) {
    return this.backend.deleteWardBed(id);
  }

  transferAdmission(id: string, payload: Record<string, unknown>) {
    return this.backend.transferRoomAllotment(id, payload);
  }

  assignNurse(admissionId: string, nurseId: string) {
    return this.backend.assignNurseToAllotment(admissionId, { assignedNurseId: nurseId });
  }

  loadWardStaff(): Observable<User[]> {
    return this.backend.getWardStaff().pipe(
      catchError(() => this.backend.getUsers({ context: 'hospital' }))
    );
  }

  acceptHandover(activityId: string) {
    return this.backend.acceptWardHandover(activityId);
  }

  acknowledgeOrder(activityId: string) {
    return this.backend.acknowledgeWardActivity(activityId);
  }

  completeOrder(activityId: string, notes = '') {
    return this.backend.completeWardActivity(activityId, { notes });
  }

  createRoom(payload: Record<string, unknown>) {
    return this.backend.createRoom(payload);
  }

  updateRoom(id: string, payload: Record<string, unknown>) {
    return this.backend.updateRoom(id, payload);
  }

  deleteRoom(id: string) {
    return this.backend.deleteRoom(id);
  }

  dischargeAllotment(id: string, payload: Record<string, unknown> = {}) {
    return this.backend.dischargeRoomAllotment(id, payload);
  }

  updateDripStatus(payload: {
    action: 'start' | 'stop' | 'complete';
    prescriptionId: string;
    fluidIndex?: number;
    fluidName?: string;
    patientId?: string;
    admissionId?: string;
    notes?: string;
  }) {
    return this.backend.wardDripAction({
      ...payload,
      fluidIndex: payload.fluidIndex ?? undefined,
    }).pipe(map((response) => (response.data || {}) as Record<string, unknown>));
  }

  buildRoomPayload(value: {
    roomName: string;
    roomType: WardRoomRecord['roomType'];
    wardId?: string;
    floorId?: string;
    floor?: string;
    dailyCharge: number;
    status?: Room['status'];
  }) {
    return wardRoomPayloadFromForm(value);
  }
}
