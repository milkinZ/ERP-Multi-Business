import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    UseGuards,
    Patch,
} from '@nestjs/common'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'

import { OrdersService } from './orders.service'

import { CreateOrderDto } from './dto/create-order.dto'

import { CurrentUser } from '../../common/decorator/current-user.decorator'

import type { JwtUser } from '../../common/interfaces/jwt-user.interface'
import { UpdateOrderStatusDto } from './dto/update-order-status.dto'

@UseGuards(JwtAuthGuard)
@Controller('customerOrders')
export class OrdersController {
    constructor(
        private ordersService: OrdersService,
    ) { }

    @Post()
    create(
        @Body() body: CreateOrderDto,

        @CurrentUser()
        user: JwtUser,
    ) {
        return this.ordersService.create(
            user.tenantId,
            user.outletId || null,
            body.items,
        )
    }

    @Get()
    findAll(
        @CurrentUser()
        user: JwtUser,
    ) {
        return this.ordersService.findAll(
            user,
        )
    }

    @Get(':id')
    findOne(
        @Param('id') id: string,

        @CurrentUser()
        user: JwtUser,
    ) {
        return this.ordersService.findOne(
            id,
            user,
        )
    }

    @Patch(':id/status')
    updateStatus(
        @Param('id') id: string,

        @Body()
        body: UpdateOrderStatusDto,

        @CurrentUser()
        user: JwtUser,
    ) {
        return this.ordersService.updateStatus(
            id,
            user,
            body.status,
        )
    }
}