import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class KitchenAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  outletId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  stationId?: string;
}
