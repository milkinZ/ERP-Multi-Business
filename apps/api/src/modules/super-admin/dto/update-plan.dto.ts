import { PartialType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

import { CreatePlanDto } from './create-plan.dto';

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @IsOptional()
  @IsString()
  declare name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  declare priceCents?: number;
}
