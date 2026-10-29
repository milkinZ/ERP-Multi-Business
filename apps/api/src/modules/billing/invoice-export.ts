import { BadRequestException } from '@nestjs/common';
import { Readable } from 'node:stream';

export type InvoiceExportCursor = { id: string; createdAt: Date };
export type InvoiceExportRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  amountCents: number;
  currency: string;
  dueAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  tenantName?: string;
};

export function invoiceExportDateBounds(filters: {
  from?: string;
  to?: string;
}) {
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(filters.to) : undefined;
  if (from && Number.isNaN(from.getTime())) {
    throw new BadRequestException('Invalid export start date');
  }
  if (to && Number.isNaN(to.getTime())) {
    throw new BadRequestException('Invalid export end date');
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to ?? '')) {
    to.setUTCHours(23, 59, 59, 999);
  }
  if (from && to && from > to) {
    throw new BadRequestException('Export start date must precede end date');
  }
  return { from, to };
}

function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function invoiceCsvRow(invoice: InvoiceExportRow, includeTenant: boolean) {
  const cells: Array<string | number | null> = [
    invoice.invoiceNumber,
    invoice.status,
    invoice.amountCents,
    invoice.currency,
    invoice.dueAt?.toISOString() ?? null,
    invoice.paidAt?.toISOString() ?? null,
    invoice.createdAt.toISOString(),
  ];
  if (includeTenant) cells.splice(1, 0, invoice.tenantName ?? '');
  return `${cells.map(csvCell).join(',')}\r\n`;
}

export function createInvoiceCsvStream(
  fetchPage: (
    cursor: InvoiceExportCursor | undefined,
    take: number,
  ) => Promise<InvoiceExportRow[]>,
  includeTenant = false,
): Readable {
  return Readable.from(
    (async function* () {
      const headers = [
        'Invoice number',
        ...(includeTenant ? ['Tenant'] : []),
        'Status',
        'Amount (minor units)',
        'Currency',
        'Due at',
        'Paid at',
        'Created at',
      ];
      yield `${headers.map(csvCell).join(',')}\r\n`;

      const pageSize = 500;
      let cursor: InvoiceExportCursor | undefined;
      while (true) {
        const page = await fetchPage(cursor, pageSize);
        for (const invoice of page) {
          yield invoiceCsvRow(invoice, includeTenant);
        }
        if (page.length < pageSize) return;
        const last = page.at(-1);
        if (!last) return;
        cursor = { id: last.id, createdAt: last.createdAt };
      }
    })(),
    { encoding: 'utf8' },
  );
}
