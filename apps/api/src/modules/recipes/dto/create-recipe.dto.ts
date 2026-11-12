import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class RecipeItemDto {
  @IsString()
  inventoryItemId!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1000000000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit?: string;
}

export class CreateRecipeDto {
  @IsString()
  productId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({
    each: true,
  })
  @Type(() => RecipeItemDto)
  items!: RecipeItemDto[];
}
