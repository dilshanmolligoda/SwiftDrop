import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { buildReceiptDocument } from './receipt-document.js';
import type { ReceiptDocument } from './receipt.types.js';

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 44;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;
const GREEN = rgb(13 / 255, 94 / 255, 54 / 255);
const INK = rgb(15 / 255, 23 / 255, 42 / 255);
const MUTED = rgb(71 / 255, 85 / 255, 105 / 255);
const BORDER = rgb(226 / 255, 232 / 255, 240 / 255);
const PALE = rgb(240 / 255, 247 / 255, 243 / 255);

export class ReceiptFontError extends Error {
  constructor() {
    super('Receipt text requires an approved Unicode font configuration');
    this.name = 'ReceiptFontError';
  }
}

/** Small, bounded text layout. Long words wrap rather than disappearing off-page. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

class ReceiptLayout {
  private page!: PDFPage;
  private y = 0;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  private newPage(continued: boolean): void {
    this.page = this.pdf.addPage([WIDTH, HEIGHT]);
    this.page.drawRectangle({
      x: 0,
      y: HEIGHT - 8,
      width: WIDTH,
      height: 8,
      color: GREEN,
    });
    this.page.drawText('SwiftDrop', {
      x: MARGIN,
      y: HEIGHT - 57,
      font: this.bold,
      size: 25,
      color: GREEN,
    });
    this.page.drawText(
      continued ? 'Delivery receipt - continued' : 'Delivery receipt',
      { x: MARGIN, y: HEIGHT - 80, font: this.regular, size: 12, color: MUTED },
    );
    this.y = HEIGHT - 112;
  }

  private ensureSpace(height: number): void {
    if (this.y - height < 74) this.newPage(true);
  }

  private textLines(
    lines: readonly string[],
    x: number,
    y: number,
    size: number,
    bold = false,
    color = INK,
  ): void {
    lines.forEach((line, index) =>
      this.page.drawText(line, {
        x,
        y: y - index * (size + 4),
        size,
        font: bold ? this.bold : this.regular,
        color,
      }),
    );
  }

  private field(label: string, value: string): void {
    const lines = wrap(value, this.regular, 11, CONTENT_WIDTH);
    const height = 22 + lines.length * 15;
    this.ensureSpace(height);
    this.textLines([label.toUpperCase()], MARGIN, this.y, 8, true, MUTED);
    this.textLines(lines, MARGIN, this.y - 17, 11);
    this.y -= height;
  }

  private parties(document: ReceiptDocument): void {
    const gap = 18;
    const columnWidth = (CONTENT_WIDTH - gap) / 2;
    const innerWidth = columnWidth - 28;
    const columns = [
      {
        heading: 'SENDER / PICKUP',
        party: document.sender,
        address: document.pickupAddress,
      },
      {
        heading: 'RECIPIENT / DESTINATION',
        party: document.recipient,
        address: document.destinationAddress,
      },
    ].map(({ heading, party, address }) => ({
      heading,
      name: wrap(party.name, this.bold, 11, innerWidth),
      phone: party.phone ? wrap(party.phone, this.regular, 10, innerWidth) : [],
      address: wrap(address, this.regular, 10, innerWidth),
    }));
    const height = Math.max(
      ...columns.map(
        (column) =>
          52 +
          column.name.length * 15 +
          column.phone.length * 14 +
          column.address.length * 14,
      ),
    );
    this.ensureSpace(height + 22);
    columns.forEach((column, index) => {
      const x = MARGIN + index * (columnWidth + gap);
      this.page.drawRectangle({
        x,
        y: this.y - height,
        width: columnWidth,
        height,
        borderColor: BORDER,
        borderWidth: 1,
      });
      this.textLines([column.heading], x + 14, this.y - 20, 8, true, GREEN);
      let y = this.y - 42;
      this.textLines(column.name, x + 14, y, 11, true);
      y -= column.name.length * 15 + 5;
      this.textLines(column.phone, x + 14, y, 10, false, MUTED);
      y -= column.phone.length * 14 + 5;
      this.textLines(column.address, x + 14, y, 10, false, MUTED);
    });
    this.y -= height + 22;
  }

  render(document: ReceiptDocument): void {
    this.newPage(false);
    this.field('Receipt reference', document.reference);
    this.field('Booking date', document.bookingDate);
    this.y -= 8;
    this.parties(document);
    this.field('Tracking number', document.trackingNumber);
    this.field('Delivery status', document.deliveryStatus);
    if (document.deliveryDate)
      this.field('Recorded delivery date', document.deliveryDate);

    const notes = wrap(document.note, this.regular, 9, CONTENT_WIDTH);
    this.ensureSpace(100 + notes.length * 13);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 64,
      width: CONTENT_WIDTH,
      height: 64,
      color: PALE,
    });
    this.textLines(
      [document.chargeLabel],
      MARGIN + 16,
      this.y - 25,
      10,
      false,
      GREEN,
    );
    const amountWidth = this.bold.widthOfTextAtSize(
      document.formattedCharge,
      18,
    );
    this.textLines(
      [document.formattedCharge],
      WIDTH - MARGIN - 16 - amountWidth,
      this.y - 49,
      18,
      true,
      GREEN,
    );
    this.y -= 88;
    this.textLines(notes, MARGIN, this.y, 9, false, MUTED);

    const pages = this.pdf.getPages();
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: MARGIN, y: 53 },
        end: { x: WIDTH - MARGIN, y: 53 },
        thickness: 0.7,
        color: BORDER,
      });
      page.drawText('SwiftDrop | Delivery receipt', {
        x: MARGIN,
        y: 35,
        font: this.regular,
        size: 8,
        color: MUTED,
      });
      const counter = `Page ${index + 1} of ${pages.length}`;
      page.drawText(counter, {
        x: WIDTH - MARGIN - this.regular.widthOfTextAtSize(counter, 8),
        y: 35,
        font: this.regular,
        size: 8,
        color: MUTED,
      });
    });
  }
}

/** Formatting only. ReceiptService must authorize real downloads first. */
@Injectable()
export class ReceiptPdfService {
  async generateFromTrustedData(data: unknown): Promise<Buffer> {
    const document = buildReceiptDocument(data);
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const textValues = [
      document.reference,
      document.trackingNumber,
      document.bookingDate,
      document.deliveryStatus,
      document.deliveryDate ?? '',
      document.sender.name,
      document.sender.phone ?? '',
      document.recipient.name,
      document.recipient.phone ?? '',
      document.pickupAddress,
      document.destinationAddress,
    ];
    // Built-in fonts do not cover all scripts. Fail clearly instead of silently
    // deleting/transliterating customer names. No remote or system font loading.
    try {
      for (const value of textValues)
        regular.encodeText(value.replace(/\n/g, ' '));
    } catch {
      throw new ReceiptFontError();
    }
    pdf.setTitle('SwiftDrop delivery receipt');
    pdf.setAuthor('SwiftDrop');
    pdf.setSubject('Recorded delivery charge');
    new ReceiptLayout(pdf, regular, bold).render(document);
    return Buffer.from(await pdf.save());
  }
}
