import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  @Permissions(PERMISSIONS.INVOICE_READ)
  getInvoices(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.billingService.getInvoices(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 10,
    );
  }

  @Get('invoices/:id')
  @Permissions(PERMISSIONS.INVOICE_READ)
  getInvoice(@Param('id') id: string) {
    return this.billingService.getInvoiceById(id);
  }

  @Post('execute/:subscriptionId')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  executeBilling(@Param('subscriptionId') subscriptionId: string) {
    return this.billingService.executeBilling(subscriptionId);
  }

  @Post('renew/:subscriptionId')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  renewSubscription(@Param('subscriptionId') subscriptionId: string) {
    return this.billingService.renewSubscription(subscriptionId);
  }
}
