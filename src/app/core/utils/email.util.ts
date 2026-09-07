/** Normalize emails for API payloads (trim + lowercase). */
export function normalizeEmail(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
