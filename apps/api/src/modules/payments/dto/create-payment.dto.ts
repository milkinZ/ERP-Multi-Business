import { IsEnum, IsNumber, IsString } from 'class-validator';

import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsString()
  orderId!: string;

  // Prisma enum can be undefined at runtime in unit tests if Prisma client
  // isn't generated/available. Convert to a string union fallback.
  @IsEnum(PaymentMethod ?? ['CASH', 'QRIS', 'TRANSFER'])
  method!: PaymentMethod;

  @IsNumber()
  amount!: number;
}
