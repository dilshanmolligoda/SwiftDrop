import { randomBytes } from 'node:crypto';

// Public identifiers are bearer capabilities: 16 random bytes, not a sequence.
// Legacy numbers remain valid for authenticated APIs, but never public lookup.
const PUBLIC_TRACKING_NUMBER = /^SD-[A-F0-9]{32}$/;

export function generateParcelTrackingNumber(): string {
  return `SD-${randomBytes(16).toString('hex').toUpperCase()}`;
}

export function isPublicTrackingNumber(value: string): boolean {
  return PUBLIC_TRACKING_NUMBER.test(value);
}
