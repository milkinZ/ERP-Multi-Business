import {
  BusinessRegistryAggregate,
  BusinessStatus,
} from './business-registry.aggregate';
import { DOMAIN_EVENTS } from '../../../core/events/domain-events';

describe('BusinessRegistryAggregate', () => {
  const baseProps = {
    id: 'tenant-1',
    tenantId: 'tenant-1',
    name: 'My Cafe',
    businessType: 'CAFE',
    contactEmail: 'contact@cafe.com',
    contactPhone: '+628123456789',
    address: 'Jl. Sudirman No. 1',
  };

  it('should create with ACTIVE status and emit CREATED + ACTIVATED events', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);

    expect(aggregate.id).toBe('tenant-1');
    expect(aggregate.status).toBe(BusinessStatus.ACTIVE);
    expect(aggregate.isActive()).toBe(true);

    const events = aggregate.pullDomainEvents();
    const types = events.map((e) => e.type);

    expect(types).toContain(DOMAIN_EVENTS.BUSINESS_CREATED);
    expect(types).toContain(DOMAIN_EVENTS.BUSINESS_ACTIVATED);
  });

  it('should emit BUSINESS_TYPE_CHANGED when business type changes', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);
    aggregate.pullDomainEvents(); // clear creation events

    aggregate.changeBusinessType('RETAIL');

    const events = aggregate.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED);
    expect(events[0].payload).toMatchObject({
      oldBusinessType: 'CAFE',
      newBusinessType: 'RETAIL',
    });
  });

  it('should be idempotent when changing to same business type', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);
    aggregate.pullDomainEvents();

    aggregate.changeBusinessType('CAFE');

    expect(aggregate.pullDomainEvents()).toHaveLength(0);
  });

  it('should emit BUSINESS_UPDATED when name changes', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);
    aggregate.pullDomainEvents();

    aggregate.update({ name: 'My Cafe V2' });

    const events = aggregate.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(DOMAIN_EVENTS.BUSINESS_UPDATED);
    expect(events[0].payload).toMatchObject({ changes: ['name'] });
  });

  it('should reject empty business name on update', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);
    expect(() => aggregate.update({ name: '   ' })).toThrow(
      'Business name cannot be empty',
    );
  });

  it('should suspend and emit BUSINESS_SUSPENDED', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);
    aggregate.pullDomainEvents();

    aggregate.suspend('Fraud');

    expect(aggregate.status).toBe(BusinessStatus.SUSPENDED);
    const events = aggregate.pullDomainEvents();
    expect(events[0].type).toBe(DOMAIN_EVENTS.BUSINESS_SUSPENDED);
    expect(events[0].payload).toMatchObject({ reason: 'Fraud' });
  });

  it('should archive and emit BUSINESS_ARCHIVED', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);
    aggregate.pullDomainEvents();

    aggregate.archive();

    expect(aggregate.isArchived()).toBe(true);
    expect(aggregate.deletedAt).not.toBeNull();

    const events = aggregate.pullDomainEvents();
    expect(events[0].type).toBe(DOMAIN_EVENTS.BUSINESS_ARCHIVED);
  });

  it('should restore and emit BUSINESS_RESTORED', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);
    aggregate.archive();
    aggregate.pullDomainEvents();

    aggregate.restore();

    expect(aggregate.isActive()).toBe(true);
    expect(aggregate.deletedAt).toBeNull();

    const events = aggregate.pullDomainEvents();
    expect(events[0].type).toBe(DOMAIN_EVENTS.BUSINESS_RESTORED);
  });

  it('should prevent updates on archived business', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);
    aggregate.archive();

    expect(() => aggregate.update({ name: 'Nope' })).toThrow(
      'Cannot update an archived business',
    );
  });

  it('should reconstitute from persistence without emitting events', () => {
    const aggregate = BusinessRegistryAggregate.reconstitute({
      ...baseProps,
      status: BusinessStatus.ACTIVE,
      deletedAt: null,
    });

    expect(aggregate.toJSON()).toMatchObject({
      id: 'tenant-1',
      tenantId: 'tenant-1',
      name: 'My Cafe',
      businessType: 'CAFE',
    });
    expect(aggregate.pullDomainEvents()).toHaveLength(0);
  });

  it('should expose contact fields in toJSON', () => {
    const aggregate = BusinessRegistryAggregate.create(baseProps);

    expect(aggregate.toJSON()).toMatchObject({
      contactEmail: 'contact@cafe.com',
      contactPhone: '+628123456789',
      address: 'Jl. Sudirman No. 1',
    });
  });
});
