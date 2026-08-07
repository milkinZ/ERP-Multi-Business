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
  metadata?: Record<string, unknown>;
};

export type PaymentGatewayChargeResult = {
  success: boolean;
  transactionId: string;
  gatewayReference: string;
  status: 'PAID' | 'FAILED' | 'PENDING';
  errorMessage?: string;
};

export abstract class PaymentGateway {
  abstract charge(
    input: PaymentGatewayChargeInput,
  ): Promise<PaymentGatewayChargeResult>;
  abstract verifyWebhookSignature(payload: unknown, signature: string): boolean;
  abstract refund(
    transactionId: string,
    amountCents?: number,
  ): Promise<PaymentGatewayChargeResult>;
}
