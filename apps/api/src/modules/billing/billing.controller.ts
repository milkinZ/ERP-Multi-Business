import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { BillingService } from './billing.service';
import { CreateXenditPaymentRequestDto } from './dto/create-xendit-payment-request.dto';
import { InvoiceExportQueryDto } from './dto/invoice-export-query.dto';
import { CreateInvoiceRefundDto } from './dto/create-invoice-refund.dto';
import { CreateAutopayEnrollmentDto } from './dto/create-autopay-enrollment.dto';
import { AutopayService } from './autopay.service';

@Controller('billing')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly autopayService: AutopayService,
  ) {}

  @Get('invoices')
  @Permissions(PERMISSIONS.INVOICE_READ)
  getInvoices(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.billingService.getInvoices(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 10,
    );
  }

  @Get('invoices-export.csv')
  @Permissions(PERMISSIONS.INVOICE_READ)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="invoices.csv"')
  exportInvoices(@Query() query: InvoiceExportQueryDto) {
    return new StreamableFile(this.billingService.exportInvoices(query));
  }

  @Get('invoices/:id')
  @Permissions(PERMISSIONS.INVOICE_READ)
  getInvoice(@Param('id') id: string) {
    return this.billingService.getInvoiceById(id);
  }

  @Get('invoices/:id/refunds')
  @Permissions(PERMISSIONS.INVOICE_READ)
  getInvoiceRefunds(@Param('id') id: string) {
    return this.billingService.getInvoiceRefunds(id);
  }

  @Post('invoices/:id/refunds')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  createInvoiceRefund(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: CreateInvoiceRefundDto,
  ) {
    return this.billingService.refundInvoice(
      id,
      body.amountCents,
      body.reason,
      { type: 'TENANT_USER', id: user.userId },
    );
  }

  @Post('invoices/:id/payment-request')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  createPaymentRequest(
    @Param('id') id: string,
    @Body() body: CreateXenditPaymentRequestDto,
  ) {
    return this.billingService.createXenditPaymentRequest(id, body.channelCode);
  }

  @Get('autopay')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  getAutopayStatus() {
    return this.autopayService.getStatus();
  }

  @Post('invoices/:id/payment-request/autopay')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  enrollAutopay(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: CreateAutopayEnrollmentDto,
  ) {
    return this.autopayService.enroll(id, body.channelCode, user.userId);
  }

  @Delete('autopay')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  revokeAutopay() {
    return this.autopayService.revoke();
  }

  @Post('invoices/:id/cancel')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  cancelPendingInvoice(@Param('id') id: string) {
    return this.billingService.cancelPendingInvoice(id);
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
