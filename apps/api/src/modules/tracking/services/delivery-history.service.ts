import {
  Inject,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import type {
  DeliveryHistoryPage,
  DeliverySummary,
  ParcelReadRecord,
} from '../domain/parcel.types.js';
import { projectDeliveryHistory } from '../domain/parcel-projections.js';
import { parseDeliveryHistoryQuery } from '../dto/delivery-history-query.dto.js';
import { ParcelReader } from '../ports/parcel-reader.port.js';
import {
  ParcelStatusPolicy,
  type ParcelStatusCategory,
} from '../ports/parcel-status-policy.port.js';
import { requireCustomer } from './customer-access.js';

function reportingMonth(date: Date): string | null {
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Colombo',
  }).formatToParts(date);
  return `${parts.find(({ type }) => type === 'year')?.value}-${parts.find(({ type }) => type === 'month')?.value}`;
}

@Injectable()
export class DeliveryHistoryService {
  constructor(
    @Inject(ParcelReader) private readonly reader: ParcelReader,
    @Inject(ParcelStatusPolicy)
    private readonly statusPolicy: ParcelStatusPolicy,
  ) {}

  private classify(status: string): ParcelStatusCategory {
    const category = this.statusPolicy.classify(status);
    if (
      !['active', 'delivered', 'failed', 'other-terminal'].includes(category)
    ) {
      throw new ServiceUnavailableException(
        'Parcel status classification is unavailable',
      );
    }
    return category;
  }

  private async readOwnedParcels(
    user: AuthenticatedUser | null | undefined,
  ): Promise<readonly ParcelReadRecord[]> {
    const customerId = requireCustomer(user);
    const parcels = await this.reader.listCustomerParcels(customerId);
    // Fail closed on a broken reader contract instead of exposing mixed-owner
    // data or returning misleading customer totals.
    if (parcels.some((parcel) => parcel.customerId !== customerId)) {
      throw new InternalServerErrorException(
        'Unable to read customer deliveries',
      );
    }
    if (
      parcels.some((parcel) => !Number.isFinite(Date.parse(parcel.createdAt)))
    ) {
      throw new InternalServerErrorException(
        'Unable to read customer deliveries',
      );
    }
    return parcels;
  }

  async listCustomerDeliveries(
    user: AuthenticatedUser | null | undefined,
    input: unknown = {},
  ): Promise<DeliveryHistoryPage> {
    requireCustomer(user);
    const query = parseDeliveryHistoryQuery(input);
    const parcels = await this.readOwnedParcels(user);
    const matches = parcels
      .filter((parcel) => {
        const category = this.classify(parcel.status);
        return (
          (query.filter === 'all' ||
            (query.filter === 'active'
              ? category === 'active'
              : category !== 'active')) &&
          parcel.trackingNumber.toUpperCase().includes(query.search)
        );
      })
      .sort((a, b) => {
        const byDate = Date.parse(b.createdAt) - Date.parse(a.createdAt);
        return byDate || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1);
      });
    const offset = (query.page - 1) * query.pageSize;
    return {
      items: matches
        .slice(offset, offset + query.pageSize)
        .map(projectDeliveryHistory),
      page: query.page,
      pageSize: query.pageSize,
      total: matches.length,
    };
  }

  async getCustomerSummary(
    user: AuthenticatedUser | null | undefined,
    now: Date = new Date(),
  ): Promise<DeliverySummary> {
    requireCustomer(user);
    const month = reportingMonth(now);
    if (!month)
      throw new InternalServerErrorException('Invalid reporting clock');
    const parcels = await this.readOwnedParcels(user);
    let activeDeliveries = 0;
    let deliveredThisMonth: number | null = 0;
    let needsAttention = 0;
    for (const parcel of parcels) {
      const category = this.classify(parcel.status);
      if (category === 'active') activeDeliveries++;
      if (category === 'failed') needsAttention++;
      if (category === 'delivered') {
        const deliveredMonth = parcel.deliveredAt
          ? reportingMonth(new Date(parcel.deliveredAt))
          : null;
        if (!deliveredMonth) deliveredThisMonth = null;
        else if (deliveredMonth === month && deliveredThisMonth !== null) {
          deliveredThisMonth++;
        }
      }
    }
    return {
      activeDeliveries,
      deliveredThisMonth,
      needsAttention,
      reportingMonth: month,
      timeZone: 'Asia/Colombo',
    };
  }
}
