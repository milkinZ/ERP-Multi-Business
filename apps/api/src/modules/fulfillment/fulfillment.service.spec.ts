import { BadRequestException } from '@nestjs/common';
import { BusinessType } from '@prisma/client';

import { InventoryRepository } from '../inventory/inventory.repository';
import { FulfillmentService } from './fulfillment.service';

describe('FulfillmentService', () => {
  const resolveTenantBusinessType = jest.fn();
  const fulfillRetail = jest.fn();
  const fulfillCafe = jest.fn();
  const repository = {
    resolveTenantBusinessType,
    fulfillRetail,
    fulfillCafe,
  } as unknown as InventoryRepository;
  let service: FulfillmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FulfillmentService(repository);
  });

  it('routes retail fulfillment using trusted tenant context', async () => {
    resolveTenantBusinessType.mockResolvedValue(BusinessType.RETAIL);
    fulfillRetail.mockResolvedValue(true);

    await expect(service.processOrder('order-a', 'tenant-a')).resolves.toBe(
      true,
    );
    expect(fulfillRetail).toHaveBeenCalledWith('order-a', 'tenant-a');
    expect(fulfillCafe).not.toHaveBeenCalled();
  });

  it('routes cafe fulfillment and does not use retail behavior', async () => {
    resolveTenantBusinessType.mockResolvedValue(BusinessType.CAFE);
    fulfillCafe.mockResolvedValue(true);

    await expect(service.processOrder('order-a', 'tenant-a')).resolves.toBe(
      true,
    );
    expect(fulfillCafe).toHaveBeenCalledWith('order-a', 'tenant-a');
    expect(fulfillRetail).not.toHaveBeenCalled();
  });

  it('rejects unsupported business types without fulfillment side effects', async () => {
    resolveTenantBusinessType.mockResolvedValue(BusinessType.GYM);

    await expect(service.processOrder('order-a', 'tenant-a')).rejects.toThrow(
      new BadRequestException('Unsupported business type: GYM'),
    );
    expect(fulfillRetail).not.toHaveBeenCalled();
    expect(fulfillCafe).not.toHaveBeenCalled();
  });

  it('propagates repository failure without masking tenant-scoped operation', async () => {
    resolveTenantBusinessType.mockResolvedValue(BusinessType.RETAIL);
    fulfillRetail.mockRejectedValue(
      new BadRequestException('Insufficient stock'),
    );

    await expect(service.processOrder('order-a', 'tenant-a')).rejects.toThrow(
      'Insufficient stock',
    );
    expect(fulfillRetail).toHaveBeenCalledWith('order-a', 'tenant-a');
  });
});
