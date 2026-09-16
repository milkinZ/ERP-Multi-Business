import { BadRequestException } from '@nestjs/common';

import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';

describe('AuditLogController', () => {
  const listAuditLogs = jest.fn();
  const getAuditLog = jest.fn();
  const getAuditLogsByEntity = jest.fn();
  const auditLogService = {
    listAuditLogs,
    getAuditLog,
    getAuditLogsByEntity,
  } as unknown as AuditLogService;
  const controller = new AuditLogController(auditLogService);

  beforeEach(() => jest.clearAllMocks());

  it('uses the authenticated tenant and outlet for list queries', async () => {
    listAuditLogs.mockResolvedValue({
      data: [{ id: 'audit-a' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    await expect(
      controller.listAuditLogs({ page: 1 }, {
        tenantId: 'tenant-a',
        outletId: 'outlet-a',
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({ success: true, data: [{ id: 'audit-a' }] }),
    );
    expect(listAuditLogs).toHaveBeenCalledWith(
      'tenant-a',
      { page: 1 },
      'outlet-a',
    );
  });

  it('does not expose a record missing from the authenticated tenant scope', async () => {
    getAuditLog.mockResolvedValue(null);

    await expect(
      controller.getAuditLog('audit-b', { tenantId: 'tenant-a' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getAuditLog).toHaveBeenCalledWith('audit-b', 'tenant-a');
  });

  it('passes tenant and entity scope to entity-history queries', async () => {
    getAuditLogsByEntity.mockResolvedValue([]);

    await expect(
      controller.getAuditLogsByEntity('Order', 'order-a', {
        tenantId: 'tenant-a',
        outletId: 'outlet-a',
      } as never),
    ).resolves.toEqual(expect.objectContaining({ data: [] }));
    expect(getAuditLogsByEntity).toHaveBeenCalledWith(
      'tenant-a',
      'Order',
      'order-a',
      'outlet-a',
    );
  });
});
