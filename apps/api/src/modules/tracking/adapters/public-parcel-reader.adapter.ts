import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { isPublicTrackingNumber } from '../../parcels/parcel-tracking-number.js';
import type { PublicTrackingResponse } from '../domain/parcel.types.js';
import { PublicParcelReader } from '../ports/parcel-reader.port.js';
import { mergeParcelEvents } from '../domain/parcel-events.js';

@Injectable()
export class PublicParcelReaderAdapter extends PublicParcelReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findPublicParcel(
    trackingNumber: string,
  ): Promise<PublicTrackingResponse | null> {
    // Enforce eligibility here as well as in the service, before any DB query.
    if (!isPublicTrackingNumber(trackingNumber)) return null;
    const parcel = await this.prisma.parcel.findUnique({
      where: { trackingNumber },
      select: {
        trackingNumber: true,
        status: true,
        updatedAt: true,
        statusHistory: {
          select: { status: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        statusEvents: {
          select: { status: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!parcel) return null;
    const history = mergeParcelEvents(
      parcel.statusHistory,
      parcel.statusEvents,
    );
    return {
      trackingNumber: parcel.trackingNumber,
      status: parcel.status,
      updatedAt: parcel.updatedAt.toISOString(),
      history,
    };
  }
}
