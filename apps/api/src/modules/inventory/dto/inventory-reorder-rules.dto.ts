import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  InventoryReorderAction,
  InventoryReorderQuantityStrategy,
  InventoryReorderScope,
} from '@prisma/client';

export class InventoryReorderRuleInputDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  reorderPoint!: number;

  @IsEnum(InventoryReorderQuantityStrategy)
  quantityStrategy!: InventoryReorderQuantityStrategy;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  targetStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  fixedOrderQuantity?: number;

  @IsOptional()
  @IsEnum(InventoryReorderAction)
  action?: InventoryReorderAction = InventoryReorderAction.ALERT_AND_SUGGEST;
}

export class InventoryReorderRulesDto {
  @IsEnum(InventoryReorderScope)
  scope!: InventoryReorderScope;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryReorderRuleInputDto)
  rules!: InventoryReorderRuleInputDto[];
}
