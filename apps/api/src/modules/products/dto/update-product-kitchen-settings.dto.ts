import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateProductKitchenSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  kitchenCategory?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  kitchenPrepTimeMinutes?: number | null;
}
