import { PlanType } from '../domain/subscription.aggregate';

export type PlanCatalogEntry = {
  id: string;
  type: PlanType;
  name: string;
  priceCents: number;
  maxOutlets: number | null;
  maxUsers: number | null;
  maxMonthlyOrders: number | null;
  maxCategories: number;
  trialDays: number;
  trialEligible: boolean;
};

export const DEFAULT_PLAN_CATALOG: Record<PlanType, PlanCatalogEntry> = {
  [PlanType.FREE]: {
    id: 'plan-free',
    type: PlanType.FREE,
    name: 'Free',
    priceCents: 0,
    maxOutlets: 1,
    maxUsers: 3,
    maxMonthlyOrders: 500,
    maxCategories: 1,
    trialDays: 0,
    trialEligible: false,
  },
  [PlanType.STARTER]: {
    id: 'plan-starter',
    type: PlanType.STARTER,
    name: 'Starter',
    priceCents: 199000,
    maxOutlets: 3,
    maxUsers: 10,
    maxMonthlyOrders: 5000,
    maxCategories: 1,
    trialDays: 0,
    trialEligible: false,
  },
  [PlanType.BUSINESS]: {
    id: 'plan-business',
    type: PlanType.BUSINESS,
    name: 'Business',
    priceCents: 499000,
    maxOutlets: 10,
    maxUsers: 50,
    maxMonthlyOrders: 50000,
    maxCategories: 2,
    trialDays: 30,
    trialEligible: true,
  },
  [PlanType.ENTERPRISE]: {
    id: 'plan-enterprise',
    type: PlanType.ENTERPRISE,
    name: 'Enterprise',
    priceCents: 0,
    maxOutlets: null,
    maxUsers: null,
    maxMonthlyOrders: null,
    maxCategories: Number.MAX_SAFE_INTEGER,
    trialDays: 0,
    trialEligible: false,
  },
};

export function getPlanCatalogEntry(type: string | PlanType): PlanCatalogEntry {
  const normalized = String(type).toUpperCase() as PlanType;
  const entry = DEFAULT_PLAN_CATALOG[normalized];
  if (!entry) {
    throw new Error(`Unsupported plan type: ${type}`);
  }
  return entry;
}
