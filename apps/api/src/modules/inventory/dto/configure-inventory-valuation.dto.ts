import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { InventoryValuationMethod, MovingAverageScope } from '@prisma/client';

export class InventoryOpeningCostDto {
  @IsOptional()
  @IsString()
  warehouseId?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  unitCost!: number;
}

export class ConfigureInventoryValuationDto {
  @IsEnum(InventoryValuationMethod)
  method!: InventoryValuationMethod;

  @IsOptional()
  @IsEnum(MovingAverageScope)
  movingAverageScope?: MovingAverageScope;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  standardCost?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryOpeningCostDto)
  openingCosts?: InventoryOpeningCostDto[];
}
