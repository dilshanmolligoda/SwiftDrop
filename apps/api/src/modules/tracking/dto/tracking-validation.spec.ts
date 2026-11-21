import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { normalizeTrackingNumber } from '../domain/tracking-number.js';
import {
  DeliveryHistoryQueryDto,
  parseDeliveryHistoryQuery,
} from './delivery-history-query.dto.js';
import { TrackingNumberParamsDto } from './tracking-number-params.dto.js';

describe('Tracking input validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it.each(['sd-24819', '  sd-col-12345  ', 'a1', '1'])(
    'normalizes valid input %s without requiring a specific prefix',
    (value) => {
      expect(normalizeTrackingNumber(value)).toBe(value.trim().toUpperCase());
    },
  );

  it.each([
    '',
    '   ',
    null,
    undefined,
    123,
    true,
    ['SD-1'],
    {},
    'SD/1',
    'SD 1',
    'SD_1',
    '../SD-1',
    'SD-1?customerId=other',
    '<script>',
    '-SD-1',
    'SD-1-',
    'SD--1',
    'A'.repeat(65),
  ])('rejects invalid tracking input %p', (value) => {
    expect(() => normalizeTrackingNumber(value)).toThrow(BadRequestException);
  });

  it('accepts the bounded maximum tracking number length', () => {
    expect(normalizeTrackingNumber('a'.repeat(64))).toHaveLength(64);
  });

  it('uses the same normalization through the existing Nest validation pipe', async () => {
    const result: unknown = await pipe.transform(
      { trackingNumber: '  sd-24819 ' },
      { type: 'param', metatype: TrackingNumberParamsDto },
    );
    expect(result).toEqual({ trackingNumber: 'SD-24819' });
    await expect(
      pipe.transform(
        {},
        {
          type: 'param',
          metatype: TrackingNumberParamsDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { trackingNumber: 'SD/1' },
        {
          type: 'param',
          metatype: TrackingNumberParamsDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('supplies history defaults and normalizes search and numeric query strings', async () => {
    expect(parseDeliveryHistoryQuery({})).toEqual({
      filter: 'all',
      search: '',
      page: 1,
      pageSize: 5,
    });
    const input = {
      filter: 'history',
      search: '  sd-ab  ',
      page: '2',
      pageSize: '10',
    };
    expect(parseDeliveryHistoryQuery(input)).toEqual({
      filter: 'history',
      search: 'SD-AB',
      page: 2,
      pageSize: 10,
    });
    const throughPipe: unknown = await pipe.transform(input, {
      type: 'query',
      metatype: DeliveryHistoryQueryDto,
    });
    expect(throughPipe).toEqual(parseDeliveryHistoryQuery(input));
  });

  it.each([
    null,
    [],
    'all',
    { filter: 'delivered' },
    { filter: null },
    { search: 1 },
    { search: null },
    { search: 'a'.repeat(65) },
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: true },
    { page: '' },
    { page: '1e2' },
    { page: ['1'] },
    { page: '1.0' },
    { page: Infinity },
    { page: '9007199254740993' },
    { page: 1_000_001 },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: false },
    { customerId: 'other-customer' },
    { unexpected: 'field' },
  ])('rejects invalid or unexpected history query %p', (query) => {
    expect(() => parseDeliveryHistoryQuery(query)).toThrow(BadRequestException);
  });
});
