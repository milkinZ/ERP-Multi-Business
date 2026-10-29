import { Readable } from 'node:stream';

import { BadRequestException } from '@nestjs/common';

import {
  createInvoiceCsvStream,
  invoiceExportDateBounds,
  InvoiceExportRow,
} from './invoice-export';

async function readCsv(stream: Readable) {
  let output = '';
  for await (const chunk of stream) {
    output += String(chunk);
  }
  return output;
}

function invoiceRow(id: string, createdAt: Date): InvoiceExportRow {
  return {
    id,
    invoiceNumber: '=HYPERLINK("https://invalid")',
    status: 'PENDING',
    amountCents: 12500,
    currency: 'IDR',
    dueAt: null,
    paidAt: null,
    createdAt,
    tenantName: '@tenant',
  };
}

describe('invoice CSV export', () => {
  it('streams stable pages and neutralizes spreadsheet formulas', async () => {
    const firstCreatedAt = new Date('2026-10-10T00:00:00.000Z');
    const lastCreatedAt = new Date('2026-10-11T00:00:00.000Z');
    const firstPage = Array.from({ length: 500 }, (_, index) =>
      invoiceRow(`invoice-${String(index).padStart(3, '0')}`, firstCreatedAt),
    );
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([invoiceRow('invoice-last', lastCreatedAt)]);

    const csv = await readCsv(createInvoiceCsvStream(fetchPage, true));

    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined, 500);
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      { id: 'invoice-499', createdAt: firstCreatedAt },
      500,
    );
    expect(csv.split('\r\n')).toHaveLength(503);
    expect(csv).toContain(`"'=HYPERLINK(""https://invalid"")"`);
    expect(csv).toContain(`"'@tenant"`);
    expect(csv.startsWith('"Invoice number","Tenant","Status"')).toBe(true);
  });

  it('accepts same-day inclusive date ranges and rejects reversed ranges', () => {
    const bounds = invoiceExportDateBounds({
      from: '2026-10-10T20:00:00.000Z',
      to: '2026-10-10',
    });

    expect(bounds.to?.toISOString()).toBe('2026-10-10T23:59:59.999Z');
    expect(() =>
      invoiceExportDateBounds({
        from: '2026-10-11',
        to: '2026-10-10',
      }),
    ).toThrow(BadRequestException);
  });
});
