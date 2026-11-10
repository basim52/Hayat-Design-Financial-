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

export function getAuthorDisplayName(item?: { createdByEmail?: string; userId?: string } | null, currentAuthEmail?: string | null): string {
  if (!item) return '---';
  const email = (item.createdByEmail || '').trim().toLowerCase();
  if (email.includes('basim5252')) {
    return 'أبو عبود';
  }
  if (email.includes('hayatalzaki')) {
    return 'أم عبود';
  }
  // Fallback if createdByEmail is not recorded yet on older records
  if (currentAuthEmail) {
    const curEmail = currentAuthEmail.trim().toLowerCase();
    if (curEmail.includes('hayatalzaki')) return 'أم عبود';
  }
  return 'أبو عبود';
}

