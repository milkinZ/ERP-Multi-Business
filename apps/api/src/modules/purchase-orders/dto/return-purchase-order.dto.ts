import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnPurchaseOrderItemDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderReceiptItemId!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(0.000001)
  quantity!: number;
}

export class ReturnPurchaseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnPurchaseOrderItemDto)
  items!: ReturnPurchaseOrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
