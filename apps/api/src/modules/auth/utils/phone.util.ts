/**
 * Normalizes phone numbers consistently for backend storage.
 * Default country code: +94 (Sri Lanka).
 * Strips whitespace, hyphens, and parenthesis.
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) {
    return '';
  }
  // Remove whitespace, hyphens, parentheses
  let cleaned = rawPhone.replace(/[\s\-()]/g, '');
  // If already in international format, keep as is
  if (cleaned.startsWith('+')) {
    // ensure format
    return /^\+94\d{9}$/.test(cleaned) ? cleaned : '';
  }
  // Strip leading zero for local format
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }
  // If starts with country code without plus, prepend plus
  if (cleaned.startsWith('94')) {
    cleaned = '+' + cleaned;
  } else {
    // Assume local number without leading zero
    cleaned = '+94' + cleaned;
  }
  // Validate final format
  return /^\+94\d{9}$/.test(cleaned) ? cleaned : '';
}

