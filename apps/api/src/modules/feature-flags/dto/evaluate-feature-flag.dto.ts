import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class EvaluateFeatureFlagDto {
  @ApiProperty({ example: 'KITCHEN_MODULE' })
  @IsString()
  key!: string;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}
