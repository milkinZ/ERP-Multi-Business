import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { PlanRepository } from '../subscription/plans/plan.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { SubscriptionStatus } from '../subscription/domain/subscription.aggregate';
import {
  XenditPaymentGateway,
  XenditPaymentRequestError,
} from './gateway/xendit-payment.gateway';

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
  const createInvoice = jest.fn();
  const updateInvoiceStatus = jest.fn();
  const settlePaidInvoice = jest.fn();
  const findXenditPaymentRequestAttempt = jest.fn();
  const claimXenditPaymentRequest = jest.fn();
  const completeXenditPaymentRequest = jest.fn();
  const recordXenditPaymentRequestOutcome = jest.fn();
  type XenditWebhookInput = Parameters<
    BillingRepository['processXenditWebhookEvent']
  >[0];
  const processedWebhookInputs: XenditWebhookInput[] = [];
  const processXenditWebhookEvent = jest.fn(
    (
      input: XenditWebhookInput,
    ): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'> => {
      processedWebhookInputs.push(input);
      return Promise.resolve('PROCESSED');
    },
  );
  const billingRepository = {
    findAllInvoices,
    findInvoiceById,
    createInvoice,
    updateInvoiceStatus,
    settlePaidInvoice,
    findXenditPaymentRequestAttempt,
    claimXenditPaymentRequest,
    completeXenditPaymentRequest,
    recordXenditPaymentRequestOutcome,
    processXenditWebhookEvent,
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
  const charge = jest.fn();
  const xenditGateway = { charge } as unknown as XenditPaymentGateway;
  let service: BillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    processedWebhookInputs.length = 0;
    findXenditPaymentRequestAttempt.mockResolvedValue(null);
    claimXenditPaymentRequest.mockResolvedValue({ claimed: true });
    completeXenditPaymentRequest.mockResolvedValue(undefined);
    recordXenditPaymentRequestOutcome.mockResolvedValue({ count: 1 });
    service = new BillingService(
      billingRepository,
      subscriptionRepository,
      planRepository,
      tenantContext,
      outbox,
      xenditGateway,
    );
  });

  it('creates a tenant-scoped invoice and payment-required events', async () => {
    const subscription = activeSubscription();
    findById.mockResolvedValue(subscription);
    settlePaidInvoice.mockResolvedValue({ id: 'invoice-a', status: 'PAID' });
    createInvoice.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      amountCents: 49900,
      currency: 'IDR',
    });

    await expect(
      service.executeBilling('subscription-a'),
    ).resolves.toBeUndefined();
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        subscriptionId: 'subscription-a',
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

  it('persists the exact Xendit payment request ID before returning success', async () => {
    findInvoiceById.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      amountCents: 49900,
      currency: 'IDR',
      status: 'PENDING',
      providerPaymentRequestId: null,
    });
    charge.mockResolvedValue({
      success: true,
      transactionId: '',
      gatewayReference: 'pr-xendit-123',
      paymentRequestId: 'pr-xendit-123',
      status: 'PENDING',
    });
    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).resolves.toEqual({
      paymentRequestId: 'pr-xendit-123',
      status: 'PENDING',
    });

    expect(charge).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 49900,
        currency: 'IDR',
        tenantId: 'tenant-a',
        channelCode: 'QRIS',
        metadata: { referenceId: 'INV-A' },
      }),
    );
    expect(claimXenditPaymentRequest).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
    );
    expect(completeXenditPaymentRequest).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
      'INV-A',
      'pr-xendit-123',
    );
  });

  it('surfaces correlation persistence failure after provider creation', async () => {
    findInvoiceById.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      amountCents: 49900,
      currency: 'IDR',
      status: 'PENDING',
      providerPaymentRequestId: null,
    });
    charge.mockResolvedValue({
      success: true,
      transactionId: '',
      gatewayReference: 'pr-xendit-456',
      paymentRequestId: 'pr-xendit-456',
      status: 'PENDING',
    });
    completeXenditPaymentRequest.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).rejects.toThrow(InternalServerErrorException);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(completeXenditPaymentRequest).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
      'INV-A',
      'pr-xendit-456',
    );
    expect(recordXenditPaymentRequestOutcome).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
      'UNKNOWN',
      'pr-xendit-456',
    );
  });

  it('reuses an existing provider request without another Xendit call', async () => {
    findInvoiceById.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      amountCents: 49900,
      currency: 'IDR',
      status: 'PENDING',
      providerPaymentRequestId: 'pr-existing',
    });

    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).resolves.toEqual({
      paymentRequestId: 'pr-existing',
      status: 'PENDING',
    });
    expect(charge).not.toHaveBeenCalled();
  });

  it('rejects a concurrent attempt owner before calling Xendit', async () => {
    findInvoiceById
      .mockResolvedValueOnce({
        id: 'invoice-a',
        invoiceNumber: 'INV-A',
        amountCents: 49900,
        currency: 'IDR',
        status: 'PENDING',
        providerPaymentRequestId: null,
      })
      .mockResolvedValueOnce({
        id: 'invoice-a',
        invoiceNumber: 'INV-A',
        amountCents: 49900,
        currency: 'IDR',
        status: 'PENDING',
        providerPaymentRequestId: null,
      });
    claimXenditPaymentRequest.mockResolvedValue({
      claimed: false,
      state: 'IN_PROGRESS',
    });
    findXenditPaymentRequestAttempt.mockResolvedValue({
      state: 'IN_PROGRESS',
      providerPaymentRequestId: null,
    });

    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).rejects.toThrow(ConflictException);
    expect(charge).not.toHaveBeenCalled();
  });

  it('allows a later retry after a definitive Xendit rejection', async () => {
    findInvoiceById.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      amountCents: 49900,
      currency: 'IDR',
      status: 'PENDING',
      providerPaymentRequestId: null,
    });
    findXenditPaymentRequestAttempt
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        state: 'REJECTED',
        providerPaymentRequestId: null,
      });
    charge
      .mockRejectedValueOnce(
        new XenditPaymentRequestError('invalid channel', 'REJECTED'),
      )
      .mockResolvedValueOnce({
        success: true,
        transactionId: '',
        gatewayReference: 'pr-after-rejection',
        paymentRequestId: 'pr-after-rejection',
        status: 'PENDING',
      });

    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).rejects.toThrow(BadGatewayException);
    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).resolves.toEqual({
      paymentRequestId: 'pr-after-rejection',
      status: 'PENDING',
    });
    expect(charge).toHaveBeenCalledTimes(2);
    expect(completeXenditPaymentRequest).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
      'INV-A',
      'pr-after-rejection',
    );
    expect(recordXenditPaymentRequestOutcome).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
      'REJECTED',
      undefined,
    );
  });

  it('blocks retry after an ambiguous Xendit outcome', async () => {
    findInvoiceById.mockResolvedValue({
      id: 'invoice-a',
      invoiceNumber: 'INV-A',
      amountCents: 49900,
      currency: 'IDR',
      status: 'PENDING',
      providerPaymentRequestId: null,
    });
    findXenditPaymentRequestAttempt
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        state: 'UNKNOWN',
        providerPaymentRequestId: null,
      });
    charge.mockRejectedValue(
      new XenditPaymentRequestError('timeout', 'UNKNOWN'),
    );

    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).rejects.toThrow(BadGatewayException);
    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).rejects.toThrow(ConflictException);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(recordXenditPaymentRequestOutcome).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
      'UNKNOWN',
      undefined,
    );
  });

  it.each(['PAID', 'FAILED'])(
    'does not create a request for a %s invoice',
    async (status) => {
      findInvoiceById.mockResolvedValue({
        id: 'invoice-a',
        invoiceNumber: 'INV-A',
        amountCents: 49900,
        currency: 'IDR',
        status,
        providerPaymentRequestId: null,
      });

      await expect(
        service.createXenditPaymentRequest('invoice-a', 'QRIS'),
      ).rejects.toThrow(ConflictException);
      expect(charge).not.toHaveBeenCalled();
    },
  );

  it('rejects nonexistent or cross-tenant invoices before claiming an attempt', async () => {
    findInvoiceById.mockResolvedValue(null);

    await expect(
      service.createXenditPaymentRequest('invoice-a', 'QRIS'),
    ).rejects.toThrow(NotFoundException);
    expect(claimXenditPaymentRequest).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
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
    updateInvoiceStatus.mockResolvedValue({
      id: 'invoice-a',
      status: 'FAILED',
    });

    await service.handlePaymentFailure('invoice-a', 'declined');

    expect(updateInvoiceStatus).toHaveBeenCalledWith(
      'invoice-a',
      'tenant-a',
      'FAILED',
      undefined,
      'PENDING',
    );
    expect(subscription.markPastDue).toHaveBeenCalledWith(49900);
    expect(save).toHaveBeenCalledWith(subscription);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('derives a stable durable key from the provider event identity instead of delivery timestamps', async () => {
    const event = {
      eventType: 'payment.capture',
      eventCreatedAt: '2026-09-28T12:00:00.000Z',
      providerUpdatedAt: '2026-09-28T12:00:01.000Z',
      paymentRequestId: 'pr-123',
      referenceId: 'INV-123',
      paymentId: 'py-123',
      amount: 49900,
      currency: 'IDR',
      status: 'SUCCEEDED',
      captureIds: ['capture-a', 'capture-b'],
    };

    await service.handleXenditWebhookEvent(event);
    await service.handleXenditWebhookEvent({
      ...event,
      eventCreatedAt: '2026-09-28T12:05:00.000Z',
      providerUpdatedAt: '2026-09-28T12:05:01.000Z',
      captureIds: ['capture-b', 'capture-a'],
    });
    await service.handleXenditWebhookEvent({
      ...event,
      status: 'FAILED',
      eventCreatedAt: '2026-09-28T12:10:00.000Z',
      providerUpdatedAt: '2026-09-28T12:10:01.000Z',
    });
    await service.handleXenditWebhookEvent({ ...event, paymentId: 'py-456' });
    await service.handleXenditWebhookEvent({
      ...event,
      eventType: 'payment.failure',
    });
    await service.handleXenditWebhookEvent({
      ...event,
      captureIds: ['capture-c'],
    });
    await service.handleXenditWebhookEvent({
      ...event,
      captureIds: ['capture-a'],
    });
    await service.handleXenditWebhookEvent({
      ...event,
      captureIds: ['capture-b'],
    });
    await service.handleXenditWebhookEvent({ ...event, captureIds: [] });
    const { captureIds: omittedCaptureIds, ...eventWithoutCaptureIds } = event;
    expect(omittedCaptureIds).toEqual(['capture-a', 'capture-b']);
    await service.handleXenditWebhookEvent(eventWithoutCaptureIds);

    const firstKey = processedWebhookInputs[0]?.idempotencyKey;
    const secondKey = processedWebhookInputs[1]?.idempotencyKey;
    const thirdKey = processedWebhookInputs[2]?.idempotencyKey;
    const differentPaymentKey = processedWebhookInputs[3]?.idempotencyKey;
    const differentEventTypeKey = processedWebhookInputs[4]?.idempotencyKey;
    const differentCaptureKey = processedWebhookInputs[5]?.idempotencyKey;
    const captureAKey = processedWebhookInputs[6]?.idempotencyKey;
    const captureBKey = processedWebhookInputs[7]?.idempotencyKey;
    const emptyCaptureKey = processedWebhookInputs[8]?.idempotencyKey;
    const missingCaptureKey = processedWebhookInputs[9]?.idempotencyKey;
    expect(firstKey).toMatch(/^[a-f0-9]{64}$/);
    expect(secondKey).toBe(firstKey);
    expect(thirdKey).not.toBe(firstKey);
    expect(differentPaymentKey).not.toBe(firstKey);
    expect(differentEventTypeKey).not.toBe(firstKey);
    expect(differentCaptureKey).not.toBe(firstKey);
    expect(captureAKey).not.toBe(captureBKey);
    expect(emptyCaptureKey).toBe(missingCaptureKey);
  });
});
