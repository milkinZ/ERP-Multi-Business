import { NotFoundException } from '@nestjs/common';

import { SuperAdminService } from './super-admin.service';
import { SuperAdminRepository } from './super-admin.repository';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('SuperAdminService', () => {
  const actor = { userId: 'user-1', tenantId: 'tenant-superadmin' };

  const findTenantByIdMock = jest.fn();
  const findAllTenantsMock = jest.fn();
  const updateTenantDeletedAtMock = jest.fn();
  const findAllPlansMock = jest.fn();
  const findPlanByIdMock = jest.fn();
  const findPlanByTypeMock = jest.fn();
  const createPlanMock = jest.fn();
  const updatePlanMock = jest.fn();
  const softDeletePlanMock = jest.fn();
  const findAllSubscriptionsMock = jest.fn();
  const findSubscriptionByTenantIdMock = jest.fn();
  const findAllInvoicesMock = jest.fn();
  const findAllFeatureFlagsMock = jest.fn();

  const repository = {
    findTenantById: findTenantByIdMock,
    findAllTenants: findAllTenantsMock,
    updateTenantDeletedAt: updateTenantDeletedAtMock,
    findAllPlans: findAllPlansMock,
    findPlanById: findPlanByIdMock,
    findPlanByType: findPlanByTypeMock,
    createPlan: createPlanMock,
    updatePlan: updatePlanMock,
    softDeletePlan: softDeletePlanMock,
    findAllSubscriptions: findAllSubscriptionsMock,
    findSubscriptionByTenantId: findSubscriptionByTenantIdMock,
    findAllInvoices: findAllInvoicesMock,
    findAllFeatureFlags: findAllFeatureFlagsMock,
  } as unknown as SuperAdminRepository;

  const outboxPublishMock = jest.fn();
  const outbox = { publish: outboxPublishMock } as unknown as OutboxPublisher;

  const eventBusPublishMock = jest.fn();
  const eventBus = {
    publish: eventBusPublishMock,
  } as unknown as DomainEventBus;

  const subscriptionUpdateMock = jest.fn();

  const prisma = {
    subscription: { update: subscriptionUpdateMock },
  } as unknown as PrismaService;

  let service: SuperAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SuperAdminService(repository, outbox, eventBus, prisma);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listTenants', () => {
    it('should delegate to repository', async () => {
      findAllTenantsMock.mockResolvedValue({ data: [], total: 0 });

      const result = await service.listTenants({ page: 1, limit: 20 });

      expect(findAllTenantsMock).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(0);
    });
  });

  describe('getTenant', () => {
    it('should return tenant when found', async () => {
      findTenantByIdMock.mockResolvedValue({ id: 'tenant-1', name: 'Cafe' });

      const result = await service.getTenant('tenant-1');

      expect(result).toMatchObject({ id: 'tenant-1' });
    });

    it('should throw NotFoundException when missing', async () => {
      findTenantByIdMock.mockResolvedValue(null);

      await expect(service.getTenant('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateTenant', () => {
    it('should publish event and clear deletedAt', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        deletedAt: new Date(),
      });
      updateTenantDeletedAtMock.mockResolvedValue(undefined);
      outboxPublishMock.mockResolvedValue(undefined);
      eventBusPublishMock.mockResolvedValue(undefined);

      const result = await service.activateTenant(actor, 'tenant-1');

      expect(updateTenantDeletedAtMock).toHaveBeenCalledWith('tenant-1', null);
      expect(outboxPublishMock).toHaveBeenCalled();
      expect(eventBusPublishMock).toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'ACTIVE' });
    });

    it('should throw NotFoundException when tenant missing', async () => {
      findTenantByIdMock.mockResolvedValue(null);

      await expect(service.activateTenant(actor, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('suspendTenant', () => {
    it('should publish event with reason', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        deletedAt: null,
      });
      outboxPublishMock.mockResolvedValue(undefined);
      eventBusPublishMock.mockResolvedValue(undefined);

      const result = await service.suspendTenant(actor, 'tenant-1', 'Fraud');

      expect(outboxPublishMock).toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'SUSPENDED' });
    });
  });

  describe('deactivateTenant', () => {
    it('should set deletedAt to now', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        deletedAt: null,
      });
      updateTenantDeletedAtMock.mockResolvedValue(undefined);
      outboxPublishMock.mockResolvedValue(undefined);
      eventBusPublishMock.mockResolvedValue(undefined);

      const result = await service.deactivateTenant(actor, 'tenant-1');

      expect(updateTenantDeletedAtMock).toHaveBeenCalledWith(
        'tenant-1',
        expect.any(Date),
      );
      expect(result).toMatchObject({ status: 'DEACTIVATED' });
    });
  });

  describe('restoreTenant', () => {
    it('should clear deletedAt', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        deletedAt: new Date(),
      });
      updateTenantDeletedAtMock.mockResolvedValue(undefined);
      outboxPublishMock.mockResolvedValue(undefined);
      eventBusPublishMock.mockResolvedValue(undefined);

      const result = await service.restoreTenant(actor, 'tenant-1');

      expect(updateTenantDeletedAtMock).toHaveBeenCalledWith('tenant-1', null);
      expect(result).toMatchObject({ status: 'ACTIVE' });
    });
  });

  describe('createPlan', () => {
    it('should create when type not taken', async () => {
      findPlanByTypeMock.mockResolvedValue(null);
      createPlanMock.mockResolvedValue({
        id: 'plan-1',
        type: 'BUSINESS',
        name: 'Business',
        priceCents: 49900,
      });

      const result = await service.createPlan({
        type: 'BUSINESS',
        name: 'Business',
        priceCents: 49900,
      });

      expect(createPlanMock).toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'plan-1' });
    });
  });

  describe('changeTenantPlan', () => {
    it('should update subscription planId', async () => {
      findSubscriptionByTenantIdMock.mockResolvedValue({
        id: 'sub-1',
        planId: 'plan-1',
        plan: { id: 'plan-1', type: 'FREE', name: 'Free', priceCents: 0 },
      });
      findPlanByIdMock.mockResolvedValue({
        id: 'plan-2',
        type: 'BUSINESS',
        name: 'Business',
        priceCents: 49900,
      });
      outboxPublishMock.mockResolvedValue(undefined);
      eventBusPublishMock.mockResolvedValue(undefined);
      subscriptionUpdateMock.mockResolvedValue(undefined);

      const result = await service.changeTenantPlan(
        actor,
        'tenant-1',
        'plan-2',
      );

      expect(subscriptionUpdateMock).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { planId: 'plan-2' },
      });
      expect(result).toMatchObject({ newPlanId: 'plan-2' });
    });

    it('should throw NotFoundException when no subscription', async () => {
      findSubscriptionByTenantIdMock.mockResolvedValue(null);

      await expect(
        service.changeTenantPlan(actor, 'tenant-1', 'plan-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
