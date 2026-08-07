import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateFeatureFlagDto {
  @ApiProperty({ example: 'KITCHEN_MODULE' })
  @IsString()
  key!: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}
