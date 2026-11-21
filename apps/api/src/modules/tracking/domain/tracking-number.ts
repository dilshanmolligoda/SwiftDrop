import { BadRequestException } from '@nestjs/common';

// Transport bounds only: no SD prefix or canonical tracking format is assumed.
export const TRACKING_NUMBER_MAX_LENGTH = 64;
const TRACKING_NUMBER_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function normalizeTrackingNumber(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Tracking number must be a string');
  }
  const normalized = value.trim().toUpperCase();
  if (
    normalized.length > TRACKING_NUMBER_MAX_LENGTH ||
    !TRACKING_NUMBER_PATTERN.test(normalized)
  ) {
    throw new BadRequestException(
      'Tracking number must contain 1–64 letters, digits, or separating hyphens',
    );
  }
  return normalized;
}
