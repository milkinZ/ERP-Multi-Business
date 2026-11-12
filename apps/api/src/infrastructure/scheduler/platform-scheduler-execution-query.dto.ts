import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PlatformSchedulerExecutionQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  schedulerName?: string;

  @IsOptional()
  @IsIn(['RUNNING', 'SUCCEEDED', 'FAILED'])
  status?: 'RUNNING' | 'SUCCEEDED' | 'FAILED';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

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
