import { ageYearsFromIsoDate, isoDateFromAgeYears } from './dob-age.util';

describe('dob-age.util', () => {
  const now = new Date('2026-09-06T12:00:00');

  it('computes age from ISO date', () => {
    expect(ageYearsFromIsoDate('1980-09-06', now)).toBe(46);
    expect(ageYearsFromIsoDate('1980-09-07', now)).toBe(45);
  });

  it('builds DOB from age using Jan 1 by default', () => {
    expect(isoDateFromAgeYears(46, '', now)).toBe('1980-01-01');
  });

  it('preserves month/day when adjusting age', () => {
    expect(isoDateFromAgeYears(40, '1990-06-15', now)).toBe('1986-06-15');
  });
});
