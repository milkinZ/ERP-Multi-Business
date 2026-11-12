import { requestContext } from '../../core/request-context/request-context';

import { AutopayService } from './autopay.service';
import { XenditPaymentRequestError } from './gateway/xendit-payment.gateway';

describe('AutopayService', () => {
  const tenantContext = { requireTenant: jest.fn(() => 'tenant-1') };
  const tokenCrypto = {
    assertConfigured: jest.fn(),
    encrypt: jest.fn(() => ({
      ciphertext: 'encrypted',
      iv: 'iv',
      authTag: 'tag',
      keyVersion: 'v1',
      fingerprint: 'fingerprint',
    })),
    decrypt: jest.fn(() => 'provider-token'),
  };

  it('does not initiate charges when the operator policy is disabled', async () => {
    const repository = {
      getAutopayPolicy: jest.fn().mockResolvedValue({
        enabled: false,
        mitChannelAllowlist: [],
      }),
      findAutopayInvoices: jest.fn(),
      expireAutopayRetryWindow: jest.fn(),
    };
    const gateway = { charge: jest.fn() };
    const service = new AutopayService(
      repository as never,
      tenantContext as never,
      gateway as never,
      tokenCrypto as never,
    );

    await service.processScheduledAutopay();

    expect(repository.findAutopayInvoices).not.toHaveBeenCalled();
    expect(repository.expireAutopayRetryWindow).toHaveBeenCalledTimes(1);
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('only advertises the supported CARDS enrollment channel', async () => {
    const repository = {
      getAutopayPolicy: jest.fn().mockResolvedValue({
        enabled: true,
        mitChannelAllowlist: ['QRIS', 'CARDS'],
      }),
      findAutopayPaymentMethod: jest.fn().mockResolvedValue(null),
    };
    const service = new AutopayService(
      repository as never,
      tenantContext as never,
      {} as never,
      tokenCrypto as never,
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      enabled: true,
      availableChannelCodes: ['CARDS'],
    });
  });

  it('rejects enrollment on channels without an Xendit customer mapping', async () => {
    const repository = {
      getAutopayPolicy: jest.fn().mockResolvedValue({
        enabled: true,
        mitChannelAllowlist: ['QRIS'],
      }),
    };
    const gateway = { charge: jest.fn() };
    const service = new AutopayService(
      repository as never,
      tenantContext as never,
      gateway as never,
      tokenCrypto as never,
    );

    await expect(service.enroll('invoice-1', 'QRIS', 'user-1')).rejects.toThrow(
      'Autopay enrollment currently supports the Xendit CARDS channel only',
    );
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('returns the provider HTTP status and safe error code for a rejected enrollment', async () => {
    const repository = {
      getAutopayPolicy: jest.fn().mockResolvedValue({
        enabled: true,
        mitChannelAllowlist: ['CARDS'],
      }),
      findInvoiceById: jest.fn().mockResolvedValue({
        id: 'invoice-1',
        status: 'PENDING',
        subscriptionId: 'subscription-1',
        currency: 'IDR',
        amountCents: 5000,
        invoiceNumber: 'INV-1',
      }),
      findAutopayPaymentMethod: jest.fn().mockResolvedValue(null),
      createAutopayEnrollment: jest
        .fn()
        .mockResolvedValue({ id: 'enrollment-1' }),
      claimXenditPaymentRequest: jest.fn().mockResolvedValue({ claimed: true }),
      recordXenditPaymentRequestOutcome: jest.fn(),
      failAutopayEnrollment: jest.fn(),
    };
    const gateway = {
      createAutopayPaymentSession: jest
        .fn()
        .mockRejectedValue(
          new XenditPaymentRequestError(
            'Provider message is intentionally not returned',
            'REJECTED',
            400,
            'INVALID_CHANNEL',
          ),
        ),
    };
    const service = new AutopayService(
      repository as never,
      tenantContext as never,
      gateway as never,
      tokenCrypto as never,
    );

    await expect(
      service.enroll('invoice-1', 'CARDS', 'user-1'),
    ).rejects.toThrow(
      'Xendit rejected autopay enrollment (HTTP 400, provider code INVALID_CHANNEL)',
    );
    expect(repository.recordXenditPaymentRequestOutcome).toHaveBeenCalledWith(
      'invoice-1',
      'tenant-1',
      'REJECTED',
    );
    expect(repository.failAutopayEnrollment).toHaveBeenCalledWith(
      'enrollment-1',
      'tenant-1',
    );
  });

  it('reports an actionable service configuration error for non-HTTPS return URLs', async () => {
    const repository = {
      getAutopayPolicy: jest.fn().mockResolvedValue({
        enabled: true,
        mitChannelAllowlist: ['CARDS'],
      }),
      findInvoiceById: jest.fn().mockResolvedValue({
        id: 'invoice-1',
        status: 'PENDING',
        subscriptionId: 'subscription-1',
        currency: 'IDR',
        amountCents: 5000,
        invoiceNumber: 'INV-1',
      }),
      findAutopayPaymentMethod: jest.fn().mockResolvedValue(null),
      createAutopayEnrollment: jest
        .fn()
        .mockResolvedValue({ id: 'enrollment-1' }),
      claimXenditPaymentRequest: jest.fn().mockResolvedValue({ claimed: true }),
      recordXenditPaymentRequestOutcome: jest.fn(),
      failAutopayEnrollment: jest.fn(),
    };
    const gateway = {
      createAutopayPaymentSession: jest
        .fn()
        .mockRejectedValue(
          new XenditPaymentRequestError(
            'Xendit Payment Sessions require HTTPS return URLs',
            'REJECTED',
            undefined,
            'XENDIT_RETURN_BASE_URL_HTTPS_REQUIRED',
          ),
        ),
    };
    const service = new AutopayService(
      repository as never,
      tenantContext as never,
      gateway as never,
      tokenCrypto as never,
    );

    await expect(
      service.enroll('invoice-1', 'CARDS', 'user-1'),
    ).rejects.toThrow(
      'Autopay hosted checkout requires XENDIT_RETURN_BASE_URL, or WEB_BASE_URL, to be a public HTTPS URL',
    );
    expect(repository.failAutopayEnrollment).toHaveBeenCalledWith(
      'enrollment-1',
      'tenant-1',
    );
  });

  it('creates a hosted Payment Session and stores its correlation before returning the checkout URL', async () => {
    const repository = {
      getAutopayPolicy: jest.fn().mockResolvedValue({
        enabled: true,
        mitChannelAllowlist: ['CARDS'],
      }),
      findInvoiceById: jest.fn().mockResolvedValue({
        id: 'invoice-1',
        status: 'PENDING',
        subscriptionId: 'subscription-1',
        currency: 'IDR',
        amountCents: 5000,
        invoiceNumber: 'INV-1',
      }),
      findAutopayPaymentMethod: jest.fn().mockResolvedValue(null),
      createAutopayEnrollment: jest
        .fn()
        .mockResolvedValue({ id: 'enrollment-1' }),
      claimXenditPaymentRequest: jest.fn().mockResolvedValue({ claimed: true }),
      recordAutopayEnrollmentSession: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const gateway = {
      createAutopayPaymentSession: jest.fn().mockResolvedValue({
        paymentSessionId: 'ps-123',
        paymentLinkUrl: 'https://checkout.xendit.co/session/ps-123',
      }),
    };
    const service = new AutopayService(
      repository as never,
      tenantContext as never,
      gateway as never,
      tokenCrypto as never,
    );

    await expect(
      service.enroll('invoice-1', 'CARDS', 'user-1'),
    ).resolves.toMatchObject({
      paymentSessionId: 'ps-123',
      status: 'PENDING',
      actions: [
        {
          type: 'REDIRECT',
          value: 'https://checkout.xendit.co/session/ps-123',
        },
      ],
    });
    expect(repository.createAutopayEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'invoice-1' }),
    );
    expect(gateway.createAutopayPaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 5000,
        currency: 'IDR',
        invoiceId: 'invoice-1',
      }),
    );
    expect(repository.recordAutopayEnrollmentSession).toHaveBeenCalledWith(
      'enrollment-1',
      'tenant-1',
      'ps-123',
    );
  });

  it('blocks automatic retry when the provider outcome is unknown', async () => {
    const candidate = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-1',
      amountCents: 5000,
      currency: 'IDR',
      paymentMethod: {
        providerPaymentTokenIdCiphertext: 'ciphertext',
        encryptionIv: 'iv',
        encryptionAuthTag: 'tag',
        encryptionKeyVersion: 'v1',
        channelCode: 'CARD',
      },
    };
    const attempt = {
      id: 'attempt-1',
      referenceId: 'ap-attempt-1',
      attemptNumber: 1,
    };
    const repository = {
      getAutopayPolicy: jest.fn().mockResolvedValue({
        enabled: true,
        mitChannelAllowlist: ['CARD'],
      }),
      findAutopayInvoices: jest.fn().mockResolvedValue([candidate]),
      claimAutopayChargeAttempt: jest.fn().mockResolvedValue({
        attempt,
        invoice: candidate,
        paymentMethod: candidate.paymentMethod,
      }),
      failAutopayChargeAttempt: jest.fn(),
      expireAutopayRetryWindow: jest.fn(),
    };
    const gateway = {
      charge: jest
        .fn()
        .mockRejectedValue(
          new XenditPaymentRequestError('Unknown outcome', 'UNKNOWN'),
        ),
    };
    const service = new AutopayService(
      repository as never,
      tenantContext as never,
      gateway as never,
      tokenCrypto as never,
    );

    await service.processScheduledAutopay();

    expect(repository.failAutopayChargeAttempt).toHaveBeenCalledWith(
      'attempt-1',
      'tenant-1',
      'UNKNOWN',
      'UNKNOWN',
      expect.any(Date),
    );
    expect(gateway.charge).toHaveBeenCalledTimes(1);
    expect(repository.expireAutopayRetryWindow).toHaveBeenCalledTimes(1);
  });

  it('processes each scheduled invoice in its tenant context and uses its approved channel', async () => {
    const candidate = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      invoiceNumber: 'INV-1',
      amountCents: 5000,
      currency: 'IDR',
      paymentMethod: {
        providerPaymentTokenIdCiphertext: 'ciphertext',
        encryptionIv: 'iv',
        encryptionAuthTag: 'tag',
        encryptionKeyVersion: 'v1',
        channelCode: 'CARDS',
      },
    };
    const attempt = {
      id: 'attempt-1',
      referenceId: 'ap-attempt-1',
      attemptNumber: 1,
    };
    const repository = {
      getAutopayPolicy: jest.fn().mockResolvedValue({
        enabled: true,
        mitChannelAllowlist: ['CARDS'],
      }),
      findAutopayInvoices: jest.fn().mockResolvedValue([candidate]),
      claimAutopayChargeAttempt: jest.fn(() => {
        expect(requestContext.get().tenantId).toBe('tenant-1');
        return Promise.resolve({
          attempt,
          invoice: {
            invoiceNumber: 'INV-1',
            amountCents: 5000,
            currency: 'IDR',
          },
          paymentMethod: candidate.paymentMethod,
        });
      }),
      completeAutopayChargeRequest: jest.fn().mockResolvedValue({ count: 1 }),
      expireAutopayRetryWindow: jest.fn(),
    };
    const chargeInputs: Array<Record<string, unknown>> = [];
    const gateway = {
      charge: jest.fn((input: Record<string, unknown>) => {
        chargeInputs.push(input);
        return Promise.resolve({
          paymentRequestId: 'payment-request-1',
          status: 'PENDING' as const,
          actions: [],
        });
      }),
    };
    const service = new AutopayService(
      repository as never,
      tenantContext as never,
      gateway as never,
      tokenCrypto as never,
    );

    await service.processScheduledAutopay();

    expect(gateway.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        channelCode: 'CARDS',
        paymentTokenId: 'provider-token',
      }),
    );
    expect(chargeInputs).toHaveLength(1);
    expect(chargeInputs[0]).not.toHaveProperty('customerId');
    expect(repository.completeAutopayChargeRequest).toHaveBeenCalledWith(
      'attempt-1',
      'tenant-1',
      'payment-request-1',
    );
  });
});
