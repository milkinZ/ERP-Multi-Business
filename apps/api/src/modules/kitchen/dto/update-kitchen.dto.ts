import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KitchenStatus } from '../domain/kitchen-status.enum';
import { Transform } from 'class-transformer';

export class UpdateKitchenStatusDto {
  @ApiProperty({ enum: KitchenStatus, example: KitchenStatus.COOKING })
  @IsOptional()
  @IsEnum(KitchenStatus)
  status?: KitchenStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SetKitchenPriorityDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  priority!: number;
}
