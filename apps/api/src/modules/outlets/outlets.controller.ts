import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { OutletResponseDto } from './dto/outlet-response.dto';

import { OutletsService } from './outlets.service';

import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';

@Controller('outlets')
@ApiTags('Outlets')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OutletsController {
  constructor(private outletsService: OutletsService) {}

  @Get()
  @Permissions(PERMISSIONS.OUTLET_READ)
  @ApiOkResponse({ type: [OutletResponseDto] })
  getAll() {
    return this.outletsService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.OUTLET_READ)
  @ApiOkResponse({ type: OutletResponseDto })
  getById(@Param('id') id: string) {
    return this.outletsService.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.OUTLET_CREATE)
  create(@Body() dto: CreateOutletDto) {
    return this.outletsService.create(dto);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.OUTLET_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateOutletDto) {
    return this.outletsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.OUTLET_DELETE)
  softDelete(@Param('id') id: string) {
    return this.outletsService.softDelete(id);
  }
}
