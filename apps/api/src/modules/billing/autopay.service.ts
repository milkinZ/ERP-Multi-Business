import {
  BadGatewayException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { requestContext } from '../../core/request-context/request-context';
import { TenantContextService } from '../tenants/tenant-context.service';
import { BillingRepository } from './billing.repository';
import { AutopayTokenCryptoService } from './autopay-token-crypto.service';
import {
  XenditPaymentGateway,
  XenditPaymentRequestError,
} from './gateway/xendit-payment.gateway';

export const AUTOPAY_CONSENT_VERSION = 'AUTOPAY_TERMS_V1';
const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AutopayService {
  private readonly logger = new Logger(AutopayService.name);

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly tenantContext: TenantContextService,
    private readonly paymentGateway: XenditPaymentGateway,
    private readonly tokenCrypto: AutopayTokenCryptoService,
  ) {}

  async getStatus() {
    const tenantId = this.tenantContext.requireTenant();
    const [paymentMethod, policy] = await Promise.all([
      this.billingRepository.findAutopayPaymentMethod(tenantId),
      this.billingRepository.getAutopayPolicy(),
    ]);
    if (policy.enabled && policy.mitChannelAllowlist.length > 0) {
      this.tokenCrypto.assertConfigured();
    }
    return {
      enabled: policy.enabled,
      availableChannelCodes:
        policy.enabled && policy.mitChannelAllowlist.includes('CARDS')
          ? ['CARDS']
          : [],
      paymentMethod,
    };
  }

  async enroll(
    invoiceId: string,
    channelCode: string,
    userId: string,
  ): Promise<{
    paymentSessionId: string;
    status: 'PENDING';
    actions: Array<{ type: string; descriptor?: string; value: string }>;
  }> {
    const tenantId = this.tenantContext.requireTenant();
    const policy = await this.billingRepository.getAutopayPolicy();
    const normalizedChannel = channelCode.trim().toUpperCase();
    if (
      !policy.enabled ||
      !policy.mitChannelAllowlist.includes(normalizedChannel)
    ) {
      throw new ConflictException(
        'Autopay is not enabled for the selected operator-approved MIT channel',
      );
    }
    if (normalizedChannel !== 'CARDS') {
      throw new ConflictException(
        'Autopay enrollment currently supports the Xendit CARDS channel only',
      );
    }

    const invoice = await this.billingRepository.findInvoiceById(
      invoiceId,
      tenantId,
    );
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'PENDING' || !invoice.subscriptionId) {
      throw new ConflictException(
        'Autopay setup requires a pending subscription invoice',
      );
    }
    if (await this.billingRepository.findAutopayPaymentMethod(tenantId)) {
      throw new ConflictException(
        'An active or pending autopay payment method already exists',
      );
    }

    this.tokenCrypto.encrypt('configuration-check');
    const referenceId = `at-${crypto.randomUUID()}`;
    const enrollment = await this.billingRepository.createAutopayEnrollment({
      tenantId,
      invoiceId: invoice.id,
      referenceId,
      channelCode: normalizedChannel,
      currency: invoice.currency,
      consentVersion: AUTOPAY_CONSENT_VERSION,
      consentUserId: userId,
    });

    const claim = await this.billingRepository.claimXenditPaymentRequest(
      invoice.id,
      tenantId,
    );
    if (!claim.claimed) {
      await this.billingRepository.failAutopayEnrollment(
        enrollment.id,
        tenantId,
      );
      throw new ConflictException(
        'Invoice already has a payment attempt; use that payment request or a different invoice for autopay setup',
      );
    }

    let result: Awaited<
      ReturnType<XenditPaymentGateway['createAutopayPaymentSession']>
    >;
    try {
      result = await this.paymentGateway.createAutopayPaymentSession({
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        description: `Invoice ${invoice.invoiceNumber}`,
        tenantId,
        invoiceId: invoice.id,
        referenceId,
      });
    } catch (error) {
      const state =
        error instanceof XenditPaymentRequestError &&
        error.outcome === 'REJECTED'
          ? 'REJECTED'
          : 'UNKNOWN';
      this.logger.error(
        `Xendit Autopay enrollment ${state.toLowerCase()}${error instanceof XenditPaymentRequestError ? ` (HTTP ${error.statusCode ?? 'unknown'}, provider code ${error.providerCode ?? 'unavailable'})` : ''}.`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.billingRepository.recordXenditPaymentRequestOutcome(
        invoice.id,
        tenantId,
        state,
      );
      if (state === 'REJECTED') {
        await this.billingRepository.failAutopayEnrollment(
          enrollment.id,
          tenantId,
        );
      }
      const rejectionDetail =
        error instanceof XenditPaymentRequestError
          ? [
              error.statusCode ? `HTTP ${error.statusCode}` : undefined,
              error.providerCode
                ? `provider code ${error.providerCode}`
                : undefined,
            ]
              .filter(Boolean)
              .join(', ')
          : '';
      if (
        error instanceof XenditPaymentRequestError &&
        error.providerCode === 'XENDIT_RETURN_BASE_URL_HTTPS_REQUIRED'
      ) {
        throw new ServiceUnavailableException(
          'Autopay hosted checkout requires XENDIT_RETURN_BASE_URL, or WEB_BASE_URL, to be a public HTTPS URL',
        );
      }
      throw new BadGatewayException(
        state === 'UNKNOWN'
          ? 'Autopay Payment Session outcome is unknown; do not retry until payment status is reconciled'
          : `Xendit rejected autopay enrollment${rejectionDetail ? ` (${rejectionDetail})` : ''}`,
      );
    }

    try {
      const saved = await this.billingRepository.recordAutopayEnrollmentSession(
        enrollment.id,
        tenantId,
        result.paymentSessionId,
      );
      if (saved.count !== 1) {
        throw new Error('Pending autopay enrollment could not be updated');
      }
    } catch (error) {
      this.logger.error(
        `Xendit Payment Session ${result.paymentSessionId} could not be linked to enrollment ${enrollment.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.billingRepository.recordXenditPaymentRequestOutcome(
        invoice.id,
        tenantId,
        'UNKNOWN',
      );
      throw new InternalServerErrorException(
        'Xendit created a Payment Session but it could not be linked locally; autopay enrollment is pending reconciliation',
      );
    }

    return {
      paymentSessionId: result.paymentSessionId,
      status: 'PENDING',
      actions: [
        {
          type: 'REDIRECT',
          descriptor: 'Complete secure card setup with Xendit',
          value: result.paymentLinkUrl,
        },
      ],
    };
  }

  async revoke() {
    const tenantId = this.tenantContext.requireTenant();
    return this.billingRepository.revokeAutopayPaymentMethod(tenantId);
  }

  async handleXenditPaymentTokenWebhookEvent(input: {
    eventType: string;
    paymentTokenId: string;
    referenceId: string;
    paymentSessionId?: string;
    channelCode?: string;
    currency?: string;
    status: string;
  }): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'> {
    const idempotencyKey = createHash('sha256')
      .update(
        [
          'xendit-payment-tokens-v3',
          input.paymentTokenId,
          input.eventType,
          input.status,
        ].join('\0'),
      )
      .digest('hex');
    const encryptedToken =
      input.eventType === 'payment_token.activation' &&
      input.status === 'ACTIVE'
        ? this.tokenCrypto.encrypt(input.paymentTokenId)
        : undefined;

    return requestContext.run({ systemOperation: 'xendit-webhook' }, () =>
      this.billingRepository.processXenditPaymentTokenWebhookEvent({
        ...input,
        idempotencyKey,
        encryptedToken,
      }),
    );
  }

  async handleXenditPaymentSessionExpiredEvent(input: {
    paymentSessionId: string;
    referenceId: string;
  }): Promise<'PROCESSED' | 'IGNORED'> {
    return requestContext.run({ systemOperation: 'xendit-webhook' }, () =>
      this.billingRepository.expireAutopayPaymentSession(input),
    );
  }

  async processScheduledAutopay(): Promise<void> {
    const policy = await this.billingRepository.getAutopayPolicy();
    const now = new Date();
    const cutoff = new Date(now.getTime() - RETRY_WINDOW_MS);
    if (policy.enabled && policy.mitChannelAllowlist.length > 0) {
      const candidates = await this.billingRepository.findAutopayInvoices(
        cutoff,
        now,
        100,
      );
      for (const invoice of candidates) {
        try {
          await requestContext.run({ tenantId: invoice.tenantId }, async () => {
            const currentPolicy =
              await this.billingRepository.getAutopayPolicy();
            if (
              !currentPolicy.enabled ||
              !currentPolicy.mitChannelAllowlist.includes(
                invoice.paymentMethod.channelCode,
              )
            ) {
              return;
            }
            await this.processInvoiceAutopay(
              invoice.id,
              invoice.tenantId,
              now,
              cutoff,
            );
          });
        } catch (error) {
          this.logger.error(
            `Autopay processing failed for invoice ${invoice.id}: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    }

    await this.billingRepository.expireAutopayRetryWindow(cutoff, now);
  }

  private async processInvoiceAutopay(
    invoiceId: string,
    tenantId: string,
    now: Date,
    cutoff: Date,
  ): Promise<void> {
    const claimed = await this.billingRepository.claimAutopayChargeAttempt(
      invoiceId,
      tenantId,
      now,
      cutoff,
    );
    if (!claimed) return;

    try {
      const tokenId = this.tokenCrypto.decrypt({
        ciphertext: claimed.paymentMethod.providerPaymentTokenIdCiphertext,
        iv: claimed.paymentMethod.encryptionIv,
        authTag: claimed.paymentMethod.encryptionAuthTag,
        keyVersion: claimed.paymentMethod.encryptionKeyVersion,
      });
      const result = await this.paymentGateway.charge({
        amountCents: claimed.invoice.amountCents,
        currency: claimed.invoice.currency,
        description: `Subscription invoice ${claimed.invoice.invoiceNumber}`,
        tenantId,
        channelCode: claimed.paymentMethod.channelCode,
        paymentTokenId: tokenId,
        metadata: {
          referenceId: claimed.attempt.referenceId,
          invoiceId,
          autopayAttempt: claimed.attempt.attemptNumber,
        },
      });
      if (!result.paymentRequestId) {
        await this.billingRepository.failAutopayChargeAttempt(
          claimed.attempt.id,
          tenantId,
          'UNKNOWN',
          'MISSING_PROVIDER_REQUEST_ID',
          now,
        );
        return;
      }
      const persisted =
        await this.billingRepository.completeAutopayChargeRequest(
          claimed.attempt.id,
          tenantId,
          result.paymentRequestId,
        );
      if (persisted.count !== 1) {
        this.logger.error(
          `Autopay request ${claimed.attempt.id} was created but provider correlation could not be persisted`,
        );
      }
    } catch (error) {
      const state =
        error instanceof XenditPaymentRequestError &&
        error.outcome === 'REJECTED'
          ? 'FAILED'
          : 'UNKNOWN';
      await this.billingRepository.failAutopayChargeAttempt(
        claimed.attempt.id,
        tenantId,
        state,
        error instanceof XenditPaymentRequestError
          ? error.outcome
          : 'PROVIDER_OUTCOME_UNKNOWN',
        now,
      );
      if (state === 'UNKNOWN') {
        this.logger.error(
          `Autopay provider outcome is unknown for attempt ${claimed.attempt.id}; automatic retry is blocked`,
        );
      }
    }
  }
}
