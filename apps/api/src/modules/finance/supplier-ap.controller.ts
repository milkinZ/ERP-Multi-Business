import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { CreateSupplierCreditNoteDto } from './dto/create-supplier-credit-note.dto';
import { SupplierApService } from './supplier-ap.service';
import { FeatureModuleGuard } from '../feature-flags/feature-module.guard';
import { RequireFeatureModule } from '../subscription/plans/feature-module.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard, FeatureModuleGuard)
@Controller('finance')
@RequireFeatureModule('FINANCE')
export class SupplierApController {
  constructor(private readonly supplierAp: SupplierApService) {}

  @Get('supplier-invoices')
  @Permissions(PERMISSIONS.FINANCE_READ)
  listInvoices(
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.supplierAp.listInvoices(
      user.tenantId,
      skip === undefined ? 0 : Number.parseInt(skip, 10),
      take === undefined ? 50 : Number.parseInt(take, 10),
    );
  }

  @Post('supplier-invoices')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  createInvoice(
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateSupplierInvoiceDto,
  ) {
    if (!key)
      throw new BadRequestException('Idempotency-Key header is required');
    return this.supplierAp.createInvoice(user.tenantId, user.userId, key, dto);
  }

  @Post('supplier-invoices/:id/approve')
  @Permissions(PERMISSIONS.FINANCE_APPROVE)
  approveInvoice(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.supplierAp.approveInvoice(user.tenantId, user.userId, id);
  }

  @Post('supplier-invoices/:id/post')
  @Permissions(PERMISSIONS.FINANCE_POST)
  postInvoice(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.supplierAp.postInvoice(user.tenantId, user.userId, id);
  }

  @Get('supplier-payments')
  @Permissions(PERMISSIONS.FINANCE_READ)
  listPayments(
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.supplierAp.listPayments(
      user.tenantId,
      skip === undefined ? 0 : Number.parseInt(skip, 10),
      take === undefined ? 50 : Number.parseInt(take, 10),
    );
  }

  @Post('supplier-payments')
  @Permissions(PERMISSIONS.FINANCE_POST)
  createPayment(
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateSupplierPaymentDto,
  ) {
    if (!key)
      throw new BadRequestException('Idempotency-Key header is required');
    return this.supplierAp.createPayment(user.tenantId, user.userId, key, dto);
  }

  @Get('supplier-credit-notes')
  @Permissions(PERMISSIONS.FINANCE_READ)
  listCreditNotes(
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.supplierAp.listCreditNotes(
      user.tenantId,
      skip === undefined ? 0 : Number.parseInt(skip, 10),
      take === undefined ? 50 : Number.parseInt(take, 10),
    );
  }

  @Post('supplier-credit-notes')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  createCreditNote(
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateSupplierCreditNoteDto,
  ) {
    if (!key)
      throw new BadRequestException('Idempotency-Key header is required');
    return this.supplierAp.createCreditNote(
      user.tenantId,
      user.userId,
      key,
      dto,
    );
  }

  @Post('supplier-credit-notes/:id/approve')
  @Permissions(PERMISSIONS.FINANCE_APPROVE)
  approveCreditNote(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.supplierAp.approveCreditNote(user.tenantId, user.userId, id);
  }

  @Post('supplier-credit-notes/:id/post')
  @Permissions(PERMISSIONS.FINANCE_POST)
  postCreditNote(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.supplierAp.postCreditNote(user.tenantId, user.userId, id);
  }
}
