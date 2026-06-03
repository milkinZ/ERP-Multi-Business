import {
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator'

export class CreateProductDto {
  @IsString()
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  sku?: string

  @IsNumber()
  price!: number
}