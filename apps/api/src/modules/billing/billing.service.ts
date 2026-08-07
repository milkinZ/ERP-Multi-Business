import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BillingRepository } from './billing.repository';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { PlanRepository } from '../subscription/plans/plan.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly planRepository: PlanRepository,
    private readonly tenantContext: TenantContextService,
    private readonly outbox: OutboxPublisher,
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

    const invoiceNumber =
      await this.billingRepository.generateInvoiceNumber(tenantId);

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
      invoiceNumber,
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
      `Invoice ${invoiceNumber} created for subscription ${subscriptionId}, amount: ${amountCents} cents`,
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

    await this.billingRepository.updateInvoiceStatus(invoiceId, 'PAID', paidAt);

    await this.outbox.publish({
      type: DOMAIN_EVENTS.INVOICE_PAID,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        tenantId,
        subscriptionId: invoice.subscriptionId ?? undefined,
        amountCents: invoice.amountCents,
      },
    });

    if (invoice.subscriptionId) {
      const subscription = await this.subscriptionRepository.findById(
        invoice.subscriptionId,
        tenantId,
      );

      if (subscription) {
        subscription.activate();
        await this.subscriptionRepository.save(subscription);
      }
    }
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

    await this.billingRepository.updateInvoiceStatus(invoiceId, 'FAILED');

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
