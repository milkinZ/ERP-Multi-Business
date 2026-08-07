import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { BusinessType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BusinessRegistryQueryDto {
  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  page?: number;

  @ApiProperty({ required: false, example: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  limit?: number;

  @ApiProperty({ required: false, example: 'cafe' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: BusinessType, example: 'CAFE' })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
