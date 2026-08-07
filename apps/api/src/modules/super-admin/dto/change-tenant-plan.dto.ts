import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChangeTenantPlanDto {
  @ApiProperty({ example: 'plan-id' })
  @IsString()
  planId!: string;
}
