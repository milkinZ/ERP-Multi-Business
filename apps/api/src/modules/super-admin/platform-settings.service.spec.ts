import { BadRequestException, ConflictException } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { PlatformAuditLogService } from '../audit-logs/platform-audit-log.service';
import { PlatformSettingsService } from './platform-settings.service';

describe('PlatformSettingsService', () => {
  const actor = { platformIdentityId: 'platform-identity-1' };
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const createMany = jest.fn();
  const updateMany = jest.fn();
  const auditCreate = jest.fn();
  const tx = {
    platformSetting: { findUnique, createMany, updateMany },
  };
  const transaction = jest.fn(
    (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const prisma = {
    platformSetting: { findMany },
    $transaction: transaction,
  } as unknown as PrismaService;
  const audit = { create: auditCreate } as unknown as PlatformAuditLogService;
  const service = new PlatformSettingsService(prisma, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    findUnique.mockResolvedValue(null);
    createMany.mockResolvedValue({ count: 1 });
    updateMany.mockResolvedValue({ count: 1 });
    auditCreate.mockResolvedValue({});
  });

  it('lists only the supported settings with safe defaults', async () => {
    const settings = await service.list();

    expect(settings.map(({ key }) => key)).toEqual([
      'platformName',
      'supportEmail',
      'supportUrl',
      'defaultTimezone',
      'defaultCurrency',
    ]);
    const defaultCurrency = settings.find(
      ({ key }) => key === 'defaultCurrency',
    );
    expect(defaultCurrency).toMatchObject({
      value: 'IDR',
      version: 0,
    });
  });

  it('validates, persists, and audits a version-zero setting atomically', async () => {
    const result = await service.update(
      actor,
      'platformName',
      'New Platform',
      0,
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [{ key: 'platformName', value: 'New Platform', version: 1 }],
      skipDuplicates: true,
    });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        action: 'super-admin.platform-setting.updated',
        resourceType: 'PLATFORM_SETTING',
        resourceId: 'platformName',
        metadata: {
          settingKey: 'platformName',
          previousVersion: 0,
          newVersion: 1,
        },
      }),
      tx,
    );
    expect(result).toMatchObject({
      key: 'platformName',
      value: 'New Platform',
      version: 1,
    });
  });

  it('uses a version-guarded update for existing settings', async () => {
    findUnique.mockResolvedValue({
      key: 'defaultTimezone',
      value: 'Asia/Jakarta',
      version: 3,
    });

    const result = await service.update(
      actor,
      'defaultTimezone',
      'Asia/Singapore',
      3,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { key: 'defaultTimezone', version: 3 },
      data: { value: 'Asia/Singapore', version: 4 },
    });
    expect(result.version).toBe(4);
  });

  it('rejects stale updates without writing or auditing', async () => {
    findUnique.mockResolvedValue({
      key: 'platformName',
      value: 'Current',
      version: 2,
    });

    await expect(
      service.update(actor, 'platformName', 'Stale', 1),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects unsupported keys and invalid values', async () => {
    await expect(
      service.update(actor, 'secretKey', 'secret', 0),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(actor, 'supportUrl', 'http://example.com', 0),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(actor, 'defaultCurrency', 'XYZ', 0),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a concurrent write lost after the initial version check', async () => {
    findUnique.mockResolvedValue({
      key: 'platformName',
      value: 'Current',
      version: 2,
    });
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(actor, 'platformName', 'Concurrent', 2),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects a concurrent first-time insert without recording a false success', async () => {
    createMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(actor, 'platformName', 'Concurrent', 0),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
