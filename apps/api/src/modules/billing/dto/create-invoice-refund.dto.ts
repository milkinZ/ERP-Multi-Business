import { IsIn, IsInt, IsString, Min, MaxLength } from 'class-validator';

export const INVOICE_REFUND_REASONS = [
  'REQUESTED_BY_CUSTOMER',
  'DUPLICATE',
  'FRAUDULENT',
] as const;

export class CreateInvoiceRefundDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @IsIn(INVOICE_REFUND_REASONS)
  @MaxLength(64)
  reason!: (typeof INVOICE_REFUND_REASONS)[number];
}
