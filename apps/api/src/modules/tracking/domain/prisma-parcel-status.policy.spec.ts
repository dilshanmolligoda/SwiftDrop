import { ServiceUnavailableException } from '@nestjs/common';
import { ParcelStatus } from '../../../generated/prisma/enums.js';
import { PrismaParcelStatusPolicy } from './prisma-parcel-status.policy.js';

describe('PrismaParcelStatusPolicy', () => {
  const policy = new PrismaParcelStatusPolicy();

  it.each([
    [ParcelStatus.PENDING, 'active', false],
    [ParcelStatus.PICKED_UP, 'active', false],
    [ParcelStatus.IN_TRANSIT, 'active', false],
    [ParcelStatus.OUT_FOR_DELIVERY, 'active', false],
    [ParcelStatus.DELIVERED, 'delivered', false],
    [ParcelStatus.FAILED, 'failed', true],
    [ParcelStatus.RETURNED, 'other-terminal', true],
  ])(
    'explicitly classifies %s as %s with attention=%s',
    (status, category, attention) => {
      expect(policy.classify(status)).toBe(category);
      expect(policy.needsAttention(status)).toBe(attention);
    },
  );

  it.each([
    'CREATED',
    'ACCEPTED',
    'AWAITING_PICKUP',
    'DELIVERY_FAILED',
    '',
    'toString',
    '__proto__',
  ])('rejects unsupported status %p', (status) => {
    expect(() => policy.classify(status)).toThrow(ServiceUnavailableException);
    expect(() => policy.needsAttention(status)).toThrow(
      ServiceUnavailableException,
    );
  });
});
