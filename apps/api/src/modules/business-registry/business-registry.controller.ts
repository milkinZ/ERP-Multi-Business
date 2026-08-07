import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';

import { BusinessRegistryService } from './business-registry.service';
import { CreateBusinessRegistryDto } from './dto/create-business-registry.dto';
import { UpdateBusinessRegistryDto } from './dto/update-business-registry.dto';
import { BusinessRegistryQueryDto } from './dto/business-registry-query.dto';
import { ChangeBusinessTypeDto } from './dto/change-business-type.dto';

@ApiTags('business-registry')
@ApiBearerAuth()
@Controller('business-registry')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BusinessRegistryController {
  constructor(
    private readonly businessRegistryService: BusinessRegistryService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.BUSINESS_READ)
  findAll(@Query() query: BusinessRegistryQueryDto) {
    return this.businessRegistryService.findAll(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.BUSINESS_READ)
  findById(@Param('id') id: string) {
    return this.businessRegistryService.findById(id);
  }

  @Post()
  @Permissions(PERMISSIONS.BUSINESS_CREATE)
  create(@Body() dto: CreateBusinessRegistryDto) {
    return this.businessRegistryService.create(dto);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.BUSINESS_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateBusinessRegistryDto) {
    return this.businessRegistryService.update(id, dto);
  }

  @Post(':id/activate')
  @Permissions(PERMISSIONS.BUSINESS_MANAGE)
  activate(@Param('id') id: string) {
    return this.businessRegistryService.activate(id);
  }

  @Post(':id/suspend')
  @Permissions(PERMISSIONS.BUSINESS_MANAGE)
  suspend(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.businessRegistryService.suspend(id, reason);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.BUSINESS_DELETE)
  archive(@Param('id') id: string) {
    return this.businessRegistryService.archive(id);
  }

  @Post(':id/restore')
  @Permissions(PERMISSIONS.BUSINESS_MANAGE)
  restore(@Param('id') id: string) {
    return this.businessRegistryService.restore(id);
  }

  @Patch(':id/business-type')
  @Permissions(PERMISSIONS.BUSINESS_UPDATE)
  changeBusinessType(
    @Param('id') id: string,
    @Body() dto: ChangeBusinessTypeDto,
  ) {
    return this.businessRegistryService.changeBusinessType(
      id,
      dto.businessType,
    );
  }
}
