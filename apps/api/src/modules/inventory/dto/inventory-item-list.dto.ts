import { IsOptional, IsString } from 'class-validator';

export class InventoryItemListQueryDto {
  @IsOptional()
  @IsString()
  type?: string;
}
