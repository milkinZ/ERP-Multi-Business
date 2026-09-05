import { BillingService } from '../billing.service';
import { WebhookController } from './webhook.controller';

describe('WebhookController', () => {
  const handlePaymentSuccess = jest.fn();
  const handlePaymentFailure = jest.fn();
  const service = {
    handlePaymentSuccess,
    handlePaymentFailure,
  } as unknown as BillingService;
  let controller: WebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WebhookController(service);
  });

  it('processes payment success callbacks by invoice id', async () => {
    await expect(
      controller.handlePaymentWebhook(
        {
          id: 'event-a',
          event: 'payment.success',
          metadata: { invoiceId: 'invoice-a' },
        },
        'signature-a',
        'event-a',
      ),
    ).resolves.toEqual({
      received: true,
      status: 'processed',
      eventId: 'event-a',
    });
    expect(handlePaymentSuccess).toHaveBeenCalledWith('invoice-a');
  });

  it('processes failures and ignores callbacks without invoice metadata', async () => {
    await controller.handlePaymentWebhook(
      {
        id: 'event-b',
        event: 'payment.failed',
        metadata: { invoiceId: 'invoice-a' },
        failure_reason: 'declined',
      },
      undefined,
      'event-b',
    );
    expect(handlePaymentFailure).toHaveBeenCalledWith('invoice-a', 'declined');

    await expect(
      controller.handlePaymentWebhook({ event: 'payment.success' }),
    ).resolves.toEqual({
      received: true,
      status: 'ignored',
      reason: 'missing_invoice_id',
    });
  });
});
