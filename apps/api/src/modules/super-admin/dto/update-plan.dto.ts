import { PartialType } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { CreatePlanDto } from './create-plan.dto';

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  declare name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  declare priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  declare maxOutlets?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  declare maxUsers?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  declare maxMonthlyOrders?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  declare moduleIds?: string[];
}
