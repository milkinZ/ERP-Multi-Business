import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { KitchenStatus } from '../domain/kitchen-status.enum';

export class ListKitchenTicketsDto {
  @ApiPropertyOptional({
    enum: [KitchenStatus.QUEUED, KitchenStatus.COOKING, KitchenStatus.READY],
  })
  @IsOptional()
  @IsEnum({
    QUEUED: KitchenStatus.QUEUED,
    COOKING: KitchenStatus.COOKING,
    READY: KitchenStatus.READY,
  })
  status?: KitchenStatus.QUEUED | KitchenStatus.COOKING | KitchenStatus.READY;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 2_147_483_647 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  skip?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
