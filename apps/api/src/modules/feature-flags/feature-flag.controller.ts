import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FeatureFlagService } from './feature-flag.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { ListFeatureFlagsDto } from './dto/list-feature-flags.dto';
import { EvaluateFeatureFlagDto } from './dto/evaluate-feature-flag.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { CurrentUser } from '../../common/decorator/current-user.decorator';

@ApiTags('Feature Flags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('feature-flags')
export class FeatureFlagController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  @Post()
  @Permissions(PERMISSIONS.FEATURE_FLAG_CREATE)
  async create(
    @Body() dto: CreateFeatureFlagDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    const aggregate = await this.featureFlagService.create(
      user.tenantId,
      dto.key,
      dto.enabled,
      dto.payload,
    );
    return {
      success: true,
      message: 'Feature flag created',
      data: aggregate.getState(),
    };
  }

  @Get()
  @Permissions(PERMISSIONS.FEATURE_FLAG_READ)
  async findAll(
    @Query() query: ListFeatureFlagsDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    const result = await this.featureFlagService.findAll(user.tenantId, query);
    return {
      success: true,
      message: 'Feature flags retrieved',
      data: result.data.map((a) => a.getState()),
      total: result.total,
    };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.FEATURE_FLAG_READ)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    const aggregate = await this.featureFlagService.findById(id, user.tenantId);
    return {
      success: true,
      message: 'Feature flag retrieved',
      data: aggregate.getState(),
    };
  }

  @Put(':id')
  @Permissions(PERMISSIONS.FEATURE_FLAG_UPDATE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFeatureFlagDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    const aggregate = await this.featureFlagService.update(
      id,
      user.tenantId,
      dto,
    );
    return {
      success: true,
      message: 'Feature flag updated',
      data: aggregate.getState(),
    };
  }

  @Post(':id/enable')
  @Permissions(PERMISSIONS.FEATURE_FLAG_UPDATE)
  async enable(
    @Param('id') id: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    const aggregate = await this.featureFlagService.enable(id, user.tenantId);
    return {
      success: true,
      message: 'Feature flag enabled',
      data: aggregate.getState(),
    };
  }

  @Post(':id/disable')
  @Permissions(PERMISSIONS.FEATURE_FLAG_UPDATE)
  async disable(
    @Param('id') id: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    const aggregate = await this.featureFlagService.disable(id, user.tenantId);
    return {
      success: true,
      message: 'Feature flag disabled',
      data: aggregate.getState(),
    };
  }

  @Post(':id/archive')
  @Permissions(PERMISSIONS.FEATURE_FLAG_DELETE)
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    await this.featureFlagService.archive(id, user.tenantId);
    return { success: true, message: 'Feature flag archived' };
  }

  @Post(':id/restore')
  @Permissions(PERMISSIONS.FEATURE_FLAG_UPDATE)
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    const aggregate = await this.featureFlagService.restore(id, user.tenantId);
    return {
      success: true,
      message: 'Feature flag restored',
      data: aggregate.getState(),
    };
  }

  @Post('evaluate')
  @Permissions(PERMISSIONS.FEATURE_FLAG_EVALUATE)
  async evaluate(
    @Body() dto: EvaluateFeatureFlagDto,
    @CurrentUser()
    user: { tenantId: string; outletId?: string | null; userId: string },
  ) {
    const result = await this.featureFlagService.evaluate(
      user.tenantId,
      dto.key,
      { outletId: user.outletId, userId: user.userId },
      dto.payload,
    );
    return {
      success: true,
      message: 'Feature flag evaluated',
      data: { key: dto.key, enabled: result },
    };
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.FEATURE_FLAG_DELETE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    await this.featureFlagService.hardDelete(id, user.tenantId);
    return { success: true, message: 'Feature flag deleted' };
  }
}
