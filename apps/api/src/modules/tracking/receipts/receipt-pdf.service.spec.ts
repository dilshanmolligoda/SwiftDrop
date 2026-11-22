import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { ReceiptFontError, ReceiptPdfService } from './receipt-pdf.service.js';
import type { ReceiptData } from './receipt.types.js';
import { InvalidReceiptDataError } from './receipt-validation.js';

/** Inspect reloaded PDF content, not merely a mocked renderer or %PDF prefix. */
function pageText(pdf: PDFDocument): string[][] {
  return pdf.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? Array.from({ length: contents.size() }, (_, index) =>
            contents.lookup(index, PDFRawStream),
          )
        : contents instanceof PDFRawStream
          ? [contents]
          : [];
    const commands = streams
      .map((stream) =>
        Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'),
      )
      .join('\n');
    return Array.from(commands.matchAll(/<([0-9A-F]+)>\s*Tj/g), (match) =>
      Buffer.from(match[1], 'hex').toString('latin1'),
    );
  });
}

describe('ReceiptPdfService (real pdf-lib renderer)', () => {
  const renderer = new ReceiptPdfService();
  const fixture = (): ReceiptData => ({
    reference: 'RCPT-TEST-001',
    trackingNumber: 'TEST-123',
    bookedAt: '2026-11-01T06:30:00Z',
    sender: { name: 'Alice Example', phone: '+94 11 000 0000' },
    recipient: { name: 'Bob Example' },
    pickupAddress: '123 Test Lane, Colombo',
    destinationAddress: '456 Fixture Road, Kandy',
    deliveryFeeMinor: 123456,
    currency: 'LKR',
    deliveryStatus: 'SOURCE_STATUS',
  });

  it('creates an actual A4 PDF with receipt fields and exact recorded monetary text', async () => {
    const bytes = await renderer.generateFromTrustedData(fixture());
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe('SwiftDrop delivery receipt');
    expect(pdf.getAuthor()).toBe('SwiftDrop');
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89);
    const text = pageText(pdf)[0].join('\n');
    for (const expected of [
      'SwiftDrop',
      'Delivery receipt',
      'RCPT-TEST-001',
      'TEST-123',
      'Alice Example',
      'Bob Example',
      '123 Test Lane, Colombo',
      '456 Fixture Road, Kandy',
      'SOURCE_STATUS',
      'Recorded delivery fee',
      'LKR 1,234.56',
      'Page 1 of 1',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).toContain('1 Nov 2026, 12:00 (Sri Lanka time)');
    expect(text).toContain('does not confirm payment');
  });

  it('wraps bounded long names/addresses without dropping characters and adds numbered pages', async () => {
    const bytes = await renderer.generateFromTrustedData({
      ...fixture(),
      sender: { name: 'N'.repeat(100), phone: '7'.repeat(40) },
      recipient: { name: 'R'.repeat(100), phone: '8'.repeat(40) },
      pickupAddress: 'W'.repeat(500),
      destinationAddress: 'Q'.repeat(500),
      deliveryStatus: 'STATUS'.repeat(13),
      deliveredAt: '2026-11-02T00:00:00Z',
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const pages = pageText(pdf);
    const text = pages.flat().join('');
    expect((text.match(/W/g) ?? []).length).toBe(500);
    expect((text.match(/Q/g) ?? []).length).toBe(500);
    pages.forEach((lines, index) =>
      expect(lines).toContain(`Page ${index + 1} of ${pages.length}`),
    );
    expect(text).toContain('LKR 1,234.56');
  });

  it('renders optional absent fields honestly and produces independent PDF documents', async () => {
    const [first, second] = await Promise.all([
      renderer.generateFromTrustedData({
        ...fixture(),
        deliveryStatus: undefined,
      }),
      renderer.generateFromTrustedData({
        ...fixture(),
        reference: 'OTHER-REFERENCE',
      }),
    ]);
    const firstText = pageText(await PDFDocument.load(first))
      .flat()
      .join(' ');
    const secondText = pageText(await PDFDocument.load(second))
      .flat()
      .join(' ');
    expect(firstText).toContain('Not recorded');
    expect(firstText).not.toContain('OTHER-REFERENCE');
    expect(secondText).toContain('OTHER-REFERENCE');
    expect(secondText).not.toContain('RCPT-TEST-001');
  });

  it('rejects invalid trusted data rather than returning a fake PDF', async () => {
    await expect(
      renderer.generateFromTrustedData({ ...fixture(), deliveryFeeMinor: -1 }),
    ).rejects.toBeInstanceOf(InvalidReceiptDataError);
  });

  it('fails clearly for unsupported scripts rather than corrupting personal information', async () => {
    await expect(
      renderer.generateFromTrustedData({
        ...fixture(),
        sender: { name: 'සඳුනි' },
      }),
    ).rejects.toBeInstanceOf(ReceiptFontError);
  });
});
