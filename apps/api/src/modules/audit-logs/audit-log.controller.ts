import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * List audit logs with filtering and pagination
   */
  @Get()
  @ApiOperation({
    summary: 'List audit logs',
    description:
      'Get audit logs for current tenant with filtering and pagination',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Audit logs retrieved successfully',
  })
  async listAuditLogs(
    @Query() dto: ListAuditLogsDto,
    @CurrentUser() user: JwtUser,
  ) {
    const result = await this.auditLogService.listAuditLogs(
      user.tenantId,
      dto,
      user.outletId,
    );

    return {
      success: true,
      message: 'Audit logs retrieved successfully',
      data: result.data,
      pagination: result.pagination,
    };
  }

  /**
   * Get single audit log
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get audit log by ID',
    description: 'Retrieve a specific audit log entry',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Audit log retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Audit log not found',
  })
  async getAuditLog(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    const auditLog = await this.auditLogService.getAuditLog(id, user.tenantId);

    if (!auditLog) {
      throw new BadRequestException('Audit log not found');
    }

    return {
      success: true,
      message: 'Audit log retrieved successfully',
      data: auditLog,
    };
  }

  /**
   * Get audit logs by entity
   */
  @Get('entity/:entity/:entityId')
  @ApiOperation({
    summary: 'Get audit logs for specific entity',
    description: 'Retrieve all audit logs for a specific entity and ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Audit logs retrieved successfully',
  })
  async getAuditLogsByEntity(
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: JwtUser,
  ) {
    const auditLogs = await this.auditLogService.getAuditLogsByEntity(
      user.tenantId,
      entity,
      entityId,
      user.outletId,
    );

    return {
      success: true,
      message: `Audit logs for ${entity} retrieved successfully`,
      data: auditLogs,
    };
  }
}
