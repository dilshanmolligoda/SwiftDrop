import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { isPublicTrackingNumber } from '../../parcels/parcel-tracking-number.js';
import type { PublicTrackingResponse } from '../domain/parcel.types.js';
import { PublicParcelReader } from '../ports/parcel-reader.port.js';

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
          orderBy: { createdAt: 'asc' },
        },
        statusEvents: {
          select: { status: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!parcel) return null;
    // Both stores contain real events. Retain repeated statuses and timestamps;
    // no pickup/delivery event is inferred from a current status or updatedAt.
    const history = [...parcel.statusHistory, ...parcel.statusEvents]
      .map((event) => ({
        status: event.status,
        occurredAt: event.createdAt.toISOString(),
      }))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return {
      trackingNumber: parcel.trackingNumber,
      status: parcel.status,
      updatedAt: parcel.updatedAt.toISOString(),
      history,
    };
  }
}
