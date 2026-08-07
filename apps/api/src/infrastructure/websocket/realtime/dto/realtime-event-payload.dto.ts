import { ApiProperty } from '@nestjs/swagger';

export type RealtimeEventRoomRouting = {
  tenantId: string;
  outletId?: string | null;
  userId?: string;
};

export class RealtimeEventPayloadDto<TData extends Record<string, unknown>> {
  @ApiProperty({ example: 'sales-order.created' })
  type!: string;

  @ApiProperty({ example: { orderId: '...', tenantId: '...' } })
  data!: TData;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  occurredAt!: string;
}
