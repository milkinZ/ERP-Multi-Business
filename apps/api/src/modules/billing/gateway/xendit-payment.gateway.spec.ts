import { ConfigService } from '@nestjs/config';

import { XenditPaymentGateway } from './xendit-payment.gateway';

describe('XenditPaymentGateway', () => {
  it('creates a payment request using the Xendit Payment Request contract', async () => {
    const requestCapture: { url?: string; init?: RequestInit } = {};
    const fetchMock: typeof fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      requestCapture.url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requestCapture.init = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            payment_request_id: 'pr-123',
            status: 'REQUIRES_ACTION',
            reference_id: 'order-456',
            latest_payment_id: 'py-456',
          }),
          { status: 200 },
        ),
      );
    };

    global.fetch = fetchMock;

    const config = {
      get: (key: string): string | undefined => {
        switch (key) {
          case 'XENDIT_API_KEY':
            return 'xnd_development_test_key';
          case 'XENDIT_API_BASE_URL':
            return 'https://api.xendit.co';
          case 'XENDIT_WEBHOOK_TOKEN':
            return 'webhook-token';
          default:
            return undefined;
        }
      },
    };

    const gateway = new XenditPaymentGateway(
      config as unknown as ConfigService,
    );

    const result = await gateway.charge({
      amountCents: 250000,
      currency: 'IDR',
      description: 'Order #456',
      tenantId: 'tenant-1',
      channelCode: 'QRIS',
      metadata: { orderId: 'order-456' },
    });

    expect(requestCapture.url).toBe(
      'https://api.xendit.co/v3/payment_requests',
    );
    expect(requestCapture.init?.method).toBe('POST');
    expect(requestCapture.init?.headers).toEqual({
      Authorization: 'Basic eG5kX2RldmVsb3BtZW50X3Rlc3Rfa2V5Og==',
      'Content-Type': 'application/json',
    });
    const requestBody = requestCapture.init?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON string request body');
    }
    expect(JSON.parse(requestBody)).toMatchObject({
      reference_id: 'order-456',
      type: 'PAY',
      country: 'ID',
      request_amount: 250000,
      currency: 'IDR',
      channel_code: 'QRIS',
      capture_method: 'AUTOMATIC',
    });

    expect(result).toMatchObject({
      success: true,
      gatewayReference: 'pr-123',
      paymentRequestId: 'pr-123',
      transactionId: 'py-456',
      status: 'PENDING',
    });
  });

  it('saves a payment token and charges recurring payments by token', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    global.fetch = (_input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON payment request body');
      }
      requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            payment_request_id: `pr-${requestBodies.length}`,
            status: 'REQUIRES_ACTION',
          }),
          { status: 200 },
        ),
      );
    };
    const gateway = new XenditPaymentGateway({
      get: (key: string) =>
        key === 'XENDIT_API_KEY' ? 'xnd_development_test_key' : undefined,
    } as unknown as ConfigService);

    await gateway.charge({
      amountCents: 5000,
      currency: 'IDR',
      description: 'Save payment method',
      tenantId: 'tenant-1',
      channelCode: 'CARDS',
      savePaymentMethod: true,
      metadata: { referenceId: 'autopay-setup-1' },
    });
    await gateway.charge({
      amountCents: 5000,
      currency: 'IDR',
      description: 'Recurring charge',
      tenantId: 'tenant-1',
      channelCode: '',
      paymentTokenId: 'pt-private-id',
      metadata: { referenceId: 'autopay-attempt-1' },
    });

    expect(requestBodies[0]).toMatchObject({
      type: 'PAY_AND_SAVE',
      country: 'ID',
      channel_code: 'CARDS',
      reference_id: 'autopay-setup-1',
    });
    expect(requestBodies[0]).not.toHaveProperty('customer_id');
    expect(requestBodies[1]).toMatchObject({
      type: 'PAY',
      country: 'ID',
      payment_token_id: 'pt-private-id',
      reference_id: 'autopay-attempt-1',
    });
    expect(requestBodies[1]).not.toHaveProperty('channel_code');
    expect(requestBodies[1]).not.toHaveProperty('customer_id');
  });

  it('creates a hosted CARDS Pay and Save session using the current Xendit contract', async () => {
    const requestCapture: { url?: string; init?: RequestInit } = {};
    global.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      requestCapture.url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requestCapture.init = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            payment_session_id: 'ps-123',
            payment_link_url: 'https://dev.xen.to/session/ps-123',
            status: 'ACTIVE',
          }),
          { status: 200 },
        ),
      );
    };
    const gateway = new XenditPaymentGateway({
      get: (key: string) => {
        if (key === 'XENDIT_API_KEY') return 'xnd_development_test_key';
        if (key === 'XENDIT_RETURN_BASE_URL') return 'https://erp.example.com';
        if (key === 'WEB_BASE_URL') return 'http://localhost:3001';
        return undefined;
      },
    } as unknown as ConfigService);

    await expect(
      gateway.createAutopayPaymentSession({
        amountCents: 5000,
        currency: 'IDR',
        description: 'Invoice INV-1',
        tenantId: 'tenant-1',
        invoiceId: 'invoice-1',
        referenceId: 'at-enrollment-1',
      }),
    ).resolves.toEqual({
      paymentSessionId: 'ps-123',
      paymentLinkUrl: 'https://dev.xen.to/session/ps-123',
    });

    expect(requestCapture.url).toBe('https://api.xendit.co/sessions');
    expect(requestCapture.init?.method).toBe('POST');
    const requestBody = requestCapture.init?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON Payment Session request body');
    }
    expect(JSON.parse(requestBody)).toMatchObject({
      reference_id: 'at-enrollment-1',
      session_type: 'PAY',
      mode: 'PAYMENT_LINK',
      allow_save_payment_method: 'FORCED',
      allowed_payment_channels: ['CARDS'],
      capture_method: 'AUTOMATIC',
      amount: 5000,
      currency: 'IDR',
      country: 'ID',
      success_return_url:
        'https://erp.example.com/app/billing/invoice-1?autopay=completed',
      cancel_return_url:
        'https://erp.example.com/app/billing/invoice-1?autopay=cancelled',
    });
    expect(JSON.parse(requestBody)).not.toHaveProperty('customer_id');
    expect(JSON.parse(requestBody)).not.toHaveProperty('channel_properties');
  });

  it('rejects Indonesian card sessions below the documented minimum amount', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [RequestInfo | URL, RequestInit?]
    >();
    global.fetch = fetchMock;
    const gateway = new XenditPaymentGateway({
      get: (key: string) =>
        key === 'XENDIT_API_KEY' ? 'xnd_development_test_key' : undefined,
    } as unknown as ConfigService);

    await expect(
      gateway.createAutopayPaymentSession({
        amountCents: 4999,
        currency: 'IDR',
        description: 'Invoice INV-1',
        tenantId: 'tenant-1',
        invoiceId: 'invoice-1',
        referenceId: 'at-enrollment-1',
      }),
    ).rejects.toMatchObject({ outcome: 'REJECTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires HTTPS return URLs before creating a Payment Session', async () => {
    const fetchMock = jest.fn<
      Promise<Response>,
      [RequestInfo | URL, RequestInit?]
    >();
    global.fetch = fetchMock;
    const gateway = new XenditPaymentGateway({
      get: (key: string) => {
        if (key === 'XENDIT_API_KEY') return 'xnd_development_test_key';
        if (key === 'WEB_BASE_URL') return 'http://localhost:3001';
        return undefined;
      },
    } as unknown as ConfigService);

    await expect(
      gateway.createAutopayPaymentSession({
        amountCents: 5000,
        currency: 'IDR',
        description: 'Invoice INV-1',
        tenantId: 'tenant-1',
        invoiceId: 'invoice-1',
        referenceId: 'at-enrollment-1',
      }),
    ).rejects.toMatchObject({
      outcome: 'REJECTED',
      providerCode: 'XENDIT_RETURN_BASE_URL_HTTPS_REQUIRED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a refund with provider correlation and returns the pending status', async () => {
    const requestCapture: { url?: string; init?: RequestInit } = {};
    global.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      requestCapture.url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requestCapture.init = init;
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'refund-123', status: 'PENDING' }), {
          status: 200,
        }),
      );
    };

    const config = {
      get: (key: string): string | undefined =>
        key === 'XENDIT_API_KEY' ? 'xnd_development_test_key' : undefined,
    };
    const gateway = new XenditPaymentGateway(
      config as unknown as ConfigService,
    );

    await expect(
      gateway.refund({
        referenceId: 'rf-456',
        paymentRequestId: 'pr-123',
        amountCents: 2500,
        currency: 'IDR',
        reason: 'REQUESTED_BY_CUSTOMER',
      }),
    ).resolves.toEqual({
      providerRefundId: 'refund-123',
      status: 'PENDING',
    });
    expect(requestCapture.url).toBe('https://api.xendit.co/refunds');
    expect(requestCapture.init?.method).toBe('POST');
    const requestBody = requestCapture.init?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON string refund body');
    }
    expect(JSON.parse(requestBody)).toEqual({
      reference_id: 'rf-456',
      payment_request_id: 'pr-123',
      currency: 'IDR',
      amount: 2500,
      reason: 'REQUESTED_BY_CUSTOMER',
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid amount %s without calling the provider',
    async (amountCents) => {
      const fetchMock = jest.fn<
        Promise<Response>,
        [RequestInfo | URL, RequestInit?]
      >();
      global.fetch = fetchMock;
      const config = {
        get: (key: string): string | undefined =>
          key === 'XENDIT_API_KEY' ? 'xnd_test_key' : undefined,
      };
      const gateway = new XenditPaymentGateway(
        config as unknown as ConfigService,
      );

      await expect(
        gateway.charge({
          amountCents,
          currency: 'IDR',
          description: 'Invalid payment amount',
          tenantId: 'tenant-1',
          channelCode: 'QRIS',
        }),
      ).rejects.toMatchObject({ outcome: 'REJECTED' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('verifies Payment Request callbacks with the configured callback token', () => {
    const config = {
      get: (key: string): string | undefined =>
        key === 'XENDIT_WEBHOOK_TOKEN' ? 'dashboard-webhook-token' : undefined,
    };
    const gateway = new XenditPaymentGateway(
      config as unknown as ConfigService,
    );

    expect(gateway.verifyWebhookSignature({}, 'dashboard-webhook-token')).toBe(
      true,
    );
    expect(gateway.verifyWebhookSignature({}, '')).toBe(false);
    expect(gateway.verifyWebhookSignature({}, 'incorrect-token')).toBe(false);

    const unconfiguredGateway = new XenditPaymentGateway({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(
      unconfiguredGateway.verifyWebhookSignature({}, 'dashboard-webhook-token'),
    ).toBe(false);
  });

  it.each([
    { status: 400, outcome: 'REJECTED' },
    { status: 408, outcome: 'UNKNOWN' },
    { status: 409, outcome: 'UNKNOWN' },
    { status: 500, outcome: 'UNKNOWN' },
  ] as const)(
    'classifies HTTP $status as $outcome',
    async ({ status, outcome }) => {
      global.fetch = () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error_code: 'INVALID_CHANNEL',
              message: 'provider error',
            }),
            {
              status,
            },
          ),
        );
      const config = {
        get: (key: string): string | undefined =>
          key === 'XENDIT_API_KEY' ? 'xnd_test_key' : undefined,
      };
      const gateway = new XenditPaymentGateway(
        config as unknown as ConfigService,
      );

      await expect(
        gateway.charge({
          amountCents: 100,
          currency: 'IDR',
          description: 'Provider error classification',
          tenantId: 'tenant-1',
          channelCode: 'QRIS',
        }),
      ).rejects.toMatchObject({
        outcome,
        statusCode: status,
        providerCode: 'INVALID_CHANNEL',
      });
    },
  );

  it('classifies transport failures as unknown provider outcomes', async () => {
    global.fetch = () => Promise.reject(new TypeError('socket timeout'));
    const config = {
      get: (key: string): string | undefined =>
        key === 'XENDIT_API_KEY' ? 'xnd_test_key' : undefined,
    };
    const gateway = new XenditPaymentGateway(
      config as unknown as ConfigService,
    );

    await expect(
      gateway.charge({
        amountCents: 100,
        currency: 'IDR',
        description: 'Transport failure classification',
        tenantId: 'tenant-1',
        channelCode: 'QRIS',
      }),
    ).rejects.toMatchObject({ outcome: 'UNKNOWN' });
  });
});
