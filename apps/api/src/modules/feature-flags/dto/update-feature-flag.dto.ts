import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateFeatureFlagDto {
  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}
