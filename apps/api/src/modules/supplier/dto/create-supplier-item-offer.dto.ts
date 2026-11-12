import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSupplierItemOfferDto {
  @IsString()
  @IsNotEmpty()
  inventoryItemId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  unit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierSku?: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1_000_000_000)
  minimumOrderQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  leadTimeDays?: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
