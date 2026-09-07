/** Helpers for DOB entry via age (data-entry friendly). */

export const todayIsoDate = (now = new Date()): string => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const ageYearsFromIsoDate = (isoDate?: string | null, now = new Date()): number | null => {
  if (!isoDate) {
    return null;
  }
  const birth = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) {
    return null;
  }
  let years = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    years -= 1;
  }
  if (years < 0 || years > 150) {
    return null;
  }
  return years;
};

/**
 * Build YYYY-MM-DD from age in years.
 * Keeps existing month/day when present; otherwise uses Jan 1 (common when exact DOB unknown).
 */
export const isoDateFromAgeYears = (
  ageYears: number,
  existingIsoDate?: string | null,
  now = new Date()
): string | null => {
  const age = Math.floor(Number(ageYears));
  if (!Number.isFinite(age) || age < 0 || age > 150) {
    return null;
  }

  const year = now.getFullYear() - age;
  let month = '01';
  let day = '01';
  const existing = String(existingIsoDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(existing)) {
    month = existing.slice(5, 7);
    day = existing.slice(8, 10);
  }

  const candidate = `${year}-${month}-${day}`;
  const parsed = new Date(`${candidate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return `${year}-01-01`;
  }
  return candidate;
};
