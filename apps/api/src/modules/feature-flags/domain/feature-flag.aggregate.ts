import { AggregateRoot } from '../../../core/domain/aggregate-root';

export type FeatureFlagStatus = 'ENABLED' | 'DISABLED' | 'ARCHIVED';

export interface FeatureFlagTargetingRule {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'contains';
  value: string | string[];
}

export interface FeatureFlagOverride {
  outletId?: string;
  userId?: string;
  enabled: boolean;
}

export interface FeatureFlagState {
  id: string;
  key: string;
  tenantId: string;
  enabled: boolean;
  payload?: Record<string, unknown>;
  targetingRules?: FeatureFlagTargetingRule[];
  overrides?: FeatureFlagOverride[];
  deletedAt?: Date | null;
}

export class FeatureFlagAggregate extends AggregateRoot {
  private constructor(private state: FeatureFlagState) {
    super();
  }

  static create(
    id: string,
    key: string,
    tenantId: string,
    enabled: boolean = false,
    payload?: Record<string, unknown>,
  ): FeatureFlagAggregate {
    const aggregate = new FeatureFlagAggregate({
      id,
      key,
      tenantId,
      enabled,
      payload,
      targetingRules: [],
      overrides: [],
      deletedAt: null,
    });
    return aggregate;
  }

  static reconstitute(state: FeatureFlagState): FeatureFlagAggregate {
    return new FeatureFlagAggregate({
      ...state,
      targetingRules: [...(state.targetingRules ?? [])],
      overrides: [...(state.overrides ?? [])],
    });
  }

  enable(): void {
    if (this.state.deletedAt) {
      throw new Error('Cannot enable an archived feature flag');
    }
    if (this.state.enabled) {
      return; // idempotent
    }
    this.state.enabled = true;
  }

  disable(): void {
    if (this.state.deletedAt) {
      throw new Error('Cannot disable an archived feature flag');
    }
    if (!this.state.enabled) {
      return; // idempotent
    }
    this.state.enabled = false;
  }

  archive(): void {
    if (this.state.deletedAt) {
      throw new Error('Feature flag is already archived');
    }
    this.state.deletedAt = new Date();
  }

  restore(): void {
    if (!this.state.deletedAt) {
      return; // idempotent
    }
    this.state.deletedAt = null;
  }

  updateTargeting(rules: FeatureFlagTargetingRule[]): void {
    if (this.state.deletedAt) {
      throw new Error('Cannot update targeting on an archived feature flag');
    }
    for (const rule of rules) {
      if (!rule.field || !rule.operator || rule.value === undefined) {
        throw new Error('Invalid targeting rule: missing required fields');
      }
    }
    this.state.targetingRules = rules;
  }

  addOverride(override: FeatureFlagOverride): void {
    if (this.state.deletedAt) {
      throw new Error('Cannot add override on an archived feature flag');
    }
    const existingIndex = this.state.overrides?.findIndex(
      (o) => o.outletId === override.outletId && o.userId === override.userId,
    );
    if (existingIndex !== undefined && existingIndex >= 0) {
      this.state.overrides![existingIndex] = override;
    } else {
      this.state.overrides = [...(this.state.overrides ?? []), override];
    }
  }

  removeOverride(outletId?: string, userId?: string): void {
    this.state.overrides = (this.state.overrides ?? []).filter(
      (o) => o.outletId !== outletId || o.userId !== userId,
    );
  }

  evaluate(
    context: {
      tenantId: string;
      outletId?: string | null;
      userId?: string;
    },
    payload?: Record<string, unknown>,
  ): boolean {
    if (this.state.deletedAt) return false;
    if (this.state.tenantId !== context.tenantId) return false;

    // Check overrides first (highest priority)
    const userOverride = this.state.overrides?.find(
      (o) => o.userId === context.userId && !o.outletId,
    );
    if (userOverride !== undefined) return userOverride.enabled;

    const outletOverride = this.state.overrides?.find(
      (o) => o.outletId === context.outletId && !o.userId,
    );
    if (outletOverride !== undefined) return outletOverride.enabled;

    // Check targeting rules
    if (this.state.targetingRules && this.state.targetingRules.length > 0) {
      return this.evaluateTargetingRules(context, payload);
    }

    // Default to flag enabled status
    return this.state.enabled;
  }

  private evaluateTargetingRules(
    context: { tenantId: string; outletId?: string | null; userId?: string },
    payload?: Record<string, unknown>,
  ): boolean {
    if (!this.state.targetingRules || this.state.targetingRules.length === 0) {
      return true;
    }

    return this.state.targetingRules.every((rule) => {
      const actualValue = this.resolveContextValue(
        rule.field,
        context,
        payload,
      );
      if (actualValue === undefined) return false;

      switch (rule.operator) {
        case 'eq':
          return actualValue === rule.value;
        case 'neq':
          return actualValue !== rule.value;
        case 'in':
          return (
            Array.isArray(rule.value) &&
            rule.value.includes(actualValue as string)
          );
        case 'contains':
          return (
            typeof actualValue === 'string' &&
            typeof rule.value === 'string' &&
            actualValue.includes(rule.value)
          );
        default:
          return false;
      }
    });
  }

  private resolveContextValue(
    field: string,
    context: { tenantId: string; outletId?: string | null; userId?: string },
    payload?: Record<string, unknown>,
  ): unknown {
    if (field === 'tenantId') return context.tenantId;
    if (field === 'outletId') return context.outletId;
    if (field === 'userId') return context.userId;
    if (field.startsWith('payload.') && payload) {
      const key = field.slice(8);
      return payload[key];
    }
    return undefined;
  }

  getState(): Readonly<FeatureFlagState> {
    return { ...this.state };
  }

  getId(): string {
    return this.state.id;
  }

  getKey(): string {
    return this.state.key;
  }

  getTenantId(): string {
    return this.state.tenantId;
  }

  isEnabled(): boolean {
    return this.state.enabled && !this.state.deletedAt;
  }

  isDeleted(): boolean {
    return !!this.state.deletedAt;
  }
}
