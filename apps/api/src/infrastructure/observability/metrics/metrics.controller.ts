import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiExcludeController, ApiOkResponse } from '@nestjs/swagger';
import type { Response } from 'express';

import { MetricsService } from './metrics.service';

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOkResponse({ description: 'Prometheus metrics in text format' })
  async getMetrics(@Res() res: Response) {
    const body = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', this.metricsService.getContentType());
    res.send(body);
  }
}
