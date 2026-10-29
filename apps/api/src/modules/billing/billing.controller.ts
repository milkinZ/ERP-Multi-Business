import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { BillingService } from './billing.service';
import { CreateXenditPaymentRequestDto } from './dto/create-xendit-payment-request.dto';
import { InvoiceExportQueryDto } from './dto/invoice-export-query.dto';

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

  @Post('invoices/:id/payment-request')
  @Permissions(PERMISSIONS.BILLING_EXECUTE)
  createPaymentRequest(
    @Param('id') id: string,
    @Body() body: CreateXenditPaymentRequestDto,
  ) {
    return this.billingService.createXenditPaymentRequest(id, body.channelCode);
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
