import { AggregateRoot } from '../../../core/domain/aggregate-root';
import { DOMAIN_EVENTS } from '../../../core/events/domain-events';

export enum BusinessStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export type BusinessRegistryProps = {
  id: string;
  tenantId: string;
  name: string;
  businessType: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  status: BusinessStatus;
  deletedAt?: Date | null;
};

/**
 * Business Registry Aggregate Root
 *
 * Owns all business registry lifecycle business rules.
 * No Prisma calls, no database queries, no infrastructure dependencies.
 */
export class BusinessRegistryAggregate extends AggregateRoot {
  private constructor(private props: BusinessRegistryProps) {
    super();
  }

  static create(
    props: Omit<BusinessRegistryProps, 'status' | 'deletedAt'>,
  ): BusinessRegistryAggregate {
    const aggregate = new BusinessRegistryAggregate({
      ...props,
      status: BusinessStatus.ACTIVE,
      deletedAt: null,
    });

    aggregate.addDomainEvent({
      type: DOMAIN_EVENTS.BUSINESS_CREATED,
      payload: {
        tenantId: props.tenantId,
        businessId: props.id,
        name: props.name,
        businessType: props.businessType,
      },
    });

    aggregate.addDomainEvent({
      type: DOMAIN_EVENTS.BUSINESS_ACTIVATED,
      payload: {
        tenantId: props.tenantId,
        businessId: props.id,
      },
    });

    return aggregate;
  }

  static reconstitute(props: BusinessRegistryProps): BusinessRegistryAggregate {
    return new BusinessRegistryAggregate(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get name(): string {
    return this.props.name;
  }

  get businessType(): string {
    return this.props.businessType;
  }

  get status(): BusinessStatus {
    return this.props.status;
  }

  get contactEmail(): string | null | undefined {
    return this.props.contactEmail;
  }

  get contactPhone(): string | null | undefined {
    return this.props.contactPhone;
  }

  get address(): string | null | undefined {
    return this.props.address;
  }

  get deletedAt(): Date | null | undefined {
    return this.props.deletedAt;
  }

  isActive(): boolean {
    return this.props.status === BusinessStatus.ACTIVE && !this.props.deletedAt;
  }

  isArchived(): boolean {
    return (
      this.props.status === BusinessStatus.ARCHIVED || !!this.props.deletedAt
    );
  }

  update(data: {
    name?: string;
    businessType?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
  }): void {
    if (this.isArchived()) {
      throw new Error('Cannot update an archived business');
    }

    const changes: string[] = [];

    if (data.name !== undefined && data.name !== this.props.name) {
      if (data.name.trim().length === 0) {
        throw new Error('Business name cannot be empty');
      }
      changes.push('name');
      this.props.name = data.name;
    }

    if (
      data.businessType !== undefined &&
      data.businessType !== this.props.businessType
    ) {
      const oldType = this.props.businessType;
      this.props.businessType = data.businessType;
      changes.push('businessType');

      this.addDomainEvent({
        type: DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED,
        payload: {
          tenantId: this.props.tenantId,
          businessId: this.props.id,
          oldBusinessType: oldType,
          newBusinessType: data.businessType,
        },
      });
    }

    if (data.contactEmail !== undefined) {
      this.props.contactEmail = data.contactEmail;
      changes.push('contactEmail');
    }

    if (data.contactPhone !== undefined) {
      this.props.contactPhone = data.contactPhone;
      changes.push('contactPhone');
    }

    if (data.address !== undefined) {
      this.props.address = data.address;
      changes.push('address');
    }

    if (changes.length > 0) {
      this.addDomainEvent({
        type: DOMAIN_EVENTS.BUSINESS_UPDATED,
        payload: {
          tenantId: this.props.tenantId,
          businessId: this.props.id,
          changes,
        },
      });
    }
  }

  activate(): void {
    if (this.props.status === BusinessStatus.ACTIVE) {
      return; // Idempotent
    }

    if (this.props.deletedAt) {
      throw new Error('Cannot activate an archived business');
    }

    this.props.status = BusinessStatus.ACTIVE;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.BUSINESS_ACTIVATED,
      payload: {
        tenantId: this.props.tenantId,
        businessId: this.props.id,
      },
    });
  }

  suspend(reason?: string): void {
    if (this.props.status === BusinessStatus.SUSPENDED) {
      return; // Idempotent
    }

    if (this.props.deletedAt) {
      throw new Error('Cannot suspend an archived business');
    }

    this.props.status = BusinessStatus.SUSPENDED;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.BUSINESS_SUSPENDED,
      payload: {
        tenantId: this.props.tenantId,
        businessId: this.props.id,
        reason,
      },
    });
  }

  archive(): void {
    if (this.props.deletedAt) {
      return; // Idempotent
    }

    this.props.status = BusinessStatus.ARCHIVED;
    this.props.deletedAt = new Date();

    this.addDomainEvent({
      type: DOMAIN_EVENTS.BUSINESS_ARCHIVED,
      payload: {
        tenantId: this.props.tenantId,
        businessId: this.props.id,
      },
    });
  }

  restore(): void {
    if (!this.props.deletedAt) {
      return; // Idempotent
    }

    this.props.deletedAt = null;
    this.props.status = BusinessStatus.ACTIVE;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.BUSINESS_RESTORED,
      payload: {
        tenantId: this.props.tenantId,
        businessId: this.props.id,
      },
    });
  }

  changeBusinessType(newBusinessType: string): void {
    if (this.isArchived()) {
      throw new Error('Cannot change business type on an archived business');
    }

    if (newBusinessType === this.props.businessType) {
      return; // Idempotent
    }

    const oldType = this.props.businessType;
    this.props.businessType = newBusinessType;

    this.addDomainEvent({
      type: DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED,
      payload: {
        tenantId: this.props.tenantId,
        businessId: this.props.id,
        oldBusinessType: oldType,
        newBusinessType,
      },
    });
  }

  toJSON() {
    return {
      id: this.props.id,
      tenantId: this.props.tenantId,
      name: this.props.name,
      businessType: this.props.businessType,
      contactEmail: this.props.contactEmail ?? null,
      contactPhone: this.props.contactPhone ?? null,
      address: this.props.address ?? null,
      status: this.props.status,
      deletedAt: this.props.deletedAt ?? null,
    };
  }
}
