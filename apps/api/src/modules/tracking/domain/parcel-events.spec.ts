import { InternalServerErrorException } from '@nestjs/common';
import {
  mergeParcelEvents,
  type RecordedParcelEvent,
} from './parcel-events.js';

describe('Recorded parcel event merge', () => {
  const event = (
    status: string,
    time: string,
    id?: string,
  ): RecordedParcelEvent => ({
    status,
    createdAt: new Date(time),
    ...(id ? { id } : {}),
  });
  const instant = '2026-11-01T00:00:00.000Z';

  it('preserves creation and every recorded courier stage without inferring pickup from assignment', () => {
    const history = mergeParcelEvents(
      [event('PENDING', '2026-11-01T00:00:01Z')],
      [
        'CREATED',
        'ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'FAILED',
        'RETURNED',
      ].map((status, index) =>
        event(
          status,
          `2026-11-01T00:00:${String(index * 2).padStart(2, '0')}Z`,
        ),
      ),
    );
    expect(history.map((item) => item.status)).toEqual([
      'CREATED',
      'PENDING',
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'FAILED',
      'RETURNED',
    ]);
    expect(mergeParcelEvents([], [event('ASSIGNED', instant)])).toEqual([
      { status: 'ASSIGNED', occurredAt: instant },
    ]);
    expect(mergeParcelEvents([], [])).toEqual([]);
  });

  it('coalesces exact status/instant copies across sources, including equivalent timezones', () => {
    expect(
      mergeParcelEvents(
        [event('PICKED_UP', instant)],
        [event('PICKED_UP', '2026-11-01T05:30:00+05:30')],
      ),
    ).toEqual([{ status: 'PICKED_UP', occurredAt: instant }]);
  });

  it('retains real repeated transitions and never uses fuzzy timestamp deduplication', () => {
    expect(
      mergeParcelEvents(
        [event('IN_TRANSIT', instant), event('IN_TRANSIT', instant)],
        [
          event('IN_TRANSIT', instant),
          event('IN_TRANSIT', '2026-11-01T00:00:00.001Z'),
        ],
      ),
    ).toEqual([
      { status: 'IN_TRANSIT', occurredAt: instant },
      { status: 'IN_TRANSIT', occurredAt: instant },
      { status: 'IN_TRANSIT', occurredAt: '2026-11-01T00:00:00.001Z' },
    ]);
    expect(
      mergeParcelEvents(
        [event('ASSIGNED', instant)],
        [event('ASSIGNED', instant), event('ASSIGNED', instant)],
      ),
    ).toHaveLength(2);
    expect(
      mergeParcelEvents(
        [],
        [event('ASSIGNED', instant), event('ASSIGNED', instant)],
      ),
    ).toHaveLength(2);
  });

  it('uses stable source/ID order for ties without inventing stage order or mutating either input', () => {
    const booking = Object.freeze([
      event('RETURNED', '2026-11-02T00:00:00Z'),
      event('PENDING', instant, 'b'),
      event('CREATED', instant, 'a'),
    ]);
    const courier = Object.freeze([event('ASSIGNED', instant, 'z')]);
    expect(
      mergeParcelEvents(booking, courier).map((item) => item.status),
    ).toEqual(['CREATED', 'PENDING', 'ASSIGNED', 'RETURNED']);
    expect(booking[0].status).toBe('RETURNED');
    expect(courier[0].id).toBe('z');
  });

  it('projects status and timestamp only, never private metadata or internal IDs', () => {
    const source = Object.assign(event('FAILED', instant, 'PRIVATE_EVENT_ID'), {
      note: 'PRIVATE_NOTE',
      actorId: 'PRIVATE_ACTOR',
      proofId: 'PRIVATE_PROOF',
      location: 'PRIVATE_LOCATION',
      recipientAddress: 'PRIVATE_ADDRESS',
    });
    expect(mergeParcelEvents([], [source])).toEqual([
      { status: 'FAILED', occurredAt: instant },
    ]);
  });

  it.each([true, false])(
    'rejects invalid stored timestamps in either source (booking=%s)',
    (booking) => {
      const invalid = [event('PENDING', 'invalid')];
      expect(() =>
        mergeParcelEvents(booking ? invalid : [], booking ? [] : invalid),
      ).toThrow(InternalServerErrorException);
    },
  );

  it('fails on a missing event inclusion instead of treating it as a confirmed empty source', () => {
    expect(() =>
      mergeParcelEvents([], undefined as unknown as RecordedParcelEvent[]),
    ).toThrow(InternalServerErrorException);
  });
});
