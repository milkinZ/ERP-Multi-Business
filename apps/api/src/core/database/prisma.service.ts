import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { requestContext } from '../request-context/request-context';
import { TENANT_SCOPED_MODELS } from './tenant-models.constants';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isAutopayCandidateScan(args: {
  where?: Record<string, unknown>;
  take?: number;
}): boolean {
  const where = args.where;
  if (
    !where ||
    args.take !== 100 ||
    !hasExactKeys(where, [
      'status',
      'deletedAt',
      'subscriptionId',
      'createdAt',
      'xenditPaymentRequestAttempt',
      'AND',
      'tenant',
    ]) ||
    where.status !== 'PENDING' ||
    where.deletedAt !== null ||
    !isObjectRecord(where.subscriptionId) ||
    !hasExactKeys(where.subscriptionId, ['not']) ||
    where.subscriptionId.not !== null ||
    !isObjectRecord(where.createdAt) ||
    !hasExactKeys(where.createdAt, ['gte']) ||
    !(where.createdAt.gte instanceof Date) ||
    !isObjectRecord(where.xenditPaymentRequestAttempt) ||
    !hasExactKeys(where.xenditPaymentRequestAttempt, ['is']) ||
    where.xenditPaymentRequestAttempt.is !== null ||
    !Array.isArray(where.AND) ||
    where.AND.length !== 2 ||
    !isObjectRecord(where.AND[0]) ||
    !hasExactKeys(where.AND[0], ['OR']) ||
    !Array.isArray(where.AND[0].OR) ||
    where.AND[0].OR.length !== 2 ||
    !isObjectRecord(where.AND[0].OR[0]) ||
    !hasExactKeys(where.AND[0].OR[0], ['dueAt']) ||
    where.AND[0].OR[0].dueAt !== null ||
    !isObjectRecord(where.AND[0].OR[1]) ||
    !hasExactKeys(where.AND[0].OR[1], ['dueAt']) ||
    !isObjectRecord(where.AND[0].OR[1].dueAt) ||
    !hasExactKeys(where.AND[0].OR[1].dueAt, ['lte']) ||
    !(where.AND[0].OR[1].dueAt.lte instanceof Date) ||
    !isObjectRecord(where.AND[1]) ||
    !hasExactKeys(where.AND[1], ['OR']) ||
    !Array.isArray(where.AND[1].OR) ||
    where.AND[1].OR.length !== 2 ||
    !isObjectRecord(where.AND[1].OR[0]) ||
    !hasExactKeys(where.AND[1].OR[0], [
      'providerPaymentRequestId',
      'providerPaymentId',
    ]) ||
    where.AND[1].OR[0].providerPaymentRequestId !== null ||
    where.AND[1].OR[0].providerPaymentId !== null ||
    !isObjectRecord(where.AND[1].OR[1]) ||
    !hasExactKeys(where.AND[1].OR[1], ['autopayAttempts']) ||
    !isObjectRecord(where.AND[1].OR[1].autopayAttempts) ||
    !hasExactKeys(where.AND[1].OR[1].autopayAttempts, ['some']) ||
    !isObjectRecord(where.AND[1].OR[1].autopayAttempts.some) ||
    Object.keys(where.AND[1].OR[1].autopayAttempts.some).length !== 0 ||
    !isObjectRecord(where.tenant) ||
    !hasExactKeys(where.tenant, ['is']) ||
    !isObjectRecord(where.tenant.is) ||
    !hasExactKeys(where.tenant.is, ['AutopayPaymentMethod']) ||
    !isObjectRecord(where.tenant.is.AutopayPaymentMethod) ||
    !hasExactKeys(where.tenant.is.AutopayPaymentMethod, ['some']) ||
    !isObjectRecord(where.tenant.is.AutopayPaymentMethod.some) ||
    !hasExactKeys(where.tenant.is.AutopayPaymentMethod.some, ['status']) ||
    where.tenant.is.AutopayPaymentMethod.some.status !== 'ACTIVE'
  ) {
    return false;
  }

  return true;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    this.$use(async (params, next) => {
      const model = params.model;

      if (model && TENANT_SCOPED_MODELS.includes(model as never)) {
        const ctx = requestContext.get();
        const args = params.args as
          | { where?: Record<string, unknown>; take?: number }
          | undefined;
        const where = args?.where;
        const subscriptionIdFilter = where?.subscriptionId;
        const createdAtFilter = where?.createdAt;
        const autopayAttemptsFilter = where?.autopayAttempts;
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
        const isPreAuthInvitationLookup =
          model === 'UserInvitation' &&
          params.action === 'findUnique' &&
          ctx?.allowPreAuthInvitationLookup === true &&
          typeof where?.tokenHash === 'string' &&
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
        const isScheduledAutopayInvoiceScan =
          model === 'Invoice' &&
          params.action === 'findMany' &&
          ctx?.systemOperation === 'subscription-autopay' &&
          args?.take === 100 &&
          Object.keys(where ?? {}).length === 5 &&
          where?.status === 'PENDING' &&
          where.deletedAt === null &&
          isObjectRecord(subscriptionIdFilter) &&
          Object.keys(subscriptionIdFilter).length === 1 &&
          subscriptionIdFilter.not === null &&
          isObjectRecord(createdAtFilter) &&
          Object.keys(createdAtFilter).length === 1 &&
          createdAtFilter.lt instanceof Date &&
          isObjectRecord(autopayAttemptsFilter) &&
          Object.keys(autopayAttemptsFilter).length === 1 &&
          isObjectRecord(autopayAttemptsFilter.some) &&
          Object.keys(autopayAttemptsFilter.some).length === 0;
        const isScheduledAutopayCandidateScan =
          model === 'Invoice' &&
          params.action === 'findMany' &&
          ctx?.systemOperation === 'subscription-autopay' &&
          isAutopayCandidateScan(args ?? {});

        if (
          !ctx?.tenantId &&
          !ctx?.platformIdentityId &&
          !isPreAuthUserLookup &&
          !isPreAuthRefreshTokenLookup &&
          !isPreAuthInvitationLookup &&
          ctx?.allowPublicTenantRegistration !== true &&
          !isOutboxSystemOperation &&
          !isXenditInvoiceCorrelationLookup &&
          !isScheduledAutopayInvoiceScan &&
          !isScheduledAutopayCandidateScan
        ) {
          throw new Error('TENANT_CONTEXT_MISSING');
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return next(params);
    });
  }
}
