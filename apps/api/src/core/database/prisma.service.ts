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
        const args = params.args as
          | { where?: Record<string, unknown> }
          | undefined;
        const where = args?.where;
        const isPreAuthUserLookup =
          model === 'User' &&
          params.action === 'findUnique' &&
          typeof where?.email === 'string' &&
          ctx?.allowPreAuthUserLookup === true;
        const isPreAuthRefreshTokenLookup =
          model === 'RefreshToken' &&
          params.action === 'findUnique' &&
          ctx?.allowPreAuthRefreshTokenLookup === true &&
          typeof where?.tokenSelector === 'string' &&
          Object.keys(where).length === 1;
        const isOutboxSystemOperation =
          model === 'OutboxEvent' && ctx?.systemOperation === 'outbox-dispatch';
        const isXenditInvoiceCorrelationLookup =
          model === 'Invoice' &&
          params.action === 'findFirst' &&
          ctx?.systemOperation === 'xendit-webhook' &&
          where?.deletedAt === null &&
          Object.keys(where).length === 2 &&
          [
            'providerPaymentRequestId',
            'providerPaymentId',
            'providerReferenceId',
            'invoiceNumber',
          ].some((field) => typeof where?.[field] === 'string');

        if (
          !ctx?.tenantId &&
          !isPreAuthUserLookup &&
          !isPreAuthRefreshTokenLookup &&
          !isOutboxSystemOperation &&
          !isXenditInvoiceCorrelationLookup
        ) {
          throw new Error('TENANT_CONTEXT_MISSING');
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return next(params);
    });
  }
}
