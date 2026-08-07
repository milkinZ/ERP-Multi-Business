import { IsEnum, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KitchenStatus } from '../domain/kitchen-status.enum';

export class UpdateKitchenStatusDto {
  @ApiProperty({ enum: KitchenStatus, example: KitchenStatus.COOKING })
  @IsEnum(KitchenStatus)
  status!: KitchenStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetKitchenPriorityDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  priority!: number;
}
