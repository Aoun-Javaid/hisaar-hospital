import {
  Doctor,
  Encounter,
  HospitalWard,
  LabOrder,
  Patient,
  PatientHistory,
  Prescription,
  Room,
  RoomAllotment,
  User,
  WardFloor,
} from '../../../../shared/models/hospital.model';
import { WardBedRecord, WardBedStatus, WardRoomRecord, WardRoomType, WardGalleryOption } from '../ward-bed-management.models';
import {
  WardAlertRow,
  WardBed,
  WardKpiCard,
  WardSection,
  WardTaskRow,
} from '../ward-dashboard.models';
import { WardModuleFilters, WardModuleRow, WardModuleRowMeta } from '../ward-module.models';
import { PatientStatus, WardPatient } from '../ward-patient-list.models';

function withModuleMeta(
  row: WardModuleRow,
  patientId?: string | null,
  admissionId?: string | null,
  extra?: WardModuleRowMeta
): WardModuleRow {
  return {
    ...row,
    meta: {
      patientId: normalizeEntityId(patientId) || undefined,
      admissionId: normalizeEntityId(admissionId) || undefined,
      ...extra,
    },
  };
}

export function normalizeWardVitalsRecord(vitals: Record<string, string>): Record<string, string> {
  return {
    ...vitals,
    bp: vitals['bp'] || vitals['bloodPressure'] || '',
    pulse: vitals['pulse'] || '',
    weight: vitals['weight'] || '',
    temperature: vitals['temperature'] || vitals['temp'] || '',
    spo2: vitals['spo2'] || vitals['SpO2'] || '',
    height: vitals['height'] || '',
    respiratoryRate: vitals['respiratoryRate'] || vitals['respiratory_rate'] || '',
  };
}

export interface WardVitalTimelineEntry {
  createdAt?: string;
  vitals: Record<string, string>;
}

export function normalizeEntityId(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }

  if (typeof value === 'object') {
    return readRecordId(value as Record<string, unknown>);
  }

  return '';
}

export function resolvePrescriptionPatientId(prescription: Prescription): string {
  return normalizeEntityId(prescription.patientId || prescription.patient?._id);
}

function resolveAllotmentPatientId(allotment: RoomAllotment): string {
  return normalizeEntityId(allotment.patientId || allotment.patient?._id);
}

export const ROOM_TYPE_WARD_LABELS: Record<string, string> = {
  general: 'General Ward',
  private: 'Private Ward',
  icu: 'ICU Ward',
  emergency: 'Emergency Ward',
  operation_theater: 'OT Ward',
};

export const UI_ROOM_TYPE_TO_API: Record<WardRoomType, Room['roomType']> = {
  general: 'general',
  private: 'private',
  icu: 'icu',
  isolation: 'general',
  recovery: 'private',
};

export const API_ROOM_TYPE_TO_UI: Record<Room['roomType'], WardRoomType> = {
  general: 'general',
  private: 'private',
  icu: 'icu',
  emergency: 'general',
  operation_theater: 'general',
};

export function wardNameFromRoom(room?: Room | null): string {
  if (room?.ward?.name) {
    return room.ward.name;
  }

  if (!room) {
    return 'General Ward';
  }

  return ROOM_TYPE_WARD_LABELS[room.roomType] || 'General Ward';
}

export function galleryLabelFromRoom(room?: Room | null): string {
  if (room?.floorRecord?.label) {
    return room.floorRecord.label;
  }

  if (room?.floorRecord?.name) {
    return room.floorRecord.name;
  }

  if (!room?.floor) {
    return 'Main Wing';
  }

  return `Floor ${room.floor}`;
}

export function patientFullName(patient?: Patient | null): string {
  if (!patient) {
    return 'Unknown Patient';
  }
  return `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Unknown Patient';
}

export function patientAge(patient?: Patient | null): number {
  if (!patient) {
    return 0;
  }
  const explicit = Number((patient as { age?: number | string }).age);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit);
  }
  if (!patient.dateOfBirth) {
    return 0;
  }
  const dob = new Date(patient.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return 0;
  }
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return Math.max(age, 0);
}

export function patientAgeLabel(patient?: Patient | null): string {
  const age = patientAge(patient);
  return age > 0 ? `${age} years` : '—';
}

export function patientSex(patient?: Patient | null): 'M' | 'F' {
  return patient?.gender === 'female' ? 'F' : 'M';
}

export function doctorName(doctorId?: string | null, doctors: Doctor[] = []): string {
  if (!doctorId) {
    return '—';
  }
  const doctor = doctors.find((item) => item._id === doctorId);
  return doctor?.user?.name || doctor?.specialization || 'Assigned Doctor';
}

export function formatDisplayDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function derivePatientStatus(
  allotment: RoomAllotment,
  encounter?: Encounter | null,
  history: PatientHistory[] = []
): PatientStatus {
  if (encounter?.status === 'ready_for_discharge') {
    return 'dischargePlanned';
  }

  const patientHistory = history.filter((item) => item.patientId === allotment.patientId);
  const hasCritical = patientHistory.some((item) =>
    /critical|sepsis|emergency/i.test(`${item.title || ''} ${item.diagnosis || ''} ${item.notes || ''}`)
  );
  if (hasCritical) {
    return 'critical';
  }

  const hasWatch = patientHistory.some((item) =>
    /watch|alert|fever|drip/i.test(`${item.title || ''} ${item.notes || ''}`)
  );
  if (hasWatch) {
    return 'watch';
  }

  return 'stable';
}

export function countMedicationsDue(prescriptions: Prescription[], patientId: string): number {
  return prescriptions
    .filter((item) => item.patientId === patientId)
    .reduce((total, prescription) => total + (prescription.medicines?.length || 0), 0);
}

export function countDripsRunning(prescriptions: Prescription[], patientId: string): number {
  return prescriptions
    .filter((item) => item.patientId === patientId)
    .flatMap((item) => item.ivFluids || [])
    .filter((fluid) => fluid.status === 'running').length;
}

export function countVitalsDue(history: PatientHistory[], patientId: string): number {
  const today = new Date().toDateString();
  const hasTodayVitals = history.some(
    (item) => item.patientId === patientId && item.vitals && new Date(item.createdAt || '').toDateString() === today
  );
  return hasTodayVitals ? 0 : 1;
}

export function mapAllotmentToWardPatient(
  allotment: RoomAllotment,
  doctors: Doctor[] = [],
  history: PatientHistory[] = [],
  prescriptions: Prescription[] = [],
  encounters: Encounter[] = [],
  wards: HospitalWard[] = []
): WardPatient {
  const patient = allotment.patient;
  const room = allotment.room;
  const encounter = encounters.find((item) => item._id === allotment.encounterId);
  const wardFromCatalog = room?.wardId
    ? wards.find((ward) => String(ward._id) === String(room.wardId))
    : undefined;
  const wardName = room?.ward?.name || wardFromCatalog?.name || wardNameFromRoom(room);

  return {
    admissionId: allotment._id,
    admissionNo: allotment.admissionNo || '',
    patientId: allotment.patientId,
    patientName: patientFullName(patient),
    mrn: patient?.patientNo || '—',
    bedNo: allotment.bedLabel || room?.roomNo || '—',
    wardName,
    roomName: room?.roomNo ? `Room ${room.roomNo}` : '—',
    galleryName: galleryLabelFromRoom(room),
    age: patientAge(patient),
    sex: patientSex(patient),
    diagnosis: allotment.admissionReason || encounter?.admissionReason || patient?.chronicDiseases?.[0] || 'Under care',
    allergies: Array.isArray(patient?.allergies) ? patient.allergies.join(', ') : patient?.allergies || '',
    bloodGroup: patient?.bloodGroup || '',
    photoUrl: (patient as { photoUrl?: string } | undefined)?.photoUrl || '',
    doctorId: allotment.consultantDoctorId || patient?.assignedDoctorId || '',
    doctorName: doctorName(allotment.consultantDoctorId || patient?.assignedDoctorId, doctors),
    nurseId: normalizeEntityId(allotment.assignedNurseId) || normalizeEntityId(allotment.assignedNurse?._id) || undefined,
    nurseName: allotment.assignedNurse?.name || undefined,
    admittedOn: allotment.admittedAt,
    status: derivePatientStatus(allotment, encounter, history),
    medicationsDue: countMedicationsDue(prescriptions, allotment.patientId),
    vitalsDue: countVitalsDue(history, allotment.patientId),
    dripsRunning: countDripsRunning(prescriptions, allotment.patientId),
    nursingTasksDue: history.filter((item) => item.patientId === allotment.patientId && item.recordType === 'ward').length,
    criticalAlerts: derivePatientStatus(allotment, encounter, history) === 'critical' ? 1 : 0,
  };
}

export function mapRoomToWardRoom(room: Room, allotment?: RoomAllotment | null): WardRoomRecord {
  const occupied = room.status === 'occupied' || allotment?.status === 'admitted' ? 1 : 0;
  const maintenance = room.status === 'maintenance' ? 1 : 0;
  const available = occupied || maintenance ? 0 : 1;

  return {
    id: room._id,
    wardId: room.wardId || room.ward?._id || room.roomType,
    wardName: wardNameFromRoom(room),
    galleryId: room.floorId || room.floorRecord?._id || `floor-${room.floor || 'main'}`,
    galleryName: galleryLabelFromRoom(room),
    roomName: room.roomNo,
    roomType: API_ROOM_TYPE_TO_UI[room.roomType] || 'general',
    capacity: 1,
    dailyCharge: room.chargesPerDay || 0,
    floor: room.floor || '',
    description: allotment?.notes || '',
    occupiedBeds: occupied,
    availableBeds: available,
    cleaningBeds: 0,
    maintenanceBeds: maintenance,
    onHoldBeds: 0,
    status: room.status === 'maintenance' ? 'maintenance' : 'active',
  };
}

export function mapRoomToWardBed(room: Room, allotment?: RoomAllotment | null): WardBedRecord {
  const patient = allotment?.patient;
  const status: WardBedStatus =
    room.status === 'maintenance'
      ? 'maintenance'
      : allotment?.status === 'admitted'
        ? 'occupied'
        : 'available';

  return {
    id: `${room._id}-bed`,
    roomId: room._id,
    bedNo: allotment?.bedLabel || room.roomNo,
    bedType: room.roomType === 'icu' ? 'icu' : 'standard',
    status,
    patientId: patient?._id,
    admissionId: allotment?._id,
    patientName: patient ? patientFullName(patient) : undefined,
    age: patient ? patientAge(patient) : undefined,
    sex: patient ? patientSex(patient) : undefined,
    nurseName: allotment?.assignedNurse?.name || undefined,
    occupiedSince: allotment?.admittedAt,
    dailyCharge: room.chargesPerDay || 0,
    notes: allotment?.notes || '',
  };
}

export function formatRoomTypeLabel(roomType?: Room['roomType'] | string | null): string {
  const key = String(roomType || 'general').toLowerCase();
  const labels: Record<string, string> = {
    general: 'General',
    private: 'Private',
    icu: 'ICU',
    emergency: 'Emergency',
    operation_theater: 'OT',
  };

  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatBedVitalsSummary(vitals?: Record<string, string> | null): string {
  if (!vitals || !Object.keys(vitals).length) {
    return '';
  }

  const bp = vitals['bloodPressure'] || vitals['bp'] || '';
  const temp = vitals['temperature'] || vitals['temp'] || '';
  const spo2 = vitals['spo2'] || vitals['SpO2'] || '';
  const parts = [bp, temp, spo2 ? `SpO2 ${spo2}` : ''].filter(Boolean);
  return parts.join(' | ');
}

export function getIvRunningLabel(prescriptions: Prescription[], patientId?: string): string {
  if (!patientId) {
    return '';
  }

  const running = prescriptions
    .filter((item) => item.patientId === patientId)
    .flatMap((item) => item.ivFluids || [])
    .find((fluid) => fluid.status === 'running');

  if (!running) {
    return '';
  }

  return `IV Running: ${running.name}${running.rate ? ` @ ${running.rate}` : ''}`;
}

export function formatAdmissionDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface WardActivityRecord {
  _id: string;
  activityType: string;
  patient?: { firstName?: string; lastName?: string } | null;
  patientId?: string;
  admissionId?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  shift?: string;
  metadata?: Record<string, unknown>;
  scheduledAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

export interface WardDashboardBundleContext {
  doctors: Doctor[];
  history: PatientHistory[];
  prescriptions: Prescription[];
  encounters: Encounter[];
  labOrders: LabOrder[];
  activities: WardActivityRecord[];
}

export function mapRoomToDashboardBed(
  room: Room,
  allotment?: RoomAllotment | null,
  context?: WardDashboardBundleContext
): WardBed {
  const patient = allotment?.patient;
  const baseStatus: WardBed['status'] =
    room.status === 'maintenance'
      ? 'maintenance'
      : room.status === 'available' && !allotment
        ? 'available'
        : allotment?.status === 'admitted'
          ? 'occupied'
          : room.status === 'occupied'
            ? 'occupied'
            : 'available';

  const bed: WardBed = {
    bedNo: allotment?.bedLabel || room.roomNo,
    roomNo: room.roomNo,
    roomType: formatRoomTypeLabel(room.roomType),
    status: baseStatus,
    patientName: patient ? patientFullName(patient) : undefined,
    age: patient ? patientAge(patient) : undefined,
    sex: patient ? patientSex(patient) : undefined,
    nurseName: allotment?.assignedNurse?.name || undefined,
    admissionId: allotment?._id,
    alertType: baseStatus === 'occupied' ? 'warning' : undefined,
  };

  if (!allotment || allotment.status !== 'admitted' || !context) {
    return bed;
  }

  const wardPatient = mapAllotmentToWardPatient(
    allotment,
    context.doctors,
    context.history,
    context.prescriptions,
    context.encounters
  );
  const latestVitals = context.history
    .filter((item) => item.patientId === allotment.patientId && item.vitals && Object.keys(item.vitals).length)
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())[0];

  const clinicalStatus =
    wardPatient.status === 'critical'
      ? 'critical'
      : wardPatient.status === 'dischargePlanned'
        ? 'discharge_pending'
        : wardPatient.status === 'watch'
          ? 'observation'
          : 'stable';

  return {
    ...bed,
    patientId: allotment.patientId,
    patientNo: wardPatient.mrn,
    doctorName: wardPatient.doctorName,
    admittedAt: allotment.admittedAt,
    diagnosis: wardPatient.diagnosis,
    clinicalStatus,
    vitalsSummary: formatBedVitalsSummary(latestVitals?.vitals),
    ivRunningLabel: getIvRunningLabel(context.prescriptions, allotment.patientId),
    medicinesDue: wardPatient.medicationsDue,
    vitalsDue: wardPatient.vitalsDue,
    status: clinicalStatus === 'critical' ? 'critical' : bed.status,
    alertType: clinicalStatus === 'critical' ? 'critical' : bed.alertType,
  };
}

function roomIdFromWardBed(bed: Record<string, unknown>): string {
  return normalizeEntityId(bed['roomId']) || normalizeEntityId((bed['room'] as Record<string, unknown> | undefined)?.['_id']);
}

function mapWardApiBedToDashboardBed(
  bedRecord: Record<string, unknown>,
  room: Room,
  allotment?: RoomAllotment | null,
  context?: WardDashboardBundleContext
): WardBed {
  const bed = mapRoomToDashboardBed(
    {
      ...room,
      status: bedRecord['status'] === 'maintenance' ? 'maintenance' : room.status,
    },
    allotment,
    context
  );
  const rawStatus = String(bedRecord['status'] || 'available');
  const persistedStatus = (rawStatus === 'blocked' ? 'on_hold' : rawStatus) as WardBed['status'];

  return {
    ...bed,
    id: normalizeEntityId(bedRecord['_id']) || undefined,
    bedNo: String(bedRecord['bedNo'] || bed.bedNo),
    status: allotment?.status === 'admitted' ? bed.status : persistedStatus,
  };
}

export function buildDashboardSections(
  rooms: Room[],
  allotments: RoomAllotment[],
  wards: HospitalWard[] = [],
  context?: WardDashboardBundleContext,
  wardBeds: Record<string, unknown>[] = []
): WardSection[] {
  const wardNameById = new Map(wards.map((ward) => [String(ward._id), ward.name]));
  const grouped = new Map<string, WardBed[]>();
  const sectionMeta = new Map<string, { sectionName: string; subtitle: string; sortKey: string }>();
  const roomsById = new Map(rooms.map((room) => [String(room._id), room]));
  const persistedRoomIds = new Set<string>();
  const admittedAllotments = allotments.filter((item) => item.status === 'admitted');
  const claimedLegacyAllotments = new Set<string>();

  const resolveWardName = (room: Room): string => {
    if (room.ward?.name) {
      return room.ward.name;
    }

    const wardId = String(room.wardId || room.ward?._id || '').trim();
    if (wardId && wardNameById.has(wardId)) {
      return wardNameById.get(wardId) || wardNameFromRoom(room);
    }

    return wardNameFromRoom(room);
  };

  const addBed = (room: Room, bed: WardBed, allotment?: RoomAllotment | null): void => {
    const wardName = resolveWardName(room);
    const gallery = galleryLabelFromRoom(room);
    const groupKey = `${wardName}::${gallery}`;
    const beds = grouped.get(groupKey) || [];

    beds.push({
      ...bed,
      roomId: room._id,
      patientId: allotment ? resolveAllotmentPatientId(allotment) : undefined,
      wardName,
      galleryName: gallery,
    });
    grouped.set(groupKey, beds);

    if (!sectionMeta.has(groupKey)) {
      sectionMeta.set(groupKey, {
        sectionName: gallery,
        subtitle: wardName,
        sortKey: `${wardName}|${gallery}`,
      });
    }
  };

  wardBeds.forEach((bedRecord) => {
    const roomId = roomIdFromWardBed(bedRecord);
    const room = roomsById.get(roomId);
    if (!room) {
      return;
    }

    persistedRoomIds.add(roomId);

    const bedId = normalizeEntityId(bedRecord['_id']);
    const directAllotment = admittedAllotments.find((item) => normalizeEntityId(item.bedId) === bedId);
    const legacyAllotment = directAllotment
      ? undefined
      : admittedAllotments.find((item) => {
          const allotmentId = normalizeEntityId(item._id);
          return !normalizeEntityId(item.bedId) &&
            String(item.roomId) === roomId &&
            !claimedLegacyAllotments.has(allotmentId) &&
            (String(item.bedLabel || '') === String(bedRecord['bedNo'] || '') || !item.bedLabel);
        });
    const allotment = directAllotment || legacyAllotment;
    if (legacyAllotment) {
      claimedLegacyAllotments.add(normalizeEntityId(legacyAllotment._id));
    }

    addBed(room, mapWardApiBedToDashboardBed(bedRecord, room, allotment, context), allotment);
  });

  rooms
    .filter((room) => !persistedRoomIds.has(String(room._id)))
    .forEach((room) => {
      const allotment = allotments.find((item) => item.roomId === room._id && item.status === 'admitted');
      addBed(room, mapRoomToDashboardBed(room, allotment, context), allotment);
  });

  return Array.from(grouped.entries())
    .map(([groupKey, beds]) => {
      const meta = sectionMeta.get(groupKey)!;
      return {
        sectionName: meta.sectionName,
        subtitle: meta.subtitle,
        beds: beds.sort((left, right) =>
          left.bedNo.localeCompare(right.bedNo, undefined, { numeric: true })
        ),
        sortKey: meta.sortKey,
      };
    })
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(({ sectionName, subtitle, beds }) => ({ sectionName, subtitle, beds }));
}

export function buildDashboardKpis(
  rooms: Room[],
  allotments: RoomAllotment[],
  context?: WardDashboardBundleContext,
  wardBeds: Record<string, unknown>[] = []
): WardKpiCard[] {
  const admitted = allotments.filter((item) => item.status === 'admitted');
  const roomIdsWithBeds = new Set(wardBeds.map((bed) => roomIdFromWardBed(bed)).filter(Boolean));
  const fallbackRooms = rooms.filter((room) => !roomIdsWithBeds.has(String(room._id)));
  const totalBeds = wardBeds.length + fallbackRooms.length;
  const total = totalBeds || 1;
  const occupied = admitted.length || rooms.filter((room) => room.status === 'occupied').length;
  const available =
    wardBeds.filter((bed) => bed['status'] === 'available').length +
    fallbackRooms.filter((room) => room.status === 'available' && !admitted.some((item) => item.roomId === room._id)).length;
  const maintenance =
    wardBeds.filter((bed) => bed['status'] === 'maintenance').length +
    fallbackRooms.filter((room) => room.status === 'maintenance').length;
  const cleaning =
    wardBeds.filter((bed) => bed['status'] === 'cleaning').length +
    fallbackRooms.filter((room) => room.status === 'available' && admitted.some((item) => item.roomId === room._id && item.dischargedAt)).length;

  let critical = 0;
  let dischargePending = 0;

  if (context) {
    admitted.forEach((allotment) => {
      const status = mapAllotmentToWardPatient(
        allotment,
        context.doctors,
        context.history,
        context.prescriptions,
        context.encounters
      ).status;
      if (status === 'critical') {
        critical += 1;
      }
      if (status === 'dischargePlanned') {
        dischargePending += 1;
      }
    });
  }

  return [
    { key: 'total', label: 'Total Beds', value: totalBeds, icon: 'fa-bed', tone: 'blue', route: '/ward/bed-management' },
    {
      key: 'occupied',
      label: 'Occupied',
      value: occupied,
      percent: Math.round((occupied / total) * 100),
      icon: 'fa-user',
      tone: 'green',
      route: '/ward/patient-list',
    },
    {
      key: 'available',
      label: 'Available',
      value: available,
      percent: Math.round((available / total) * 100),
      icon: 'fa-check-circle',
      tone: 'blue',
      route: '/ward/bed-management',
    },
    {
      key: 'cleaning',
      label: 'Cleaning',
      value: cleaning,
      icon: 'fa-shower',
      tone: 'amber',
      route: '/ward/bed-management',
    },
    {
      key: 'maintenance',
      label: 'Maintenance',
      value: maintenance,
      icon: 'fa-wrench',
      tone: 'red',
      route: '/ward/bed-management',
    },
    {
      key: 'critical',
      label: 'Critical Patients',
      value: critical,
      icon: 'fa-exclamation-triangle',
      tone: 'red',
      route: '/ward/patient-list',
    },
    {
      key: 'discharge_pending',
      label: 'Discharge Pending',
      value: dischargePending,
      icon: 'fa-sign-out',
      tone: 'purple',
      route: '/ward/admissions',
    },
  ];
}

export function buildDashboardAlerts(
  bundle: WardDashboardBundleContext,
  allotments: RoomAllotment[]
): WardAlertRow[] {
  const admitted = allotments.filter((item) => item.status === 'admitted');
  const medicinesDue = bundle.prescriptions.reduce((total, item) => total + (item.medicines?.length || 0), 0);
  const vitalsOverdue = admitted.reduce(
    (total, allotment) => total + countVitalsDue(bundle.history, allotment.patientId),
    0
  );
  const dripsRunning = bundle.prescriptions
    .flatMap((item) => item.ivFluids || [])
    .filter((fluid) => fluid.status === 'running').length;
  const labPending = bundle.labOrders.filter((order) => !['completed', 'cancelled'].includes(String(order.status || '').toLowerCase())).length;
  const criticalCount = admitted.filter((allotment) =>
    derivePatientStatus(
      allotment,
      bundle.encounters.find((item) => item._id === allotment.encounterId),
      bundle.history
    ) === 'critical'
  ).length;
  const dischargePending = admitted.filter((allotment) =>
    derivePatientStatus(
      allotment,
      bundle.encounters.find((item) => item._id === allotment.encounterId),
      bundle.history
    ) === 'dischargePlanned'
  ).length;

  return [
    { label: 'Medicine due', value: medicinesDue, route: '/ward/mar', tone: 'amber' },
    { label: 'Vitals overdue', value: vitalsOverdue, route: '/ward/vitals', tone: 'red' },
    { label: 'Lab report pending', value: labPending, route: '/ward/orders-services', tone: 'purple' },
    { label: 'Critical vitals', value: criticalCount, route: '/ward/patient-list', tone: 'red' },
    { label: 'Discharge pending', value: dischargePending, route: '/ward/admissions', tone: 'purple' },
    { label: 'Drips running', value: dripsRunning, route: '/ward/drips-iv', tone: 'green' },
  ];
}

export function buildDashboardTasks(
  bundle: WardDashboardBundleContext,
  allotments: RoomAllotment[]
): WardTaskRow[] {
  const tasks: WardTaskRow[] = [];
  const admitted = allotments.filter((item) => item.status === 'admitted');

  bundle.prescriptions.forEach((prescription) => {
    const patientName = patientFullName(prescription.patient);
    const bed = admitted.find((item) => item.patientId === prescription.patientId);
    const bedLabel = bed?.bedLabel || bed?.room?.roomNo || 'bed';

    (prescription.medicines || []).slice(0, 2).forEach((medicine, index) => {
      tasks.push({
        time: medicine.morning ? '08:00 AM' : medicine.noon ? '01:00 PM' : medicine.evening ? '06:00 PM' : '09:00 PM',
        label: `Give ${medicine.name} to ${bedLabel} (${patientName})`,
        route: `/ward/mar?admissionId=${bed?._id || ''}&patientId=${prescription.patientId || ''}`,
      });

      if (index === 0 && countVitalsDue(bundle.history, prescription.patientId || '')) {
        tasks.push({
          time: '10:30 AM',
          label: `Check vitals for ${bedLabel} (${patientName})`,
          route: `/ward/vitals?admissionId=${bed?._id || ''}&patientId=${prescription.patientId || ''}`,
        });
      }
    });
  });

  bundle.prescriptions.forEach((prescription) => {
    const running = (prescription.ivFluids || []).find((fluid) => fluid.status === 'running');
    if (!running) {
      return;
    }

    const bed = admitted.find((item) => item.patientId === prescription.patientId);
    tasks.push({
      time: '11:00 AM',
      label: `Monitor drip ${running.name} at ${bed?.bedLabel || bed?.room?.roomNo || 'bed'}`,
      route: `/ward/drips-iv?admissionId=${bed?._id || ''}&patientId=${prescription.patientId || ''}`,
    });
  });

  return tasks.slice(0, 8);
}

export function wardRoomPayloadFromForm(value: {
  roomName: string;
  roomType: WardRoomType;
  wardId?: string;
  floorId?: string;
  floor?: string;
  dailyCharge: number;
  status?: Room['status'];
}): Record<string, unknown> {
  return {
    roomNo: value.roomName,
    roomType: UI_ROOM_TYPE_TO_API[value.roomType] || 'general',
    wardId: value.wardId || undefined,
    floorId: value.floorId || undefined,
    floor: value.floor || undefined,
    chargesPerDay: Number(value.dailyCharge) || 0,
    status: value.status || 'available',
  };
}

export function getWardOptionsFromCatalog(wards: HospitalWard[]): string[] {
  return wards.map((ward) => ward.name).sort((a, b) => a.localeCompare(b));
}

export function getWardOptionsFromRooms(rooms: Room[], wards: HospitalWard[] = []): string[] {
  const labels = new Set<string>([
    ...wards.map((ward) => ward.name),
    ...rooms.map((room) => wardNameFromRoom(room)),
  ]);
  return Array.from(labels).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function buildFloorOptions(floors: WardFloor[], wardId = ''): WardGalleryOption[] {
  const normalizedWardId = String(wardId || '').trim();
  return floors
    .filter((floor) => !normalizedWardId || String(floor.wardId) === normalizedWardId)
    .map((floor) => ({
      id: floor._id,
      label: floor.label || floor.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function normalizeWardFloorRecord(raw: unknown, fallbackWardId = ''): WardFloor | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const nested = record['data'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return normalizeWardFloorRecord(nested, fallbackWardId);
  }

  const id = readRecordId(record);
  const name = String(record['name'] || record['label'] || 'Floor').trim();
  if (!id || !name) {
    return null;
  }

  const rawWardId = record['wardId'];
  const wardId =
    (rawWardId && typeof rawWardId === 'object'
      ? readRecordId(rawWardId as Record<string, unknown>)
      : readRecordId({ _id: rawWardId, id: rawWardId })) || String(fallbackWardId || '').trim();
  if (!wardId) {
    return null;
  }

  return {
    _id: id,
    hospitalId: String(record['hospitalId'] || ''),
    wardId,
    name,
    label: String(record['label'] || name),
    sortOrder: Number(record['sortOrder'] || 0) || 0,
    status: (String(record['status'] || 'active') as WardFloor['status']),
  };
}

export function normalizeWardFloorRecords(raw: unknown, fallbackWardId = ''): WardFloor[] {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeWardFloorRecord(item, fallbackWardId))
      .filter((floor): floor is WardFloor => Boolean(floor));
  }

  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record['items'])) {
      return normalizeWardFloorRecords(record['items'], fallbackWardId);
    }
    const single = normalizeWardFloorRecord(raw, fallbackWardId);
    return single ? [single] : [];
  }

  return [];
}

export function mapAdmissionRecommendationRows(
  recommendations: Array<Record<string, unknown>>,
  doctors: Doctor[] = []
): WardModuleRow[] {
  return recommendations.map((item) => {
    const patient = item['patientId'] as Patient | undefined;
    const doctorRef = item['recommendedByDoctorId'] as Doctor | string | undefined;
    const doctorId = typeof doctorRef === 'object' ? doctorRef?._id : doctorRef;
    const status = String(item['status'] || 'pending');
    const tab =
      status === 'admitted'
        ? 'active'
        : status === 'cancelled' || status === 'declined'
          ? 'discharge'
          : 'pending';

    const roomAllotmentId =
      typeof item['roomAllotmentId'] === 'object'
        ? String((item['roomAllotmentId'] as { _id?: string })._id || '')
        : String(item['roomAllotmentId'] || '');

    return withModuleMeta(
      {
        id: String(item['_id']),
        cells: {
          patient: patientFullName(patient),
          mrn: patient?.patientNo || '—',
          bed: '—',
          doctor: typeof doctorRef === 'object' ? doctorName(String(doctorRef?._id || ''), doctors) : doctorName(String(doctorId || ''), doctors),
          admittedOn: formatDisplayDate(String(item['recommendedAt'] || item['createdAt'] || '')),
          status:
            status === 'pending'
              ? 'Pending Order'
              : status === 'acknowledged'
                ? 'Acknowledged'
                : status === 'draft'
                  ? 'Draft'
                  : status === 'admitted'
                    ? 'Admitted'
                    : status,
          orderNo: String(item['orderNo'] || '—'),
          priority: String(item['priority'] || 'routine'),
          reason: String(item['reason'] || '—'),
          diagnosis: String(item['initialDiagnosis'] || '—'),
          levelOfCare: String((item['clinicalSnapshot'] as Record<string, unknown> | undefined)?.['admissionDecision']
            ? ((item['clinicalSnapshot'] as Record<string, unknown>)['admissionDecision'] as Record<string, unknown>)['levelOfCare']
            : '—'),
          _tab: tab,
          _source: 'admission_recommendation',
        },
        badgeTone: {
          status: status === 'pending' || status === 'acknowledged' ? 'pending' : status === 'admitted' ? 'active' : 'completed',
        },
        linkRoute: status === 'admitted' && roomAllotmentId ? `/ward/patient-detail/${roomAllotmentId}` : undefined,
      },
      patient?._id,
      roomAllotmentId,
      {
        recommendationId: String(item['_id']),
        rowSource: 'admission_recommendation',
      }
    );
  });
}

export function mapAdmissionRows(allotments: RoomAllotment[], doctors: Doctor[] = []): WardModuleRow[] {
  return allotments.map((item) =>
    withModuleMeta(
      {
        id: item._id,
        cells: {
          patient: patientFullName(item.patient),
          mrn: item.patient?.patientNo || '—',
          bed: item.bedLabel || item.room?.roomNo || '—',
          doctor: doctorName(item.consultantDoctorId, doctors),
          admittedOn: formatDisplayDate(item.admittedAt),
          status: item.status === 'admitted' ? 'Active' : 'Discharged',
          _tab: item.status === 'admitted' ? 'active' : item.dischargedAt ? 'discharge' : 'pending',
          _dischargedAt: item.dischargedAt || '',
        },
        badgeTone: {
          status: item.status === 'admitted' ? 'active' : 'completed',
        },
        linkRoute: `/ward/patient-detail/${item._id}`,
      },
      item.patientId,
      item._id
    )
  );
}

export function mapNursingRows(history: PatientHistory[]): WardModuleRow[] {
  return history.map((item) =>
    withModuleMeta(
      {
        id: item._id,
        cells: {
          patient: patientFullName(item.patient),
          task: item.title || 'Ward Note',
          priority: /critical|urgent/i.test(item.notes || '') ? 'High' : 'Medium',
          nurse: item.doctor?.name || '—',
          dueAt: formatDisplayDate(item.createdAt),
          status: item.notes ? 'Completed' : 'Due',
          _tab: item.notes ? 'completed' : 'due',
        },
        badgeTone: {
          priority: /critical|urgent/i.test(item.notes || '') ? 'critical' : 'medium',
          status: item.notes ? 'completed' : 'pending',
        },
        linkRoute: item.patientId ? `/ward/patient-detail/${item.patientId}` : undefined,
      },
      item.patientId
    )
  );
}

export function mapMarRows(prescriptions: Prescription[]): WardModuleRow[] {
  const rows: WardModuleRow[] = [];
  prescriptions.forEach((prescription) => {
    const patientId = resolvePrescriptionPatientId(prescription);
    (prescription.medicines || []).forEach((medicine, index) => {
      rows.push(
        withModuleMeta(
          {
            id: `${prescription._id}-${index}`,
            cells: {
              patient: patientFullName(prescription.patient),
              medicine: medicine.name,
              dose: medicine.dosage || medicine.frequency || '—',
              route: 'PO',
              dueTime: medicine.morning ? '08:00' : medicine.noon ? '13:00' : medicine.evening ? '18:00' : '21:00',
              status: 'Due',
              _tab: 'due',
            },
            badgeTone: { status: 'pending' },
            linkRoute: patientId ? `/ward/patient-detail/${patientId}` : undefined,
          },
          patientId
        )
      );
    });
  });
  return rows;
}

export function normalizeDripFluidStatus(status?: string | null): 'planned' | 'running' | 'completed' {
  const value = String(status || 'planned').trim().toLowerCase();
  if (value === 'running') {
    return 'running';
  }
  if (value === 'completed') {
    return 'completed';
  }
  return 'planned';
}

export function mapDripRows(prescriptions: Prescription[]): WardModuleRow[] {
  const rows: WardModuleRow[] = [];
  prescriptions.forEach((prescription) => {
    const patientId = resolvePrescriptionPatientId(prescription);
    (prescription.ivFluids || []).forEach((fluid, index) => {
      const fluidStatus = normalizeDripFluidStatus(fluid.status);
      rows.push(
        withModuleMeta(
          {
            id: `${prescription._id}-iv-${index}`,
            cells: {
              patient: patientFullName(prescription.patient),
              fluid: fluid.name,
              rate: fluid.rate || '—',
              startedAt: formatDisplayDate(fluid.startDateTime),
              nurse: prescription.doctor?.name || '—',
              status: fluidStatus === 'running' ? 'Running' : fluidStatus === 'completed' ? 'Completed' : 'Planned',
              _tab: fluidStatus === 'running' ? 'running' : fluidStatus === 'completed' ? 'completed' : 'planned',
            },
            badgeTone: {
              status: fluidStatus === 'running' ? 'running' : fluidStatus === 'completed' ? 'completed' : 'pending',
            },
            linkRoute: patientId ? `/ward/patient-detail/${patientId}` : undefined,
          },
          patientId,
          undefined,
          {
            prescriptionId: normalizeEntityId(prescription._id),
            fluidIndex: index,
            fluidName: fluid.name,
            fluidStatus,
          }
        )
      );
    });
  });
  return rows;
}

export function mapVitalsRows(
  history: PatientHistory[],
  prescriptions: Prescription[] = [],
  allotments: RoomAllotment[] = []
): WardModuleRow[] {
  const bedByPatient = new Map<string, string>();
  const admissionByPatient = new Map<string, string>();

  allotments
    .filter((item) => item.status === 'admitted')
    .forEach((item) => {
      const patientId = normalizeEntityId(item.patientId);
      if (!patientId) {
        return;
      }
      bedByPatient.set(patientId, item.bedLabel || item.room?.roomNo || '—');
      admissionByPatient.set(patientId, normalizeEntityId(item._id));
    });

  const entries: Array<{
    id: string;
    createdAt?: string;
    patientId: string;
    patientName: string;
    vitals: Record<string, string>;
  }> = [];

  history
    .filter((item) => item.vitals && Object.values(item.vitals).some((value) => String(value || '').trim()))
    .forEach((item) => {
      entries.push({
        id: item._id,
        createdAt: item.createdAt,
        patientId: normalizeEntityId(item.patientId),
        patientName: patientFullName(item.patient),
        vitals: normalizeWardVitalsRecord(item.vitals || {}),
      });
    });

  prescriptions
    .filter((prescription) => prescription.vitals && Object.values(prescription.vitals).some((value) => String(value || '').trim()))
    .forEach((prescription) => {
      entries.push({
        id: `rx-vitals-${prescription._id}`,
        createdAt: prescription.createdAt,
        patientId: resolvePrescriptionPatientId(prescription),
        patientName: patientFullName(prescription.patient),
        vitals: normalizeWardVitalsRecord(prescription.vitals || {}),
      });
    });

  return entries
    .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime())
    .map((entry) =>
      withModuleMeta(
        {
          id: entry.id,
          cells: {
            patient: entry.patientName,
            bed: bedByPatient.get(entry.patientId) || '—',
            recordedAt: formatDisplayDate(entry.createdAt),
            bp: entry.vitals['bp'] || '—',
            temp: entry.vitals['temperature'] || '—',
            spo2: entry.vitals['spo2'] || '—',
            pulse: entry.vitals['pulse'] || '—',
            status: 'Recorded',
            _tab: 'recorded',
          },
          badgeTone: { status: 'completed' },
          linkRoute: entry.patientId ? `/ward/patient-detail/${entry.patientId}` : undefined,
        },
        entry.patientId,
        admissionByPatient.get(entry.patientId)
      )
    );
}

export function normalizeOrderType(raw: string): string {
  const value = String(raw || '').toLowerCase();
  if (value.includes('lab')) return 'Lab';
  if (value.includes('med') || value.includes('pharmacy') || value.includes('drug')) return 'Medicine';
  if (value.includes('imag') || value.includes('radio') || value.includes('x-ray') || value.includes('xray') || value.includes('scan')) {
    return 'Imaging';
  }
  if (value.includes('proc') || value.includes('surg') || value.includes('oper')) return 'Procedure';
  if (value.includes('nurs')) return 'Nursing';
  if (['lab', 'medicine', 'imaging', 'procedure', 'nursing', 'other'].includes(value)) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return raw ? 'Other' : 'Other';
}

export function mapOrderRows(labOrders: LabOrder[], prescriptions: Prescription[]): WardModuleRow[] {
  const labRows = labOrders.map((order) => {
    const completed = ['verified', 'result_entered'].includes(order.status);
    const progress = ['processing', 'sample_collected'].includes(order.status);
    const urgent = order.priority === 'urgent';
    return withModuleMeta(
      {
        id: order._id,
        cells: {
          patient: patientFullName(order.patient),
          patientSub: order.patient?.patientNo || order.orderNo || '',
          order: order.items?.map((test) => test.testName).join(', ') || 'Lab Order',
          type: 'Lab',
          doctor: order.doctor?.name || '—',
          time: formatDisplayDate(order.createdAt),
          orderedOn: formatDisplayDate(order.createdAt),
          priority: urgent ? 'Urgent' : 'Normal',
          status: completed ? 'Completed' : progress ? 'In Progress' : 'Pending',
          _tab: completed ? 'completed' : progress ? 'progress' : 'pending',
          _urgent: urgent ? '1' : '',
          _source: 'lab',
        },
        badgeTone: {
          status: completed ? 'completed' : progress ? 'running' : 'pending',
          priority: urgent ? 'critical' : 'stable',
          type: 'lab',
        },
        linkRoute: `/ward/patient-detail/${order.patientId}`,
      },
      order.patientId
    );
  });

  const admissionRows = prescriptions.flatMap((prescription) =>
    (prescription.admissionOrderItems || []).map((order, index) => {
      const completed = order.status === 'completed';
      const urgent = String((order as { priority?: string }).priority || '').toLowerCase() === 'urgent'
        || String((order as { priority?: string }).priority || '').toLowerCase() === 'high';
      const type = normalizeOrderType(order.category || 'Other');
      return withModuleMeta(
        {
          id: `${prescription._id}-order-${index}`,
          cells: {
            patient: patientFullName(prescription.patient),
            patientSub: prescription.patient?.patientNo || '',
            order: order.order,
            type,
            doctor: prescription.doctor?.name || '—',
            time: formatDisplayDate(order.orderedOn),
            orderedOn: formatDisplayDate(order.orderedOn),
            priority: urgent ? 'Urgent' : 'Normal',
            status: completed ? 'Completed' : 'Pending',
            _tab: completed ? 'completed' : 'pending',
            _urgent: urgent ? '1' : '',
            _source: 'admission-order',
          },
          badgeTone: {
            status: completed ? 'completed' : 'pending',
            priority: urgent ? 'critical' : 'stable',
            type: type.toLowerCase(),
          },
          linkRoute: `/ward/patient-detail/${prescription.patientId}`,
        },
        prescription.patientId
      );
    })
  );

  return [...labRows, ...admissionRows];
}

export function mapServiceOrderRows(activities: WardActivityRecord[]): WardModuleRow[] {
  return activities
    .filter((item) => Boolean(item.metadata?.['orderType']))
    .map((item) => {
      const completed = item.status === 'completed';
      const progress = item.status === 'in_progress' || item.status === 'in progress';
      const urgent = item.priority === 'high' || item.priority === 'critical';
      const type = normalizeOrderType(String(item.metadata?.['orderType'] || 'Other'));
      const patientName = item.patient
        ? `${item.patient.firstName || ''} ${item.patient.lastName || ''}`.trim()
        : '—';
      return withModuleMeta(
        {
          id: item._id,
          cells: {
            patient: patientName,
            patientSub: String(item.metadata?.['mrn'] || item.metadata?.['admissionNo'] || ''),
            order: item.title || 'Ward Order',
            type,
            doctor: String(item.metadata?.['doctorName'] || '—'),
            time: formatDisplayDate(item.createdAt),
            orderedOn: formatDisplayDate(item.createdAt),
            priority: urgent ? 'Urgent' : 'Normal',
            status: completed ? 'Completed' : progress ? 'In Progress' : 'Pending',
            _tab: completed ? 'completed' : progress ? 'progress' : 'pending',
            _urgent: urgent ? '1' : '',
            _source: 'ward-order',
          },
          badgeTone: {
            status: completed ? 'completed' : progress ? 'running' : 'pending',
            priority: urgent ? 'critical' : 'stable',
            type: type.toLowerCase(),
          },
          linkRoute: item.admissionId ? `/ward/patient-detail/${item.admissionId}` : undefined,
        },
        item.patientId,
        item.admissionId
      );
    });
}

export function filterModuleRows(
  rows: WardModuleRow[],
  allotments: RoomAllotment[],
  filters?: WardModuleFilters
): WardModuleRow[] {
  if (!filters?.patientId && !filters?.admissionId && !filters?.wardName && !filters?.patientName) {
    return rows;
  }

  let result = rows;
  const admissionId = normalizeEntityId(filters?.admissionId);
  const patientId =
    normalizeEntityId(filters?.patientId) ||
    (admissionId
      ? resolveAllotmentPatientId(
          allotments.find((item) => normalizeEntityId(item._id) === admissionId) || ({} as RoomAllotment)
        )
      : '');

  if (patientId || admissionId) {
    const scoped = result.filter((row) => {
      const rowPatientId = normalizeEntityId(row.meta?.patientId);
      const rowAdmissionId = normalizeEntityId(row.meta?.admissionId);
      if (admissionId && rowAdmissionId === admissionId) {
        return true;
      }
      return patientId ? rowPatientId === patientId : false;
    });
    result = scoped.length ? scoped : result;
  }

  if (filters?.patientName) {
    const name = filters.patientName.trim().toLowerCase();
    const named = result.filter((row) =>
      Object.values(row.cells).join(' ').toLowerCase().includes(name)
    );
    if (named.length) {
      result = named;
    }
  }

  if (filters?.wardName && !patientId && !admissionId) {
    const wardPatientIds = new Set(
      allotments
        .filter((item) => item.status === 'admitted' && matchesWardFilter(item.room, filters.wardName!, []))
        .map((item) => resolveAllotmentPatientId(item))
        .filter(Boolean)
    );
    result = result.filter((row) => {
      const rowPatientId = normalizeEntityId(row.meta?.patientId);
      return rowPatientId && wardPatientIds.has(rowPatientId);
    });
  }

  return result;
}

export function mapWardActivityRows(activities: WardActivityRecord[], type?: string): WardModuleRow[] {
  return activities
    .filter((item) => !type || item.activityType === type)
    .map((item) => {
      const patientName = item.patient
        ? `${item.patient.firstName || ''} ${item.patient.lastName || ''}`.trim()
        : '—';
      const status = item.status || 'pending';
      const tab =
        status === 'completed'
          ? item.activityType === 'handover'
            ? item.shift || 'day'
            : 'completed'
          : status === 'due' || status === 'pending'
            ? item.activityType === 'handover'
              ? item.shift || 'day'
              : item.activityType === 'inventory'
                ? 'low'
                : 'due'
            : status;

      if (item.activityType === 'io_entry') {
        return withModuleMeta(
          {
            id: item._id,
            cells: {
              patient: patientName,
              intake: String(item.metadata?.['intake'] || '—'),
              output: String(item.metadata?.['output'] || '—'),
              balance: String(item.metadata?.['balance'] || '—'),
              shift: item.shift || 'day',
              status: status === 'completed' ? 'Recorded' : 'Pending',
              _tab: item.shift || 'day',
            },
            badgeTone: { status: status === 'completed' ? 'completed' : 'pending' },
            linkRoute: item.admissionId ? `/ward/patient-detail/${item.admissionId}` : undefined,
          },
          item.patientId,
          item.admissionId
        );
      }

      if (item.activityType === 'handover') {
        return withModuleMeta(
          {
            id: item._id,
            cells: {
              shift: item.shift === 'night' ? 'Night Shift' : item.shift === 'evening' ? 'Evening Shift' : 'Day Shift',
              nurse: String(item.metadata?.['nurseName'] || '—'),
              patient: patientName,
              condition: String(item.metadata?.['patientCondition'] || item.description || '—'),
              pending: String(item.metadata?.['pending'] || '0'),
              risk: String(item.metadata?.['riskAlerts'] || '—'),
              updatedAt: item.createdAt ? new Date(item.createdAt).toLocaleString() : '—',
              status: status === 'completed' ? 'Completed' : 'Pending',
              _tab: item.shift || 'day',
            },
            badgeTone: { status: status === 'completed' ? 'completed' : 'pending' },
            linkRoute: item.admissionId ? `/ward/patient-detail/${item.admissionId}` : undefined,
          },
          item.patientId,
          item.admissionId
        );
      }

      if (item.activityType === 'inventory') {
        return withModuleMeta(
          {
            id: item._id,
            cells: {
              item: item.title || '—',
              category: String(item.metadata?.['category'] || 'Consumable'),
              stock: String(item.metadata?.['quantity'] || '0'),
              reorder: String(item.metadata?.['reorderLevel'] || '—'),
              location: String(item.metadata?.['location'] || 'Ward Store'),
              status: status === 'completed' ? 'Available' : 'Low',
              _tab: status === 'completed' ? 'available' : 'low',
            },
            badgeTone: { status: status === 'completed' ? 'completed' : 'critical' },
          },
          item.patientId,
          item.admissionId
        );
      }

      if (item.activityType === 'mar_dose') {
        return withModuleMeta(
          {
            id: item._id,
            cells: {
              patient: patientName,
              medicine: String(item.metadata?.['medicineName'] || item.title || '—'),
              dose: String(item.metadata?.['dose'] || '—'),
              route: String(item.metadata?.['route'] || 'PO'),
              dueTime: item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : '—',
              status: 'Given',
              _tab: 'given',
            },
            badgeTone: { status: 'completed' },
            linkRoute: item.admissionId ? `/ward/patient-detail/${item.admissionId}` : undefined,
          },
          item.patientId,
          item.admissionId
        );
      }

      if (item.activityType === 'nursing_task') {
        return withModuleMeta(
          {
            id: item._id,
            cells: {
              patient: patientName,
              task: item.title || 'Nursing Task',
              priority: item.priority === 'high' || item.priority === 'critical' ? 'High' : 'Medium',
              nurse: String(item.metadata?.['nurseName'] || '—'),
              dueAt: item.createdAt ? formatDisplayDate(item.createdAt) : '—',
              status: status === 'completed' ? 'Completed' : 'Due',
              _tab: status === 'completed' ? 'completed' : 'due',
            },
            badgeTone: {
              priority: item.priority === 'critical' ? 'critical' : item.priority === 'high' ? 'critical' : 'medium',
              status: status === 'completed' ? 'completed' : 'pending',
            },
            linkRoute: item.admissionId ? `/ward/patient-detail/${item.admissionId}` : undefined,
          },
          item.patientId,
          item.admissionId
        );
      }

      if (item.activityType === 'admission_request') {
        return withModuleMeta(
          {
            id: item._id,
            cells: {
              patient: patientName,
              mrn: String(item.metadata?.['mrn'] || '—'),
              bed: String(item.metadata?.['bedLabel'] || '—'),
              doctor: String(item.metadata?.['doctorName'] || '—'),
              admittedOn: '—',
              status: 'Pending',
              _tab: 'pending',
            },
            badgeTone: { status: 'pending' },
          },
          item.patientId,
          item.admissionId
        );
      }

      return withModuleMeta(
        {
          id: item._id,
          cells: {
            patient: patientName,
            task: item.title || item.activityType,
            priority: item.priority || 'normal',
            nurse: '—',
            dueAt: formatDisplayDate(item.createdAt),
            status: status,
            _tab: tab,
          },
          badgeTone: { status: status === 'completed' ? 'completed' : 'pending' },
          linkRoute: item.admissionId ? `/ward/patient-detail/${item.admissionId}` : undefined,
        },
        item.patientId,
        item.admissionId
      );
    });
}

export function mapWardApiBedToRecord(
  bed: Record<string, unknown>,
  allotment?: RoomAllotment | null
): WardBedRecord {
  const patient = allotment?.patient;
  const status = (bed['status'] as WardBedRecord['status']) || 'available';
  return {
    id: String(bed['_id']),
    roomId: String(bed['roomId']),
    bedNo: String(bed['bedNo'] || ''),
    bedType: (bed['bedType'] as WardBedRecord['bedType']) || 'standard',
    status,
    patientId: patient?._id,
    admissionId: allotment?._id,
    patientName: patient ? patientFullName(patient) : undefined,
    age: patient ? patientAge(patient) : undefined,
    sex: patient ? patientSex(patient) : undefined,
    nurseName: allotment?.assignedNurse?.name || undefined,
    occupiedSince: allotment?.admittedAt,
    dailyCharge: Number(bed['dailyCharge'] || 0),
    notes: String(bed['notes'] || ''),
  };
}

export function isPersistedWardBedId(id: string | null | undefined): boolean {
  return /^[a-f\d]{24}$/i.test(String(id || '').trim());
}

export function readRecordId(record: Record<string, unknown>): string {
  const raw = record['_id'] ?? record['id'];
  if (!raw) {
    return '';
  }

  if (typeof raw === 'string' || typeof raw === 'number') {
    return String(raw).trim();
  }

  if (typeof raw === 'object' && raw !== null) {
    const objectId = raw as Record<string, unknown>;
    if (typeof objectId['$oid'] === 'string') {
      return objectId['$oid'];
    }
    if (typeof objectId['_id'] === 'string') {
      return objectId['_id'];
    }
    if (typeof (raw as { toHexString?: () => string }).toHexString === 'function') {
      return (raw as { toHexString: () => string }).toHexString();
    }
    const asString = String(raw).trim();
    if (/^[a-f\d]{24}$/i.test(asString)) {
      return asString;
    }
  }

  return '';
}

export function normalizeHospitalWardRecord(raw: unknown): HospitalWard | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const nested = record['data'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return normalizeHospitalWardRecord(nested);
  }

  const name = String(record['name'] || '').trim();
  if (!name) {
    return null;
  }

  const id = readRecordId(record);
  if (!id) {
    return null;
  }

  return {
    _id: id,
    hospitalId: String(record['hospitalId'] || ''),
    name,
    code: String(record['code'] || ''),
    description: String(record['description'] || ''),
    status: (String(record['status'] || 'active') as HospitalWard['status']),
  };
}

export function normalizeHospitalWardRecords(raw: unknown): HospitalWard[] {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeHospitalWardRecord(item))
      .filter((ward): ward is HospitalWard => Boolean(ward));
  }

  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record['items'])) {
      return normalizeHospitalWardRecords(record['items']);
    }
    if (Array.isArray(record['data'])) {
      return normalizeHospitalWardRecords(record['data']);
    }
    const single = normalizeHospitalWardRecord(raw);
    return single ? [single] : [];
  }

  return [];
}

export function matchesWardFilter(
  room: Room | null | undefined,
  wardFilter: string,
  wards: HospitalWard[] = []
): boolean {
  if (!wardFilter) {
    return true;
  }

  const selectedWard = wards.find((ward) => ward.name === wardFilter);
  if (selectedWard?._id && room?.wardId) {
    return String(room.wardId) === String(selectedWard._id);
  }

  if (selectedWard?._id && room?.ward?._id) {
    return String(room.ward._id) === String(selectedWard._id);
  }

  return wardNameFromRoom(room) === wardFilter;
}
