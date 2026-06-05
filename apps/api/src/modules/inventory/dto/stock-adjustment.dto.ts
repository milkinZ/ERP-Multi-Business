import { IsInt, IsString } from 'class-validator';

export class StockAdjustmentDto {
  @IsString()
  inventoryItemId!: string;

  @IsString()
  warehouseId!: string;

  @IsInt()
  quantity!: number;

  @IsString()
  note!: string;
}
