import {
    IsArray,
    IsInt,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator'

import { Type } from 'class-transformer'

class OrderItemDto {
    @IsString()
    productId!: string

    @IsInt()
    @Min(1)
    quantity!: number
}

export class CreateOrderDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrderItemDto)
    items!: OrderItemDto[]
}