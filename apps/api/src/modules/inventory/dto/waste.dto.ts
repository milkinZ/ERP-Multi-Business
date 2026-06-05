import { IsInt, IsString, Min } from 'class-validator';

export class WasteDto {
  @IsString()
  inventoryItemId!: string;

  @IsString()
  warehouseId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  note!: string;
}
