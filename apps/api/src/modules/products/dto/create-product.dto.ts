import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProductStockMode } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsEnum(ProductStockMode)
  stockMode?: ProductStockMode;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  inventoryUnit?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  kitchenCategory?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  kitchenPrepTimeMinutes?: number;

  @IsNumber()
  price!: number;
}
