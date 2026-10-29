import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ReceiveWarehouseTransferItemDto {
  @IsString()
  @MaxLength(128)
  transferItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  receivedQuantity!: number;
}

export class ReceiveWarehouseTransferDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiveWarehouseTransferItemDto)
  items!: ReceiveWarehouseTransferItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
