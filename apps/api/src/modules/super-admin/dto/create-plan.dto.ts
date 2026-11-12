import { PlanType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'BUSINESS' })
  @IsEnum(PlanType)
  type!: PlanType;

  @ApiProperty({ example: 'Business Plan' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 49900 })
  @IsNumber()
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutlets?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMonthlyOrders?: number | null;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  moduleIds?: string[];
}
