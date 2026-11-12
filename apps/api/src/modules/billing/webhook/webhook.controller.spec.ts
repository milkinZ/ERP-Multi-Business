import { BillingService } from '../billing.service';
import { WebhookController } from './webhook.controller';
import { UnauthorizedException } from '@nestjs/common';
import { XenditPaymentGateway } from '../gateway/xendit-payment.gateway';
import { AutopayService } from '../autopay.service';

describe('WebhookController', () => {
  type XenditWebhookInput = Parameters<
    BillingService['handleXenditWebhookEvent']
  >[0];
  let capturedServiceInput: XenditWebhookInput | undefined;
  let capturedVerifiedBody: unknown;
  let capturedCallbackToken: string | undefined;
  let verificationResult = true;
  const handleXenditWebhookEvent = jest.fn(
    (
      input: XenditWebhookInput,
    ): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'> => {
      capturedServiceInput = input;
      return Promise.resolve('PROCESSED');
    },
  );
  const handleXenditPaymentTokenWebhookEvent = jest.fn(
    (): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'> =>
      Promise.resolve('PROCESSED'),
  );
  const handleXenditPaymentSessionExpiredEvent = jest.fn(
    (): Promise<'PROCESSED' | 'IGNORED'> => Promise.resolve('PROCESSED'),
  );
  const service: Pick<BillingService, 'handleXenditWebhookEvent'> = {
    handleXenditWebhookEvent,
  };
  const paymentGateway = {
    verifyWebhookSignature: (payload: unknown, token: string): boolean => {
      capturedVerifiedBody = payload;
      capturedCallbackToken = token;
      return verificationResult;
    },
  };
  let controller: WebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedServiceInput = undefined;
    capturedVerifiedBody = undefined;
    capturedCallbackToken = undefined;
    verificationResult = true;
    controller = new WebhookController(
      service as unknown as BillingService,
      paymentGateway as unknown as XenditPaymentGateway,
      {
        handleXenditPaymentTokenWebhookEvent,
        handleXenditPaymentSessionExpiredEvent,
      } as unknown as AutopayService,
    );
  });

  it('rejects missing or invalid Xendit callback token', async () => {
    verificationResult = false;

    await expect(
      controller.handlePaymentWebhook(
        {
          id: 'event-a',
          event: 'payment.success',
          payment_request_id: 'pr-123',
          reference_id: 'ref-123',
          amount: 250000,
          currency: 'IDR',
        },
        undefined,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(handleXenditWebhookEvent).not.toHaveBeenCalled();
  });

  it('accepts a valid Xendit callback and correlates via provider payment ids', async () => {
    await expect(
      controller.handlePaymentWebhook(
        {
          event: 'payment.capture',
          created: '2026-09-28T12:00:00.000Z',
          data: {
            payment_id: 'pay-123',
            payment_request_id: 'pr-123',
            reference_id: 'INV-202501-000001',
            request_amount: 250000,
            currency: 'IDR',
            status: 'SUCCEEDED',
            updated: '2026-09-28T12:00:01.000Z',
            captures: [{ capture_id: 'capture-123', capture_amount: 250000 }],
            metadata: { invoiceId: 'attacker-controlled' },
          },
        },
        'callback-token',
      ),
    ).resolves.toEqual({
      received: true,
      status: 'PROCESSED',
    });

    expect(capturedCallbackToken).toBe('callback-token');
    const verifiedBody = capturedVerifiedBody as
      | { data?: { payment_request_id?: string } }
      | undefined;
    expect(verifiedBody?.data?.payment_request_id).toBe('pr-123');

    expect(capturedServiceInput?.paymentRequestId).toBe('pr-123');
    expect(capturedServiceInput?.referenceId).toBe('INV-202501-000001');
    expect(capturedServiceInput?.paymentId).toBe('pay-123');
    expect(capturedServiceInput?.amount).toBe(250000);
    expect(capturedServiceInput?.status).toBe('SUCCEEDED');
    expect(capturedServiceInput?.captureIds).toEqual(['capture-123']);
    expect(capturedServiceInput).not.toHaveProperty('metadata');
  });

  it('routes authenticated payment-token events to autopay processing', async () => {
    await expect(
      controller.handlePaymentWebhook(
        {
          event: 'payment_token.activation',
          created: '2026-09-28T12:00:00.000Z',
          data: {
            payment_token_id: 'token-123',
            reference_id: 'at-enrollment-123',
            channel_code: 'CARD',
            currency: 'IDR',
            status: 'ACTIVE',
          },
        },
        'callback-token',
      ),
    ).resolves.toEqual({ received: true, status: 'PROCESSED' });

    expect(handleXenditPaymentTokenWebhookEvent).toHaveBeenCalledWith({
      eventType: 'payment_token.activation',
      paymentTokenId: 'token-123',
      referenceId: 'at-enrollment-123',
      channelCode: 'CARD',
      currency: 'IDR',
      status: 'ACTIVE',
    });
    expect(handleXenditWebhookEvent).not.toHaveBeenCalled();
  });

  it('uses the completed Payment Session token to activate the matching enrollment', async () => {
    await expect(
      controller.handlePaymentWebhook(
        {
          event: 'payment_session.completed',
          created: '2026-11-08T07:00:00.000Z',
          data: {
            payment_session_id: 'ps-123',
            payment_token_id: 'token-123',
            reference_id: 'at-enrollment-123',
            currency: 'IDR',
            status: 'COMPLETED',
          },
        },
        'callback-token',
      ),
    ).resolves.toEqual({ received: true, status: 'PROCESSED' });

    expect(handleXenditPaymentTokenWebhookEvent).toHaveBeenCalledWith({
      eventType: 'payment_token.activation',
      paymentSessionId: 'ps-123',
      paymentTokenId: 'token-123',
      referenceId: 'at-enrollment-123',
      channelCode: undefined,
      currency: 'IDR',
      status: 'ACTIVE',
    });
    expect(handleXenditWebhookEvent).not.toHaveBeenCalled();
  });

  it('expires the enrollment when Xendit expires its Payment Session', async () => {
    await expect(
      controller.handlePaymentWebhook(
        {
          event: 'payment_session.expired',
          created: '2026-11-08T07:00:00.000Z',
          data: {
            payment_session_id: 'ps-123',
            reference_id: 'at-enrollment-123',
            status: 'EXPIRED',
          },
        },
        'callback-token',
      ),
    ).resolves.toEqual({ received: true, status: 'PROCESSED' });

    expect(handleXenditPaymentSessionExpiredEvent).toHaveBeenCalledWith({
      paymentSessionId: 'ps-123',
      referenceId: 'at-enrollment-123',
    });
  });
});
