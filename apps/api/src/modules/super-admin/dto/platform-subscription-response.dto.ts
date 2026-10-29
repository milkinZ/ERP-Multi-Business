import type { PlanType, SubscriptionStatus } from '@prisma/client';

export type PlatformSubscriptionResponse = {
  id: string;
  tenantId: string;
  planId: string;
  pendingPlanId: string | null;
  pendingPlanEffectiveAt: 'NEXT_RENEWAL' | null;
  status: SubscriptionStatus;
  planType: PlanType;
  priceCents: number;
  startedAt: Date;
  endedAt: Date | null;
  tenant: {
    id: string;
    name: string;
  };
  plan: {
    id: string;
    type: PlanType;
    name: string;
    priceCents: number;
  };
};
