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

import { OutletsService } from './outlets.service';

import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';

@Controller('outlets')
@UseGuards(JwtAuthGuard)
export class OutletsController {
  constructor(private outletsService: OutletsService) {}

  @Get()
  getAll() {
    return this.outletsService.findAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.outletsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOutletDto) {
    return this.outletsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOutletDto) {
    return this.outletsService.update(id, dto);
  }

  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.outletsService.softDelete(id);
  }
}
