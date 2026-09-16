import { BadRequestException } from '@nestjs/common';

import { requestContext } from '../../core/request-context/request-context';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

describe('StorageController', () => {
  const generateSignedUrl = jest.fn();
  const storage = {
    generateSignedUrl,
    download: jest.fn(),
    delete: jest.fn(),
  } as unknown as StorageService;
  const controller = new StorageController(storage);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects access to another tenant storage path', async () => {
    await requestContext.run({ tenantId: 'tenant-a' }, async () => {
      await expect(
        controller.signedUrl('permanent/tenant-tenant-b/products/file.txt'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    expect(generateSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects tenant-only access to an outlet path', async () => {
    await requestContext.run({ tenantId: 'tenant-a' }, async () => {
      await expect(
        controller.signedUrl(
          'permanent/tenant-tenant-a/outlet-outlet-b/products/file.txt',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    expect(generateSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects an outlet user accessing a different outlet path', async () => {
    await requestContext.run(
      { tenantId: 'tenant-a', outletId: 'outlet-a' },
      async () => {
        await expect(
          controller.signedUrl(
            'permanent/tenant-tenant-a/outlet-outlet-b/products/file.txt',
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );
    expect(generateSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects traversal and malformed storage ids before provider access', async () => {
    await requestContext.run({ tenantId: 'tenant-a' }, async () => {
      await expect(
        controller.signedUrl('permanent/tenant-tenant-a/../tenant-b/file.txt'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    expect(generateSignedUrl).not.toHaveBeenCalled();
  });
});
