import { IsEnum } from 'class-validator';
import { BusinessType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeBusinessTypeDto {
  @ApiProperty({ enum: BusinessType, example: 'RETAIL' })
  @IsEnum(BusinessType)
  businessType!: BusinessType;
}
