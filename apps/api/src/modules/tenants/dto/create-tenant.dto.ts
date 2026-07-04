import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BusinessType } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;
}
