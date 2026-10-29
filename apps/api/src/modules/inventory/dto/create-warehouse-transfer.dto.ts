import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateWarehouseTransferItemDto {
  @IsString()
  @MaxLength(128)
  inventoryItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  quantity!: number;
}

export class CreateWarehouseTransferDto {
  @IsString()
  @MaxLength(128)
  sourceWarehouseId!: string;

  @IsString()
  @MaxLength(128)
  destinationWarehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateWarehouseTransferItemDto)
  items!: CreateWarehouseTransferItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
