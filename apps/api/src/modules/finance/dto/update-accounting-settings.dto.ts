import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAccountingSettingsDto {
  @IsOptional()
  @IsBoolean()
  invoiceApprovalRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPostMatchedInvoices?: boolean;
}
