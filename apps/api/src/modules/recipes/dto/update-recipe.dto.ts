import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { CreateRecipeDto } from './create-recipe.dto';

export class UpdateRecipeDto extends CreateRecipeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
