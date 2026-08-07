import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceivePurchaseOrderItemDto {
  @IsString()
  inventoryItemId!: string;

  @IsNumber()
  @Min(0.1)
  receivedQuantity!: number;
}

export class ReceivePurchaseOrderDto {
  // incremental receive request: apply +receivedQuantity deltas
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderItemDto)
  items!: ReceivePurchaseOrderItemDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
