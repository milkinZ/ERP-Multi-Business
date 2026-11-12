import { CreditAllocationType, SupplierCreditNoteType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class SupplierCreditNoteLineDto {
  @IsEnum(CreditAllocationType)
  allocationType!: CreditAllocationType;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  amount!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  quantity?: number;

  @IsOptional()
  @IsString()
  invoiceLineId?: string;

  @IsOptional()
  @IsString()
  receiptItemId?: string;

  @IsOptional()
  @IsString()
  returnItemId?: string;

  @IsArray()
  @IsString({ each: true })
  inputTaxRuleIds!: string[];

  @IsArray()
  @IsString({ each: true })
  withholdingRuleIds!: string[];

  @IsOptional()
  @IsString()
  @Length(1, 240)
  taxExemptReason?: string;
}

export class CreateSupplierCreditNoteDto {
  @IsString()
  supplierId!: string;

  @IsString()
  @Length(1, 80)
  creditNumber!: string;

  @IsEnum(SupplierCreditNoteType)
  type!: SupplierCreditNoteType;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  purchaseOrderReturnId?: string;

  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  claimReference?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierCreditNoteLineDto)
  lines!: SupplierCreditNoteLineDto[];
}
