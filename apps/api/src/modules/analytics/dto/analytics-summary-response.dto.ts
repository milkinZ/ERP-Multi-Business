import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsSummaryResponseDto {
  @ApiProperty({ example: 150 })
  totalProducts!: number;

  @ApiProperty({ example: 1200 })
  totalOrders!: number;

  @ApiProperty({ example: 980 })
  paidOrders!: number;

  @ApiProperty({ example: 850 })
  completedOrders!: number;

  @ApiProperty({ example: 50 })
  cancelledOrders!: number;

  @ApiProperty({ example: 900 })
  totalPayments!: number;

  @ApiProperty({ example: 12500000 })
  totalRevenue!: number;

  @ApiProperty({ example: 14500 })
  averageOrderValue!: number;

  @ApiProperty({ example: 200 })
  pendingOrders!: number;
}
