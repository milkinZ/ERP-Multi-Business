import type {
  PlanType,
  SubscriptionStatus,
  TenantStatus,
  XenditPaymentRequestAttemptState,
} from '@prisma/client';

export type PlatformBillingAggregateResponse = {
  tenants: {
    total: number;
    byStatus: Array<{ status: TenantStatus; count: number }>;
  };
  users: { total: number };
  outlets: { total: number };
  platformAudit: { total: number; last24Hours: number };
  subscriptions: {
    total: number;
    byStatus: Array<{ status: SubscriptionStatus; count: number }>;
    byPlan: Array<{
      planId: string;
      planType: PlanType;
      planName: string;
      subscriptionCount: number;
    }>;
  };
  invoices: {
    total: number;
    byStatusAndCurrency: Array<{
      status: string;
      currency: string;
      count: number;
      amountCents: number;
    }>;
    byProviderStatus: Array<{
      providerStatus: string | null;
      count: number;
    }>;
  };
  paymentRequests: {
    total: number;
    byState: Array<{
      state: XenditPaymentRequestAttemptState;
      count: number;
    }>;
  };
};
