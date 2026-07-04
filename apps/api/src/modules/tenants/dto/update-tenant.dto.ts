import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BusinessType } from '@prisma/client';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;
}
