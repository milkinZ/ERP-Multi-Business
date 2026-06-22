import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';

import { PaymentsService } from './payments.service';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';

import { CreatePaymentDto } from './dto/create-payment.dto';

import { PERMISSIONS } from '../rbac/permissions';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('pay')
  @Permissions(PERMISSIONS.PAYMENT_CREATE)
  pay(
    @Body()
    dto: CreatePaymentDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.paymentsService.pay(user.tenantId, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.PAYMENT_READ)
  findAll(
    @CurrentUser()
    user: JwtUser,
  ) {
    return this.paymentsService.findAll(user.tenantId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PAYMENT_READ)
  findOne(
    @Param('id')
    id: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.paymentsService.findOne(id, user.tenantId);
  }
}
