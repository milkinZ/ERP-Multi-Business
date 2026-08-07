import { Injectable, Logger } from '@nestjs/common';

import { AnalyticsRepository } from './analytics.repository';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';
import type { AnalyticsSummaryResponseDto } from './dto/analytics-summary-response.dto';
import type { TopProductsResponseDto } from './dto/top-products-response.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async getSummary(
    tenantId: string,
    query?: AnalyticsQueryDto,
  ): Promise<AnalyticsSummaryResponseDto> {
    try {
      const [revenue, totalProducts] = await Promise.all([
        this.analyticsRepository.aggregateRevenue(tenantId, query),
        this.analyticsRepository.getProductCount(tenantId, query),
      ]);

      return {
        totalProducts,
        totalOrders: revenue.totalOrderCount,
        paidOrders: revenue.paidOrderCount,
        completedOrders: revenue.completedOrderCount,
        cancelledOrders: revenue.cancelledOrderCount,
        totalPayments: revenue.totalPaymentCount,
        totalRevenue: revenue.totalRevenue,
        averageOrderValue: revenue.averageOrderValue,
        pendingOrders: revenue.pendingOrderCount,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get analytics summary for tenant ${tenantId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async getTopProducts(
    tenantId: string,
    query?: AnalyticsQueryDto,
    limit = 10,
  ): Promise<TopProductsResponseDto> {
    try {
      const items = await this.analyticsRepository.getTopProducts(
        tenantId,
        query,
        limit,
      );

      return { items };
    } catch (error) {
      this.logger.error(
        `Failed to get top products for tenant ${tenantId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
