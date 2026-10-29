import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  PaymentGateway,
  PaymentGatewayChargeInput,
  PaymentGatewayChargeResult,
} from './payment-gateway.interface';

export class XenditPaymentRequestError extends Error {
  constructor(
    message: string,
    readonly outcome: 'REJECTED' | 'UNKNOWN',
  ) {
    super(message);
    this.name = XenditPaymentRequestError.name;
  }
}

@Injectable()
export class XenditPaymentGateway extends PaymentGateway {
  constructor(private readonly config: ConfigService) {
    super();
  }

  private getApiKey(): string {
    const apiKey = this.config.get<string>('XENDIT_API_KEY');
    if (!apiKey) {
      throw new Error('XENDIT_API_KEY is not configured');
    }
    return apiKey;
  }

  private getApiBaseUrl(): string {
    return (
      this.config.get<string>('XENDIT_API_BASE_URL') ?? 'https://api.xendit.co'
    );
  }

  private getWebhookToken(): string | undefined {
    return this.config.get<string>('XENDIT_WEBHOOK_TOKEN');
  }

  async charge(
    input: PaymentGatewayChargeInput,
  ): Promise<PaymentGatewayChargeResult> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new XenditPaymentRequestError(
        'Payment amount must be a positive safe integer in cents',
        'REJECTED',
      );
    }
    if (!input.currency.trim() || !input.channelCode.trim()) {
      throw new XenditPaymentRequestError(
        'Payment currency and channel are required',
        'REJECTED',
      );
    }

    const referenceId =
      (input.metadata?.referenceId as string | undefined) ??
      (input.metadata?.orderId as string | undefined) ??
      `tenant-${input.tenantId}-${Date.now()}`;

    const payload = {
      reference_id: referenceId,
      type: 'PAY',
      request_amount: input.amountCents,
      currency: input.currency,
      channel_code: input.channelCode,
      capture_method: 'AUTOMATIC',
      description: input.description,
      metadata: {
        ...(input.metadata ?? {}),
        tenantId: input.tenantId,
      },
    };

    const requestBody = JSON.stringify(payload);
    let apiKey: string;
    try {
      apiKey = this.getApiKey();
    } catch {
      throw new XenditPaymentRequestError(
        'Xendit payment request configuration is incomplete',
        'REJECTED',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${this.getApiBaseUrl()}/v3/payment_requests`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });
    } catch {
      throw new XenditPaymentRequestError(
        'Xendit payment request outcome is unknown after a transport failure',
        'UNKNOWN',
      );
    }

    let data: {
      payment_request_id?: string;
      status?: string;
      latest_payment_id?: string;
      reference_id?: string;
      request_amount?: number;
      currency?: string;
      failure_code?: string;
      message?: string;
    } = {};
    try {
      data = (await response.json()) as typeof data;
    } catch {
      if (response.ok) {
        throw new XenditPaymentRequestError(
          'Xendit returned success without a readable Payment Request ID',
          'UNKNOWN',
        );
      }
    }

    if (!response.ok) {
      const detail = data?.message ?? 'Xendit payment request creation failed';
      const outcome =
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 409
          ? 'REJECTED'
          : 'UNKNOWN';
      throw new XenditPaymentRequestError(detail, outcome);
    }

    if (!data.payment_request_id) {
      throw new XenditPaymentRequestError(
        'Xendit response did not include the required payment_request_id',
        'UNKNOWN',
      );
    }

    return {
      success: true,
      transactionId: data.latest_payment_id ?? '',
      gatewayReference: data.payment_request_id,
      paymentRequestId: data.payment_request_id,
      status:
        data.status === 'SUCCEEDED'
          ? 'PAID'
          : data.status === 'FAILED'
            ? 'FAILED'
            : 'PENDING',
      errorMessage: data.failure_code,
    };
  }

  verifyWebhookSignature(payload: unknown, signature: string): boolean {
    const token = this.getWebhookToken();
    if (!token) {
      return false;
    }

    if (!signature) {
      return false;
    }

    void payload;

    return signature === token;
  }
}
