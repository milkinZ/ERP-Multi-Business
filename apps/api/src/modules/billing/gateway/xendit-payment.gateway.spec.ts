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
          new Response(JSON.stringify({ message: 'provider error' }), {
            status,
          }),
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
      ).rejects.toMatchObject({ outcome });
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
