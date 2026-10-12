import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { BillingRepository } from './billing.repository';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { PlanRepository } from '../subscription/plans/plan.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import { requestContext } from '../../core/request-context/request-context';
import { createHash } from 'node:crypto';
import {
  XenditPaymentGateway,
  XenditPaymentRequestError,
} from './gateway/xendit-payment.gateway';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly planRepository: PlanRepository,
    private readonly tenantContext: TenantContextService,
    private readonly outbox: OutboxPublisher,
    @Optional() private readonly xenditGateway?: XenditPaymentGateway,
  ) {}

  async getInvoices(skip = 0, take = 10) {
    const tenantId = this.tenantContext.requireTenant();
    return this.billingRepository.findAllInvoices(tenantId, skip, take);
  }

  async getInvoiceById(id: string) {
    const tenantId = this.tenantContext.requireTenant();
    const invoice = await this.billingRepository.findInvoiceById(id, tenantId);

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async createXenditPaymentRequest(
    invoiceId: string,
    channelCode: string,
  ): Promise<{
    paymentRequestId: string;
    status: 'PAID' | 'FAILED' | 'PENDING';
  }> {
    const tenantId = this.tenantContext.requireTenant();
    const invoice = await this.billingRepository.findInvoiceById(
      invoiceId,
      tenantId,
    );
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'PENDING') {
      throw new ConflictException('Only pending invoices can be paid');
    }
    if (invoice.providerPaymentRequestId) {
      return {
        paymentRequestId: invoice.providerPaymentRequestId,
        status: 'PENDING',
      };
    }
    if (!this.xenditGateway) {
      throw new InternalServerErrorException(
        'Xendit payment gateway is not available',
      );
    }

    let attempt = await this.billingRepository.findXenditPaymentRequestAttempt(
      invoice.id,
      tenantId,
    );
    if (attempt?.providerPaymentRequestId) {
      return this.recoverXenditPaymentRequest(
        invoice.id,
        tenantId,
        invoice.invoiceNumber,
        attempt.providerPaymentRequestId,
      );
    }
    if (attempt && attempt.state !== 'REJECTED') {
      throw this.paymentRequestAttemptConflict(attempt.state);
    }

    const claim = await this.billingRepository.claimXenditPaymentRequest(
      invoice.id,
      tenantId,
    );
    if (!claim.claimed) {
      const currentInvoice = await this.billingRepository.findInvoiceById(
        invoice.id,
        tenantId,
      );
      if (currentInvoice?.providerPaymentRequestId) {
        return {
          paymentRequestId: currentInvoice.providerPaymentRequestId,
          status: 'PENDING',
        };
      }

      attempt = await this.billingRepository.findXenditPaymentRequestAttempt(
        invoice.id,
        tenantId,
      );
      if (attempt?.providerPaymentRequestId) {
        return this.recoverXenditPaymentRequest(
          invoice.id,
          tenantId,
          invoice.invoiceNumber,
          attempt.providerPaymentRequestId,
        );
      }
      throw this.paymentRequestAttemptConflict(attempt?.state);
    }

    let result: Awaited<ReturnType<XenditPaymentGateway['charge']>>;
    try {
      result = await this.xenditGateway.charge({
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        description: `Invoice ${invoice.invoiceNumber}`,
        tenantId,
        channelCode,
        metadata: { referenceId: invoice.invoiceNumber },
      });
    } catch (error) {
      const state =
        error instanceof XenditPaymentRequestError &&
        error.outcome === 'REJECTED'
          ? 'REJECTED'
          : 'UNKNOWN';
      await this.recordPaymentRequestOutcome(invoice.id, tenantId, state);
      throw new BadGatewayException(
        state === 'UNKNOWN'
          ? 'Xendit payment request outcome is unknown; automatic retry is blocked'
          : 'Xendit rejected the payment request; a later retry may be attempted',
      );
    }

    if (!result.paymentRequestId) {
      await this.recordPaymentRequestOutcome(invoice.id, tenantId, 'UNKNOWN');
      throw new InternalServerErrorException(
        'Xendit did not return a Payment Request ID; automatic retry is blocked',
      );
    }

    try {
      await this.billingRepository.completeXenditPaymentRequest(
        invoice.id,
        tenantId,
        invoice.invoiceNumber,
        result.paymentRequestId,
      );
    } catch (error) {
      await this.recordPaymentRequestOutcome(
        invoice.id,
        tenantId,
        'UNKNOWN',
        result.paymentRequestId,
      );
      this.logger.error(
        `Xendit created Payment Request for invoice ${invoice.id}, but ERP correlation persistence failed`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Xendit created a Payment Request but ERP correlation failed; its ID is retained for retry when possible',
      );
    }

    return {
      paymentRequestId: result.paymentRequestId,
      status: result.status,
    };
  }

  private async recoverXenditPaymentRequest(
    invoiceId: string,
    tenantId: string,
    referenceId: string,
    paymentRequestId: string,
  ): Promise<{
    paymentRequestId: string;
    status: 'PAID' | 'FAILED' | 'PENDING';
  }> {
    try {
      await this.billingRepository.completeXenditPaymentRequest(
        invoiceId,
        tenantId,
        referenceId,
        paymentRequestId,
      );
    } catch (error) {
      this.logger.error(
        `Known Xendit Payment Request ID could not be linked to invoice ${invoiceId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'The existing Xendit Payment Request ID could not yet be linked; no new request was created',
      );
    }
    return { paymentRequestId, status: 'PENDING' };
  }

  private async recordPaymentRequestOutcome(
    invoiceId: string,
    tenantId: string,
    state: 'REJECTED' | 'UNKNOWN',
    paymentRequestId?: string,
  ): Promise<void> {
    try {
      await this.billingRepository.recordXenditPaymentRequestOutcome(
        invoiceId,
        tenantId,
        state,
        paymentRequestId,
      );
    } catch (error) {
      this.logger.error(
        `Could not persist Xendit request outcome for invoice ${invoiceId}; the durable claim remains blocking`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private paymentRequestAttemptConflict(
    state?: 'IN_PROGRESS' | 'REJECTED' | 'UNKNOWN' | 'COMPLETED',
  ): ConflictException {
    if (state === 'UNKNOWN') {
      return new ConflictException(
        'Xendit request outcome is unknown; manual resolution is required before another request',
      );
    }
    return new ConflictException(
      'A Xendit payment request operation is already in progress or completed',
    );
  }

  async executeBilling(subscriptionId: string): Promise<void> {
    const tenantId = this.tenantContext.requireTenant();
    const subscription = await this.subscriptionRepository.findById(
      subscriptionId,
      tenantId,
    );

    if (!subscription) {
      throw new NotFoundException('Subscription not found for billing');
    }

    if (!subscription.isActive()) {
      throw new BadRequestException('Cannot bill a non-active subscription');
    }

    const amountCents = subscription.planPriceCents;
    if (amountCents <= 0) {
      this.logger.log(
        `Free plan — no billing needed for subscription ${subscriptionId}`,
      );
      return;
    }

    const now = new Date();
    const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const billingPeriodEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const invoice = await this.billingRepository.createInvoice({
      tenantId,
      subscriptionId,
      amountCents,
      currency: 'IDR',
      status: 'PENDING',
      dueAt: billingPeriodEnd,
    });

    await this.outbox.publish({
      type: DOMAIN_EVENTS.INVOICE_CREATED,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        tenantId,
        subscriptionId: subscriptionId ?? undefined,
        amountCents: invoice.amountCents,
        currency: invoice.currency,
      },
    });

    await this.outbox.publish({
      type: DOMAIN_EVENTS.PAYMENT_REQUIRED,
      payload: {
        subscriptionId,
        tenantId,
        amountCents,
        billingPeriod: `${billingPeriodStart.toISOString()}/${billingPeriodEnd.toISOString()}`,
      },
    });

    this.logger.log(
      `Invoice ${invoice.invoiceNumber} created for subscription ${subscriptionId}, amount: ${amountCents} cents`,
    );
  }

  async handlePaymentSuccess(
    invoiceId: string,
    paidAt: Date = new Date(),
  ): Promise<void> {
    const tenantId = this.tenantContext.requireTenant();
    const invoice = await this.billingRepository.findInvoiceById(
      invoiceId,
      tenantId,
    );

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      this.logger.warn(
        `Invoice ${invoice.invoiceNumber} already paid — skipping`,
      );
      return;
    }

    const updated = await this.billingRepository.settlePaidInvoice(
      invoiceId,
      tenantId,
      paidAt,
    );

    if (!updated) return;
  }

  async handlePaymentFailure(
    invoiceId: string,
    reason?: string,
  ): Promise<void> {
    const tenantId = this.tenantContext.requireTenant();
    const invoice = await this.billingRepository.findInvoiceById(
      invoiceId,
      tenantId,
    );

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const updated = await this.billingRepository.updateInvoiceStatus(
      invoiceId,
      tenantId,
      'FAILED',
      undefined,
      'PENDING',
    );

    if (!updated) return;

    await this.outbox.publish({
      type: DOMAIN_EVENTS.INVOICE_FAILED,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        tenantId,
        subscriptionId: invoice.subscriptionId ?? undefined,
        reason,
      },
    });

    if (invoice.subscriptionId) {
      const subscription = await this.subscriptionRepository.findById(
        invoice.subscriptionId,
        tenantId,
      );

      if (subscription) {
        subscription.markPastDue(invoice.amountCents);
        await this.subscriptionRepository.save(subscription);
      }
    }
  }

  async handleXenditWebhookEvent(input: {
    eventType: string;
    eventCreatedAt: string;
    providerUpdatedAt: string;
    paymentRequestId?: string;
    referenceId?: string;
    paymentId: string;
    amount?: number;
    currency?: string;
    status?: string;
    captureIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'> {
    const idempotencyKey = createHash('sha256')
      .update(
        [
          'xendit-payments-v3',
          input.paymentId,
          input.eventType,
          input.status ?? '',
          (input.captureIds ?? []).slice().sort().join(','),
        ].join('\0'),
      )
      .digest('hex');

    return requestContext.run({ systemOperation: 'xendit-webhook' }, () =>
      this.billingRepository.processXenditWebhookEvent({
        ...input,
        idempotencyKey,
      }),
    );
  }

  async renewSubscription(subscriptionId: string): Promise<void> {
    const tenantId = this.tenantContext.requireTenant();
    const subscription = await this.subscriptionRepository.findById(
      subscriptionId,
      tenantId,
    );

    if (!subscription) {
      throw new NotFoundException('Subscription not found for renewal');
    }

    const now = new Date();
    const billingPeriodStart = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    );
    const billingPeriodEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 2,
      0,
      23,
      59,
      59,
      999,
    );

    subscription.renew(billingPeriodStart, billingPeriodEnd);
    await this.subscriptionRepository.save(subscription);

    await this.executeBilling(subscriptionId);
  }
}
