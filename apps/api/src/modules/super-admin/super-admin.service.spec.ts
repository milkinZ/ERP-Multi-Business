import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';

import { SuperAdminService } from './super-admin.service';
import { SuperAdminRepository } from './super-admin.repository';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { PrismaService } from '../../core/database/prisma.service';
import { PlatformAuditLogService } from '../audit-logs/platform-audit-log.service';

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
  const findSubscriptionByIdMock = jest.fn();
  const findSubscriptionByTenantIdMock = jest.fn();
  const findAllInvoicesMock = jest.fn();
  const findInvoiceByIdMock = jest.fn();
  const findAllFeatureFlagsMock = jest.fn();
  const tenantUpdateMock = jest.fn();
  const tenantUpdateManyMock = jest.fn();

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
    findSubscriptionById: findSubscriptionByIdMock,
    findSubscriptionByTenantId: findSubscriptionByTenantIdMock,
    findAllInvoices: findAllInvoicesMock,
    findInvoiceById: findInvoiceByIdMock,
    findAllFeatureFlags: findAllFeatureFlagsMock,
  } as unknown as SuperAdminRepository;

  const outboxPublishMock = jest.fn();
  const outbox = { publish: outboxPublishMock } as unknown as OutboxPublisher;

  const subscriptionUpdateMock = jest.fn();
  const subscriptionUpdateManyMock = jest.fn();
  const transactionMock = jest.fn(
    async (callback: (tx: typeof txClient) => Promise<unknown>) =>
      callback(txClient),
  );

  const prisma = {
    $transaction: transactionMock,
    tenant: { update: tenantUpdateMock, updateMany: tenantUpdateManyMock },
    subscription: {
      update: subscriptionUpdateMock,
      updateMany: subscriptionUpdateManyMock,
    },
  } as unknown as PrismaService;
  const platformAuditCreateMock = jest.fn().mockResolvedValue(undefined);
  const platformAudit = {
    create: platformAuditCreateMock,
    list: jest.fn(),
    getById: jest.fn(),
  } as unknown as PlatformAuditLogService;

  const txClient = {
    tenant: { update: tenantUpdateMock, updateMany: tenantUpdateManyMock },
    subscription: {
      update: subscriptionUpdateMock,
      updateMany: subscriptionUpdateManyMock,
    },
    platformAuditLog: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };

  let service: SuperAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantUpdateManyMock.mockResolvedValue({ count: 1 });
    subscriptionUpdateManyMock.mockResolvedValue({ count: 1 });
    transactionMock.mockImplementation(async (callback) => callback(txClient));
    txClient.subscription.update = subscriptionUpdateMock;
    txClient.platformAuditLog.create = platformAuditCreateMock;
    txClient.outboxEvent.create = outboxPublishMock;
    service = new SuperAdminService(repository, outbox, platformAudit, prisma);
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
    it('should activate a suspended tenant and persist the transition', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.SUSPENDED,
        deletedAt: null,
      });
      outboxPublishMock.mockResolvedValue(undefined);

      const result = await service.activateTenant(actor, 'tenant-1');

      expect(tenantUpdateManyMock).toHaveBeenCalledWith({
        where: {
          id: 'tenant-1',
          status: TenantStatus.SUSPENDED,
          deletedAt: null,
        },
        data: { status: TenantStatus.ACTIVE },
      });
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(outboxPublishMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'super-admin.tenant.activated' }),
        txClient,
      );
      expect(platformAuditCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'super-admin.tenant.activated',
          resourceType: 'TENANT',
          resourceId: 'tenant-1',
          targetTenantId: 'tenant-1',
        }),
        txClient,
      );
      expect(result).toMatchObject({ status: 'ACTIVE' });
    });

    it('should throw NotFoundException when tenant missing', async () => {
      findTenantByIdMock.mockResolvedValue(null);

      await expect(service.activateTenant(actor, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects activation when the tenant is already active', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      });

      await expect(service.activateTenant(actor, 'tenant-1')).rejects.toThrow(
        ConflictException,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  describe('suspendTenant', () => {
    it('should publish event with reason', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      });
      outboxPublishMock.mockResolvedValue(undefined);

      const result = await service.suspendTenant(actor, 'tenant-1', 'Fraud');

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(tenantUpdateManyMock).toHaveBeenCalledWith({
        where: {
          id: 'tenant-1',
          status: TenantStatus.ACTIVE,
          deletedAt: null,
        },
        data: { status: TenantStatus.SUSPENDED },
      });
      expect(outboxPublishMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'super-admin.tenant.suspended' }),
        txClient,
      );
      expect(platformAuditCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'super-admin.tenant.suspended',
          resourceType: 'TENANT',
          resourceId: 'tenant-1',
          targetTenantId: 'tenant-1',
        }),
        txClient,
      );
      expect(result).toMatchObject({ status: 'SUSPENDED' });
    });

    it('rejects suspension when the tenant is already suspended', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.SUSPENDED,
        deletedAt: null,
      });

      await expect(service.suspendTenant(actor, 'tenant-1')).rejects.toThrow(
        ConflictException,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  describe('deactivateTenant', () => {
    it('should set deletedAt to now', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      });
      outboxPublishMock.mockResolvedValue(undefined);
      const result = await service.deactivateTenant(actor, 'tenant-1');

      expect(tenantUpdateManyMock).toHaveBeenCalledTimes(1);
      const calls = tenantUpdateManyMock.mock.calls as unknown as Array<{
        0: {
          where: { id: string; deletedAt: null };
          data: { deletedAt: Date; status: TenantStatus };
        };
      }>;
      const update = calls[0][0];
      expect(update.where).toEqual({
        id: 'tenant-1',
        status: { in: [TenantStatus.ACTIVE, TenantStatus.SUSPENDED] },
        deletedAt: null,
      });
      expect(update.data.status).toBe(TenantStatus.DEACTIVATED);
      expect(update.data.deletedAt).toBeInstanceOf(Date);
      expect(result).toMatchObject({ status: 'DEACTIVATED' });
    });
  });

  describe('restoreTenant', () => {
    it('should clear deletedAt', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.DEACTIVATED,
        deletedAt: new Date(),
      });
      outboxPublishMock.mockResolvedValue(undefined);

      const result = await service.restoreTenant(actor, 'tenant-1');

      expect(tenantUpdateManyMock).toHaveBeenCalledWith({
        where: {
          id: 'tenant-1',
          status: TenantStatus.DEACTIVATED,
          deletedAt: { not: null },
        },
        data: { status: TenantStatus.ACTIVE, deletedAt: null },
      });
      expect(result).toMatchObject({ status: 'ACTIVE' });
    });

    it('rejects restore for an active tenant', async () => {
      findTenantByIdMock.mockResolvedValue({
        id: 'tenant-1',
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      });

      await expect(service.restoreTenant(actor, 'tenant-1')).rejects.toThrow(
        ConflictException,
      );
      expect(transactionMock).not.toHaveBeenCalled();
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
      subscriptionUpdateManyMock.mockResolvedValue({ count: 1 });

      const result = await service.changeTenantPlan(
        actor,
        'tenant-1',
        'plan-2',
      );

      expect(subscriptionUpdateManyMock).toHaveBeenCalledWith({
        where: { id: 'sub-1', planId: 'plan-1' },
        data: { planId: 'plan-2' },
      });
      expect(platformAuditCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actor,
          action: 'super-admin.plan.changed',
          resourceType: 'SUBSCRIPTION',
          resourceId: 'sub-1',
          targetTenantId: 'tenant-1',
        }),
        expect.any(Object),
      );
      expect(result).toMatchObject({ newPlanId: 'plan-2' });
    });

    it('should throw NotFoundException when no subscription', async () => {
      findSubscriptionByTenantIdMock.mockResolvedValue(null);

      await expect(
        service.changeTenantPlan(actor, 'tenant-1', 'plan-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('subscription reads', () => {
    const subscription = {
      id: 'sub-1',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      status: 'ACTIVE',
      startedAt: new Date('2026-01-01'),
      endedAt: null,
      plan: {
        id: 'plan-1',
        type: 'BUSINESS',
        name: 'Business',
        priceCents: 49900,
      },
      tenant: { id: 'tenant-1', name: 'Tenant 1' },
    };

    it('returns an explicit safe platform subscription shape', async () => {
      findAllSubscriptionsMock.mockResolvedValue([subscription]);

      const result = await service.listSubscriptions();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'sub-1',
        tenantId: 'tenant-1',
        planType: 'BUSINESS',
        priceCents: 49900,
        tenant: { id: 'tenant-1', name: 'Tenant 1' },
        plan: { name: 'Business' },
      });
    });

    it('throws when the platform subscription is missing', async () => {
      findSubscriptionByIdMock.mockResolvedValue(null);

      await expect(service.getSubscription('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('invoice reads', () => {
    const invoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      invoiceNumber: 'INV-202609-000001',
      amountCents: 49900,
      currency: 'IDR',
      status: 'PENDING',
      dueAt: new Date('2026-09-30'),
      paidAt: null,
      createdAt: new Date('2026-09-01'),
      tenant: { id: 'tenant-1', name: 'Tenant 1' },
    };

    it('returns an explicit safe platform invoice shape', async () => {
      findAllInvoicesMock.mockResolvedValue([invoice]);

      const result = await service.listInvoices();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'invoice-1',
        tenantId: 'tenant-1',
        subscriptionId: 'sub-1',
        invoiceNumber: 'INV-202609-000001',
        amountCents: 49900,
        currency: 'IDR',
        tenant: { id: 'tenant-1', name: 'Tenant 1' },
      });
    });

    it('throws when the platform invoice is missing', async () => {
      findInvoiceByIdMock.mockResolvedValue(null);

      await expect(service.getInvoice('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
