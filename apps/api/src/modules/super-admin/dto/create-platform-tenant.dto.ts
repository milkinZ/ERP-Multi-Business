import { BusinessType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Matches,
  ArrayUnique,
  IsArray,
} from 'class-validator';

export class CreatePlatformTenantDto {
  @ApiProperty({ example: 'Sandbox Cafe' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: BusinessType, default: BusinessType.CAFE })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType = BusinessType.CAFE;

  @ApiProperty({ example: 'IDR', default: 'IDR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string = 'IDR';

  @ApiProperty({ example: 'plan-starter' })
  @IsString()
  @MaxLength(100)
  planId!: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  moduleIds?: string[];

  @ApiProperty({ example: 'owner@example.test' })
  @IsEmail()
  @MaxLength(254)
  ownerEmail!: string;
}
