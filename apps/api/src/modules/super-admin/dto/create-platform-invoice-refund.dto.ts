import { Equals, IsBoolean, IsIn, IsInt, IsString, Min } from 'class-validator';
import { INVOICE_REFUND_REASONS } from '../../billing/dto/create-invoice-refund.dto';

export class CreatePlatformInvoiceRefundDto {
  @IsBoolean()
  @Equals(true)
  confirm!: true;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @IsIn(INVOICE_REFUND_REASONS)
  reason!: (typeof INVOICE_REFUND_REASONS)[number];
}
