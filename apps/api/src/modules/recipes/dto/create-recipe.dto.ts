import {
    IsArray,
    IsNumber,
    IsString,
    ValidateNested,
} from 'class-validator'

import { Type } from 'class-transformer'

class RecipeItemDto {
    @IsString()
    ingredientId!: string

    @IsNumber()
    quantity!: number
}

export class CreateRecipeDto {
    @IsString()
    productId!: string

    @IsArray()
    @ValidateNested({
        each: true,
    })
    @Type(() => RecipeItemDto)
    items!: RecipeItemDto[]
}