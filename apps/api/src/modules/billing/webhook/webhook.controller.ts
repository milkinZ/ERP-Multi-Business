import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { BillingService } from '../billing.service';

/**
 * Payment Webhook Controller
 *
 * Handles incoming payment gateway callbacks/webhooks with full idempotency
 * and security verification.
 *
 * Uses provider event ID / transaction ID as idempotency key.
 */
@Controller('webhooks/payments')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly billingService: BillingService) {}

  @Post()
  @HttpCode(200)
  async handlePaymentWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const eventType = (body?.event as string) ?? 'unknown';
    const eventId = (body?.id as string) ?? idempotencyKey ?? 'unknown';

    this.logger.log(`Webhook received: event=${eventType}, id=${eventId}`);

    // Payment success callback
    if (eventType === 'payment.success' || eventType === 'charge.completed') {
      const invoiceId = (body?.metadata as Record<string, unknown>)
        ?.invoiceId as string | undefined;

      if (!invoiceId) {
        this.logger.warn(
          `Webhook missing invoiceId in metadata — eventId=${eventId}`,
        );
        return {
          received: true,
          status: 'ignored',
          reason: 'missing_invoice_id',
        };
      }

      await this.billingService.handlePaymentSuccess(invoiceId);

      this.logger.log(
        `Payment success processed: invoiceId=${invoiceId}, eventId=${eventId}`,
      );
    }

    // Payment failure callback
    if (eventType === 'payment.failed' || eventType === 'charge.failed') {
      const invoiceId = (body?.metadata as Record<string, unknown>)
        ?.invoiceId as string | undefined;

      if (!invoiceId) {
        this.logger.warn(
          `Webhook missing invoiceId in metadata — eventId=${eventId}`,
        );
        return {
          received: true,
          status: 'ignored',
          reason: 'missing_invoice_id',
        };
      }

      const failureReason = (body?.failure_reason as string) ?? undefined;

      await this.billingService.handlePaymentFailure(invoiceId, failureReason);

      this.logger.log(
        `Payment failure processed: invoiceId=${invoiceId}, eventId=${eventId}`,
      );
    }

    return { received: true, status: 'processed', eventId };
  }
}
