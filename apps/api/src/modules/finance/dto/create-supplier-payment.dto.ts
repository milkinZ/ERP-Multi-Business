import { SupplierPaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class SupplierPaymentAllocationDto {
  @IsString()
  invoiceId!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  allocatedGross!: number;
}

export class CreateSupplierPaymentDto {
  @IsString()
  supplierId!: string;

  @IsDateString()
  paymentDate!: string;

  @IsEnum(SupplierPaymentMethod)
  method!: SupplierPaymentMethod;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  reference?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierPaymentAllocationDto)
  allocations!: SupplierPaymentAllocationDto[];
}
