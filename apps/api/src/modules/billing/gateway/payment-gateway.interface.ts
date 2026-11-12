/**
 * Payment Gateway Interface
 *
 * All gateway-specific logic must be isolated behind this interface.
 * Never hardcode gateway-specific logic into SubscriptionService or BillingService.
 */

export type PaymentGatewayChargeInput = {
  amountCents: number;
  currency: string;
  description: string;
  tenantId: string;
  channelCode: string;
  paymentTokenId?: string;
  savePaymentMethod?: boolean;
  customerId?: string;
  metadata?: Record<string, unknown>;
};

export type PaymentGatewayAction = {
  type: string;
  descriptor?: string;
  value: string;
};

export type PaymentGatewayChargeResult = {
  success: boolean;
  transactionId: string;
  gatewayReference: string;
  paymentRequestId?: string;
  status: 'PAID' | 'FAILED' | 'PENDING';
  actions?: PaymentGatewayAction[];
  errorMessage?: string;
};

export type PaymentGatewayRefundInput = {
  referenceId: string;
  paymentRequestId: string;
  amountCents: number;
  currency: string;
  reason: string;
};

export type PaymentGatewayRefundResult = {
  providerRefundId?: string;
  status?: string;
};

export abstract class PaymentGateway {
  abstract charge(
    input: PaymentGatewayChargeInput,
  ): Promise<PaymentGatewayChargeResult>;
  abstract refund(
    input: PaymentGatewayRefundInput,
  ): Promise<PaymentGatewayRefundResult>;
  abstract verifyWebhookSignature(payload: unknown, signature: string): boolean;
}
