import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { BusinessType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBusinessRegistryDto {
  @ApiProperty({ required: false, example: 'My Cafe Updated' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, enum: BusinessType, example: 'RETAIL' })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiProperty({ required: false, example: 'new@cafe.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({ required: false, example: '+628987654321' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiProperty({ required: false, example: 'Jl. Baru No. 2' })
  @IsOptional()
  @IsString()
  address?: string;
}
