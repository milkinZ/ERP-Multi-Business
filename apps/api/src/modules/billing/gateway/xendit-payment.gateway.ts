import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  PaymentGateway,
  PaymentGatewayChargeInput,
  PaymentGatewayChargeResult,
  PaymentGatewayRefundInput,
  PaymentGatewayRefundResult,
} from './payment-gateway.interface';

const XENDIT_COUNTRY_BY_CURRENCY: Record<string, string> = {
  IDR: 'ID',
  MYR: 'MY',
  PHP: 'PH',
  SGD: 'SG',
  THB: 'TH',
  VND: 'VN',
};

export class XenditPaymentRequestError extends Error {
  constructor(
    message: string,
    readonly outcome: 'REJECTED' | 'UNKNOWN',
    readonly statusCode?: number,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = XenditPaymentRequestError.name;
  }
}

export class XenditRefundError extends Error {
  constructor(
    message: string,
    readonly outcome: 'REJECTED' | 'UNKNOWN',
  ) {
    super(message);
    this.name = XenditRefundError.name;
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

  async createAutopayPaymentSession(input: {
    amountCents: number;
    currency: string;
    description: string;
    tenantId: string;
    invoiceId: string;
    referenceId: string;
  }): Promise<{ paymentSessionId: string; paymentLinkUrl: string }> {
    const currency = input.currency.trim().toUpperCase();
    const country = XENDIT_COUNTRY_BY_CURRENCY[currency];
    if (
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      !country ||
      !input.referenceId.trim() ||
      !input.invoiceId.trim()
    ) {
      throw new XenditPaymentRequestError(
        'Autopay Payment Session details are invalid',
        'REJECTED',
      );
    }
    if (currency === 'IDR' && input.amountCents < 5000) {
      throw new XenditPaymentRequestError(
        'Xendit CARDS requires a minimum IDR 5,000 payment',
        'REJECTED',
      );
    }

    const configuredReturnBaseUrl =
      this.config.get<string>('XENDIT_RETURN_BASE_URL') ??
      this.config.get<string>('WEB_BASE_URL') ??
      'http://localhost:3000';
    let webBaseUrl: URL;
    try {
      webBaseUrl = new URL(configuredReturnBaseUrl);
    } catch {
      throw new XenditPaymentRequestError(
        'Xendit Payment Sessions require XENDIT_RETURN_BASE_URL to be a valid HTTPS URL',
        'REJECTED',
        undefined,
        'XENDIT_RETURN_BASE_URL_HTTPS_REQUIRED',
      );
    }
    if (
      webBaseUrl.protocol !== 'https:' ||
      !webBaseUrl.hostname ||
      webBaseUrl.username ||
      webBaseUrl.password
    ) {
      throw new XenditPaymentRequestError(
        'Xendit Payment Sessions require XENDIT_RETURN_BASE_URL to use HTTPS',
        'REJECTED',
        undefined,
        'XENDIT_RETURN_BASE_URL_HTTPS_REQUIRED',
      );
    }
    const invoiceUrl = new URL(
      `/app/billing/${encodeURIComponent(input.invoiceId)}`,
      webBaseUrl,
    );
    const successUrl = new URL(invoiceUrl);
    successUrl.searchParams.set('autopay', 'completed');
    const cancelUrl = new URL(invoiceUrl);
    cancelUrl.searchParams.set('autopay', 'cancelled');

    const requestBody = JSON.stringify({
      reference_id: input.referenceId,
      session_type: 'PAY',
      mode: 'PAYMENT_LINK',
      allow_save_payment_method: 'FORCED',
      allowed_payment_channels: ['CARDS'],
      capture_method: 'AUTOMATIC',
      amount: input.amountCents,
      currency,
      country,
      locale: 'en',
      description: input.description,
      success_return_url: successUrl.toString(),
      cancel_return_url: cancelUrl.toString(),
      metadata: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
      },
    });

    let apiKey: string;
    try {
      apiKey = this.getApiKey();
    } catch {
      throw new XenditPaymentRequestError(
        'Xendit Payment Session configuration is incomplete',
        'REJECTED',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${this.getApiBaseUrl()}/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });
    } catch {
      throw new XenditPaymentRequestError(
        'Xendit Payment Session outcome is unknown after a transport failure',
        'UNKNOWN',
      );
    }

    let data: {
      payment_session_id?: string;
      payment_link_url?: string;
      error_code?: string;
      message?: string;
    } = {};
    try {
      data = (await response.json()) as typeof data;
    } catch {
      if (response.ok) {
        throw new XenditPaymentRequestError(
          'Xendit returned success without a readable Payment Session response',
          'UNKNOWN',
        );
      }
    }

    if (!response.ok) {
      const outcome =
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 409
          ? 'REJECTED'
          : 'UNKNOWN';
      const providerCode =
        typeof data.error_code === 'string' &&
        /^[A-Za-z0-9_-]{1,64}$/.test(data.error_code)
          ? data.error_code
          : undefined;
      throw new XenditPaymentRequestError(
        data.message ?? 'Xendit rejected the Payment Session',
        outcome,
        response.status,
        providerCode,
      );
    }

    if (!data.payment_session_id || !data.payment_link_url) {
      throw new XenditPaymentRequestError(
        'Xendit did not return the required Payment Session ID and checkout URL',
        'UNKNOWN',
      );
    }

    let paymentLinkUrl: URL;
    try {
      paymentLinkUrl = new URL(data.payment_link_url);
    } catch {
      throw new XenditPaymentRequestError(
        'Xendit returned an invalid Payment Session checkout URL',
        'UNKNOWN',
      );
    }
    if (paymentLinkUrl.protocol !== 'https:') {
      throw new XenditPaymentRequestError(
        'Xendit returned an insecure Payment Session checkout URL',
        'UNKNOWN',
      );
    }

    return {
      paymentSessionId: data.payment_session_id,
      paymentLinkUrl: paymentLinkUrl.toString(),
    };
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
    if (
      !input.currency.trim() ||
      (!input.paymentTokenId && !input.channelCode.trim()) ||
      (input.paymentTokenId && input.channelCode)
    ) {
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
      type: input.savePaymentMethod ? 'PAY_AND_SAVE' : 'PAY',
      ...(XENDIT_COUNTRY_BY_CURRENCY[input.currency]
        ? { country: XENDIT_COUNTRY_BY_CURRENCY[input.currency] }
        : {}),
      request_amount: input.amountCents,
      currency: input.currency,
      ...(input.paymentTokenId
        ? { payment_token_id: input.paymentTokenId }
        : { channel_code: input.channelCode }),
      capture_method: 'AUTOMATIC',
      ...(input.savePaymentMethod && input.customerId
        ? { customer_id: input.customerId }
        : {}),
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
      error_code?: string;
      message?: string;
      actions?: Array<{
        type?: string;
        descriptor?: string;
        value?: string;
      }>;
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
      const providerCode =
        typeof data?.error_code === 'string' &&
        /^[A-Za-z0-9_-]{1,64}$/.test(data.error_code)
          ? data.error_code
          : undefined;
      throw new XenditPaymentRequestError(
        detail,
        outcome,
        response.status,
        providerCode,
      );
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
      actions: data.actions?.flatMap((action) =>
        typeof action.type === 'string' && typeof action.value === 'string'
          ? [
              {
                type: action.type,
                ...(action.descriptor ? { descriptor: action.descriptor } : {}),
                value: action.value,
              },
            ]
          : [],
      ),
    };
  }

  async refund(
    input: PaymentGatewayRefundInput,
  ): Promise<PaymentGatewayRefundResult> {
    if (
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      !input.paymentRequestId.trim() ||
      !input.referenceId.trim() ||
      !input.currency.trim() ||
      !input.reason.trim()
    ) {
      throw new XenditRefundError(
        'Refund request details are invalid',
        'REJECTED',
      );
    }

    let apiKey: string;
    try {
      apiKey = this.getApiKey();
    } catch {
      throw new XenditRefundError(
        'Xendit refund configuration is incomplete',
        'REJECTED',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${this.getApiBaseUrl()}/refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference_id: input.referenceId,
          payment_request_id: input.paymentRequestId,
          currency: input.currency,
          amount: input.amountCents,
          reason: input.reason,
        }),
      });
    } catch {
      throw new XenditRefundError(
        'Xendit refund outcome is unknown after a transport failure',
        'UNKNOWN',
      );
    }

    let data: {
      id?: string;
      refund_id?: string;
      status?: string;
      message?: string;
    } = {};
    try {
      data = (await response.json()) as typeof data;
    } catch {
      if (response.ok) {
        throw new XenditRefundError(
          'Xendit returned success without a readable refund response',
          'UNKNOWN',
        );
      }
    }

    if (!response.ok) {
      const outcome =
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 409
          ? 'REJECTED'
          : 'UNKNOWN';
      throw new XenditRefundError(
        data.message ??
          'Xendit rejected or could not confirm the refund request',
        outcome,
      );
    }

    const providerRefundId = data.id ?? data.refund_id;
    if (!providerRefundId) {
      throw new XenditRefundError(
        'Xendit refund response did not include its provider refund ID',
        'UNKNOWN',
      );
    }

    return { providerRefundId, status: data.status };
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
