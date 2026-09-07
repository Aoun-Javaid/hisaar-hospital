import { normalizeEmail } from './email.util';

describe('normalizeEmail', () => {
  it('lowercases and trims emails', () => {
    expect(normalizeEmail('  Medicare@Gmail.com ')).toBe('medicare@gmail.com');
  });

  it('returns empty string for blank values', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});
