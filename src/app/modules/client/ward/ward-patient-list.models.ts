export type PatientStatus =
  | 'stable'
  | 'watch'
  | 'critical'
  | 'dischargePlanned'
  | 'pendingAssignment';

export interface WardPatient {
  admissionId: string;
  admissionNo?: string;
  patientId: string;
  patientName: string;
  mrn: string;
  bedNo: string;
  wardName: string;
  roomName: string;
  galleryName: string;
  age: number;
  sex: 'M' | 'F';
  diagnosis: string;
  allergies?: string;
  bloodGroup?: string;
  photoUrl?: string;
  doctorId: string;
  doctorName: string;
  nurseId?: string;
  nurseName?: string;
  admittedOn: string;
  status: PatientStatus;
  medicationsDue: number;
  vitalsDue: number;
  dripsRunning: number;
  nursingTasksDue: number;
  criticalAlerts: number;
}

export type PatientStatusTab = 'all' | PatientStatus;

export interface WardPatientListFilters {
  ward: string;
  date: string;
  shift: string;
  statusTab: PatientStatusTab;
  search: string;
  doctor: string;
  nurse: string;
  room: string;
  unassignedNurseOnly: boolean;
}

export interface WardPatientKpi {
  key: string;
  label: string;
  count: number;
  icon: string;
  tone: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'amber';
  description?: string;
  filterTab?: PatientStatusTab;
  unassignedOnly?: boolean;
}
