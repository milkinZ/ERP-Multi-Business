import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsSummaryResponseDto } from './dto/analytics-summary-response.dto';
import { TopProductsResponseDto } from './dto/top-products-response.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';

@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @Permissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOkResponse({ type: AnalyticsSummaryResponseDto })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'outletId', required: false })
  getSummary(
    @CurrentUser() user: JwtUser,
    @Query() query?: AnalyticsQueryDto,
  ): Promise<AnalyticsSummaryResponseDto> {
    return this.analyticsService.getSummary(user.tenantId, query);
  }

  @Get('top-products')
  @Permissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOkResponse({ type: TopProductsResponseDto })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'outletId', required: false })
  getTopProducts(
    @CurrentUser() user: JwtUser,
    @Query() query?: AnalyticsQueryDto,
  ): Promise<TopProductsResponseDto> {
    return this.analyticsService.getTopProducts(user.tenantId, query);
  }
}
