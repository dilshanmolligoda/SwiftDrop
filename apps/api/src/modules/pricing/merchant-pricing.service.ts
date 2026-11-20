import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MerchantPricingRepository,
  type MerchantPricingCharge,
} from './merchant-pricing.repository.js';
import type { PricingHistoryDto } from './dto/pricing-history.dto.js';

export interface MerchantPricingHistoryRow {
  date: string;
  shortDate: string;
  deliveries: number;
  total: number;
  periodLabel: string;
}

export interface MerchantDeliveryCharge {
  trackingNumber: string;
  orderRef: string;
  destinationZone: string;
  weight: string;
  weightKg: number | null;
  deliveryFee: number;
  adjustments: number;
  total: number;
}

export interface MerchantPricingSummary {
  today: {
    date: string;
    deliveries: number;
    total: number;
  };
  period: {
    from: string;
    to: string;
    deliveries: number;
    total: number;
  };
}

export interface MerchantPricingHistory {
  period: {
    from: string;
    to: string;
  };
  history: MerchantPricingHistoryRow[];
  summary: MerchantPricingSummary;
}

export interface MerchantPricingDay {
  date: string;
  shortDate: string;
  deliveries: number;
  total: number;
  charges: MerchantDeliveryCharge[];
}

@Injectable()
export class MerchantPricingService {
  constructor(private readonly repository: MerchantPricingRepository) {}

  async getSummary(
    merchantUserId: string,
    query: PricingHistoryDto,
  ): Promise<MerchantPricingSummary> {
    const period = this.resolvePeriod(query);
    const charges = await this.repository.findCharges(
      merchantUserId,
      period.fromDate,
      period.toExclusiveDate,
    );
    const today = this.dateKey(new Date());
    const todayCharges = charges.filter(
      (charge) => this.dateKey(charge.createdAt) === today,
    );
    const total = this.roundMoney(
      charges.reduce((sum, charge) => sum + this.getFee(charge), 0),
    );

    return {
      today: {
        date: today,
        deliveries: todayCharges.length,
        total: this.roundMoney(
          todayCharges.reduce((sum, charge) => sum + this.getFee(charge), 0),
        ),
      },
      period: {
        from: period.from,
        to: period.to,
        deliveries: charges.length,
        total,
      },
    };
  }

  async getHistory(
    merchantUserId: string,
    query: PricingHistoryDto,
  ): Promise<MerchantPricingHistory> {
    const period = this.resolvePeriod(query);
    const charges = await this.repository.findCharges(
      merchantUserId,
      period.fromDate,
      period.toExclusiveDate,
    );
    const history = this.buildHistory(charges, period.from, period.to);
    const total = this.roundMoney(
      charges.reduce((sum, charge) => sum + this.getFee(charge), 0),
    );

    return {
      period: { from: period.from, to: period.to },
      history,
      summary: {
        today: await this.getTodaySummary(merchantUserId),
        period: {
          from: period.from,
          to: period.to,
          deliveries: charges.length,
          total,
        },
      },
    };
  }

  async getDay(
    merchantUserId: string,
    date: string,
  ): Promise<MerchantPricingDay> {
    if (!this.isDateOnly(date)) {
      throw new BadRequestException('Invalid pricing date');
    }
    const today = this.dateKey(new Date());
    if (date > today) {
      throw new BadRequestException('Pricing date cannot be in the future');
    }

    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const charges = await this.repository.findCharges(
      merchantUserId,
      start,
      end,
    );

    return {
      date,
      shortDate: this.formatShortDate(date),
      deliveries: charges.length,
      total: this.roundMoney(
        charges.reduce((sum, charge) => sum + this.getFee(charge), 0),
      ),
      charges: charges.map((charge) => this.mapCharge(charge)),
    };
  }

  async getTodaySummary(
    merchantUserId: string,
  ): Promise<{ date: string; deliveries: number; total: number }> {
    const today = this.dateKey(new Date());
    const start = new Date(`${today}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const charges = await this.repository.findCharges(
      merchantUserId,
      start,
      end,
    );
    return {
      date: today,
      deliveries: charges.length,
      total: this.roundMoney(
        charges.reduce((sum, charge) => sum + this.getFee(charge), 0),
      ),
    };
  }

  private resolvePeriod(query: PricingHistoryDto): {
    from: string;
    to: string;
    fromDate: Date;
    toExclusiveDate: Date;
  } {
    const today = this.dateKey(new Date());
    const to = query.to ?? today;
    const from = query.from ?? this.addUtcDays(to, -6);

    if (!this.isDateOnly(from) || !this.isDateOnly(to)) {
      throw new BadRequestException('Invalid pricing date range');
    }
    if (from > to) {
      throw new BadRequestException(
        'Pricing from-date cannot be after to-date',
      );
    }
    if (to > today) {
      throw new BadRequestException('Pricing dates cannot be in the future');
    }

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);
    toDate.setUTCDate(toDate.getUTCDate() + 1);

    return { from, to, fromDate, toExclusiveDate: toDate };
  }

  private buildHistory(
    charges: MerchantPricingCharge[],
    from: string,
    to: string,
  ): MerchantPricingHistoryRow[] {
    const grouped = new Map<string, MerchantPricingCharge[]>();
    for (const charge of charges) {
      const key = this.dateKey(charge.createdAt);
      const rows = grouped.get(key) ?? [];
      rows.push(charge);
      grouped.set(key, rows);
    }

    const rows: MerchantPricingHistoryRow[] = [];
    for (let date = from; date <= to; date = this.addUtcDays(date, 1)) {
      const dayCharges = grouped.get(date) ?? [];
      rows.unshift({
        date,
        shortDate: this.formatShortDate(date),
        deliveries: dayCharges.length,
        total: this.roundMoney(
          dayCharges.reduce((sum, charge) => sum + this.getFee(charge), 0),
        ),
        periodLabel: this.formatShortDate(date),
      });
    }
    return rows;
  }

  private mapCharge(charge: MerchantPricingCharge): MerchantDeliveryCharge {
    const fee = this.getFee(charge);
    return {
      trackingNumber: charge.trackingNumber,
      orderRef: charge.reference,
      destinationZone: this.destinationZone(charge.destination),
      weight: charge.weightKg == null ? '-' : `${charge.weightKg} kg`,
      weightKg: charge.weightKg,
      deliveryFee: fee,
      adjustments: 0,
      total: fee,
    };
  }

  private destinationZone(destination: string): string {
    const value = destination.toLowerCase();
    if (value.includes('colombo')) return 'Colombo Central';
    if (
      /dehiwala|nugegoda|maharagama|moratuwa|kotte|battaramulla|kotte/.test(
        value,
      )
    ) {
      return 'Colombo South';
    }
    if (/gampaha|kalutara|negombo|panadura|wattala|kelaniya/.test(value)) {
      return 'Western Province';
    }
    return 'Island Wide';
  }

  private getFee(charge: MerchantPricingCharge): number {
    return this.roundMoney(charge.feeLkr ?? 0);
  }

  private dateKey(value: Date): string {
    return [
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, '0'),
      String(value.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  private isDateOnly(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private addUtcDays(date: string, amount: number): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + amount);
    return this.dateKey(value);
  }

  private formatShortDate(date: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00.000Z`));
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
