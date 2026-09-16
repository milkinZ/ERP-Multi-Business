import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { requestContext } from '../../core/request-context/request-context';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { StorageUploadService } from './storage-upload.service';

describe('StorageUploadService', () => {
  const upload = jest.fn();
  const deleteFile = jest.fn();
  const exists = jest.fn();
  const download = jest.fn();
  const getStorageType = jest.fn(() => 'local');
  const getUrl = jest.fn((path: string) => `http://storage/${path}`);
  const storage = {
    upload,
    delete: deleteFile,
    exists,
    download,
    getStorageType,
    getUrl,
  } as unknown as StorageService;
  const config = {} as ConfigService;
  const service = new StorageUploadService(config, storage);

  beforeEach(() => {
    jest.clearAllMocks();
    upload.mockResolvedValue({
      path: 'tenant-tenant-a/products/file.txt',
      size: 3,
      publicUrl: 'http://storage/file.txt',
    });
    exists.mockResolvedValue(true);
    download.mockResolvedValue({
      buffer: Buffer.from('abc'),
      size: 3,
    });
  });

  it('requires tenant context for uploads and reads', async () => {
    await expect(
      service.uploadSingle({
        file: {
          buffer: Buffer.from('abc'),
          originalname: 'file.txt',
          mimetype: 'text/plain',
        },
        category: 'products',
        permanent: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.get({ id: 'tenant-tenant-a/products/file.txt' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow a tenant-only caller to access another outlet path', async () => {
    await requestContext.run({ tenantId: 'tenant-a' }, async () => {
      await expect(
        service.get({
          id: 'tenant-tenant-a/outlet-outlet-b/products/file.txt',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.delete({
          id: 'tenant-tenant-a/outlet-outlet-b/products/file.txt',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    expect(exists).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('uses the configured permanent folder consistently for upload and read', async () => {
    await requestContext.run({ tenantId: 'tenant-a' }, async () => {
      await service.uploadSingle({
        file: {
          buffer: Buffer.from('abc'),
          originalname: 'file.txt',
          mimetype: 'text/plain',
        },
        category: 'products',
        permanent: true,
      });
      await service.get({ id: 'tenant-tenant-a/products/file.txt' });
    });

    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'uploads',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        filename: expect.stringContaining('tenant-tenant-a/products/'),
      }),
    );
    expect(exists).toHaveBeenCalledWith(
      'uploads/tenant-tenant-a/products/file.txt',
    );
    expect(download).toHaveBeenCalledWith(
      'uploads/tenant-tenant-a/products/file.txt',
    );
  });
});
