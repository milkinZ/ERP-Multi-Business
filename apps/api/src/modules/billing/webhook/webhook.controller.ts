import {
  Body,
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { XenditPaymentGateway } from '../gateway/xendit-payment.gateway';
import { BillingService } from '../billing.service';

/**
 * Payment Webhook Controller
 *
 * Handles incoming payment gateway callbacks/webhooks with full idempotency
 * and security verification.
 *
 * Uses a provider-derived payment/event fingerprint for durable idempotency.
 */
@Controller('webhooks/payments')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly paymentGateway: XenditPaymentGateway,
  ) {}

  @Post()
  @HttpCode(200)
  async handlePaymentWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-callback-token') callbackToken?: string,
  ) {
    const eventType = typeof body?.event === 'string' ? body.event : '';
    const eventCreatedAt =
      typeof body?.created === 'string' ? body.created : '';
    const data =
      body?.data && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : undefined;
    const paymentId =
      typeof data?.payment_id === 'string' ? data.payment_id : undefined;
    const token = callbackToken ?? '';

    if (!this.paymentGateway.verifyWebhookSignature(body, token ?? '')) {
      this.logger.warn(
        `Rejected unauthenticated Xendit webhook: event=${eventType || 'unknown'}, paymentId=${paymentId ?? 'unknown'}`,
      );
      throw new UnauthorizedException('Invalid Xendit callback token');
    }

    if (!data || !eventType || !eventCreatedAt) {
      throw new BadRequestException('Invalid Xendit payment webhook envelope');
    }

    const paymentRequestId =
      typeof data.payment_request_id === 'string'
        ? data.payment_request_id
        : undefined;
    const referenceId =
      typeof data.reference_id === 'string' ? data.reference_id : undefined;
    const providerUpdatedAt =
      typeof data.updated === 'string' ? data.updated : undefined;
    const amountValue = data.request_amount;
    const amount =
      typeof amountValue === 'number' || typeof amountValue === 'string'
        ? Number(amountValue)
        : undefined;
    const currency =
      typeof data.currency === 'string' ? data.currency : undefined;
    const status = typeof data.status === 'string' ? data.status : undefined;
    const captureIds = Array.isArray(data.captures)
      ? data.captures.flatMap((capture) => {
          if (!capture || typeof capture !== 'object') return [];
          const captureId = (capture as Record<string, unknown>).capture_id;
          return typeof captureId === 'string' ? [captureId] : [];
        })
      : [];

    if (!paymentId || !providerUpdatedAt || !paymentRequestId || !referenceId) {
      throw new BadRequestException(
        'Xendit webhook is missing required payment identifiers or timestamps',
      );
    }

    this.logger.log(
      `Webhook received: event=${eventType}, paymentId=${paymentId}`,
    );

    const outcome = await this.billingService.handleXenditWebhookEvent({
      eventType,
      eventCreatedAt,
      providerUpdatedAt,
      paymentRequestId,
      referenceId,
      paymentId,
      amount,
      currency,
      status,
      captureIds,
    });

    return { received: true, status: outcome };
  }
}
