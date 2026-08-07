import { ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessType } from '@prisma/client';

import { BusinessRegistryService } from './business-registry.service';
import { BusinessRegistryRepository } from './business-registry.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import {
  BusinessRegistryAggregate,
  BusinessStatus,
} from './domain/business-registry.aggregate';

describe('BusinessRegistryService', () => {
  const tenantId = 'tenant-1';

  const findByIdMock = jest.fn();
  const findAllMock = jest.fn();
  const saveMock = jest.fn();

  const repository = {
    findById: findByIdMock,
    findAll: findAllMock,
    save: saveMock,
  } as unknown as BusinessRegistryRepository;

  const requireTenantMock = jest.fn().mockReturnValue(tenantId);

  const tenantContext = {
    requireTenant: requireTenantMock,
  } as unknown as TenantContextService;

  let service: BusinessRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    requireTenantMock.mockReturnValue(tenantId);
    service = new BusinessRegistryService(repository, tenantContext);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should delegate to repository with tenant context', async () => {
      findAllMock.mockResolvedValue({
        data: [],
        total: 0,
      });

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(requireTenantMock).toHaveBeenCalled();
      expect(findAllMock).toHaveBeenCalledWith(tenantId, {
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return aggregate JSON when found', async () => {
      const aggregate = BusinessRegistryAggregate.reconstitute({
        id: tenantId,
        tenantId,
        name: 'My Cafe',
        businessType: 'CAFE',
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      });
      findByIdMock.mockResolvedValue(aggregate);

      const result = await service.findById(tenantId);

      expect(result).toMatchObject({ id: tenantId, name: 'My Cafe' });
    });

    it('should throw NotFoundException when not found', async () => {
      findByIdMock.mockResolvedValue(null);

      await expect(service.findById('other')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a business registry when none exists', async () => {
      findByIdMock.mockResolvedValue(null);
      saveMock.mockResolvedValue(undefined);

      const result = await service.create({
        name: 'My Cafe',
        businessType: BusinessType.CAFE,
      });

      expect(saveMock).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: tenantId,
        tenantId,
        businessType: 'CAFE',
      });
    });

    it('should throw ConflictException when already exists', async () => {
      const aggregate = BusinessRegistryAggregate.reconstitute({
        id: tenantId,
        tenantId,
        name: 'My Cafe',
        businessType: 'CAFE',
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      });
      findByIdMock.mockResolvedValue(aggregate);

      await expect(
        service.create({
          name: 'My Cafe',
          businessType: BusinessType.CAFE,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update name and persist', async () => {
      const aggregate = BusinessRegistryAggregate.reconstitute({
        id: tenantId,
        tenantId,
        name: 'My Cafe',
        businessType: 'CAFE',
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      });
      findByIdMock.mockResolvedValue(aggregate);
      saveMock.mockResolvedValue(undefined);

      const result = await service.update(tenantId, { name: 'Updated Cafe' });

      expect(saveMock).toHaveBeenCalled();
      expect(result).toMatchObject({ name: 'Updated Cafe' });
    });
  });

  describe('activate', () => {
    it('should activate and persist', async () => {
      const suspended = BusinessRegistryAggregate.reconstitute({
        id: tenantId,
        tenantId,
        name: 'My Cafe',
        businessType: 'CAFE',
        status: BusinessStatus.SUSPENDED,
        deletedAt: null,
      });
      findByIdMock.mockResolvedValue(suspended);
      saveMock.mockResolvedValue(undefined);

      const result = await service.activate(tenantId);

      expect(saveMock).toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'ACTIVE' });
    });
  });

  describe('suspend', () => {
    it('should suspend and persist', async () => {
      const aggregate = BusinessRegistryAggregate.reconstitute({
        id: tenantId,
        tenantId,
        name: 'My Cafe',
        businessType: 'CAFE',
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      });
      findByIdMock.mockResolvedValue(aggregate);
      saveMock.mockResolvedValue(undefined);

      const result = await service.suspend(tenantId, 'Fraud');

      expect(saveMock).toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'SUSPENDED' });
    });
  });

  describe('archive', () => {
    it('should archive and persist', async () => {
      const aggregate = BusinessRegistryAggregate.reconstitute({
        id: tenantId,
        tenantId,
        name: 'My Cafe',
        businessType: 'CAFE',
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      });
      findByIdMock.mockResolvedValue(aggregate);
      saveMock.mockResolvedValue(undefined);

      const result = await service.archive(tenantId);

      expect(saveMock).toHaveBeenCalled();
      expect(result.deletedAt).not.toBeNull();
      expect(result.status).toBe('ARCHIVED');
    });
  });

  describe('restore', () => {
    it('should restore and persist', async () => {
      const archived = BusinessRegistryAggregate.reconstitute({
        id: tenantId,
        tenantId,
        name: 'My Cafe',
        businessType: 'CAFE',
        status: BusinessStatus.ARCHIVED,
        deletedAt: new Date(),
      });
      findByIdMock.mockResolvedValue(archived);
      saveMock.mockResolvedValue(undefined);

      const result = await service.restore(tenantId);

      expect(saveMock).toHaveBeenCalled();
      expect(result.deletedAt).toBeNull();
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('changeBusinessType', () => {
    it('should change business type and persist', async () => {
      const aggregate = BusinessRegistryAggregate.reconstitute({
        id: tenantId,
        tenantId,
        name: 'My Cafe',
        businessType: 'CAFE',
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      });
      findByIdMock.mockResolvedValue(aggregate);
      saveMock.mockResolvedValue(undefined);

      const result = await service.changeBusinessType(
        tenantId,
        BusinessType.RETAIL,
      );

      expect(saveMock).toHaveBeenCalled();
      expect(result).toMatchObject({ businessType: 'RETAIL' });
    });
  });
});
