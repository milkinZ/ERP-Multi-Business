import { BadRequestException, NotFoundException } from '@nestjs/common';

import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { PlanRepository } from '../subscription/plans/plan.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { SubscriptionStatus } from '../subscription/domain/subscription.aggregate';

function activeSubscription() {
  return {
    id: 'subscription-a',
    planPriceCents: 49900,
    status: SubscriptionStatus.ACTIVE,
    isActive: () => true,
    activate: jest.fn(),
    markPastDue: jest.fn(),
  };
}

describe('BillingService', () => {
  const findAllInvoices = jest.fn();
  const findInvoiceById = jest.fn();
  const generateInvoiceNumber = jest.fn();
  const createInvoice = jest.fn();
  const updateInvoiceStatus = jest.fn();
  const billingRepository = {
    findAllInvoices,
    findInvoiceById,
    generateInvoiceNumber,
    createInvoice,
    updateInvoiceStatus,
  } as unknown as BillingRepository;
  const findById = jest.fn();
  const save = jest.fn();
  const subscriptionRepository = {
    findById,
    save,
  } as unknown as SubscriptionRepository;
  const planRepository = {} as PlanRepository;
  const requireTenant = jest.fn().mockReturnValue('tenant-a');
  const tenantContext = { requireTenant } as unknown as TenantContextService;
  const publish = jest.fn();
  const outbox = { publish } as unknown as OutboxPublisher;
  let service: BillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingService(
      billingRepository,
      subscriptionRepository,
      planRepository,
      tenantContext,
      outbox,
    );
  });

  it('creates a tenant-scoped invoice and payment-required events', async () => {
    const subscription = activeSubscription();
    findById.mockResolvedValue(subscription);
    generateInvoiceNumber.mockResolvedValue('INV-A');
    createInvoice.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      amountCents: 49900,
      currency: 'IDR',
    });

    await expect(
      service.executeBilling('subscription-a'),
    ).resolves.toBeUndefined();
    expect(generateInvoiceNumber).toHaveBeenCalledWith('tenant-a');
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        subscriptionId: 'subscription-a',
        invoiceNumber: 'INV-A',
        amountCents: 49900,
        status: 'PENDING',
      }),
    );
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('rejects missing or inactive subscriptions without invoice side effects', async () => {
    findById.mockResolvedValue(null);
    await expect(service.executeBilling('missing')).rejects.toThrow(
      new NotFoundException('Subscription not found for billing'),
    );

    findById.mockResolvedValue({
      ...activeSubscription(),
      isActive: () => false,
    });
    await expect(service.executeBilling('subscription-a')).rejects.toThrow(
      new BadRequestException('Cannot bill a non-active subscription'),
    );
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('treats duplicate paid callbacks as idempotent', async () => {
    findInvoiceById.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      status: 'PAID',
      amountCents: 49900,
      subscriptionId: 'subscription-a',
    });

    await expect(
      service.handlePaymentSuccess('invoice-a'),
    ).resolves.toBeUndefined();
    expect(updateInvoiceStatus).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('marks failed payment invoices and subscriptions past due', async () => {
    const subscription = activeSubscription();
    findInvoiceById.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      status: 'PENDING',
      amountCents: 49900,
      subscriptionId: 'subscription-a',
    });
    findById.mockResolvedValue(subscription);

    await service.handlePaymentFailure('invoice-a', 'declined');

    expect(updateInvoiceStatus).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
      'FAILED',
    );
    expect(subscription.markPastDue).toHaveBeenCalledWith(49900);
    expect(save).toHaveBeenCalledWith(subscription);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
