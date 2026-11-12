import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class SupplierInvoiceLineDto {
  @IsString()
  receiptItemId!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  unitPrice!: number;

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

export class CreateSupplierInvoiceDto {
  @IsString()
  supplierId!: string;

  @IsString()
  @Length(1, 80)
  invoiceNumber!: string;

  @IsDateString()
  invoiceDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceLineDto)
  lines!: SupplierInvoiceLineDto[];
}
