import { randomBytes } from 'node:crypto';
import {
  generateParcelTrackingNumber,
  isPublicTrackingNumber,
} from './parcel-tracking-number.js';

jest.mock('node:crypto', () => ({ randomBytes: jest.fn() }));

describe('Parcel public tracking identifiers', () => {
  it('encodes all 128 cryptographically random bits without truncation', () => {
    const bytes = Buffer.from('0123456789abcdeffedcba9876543210', 'hex');
    jest.mocked(randomBytes).mockImplementation(() => bytes);
    expect(generateParcelTrackingNumber()).toBe(
      'SD-0123456789ABCDEFFEDCBA9876543210',
    );
    expect(randomBytes).toHaveBeenCalledWith(16);
  });

  it.each([
    'SD-21011',
    'SD-DEMO-00001',
    'SD-' + 'A'.repeat(31),
    'SD-' + 'A'.repeat(33),
    'SD-' + 'G'.repeat(32),
    'sd-' + 'a'.repeat(32),
    '',
  ])('rejects non-public format %s', (value) => {
    expect(isPublicTrackingNumber(value)).toBe(false);
  });

  it('recognizes the new format without changing private validation', () => {
    expect(isPublicTrackingNumber('SD-' + 'A'.repeat(32))).toBe(true);
  });
});
