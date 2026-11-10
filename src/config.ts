/**
 * Configuration & Allowed Accounts for Hayat Online
 */

export const ALLOWED_EMAILS = [
  'basim5252@gmail.com',
  'Hayatalzaki@gmail.com'
] as const;

export function isEmailAllowed(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ALLOWED_EMAILS.some(allowed => allowed.trim().toLowerCase() === normalized);
}
