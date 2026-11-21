import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { Role } from '../../generated/prisma/enums.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PricingHistoryDto } from './dto/pricing-history.dto.js';
import {
  MerchantPricingService,
  type MerchantPricingDay,
  type MerchantPricingHistory,
  type MerchantPricingSummary,
} from './merchant-pricing.service.js';

@Controller('merchant/pricing')
@Roles(Role.MERCHANT)
export class MerchantPricingController {
  constructor(
    private readonly merchantPricingService: MerchantPricingService,
  ) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PricingHistoryDto,
  ): Promise<MerchantPricingSummary> {
    return this.merchantPricingService.getSummary(user.id, query);
  }

  @Get('history')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PricingHistoryDto,
  ): Promise<MerchantPricingHistory> {
    return this.merchantPricingService.getHistory(user.id, query);
  }

  @Get('history/export')
  async exportHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PricingHistoryDto,
    @Query('format') format: 'csv' | 'pdf' = 'csv',
    @Res() response: Response,
  ): Promise<void> {
    const history = await this.merchantPricingService.getHistory(
      user.id,
      query,
    );
    if (format === 'pdf') {
      const pdf = await this.createHistoryPdf(history);
      response
        .setHeader('Content-Type', 'application/pdf')
        .setHeader(
          'Content-Disposition',
          'attachment; filename="merchant-pricing-history.pdf"',
        )
        .status(200)
        .send(pdf);
      return;
    }

    const rows = [
      ['Date', 'Charged deliveries', 'Total cost LKR'],
      ...history.history.map((row) => [
        row.shortDate,
        String(row.deliveries),
        row.total.toFixed(2),
      ]),
    ];
    response
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        'attachment; filename="merchant-pricing-history.csv"',
      )
      .status(200)
      .send(this.toCsv(rows));
  }

  @Get('days/:date/export')
  async exportDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date') date: string,
    @Query('format') format: 'csv' | 'pdf' = 'csv',
    @Res() response: Response,
  ): Promise<void> {
    const day = await this.merchantPricingService.getDay(user.id, date);
    if (format === 'pdf') {
      const pdf = await this.createDayPdf(day);
      response
        .setHeader('Content-Type', 'application/pdf')
        .setHeader(
          'Content-Disposition',
          `attachment; filename="merchant-pricing-${date}.pdf"`,
        )
        .status(200)
        .send(pdf);
      return;
    }

    const rows = [
      [
        'Tracking number',
        'Order reference',
        'Destination zone',
        'Weight',
        'Delivery fee LKR',
        'Adjustments LKR',
        'Total LKR',
      ],
      ...day.charges.map((charge) => [
        charge.trackingNumber,
        charge.orderRef,
        charge.destinationZone,
        charge.weight,
        charge.deliveryFee.toFixed(2),
        charge.adjustments.toFixed(2),
        charge.total.toFixed(2),
      ]),
    ];
    response
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="merchant-pricing-${date}.csv"`,
      )
      .status(200)
      .send(this.toCsv(rows));
  }

  @Get('days/:date')
  getDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date') date: string,
  ): Promise<MerchantPricingDay> {
    return this.merchantPricingService.getDay(user.id, date);
  }

  private toCsv(rows: string[][]): string {
    return rows
      .map((row) =>
        row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','),
      )
      .join('\r\n');
  }

  private async createHistoryPdf(
    history: MerchantPricingHistory,
  ): Promise<Buffer> {
    const lines = [
      'SwiftDrop Merchant Pricing History',
      `Period: ${history.period.from} to ${history.period.to}`,
      '',
      ...history.history.map(
        (row) =>
          `${row.shortDate} | ${row.deliveries} deliveries | LKR ${row.total.toFixed(2)}`,
      ),
      '',
      `Period total: LKR ${history.summary.period.total.toFixed(2)}`,
    ];
    return this.createPdf(lines);
  }

  private async createDayPdf(day: MerchantPricingDay): Promise<Buffer> {
    const lines = [
      'SwiftDrop Daily Cost Breakdown',
      `Date: ${day.shortDate}`,
      `Charged deliveries: ${day.deliveries}`,
      `Total: LKR ${day.total.toFixed(2)}`,
      '',
      ...day.charges.map(
        (charge) =>
          `${charge.trackingNumber} | ${charge.orderRef} | ${charge.destinationZone} | ${charge.weight} | Fee LKR ${charge.deliveryFee.toFixed(2)} | Total LKR ${charge.total.toFixed(2)}`,
      ),
    ];
    return this.createPdf(lines);
  }

  private createPdf(lines: string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      document.fontSize(16).text(lines[0], { underline: true });
      document.moveDown();
      document.fontSize(10);
      for (const line of lines.slice(1)) {
        document.text(line);
      }
      document.end();
    });
  }
}
