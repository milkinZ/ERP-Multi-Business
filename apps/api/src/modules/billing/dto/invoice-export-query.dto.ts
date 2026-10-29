import { IsDateString, IsIn, IsOptional } from 'class-validator';

const INVOICE_STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'];

export class InvoiceExportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: string;
}

export type InvoiceExportFilters = {
  from?: string;
  to?: string;
  status?: string;
};
