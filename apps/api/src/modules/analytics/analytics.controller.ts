import {
    Controller,
    Get,
    UseGuards,
} from '@nestjs/common'

import { AnalyticsService } from './analytics.service'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { CurrentUser } from '../../common/decorator/current-user.decorator'
import { Permissions } from '../../common/decorator/permissions.decorator'

import type { JwtUser } from '../../common/interfaces/jwt-user.interface'
import { PermissionGuard } from '../rbac/permission.guard'
import { PERMISSIONS } from '../rbac/permissions'

@UseGuards(
    JwtAuthGuard,
    PermissionGuard,
)
@Controller('analytics')
export class AnalyticsController {
    constructor(
        private analyticsService: AnalyticsService,
    ) { }

    @Get('summary')
    @Permissions(
        PERMISSIONS.ANALYTICS_READ,
    )
    getSummary(
        @CurrentUser()
        user: JwtUser,
    ) {
        return this.analyticsService.getSummary(
            user.tenantId,
        )
    }

    @Get('top-products')
    @Permissions(
        PERMISSIONS.ANALYTICS_READ,
    )
    getTopProducts(
        @CurrentUser()
        user: JwtUser,
    ) {
        return this.analyticsService.getTopProducts(
            user.tenantId,
        )
    }
}