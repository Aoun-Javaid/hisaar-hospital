import { HmsDocumentHospitalInfo } from '../services/hms-document.types';
import { Hospital } from '../../shared/models/hospital.model';

export function readCurrentUserName(): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as { name?: string; email?: string } | null;
    return user?.name || user?.email || 'System User';
  } catch {
    return 'System User';
  }
}

export function mapHospitalDocumentInfo(hospital?: Hospital | null): HmsDocumentHospitalInfo | null {
  if (!hospital) return null;
  const name = String(hospital.name || '').trim();
  if (!name && !hospital.logoUrl && !hospital.address && !hospital.phone) {
    return null;
  }
  return {
    name: name || undefined,
    address: hospital.address || undefined,
    city: hospital.city || undefined,
    phone: hospital.phone || undefined,
    email: hospital.email || undefined,
    logoUrl: hospital.logoUrl || undefined,
  };
}

function readHospitalFromUserStorage(): Hospital | null {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null') as {
      hospital?: Hospital | null;
    } | null;
    return user?.hospital || null;
  } catch {
    return null;
  }
}

export function readStoredHospitalDocumentInfo(): HmsDocumentHospitalInfo | null {
  try {
    const stored = JSON.parse(localStorage.getItem('hospital') || 'null') as Hospital | null;
    const fromHospitalKey = mapHospitalDocumentInfo(stored);
    if (fromHospitalKey?.name) {
      return fromHospitalKey;
    }

    const fromUser = mapHospitalDocumentInfo(readHospitalFromUserStorage());
    if (fromUser?.name) {
      return fromUser;
    }

    return fromHospitalKey || fromUser;
  } catch {
    return mapHospitalDocumentInfo(readHospitalFromUserStorage());
  }
}
