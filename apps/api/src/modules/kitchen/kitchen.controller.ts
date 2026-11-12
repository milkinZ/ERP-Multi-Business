import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { UpdateKitchenStatusDto } from './dto/update-kitchen.dto';
import { KitchenStatus } from './domain/kitchen-status.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import { SetKitchenPriorityDto } from './dto/update-kitchen.dto';
import { UpdateKitchenSettingsDto } from './dto/update-kitchen-settings.dto';
import { ListKitchenTicketsDto } from './dto/list-kitchen-tickets.dto';
import { CreateKitchenStationDto } from './dto/create-kitchen-station.dto';
import { UpdateKitchenStationDto } from './dto/update-kitchen-station.dto';
import { AssignKitchenTicketDto } from './dto/assign-kitchen-ticket.dto';
import { KitchenAnalyticsQueryDto } from './dto/kitchen-analytics-query.dto';

@UseGuards(JwtAuthGuard, PermissionGuard)
@UsePipes(new ValidationPipe({ transform: true }))
@Controller('kitchen')
export class KitchenController {
  constructor(private kitchenService: KitchenService) {}

  @Get('orders')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getQueue(
    @Query() query: ListKitchenTicketsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.getQueue(
      user.tenantId,
      user.outletId || null,
      query,
    );
  }

  @Get('orders/:id')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.kitchenService.getTicket(
      id,
      user.tenantId,
      user.outletId || null,
    );
  }

  @Patch('orders/:id/enqueue')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  enqueueTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.kitchenService.enqueueTicket(
      id,
      user.tenantId,
      user.outletId || null,
      user.userId,
    );
  }

  @Get('outlets')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getOutlets(@CurrentUser() user: JwtUser) {
    return this.kitchenService.getOutlets(user.tenantId, user.outletId || null);
  }

  @Get('stations')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getStations(
    @Query('outletId') outletId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.getStations(
      user.tenantId,
      user.outletId || null,
      outletId,
    );
  }

  @Post('stations')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  createStation(
    @Body() dto: CreateKitchenStationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.createStation(
      user.tenantId,
      user.userId,
      user.outletId || null,
      dto,
    );
  }

  @Patch('stations/:id')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  updateStation(
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.updateStation(
      id,
      user.tenantId,
      user.userId,
      user.outletId || null,
      dto,
    );
  }

  @Get('operators')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getOperators(@CurrentUser() user: JwtUser) {
    return this.kitchenService.getOperators(
      user.tenantId,
      user.outletId || null,
    );
  }

  @Get('analytics')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getAnalytics(
    @Query() query: KitchenAnalyticsQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.getAnalytics(
      user.tenantId,
      user.outletId || null,
      query,
    );
  }

  @Get('settings')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getSettings(@CurrentUser() user: JwtUser) {
    return this.kitchenService.getSettings(user.tenantId);
  }

  @Patch('settings')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  updateSettings(
    @Body() dto: UpdateKitchenSettingsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.updateWaitThreshold(
      user.tenantId,
      dto.waitThresholdMinutes,
      user.userId,
    );
  }

  @Patch('orders/:id/priority')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  setPriority(
    @Param('id') id: string,
    @Body() dto: SetKitchenPriorityDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.setPriority(
      id,
      user.tenantId,
      dto.priority,
      user.userId,
      user.outletId || null,
    );
  }

  @Patch('orders/:id/assignment')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  assignTicket(
    @Param('id') id: string,
    @Body() dto: AssignKitchenTicketDto,
    @CurrentUser() user: JwtUser,
  ) {
    if (dto.userId === undefined) {
      throw new BadRequestException('userId is required; use null to unassign');
    }
    return this.kitchenService.assignTicket(
      id,
      user.tenantId,
      user.outletId || null,
      user.userId,
      dto.userId,
    );
  }

  @Patch('orders/:id/start')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  startCooking(
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertActionStatus(dto, KitchenStatus.COOKING);
    return this.kitchenService.startCooking(
      id,
      user.tenantId,
      user.outletId || null,
      user.userId,
      dto?.reason,
    );
  }

  @Patch('orders/:id/ready')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  markReady(
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertActionStatus(dto, KitchenStatus.READY);
    return this.kitchenService.markReady(
      id,
      user.tenantId,
      user.outletId || null,
      user.userId,
      dto?.reason,
    );
  }

  @Patch('orders/:id/serve')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  markServed(
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertActionStatus(dto, KitchenStatus.SERVED);
    return this.kitchenService.markServed(
      id,
      user.tenantId,
      user.outletId || null,
      user.userId,
      dto?.reason,
    );
  }

  @Patch('orders/:id/cancel')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  cancel(
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertActionStatus(dto, KitchenStatus.CANCELLED);
    return this.kitchenService.cancel(
      id,
      user.tenantId,
      user.outletId || null,
      user.userId,
      dto?.reason,
    );
  }

  @Patch('orders/:id/recall')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  recall(
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    this.assertActionStatus(dto, KitchenStatus.RECALLED);
    return this.kitchenService.recall(
      id,
      user.tenantId,
      user.outletId || null,
      user.userId,
      dto?.reason,
    );
  }

  private assertActionStatus(
    dto: UpdateKitchenStatusDto | undefined,
    routeStatus: KitchenStatus,
  ) {
    if (dto?.status && dto.status !== routeStatus) {
      throw new BadRequestException(
        'Status in the request body must match the Kitchen action route',
      );
    }
  }
}
