import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { BusinessType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBusinessRegistryDto {
  @ApiProperty({ example: 'My Cafe' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: BusinessType, example: 'CAFE' })
  @IsEnum(BusinessType)
  businessType!: BusinessType;

  @ApiProperty({ required: false, example: 'contact@cafe.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({ required: false, example: '+628123456789' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiProperty({ required: false, example: 'Jl. Sudirman No. 1' })
  @IsOptional()
  @IsString()
  address?: string;
}
