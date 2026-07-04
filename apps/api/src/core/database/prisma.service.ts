import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { requestContext } from '../request-context/request-context';
import { TENANT_SCOPED_MODELS } from './tenant-models.constants';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    this.$use(async (params, next) => {
      const model = params.model;

      if (model && TENANT_SCOPED_MODELS.includes(model as never)) {
        const ctx = requestContext.get();

        if (!ctx?.tenantId) {
          throw new Error('TENANT_CONTEXT_MISSING');
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return next(params);
    });
  }
}
