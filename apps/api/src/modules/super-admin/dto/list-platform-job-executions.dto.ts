import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListPlatformJobExecutionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  queueName?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'RETRYING', 'COMPLETED', 'FAILED'])
  status?: 'ACTIVE' | 'RETRYING' | 'COMPLETED' | 'FAILED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
