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
import { AutopayService } from '../autopay.service';

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
    private readonly autopayService: AutopayService,
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

    if (eventType.startsWith('payment_token.')) {
      const paymentTokenId =
        typeof data.payment_token_id === 'string'
          ? data.payment_token_id
          : typeof data.id === 'string'
            ? data.id
            : undefined;
      const referenceId =
        typeof data.reference_id === 'string' ? data.reference_id : undefined;
      const channelCode =
        typeof data.channel_code === 'string' ? data.channel_code : undefined;
      const currency =
        typeof data.currency === 'string' ? data.currency : undefined;
      const status = typeof data.status === 'string' ? data.status : undefined;
      if (!paymentTokenId || !referenceId || !status) {
        throw new BadRequestException(
          'Xendit payment token webhook is missing required identifiers or status',
        );
      }
      const outcome =
        await this.autopayService.handleXenditPaymentTokenWebhookEvent({
          eventType,
          paymentTokenId,
          referenceId,
          channelCode,
          currency,
          status,
        });
      return { received: true, status: outcome };
    }

    if (eventType === 'payment_session.completed') {
      const paymentSessionId =
        typeof data.payment_session_id === 'string'
          ? data.payment_session_id
          : typeof data.id === 'string'
            ? data.id
            : undefined;
      const paymentTokenId =
        typeof data.payment_token_id === 'string'
          ? data.payment_token_id
          : typeof data.latest_payment_token_id === 'string'
            ? data.latest_payment_token_id
            : undefined;
      const referenceId =
        typeof data.reference_id === 'string' ? data.reference_id : undefined;
      if (!paymentSessionId || !paymentTokenId || !referenceId) {
        throw new BadRequestException(
          'Xendit completed payment session is missing required identifiers',
        );
      }
      const outcome =
        await this.autopayService.handleXenditPaymentTokenWebhookEvent({
          eventType: 'payment_token.activation',
          paymentSessionId,
          paymentTokenId,
          referenceId,
          channelCode:
            typeof data.channel_code === 'string'
              ? data.channel_code
              : undefined,
          currency:
            typeof data.currency === 'string' ? data.currency : undefined,
          status: 'ACTIVE',
        });
      return { received: true, status: outcome };
    }

    if (eventType === 'payment_session.expired') {
      const paymentSessionId =
        typeof data.payment_session_id === 'string'
          ? data.payment_session_id
          : typeof data.id === 'string'
            ? data.id
            : undefined;
      const referenceId =
        typeof data.reference_id === 'string' ? data.reference_id : undefined;
      if (!paymentSessionId || !referenceId) {
        throw new BadRequestException(
          'Xendit expired payment session is missing required identifiers',
        );
      }
      const outcome =
        await this.autopayService.handleXenditPaymentSessionExpiredEvent({
          paymentSessionId,
          referenceId,
        });
      return { received: true, status: outcome };
    }

    if (eventType.startsWith('payment_session.')) {
      return { received: true, status: 'IGNORED' };
    }

    if (eventType.startsWith('refund.')) {
      const refundId =
        typeof data.refund_id === 'string' ? data.refund_id : undefined;
      const referenceId =
        typeof data.reference_id === 'string' ? data.reference_id : undefined;
      const rawAmount = data.amount ?? data.request_amount;
      const amount =
        typeof rawAmount === 'number' || typeof rawAmount === 'string'
          ? Number(rawAmount)
          : undefined;
      const currency =
        typeof data.currency === 'string' ? data.currency : undefined;
      const status = typeof data.status === 'string' ? data.status : undefined;
      if (
        !refundId ||
        !referenceId ||
        typeof amount !== 'number' ||
        !Number.isSafeInteger(amount) ||
        !currency ||
        !status
      ) {
        throw new BadRequestException(
          'Xendit refund webhook is missing required identifiers or financial fields',
        );
      }
      const outcome = await this.billingService.handleXenditRefundWebhookEvent({
        eventType,
        refundId,
        referenceId,
        amount,
        currency,
        status,
      });
      return { received: true, status: outcome };
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
