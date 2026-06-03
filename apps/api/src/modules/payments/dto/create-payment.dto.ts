import {
    IsEnum,
    IsNumber,
    IsString,
} from 'class-validator'

import {
    PaymentMethod,
} from '@prisma/client'

export class CreatePaymentDto {
    @IsString()
    orderId!: string

    @IsEnum(PaymentMethod)
    method!: PaymentMethod

    @IsNumber()
    amount!: number
}