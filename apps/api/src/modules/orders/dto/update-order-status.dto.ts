import { IsEnum } from 'class-validator';

import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(
    OrderStatus ?? [
      'PENDING',
      'PAID',
      'COMPLETED',
      'CANCELLED',
      'IN_PROGRESS',
      'READY',
    ],
  )
  status!: OrderStatus;
}
