import {
  CreateBucketCommand,
  DeleteBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { execFileSync } from 'node:child_process';

import { assertSafeIntegrationEnvironment } from '../../../test/integration-environment';
import { MinioStorageProvider } from './minio-storage.provider';

const bucket = 'erp-storage-test';
const endpoint = 'http://127.0.0.1:19000';
const client = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin123',
  },
});
const config = {
  get: (key: string) =>
    ({
      MINIO_BUCKET: bucket,
      MINIO_ENDPOINT: endpoint,
      MINIO_ACCESS_KEY: 'minioadmin',
      MINIO_SECRET_KEY: 'minioadmin123',
      MINIO_REGION: 'us-east-1',
    })[key],
};

describe('MinIO storage adapter integration', () => {
  let provider: MinioStorageProvider;
  let containerId: string | undefined;

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    containerId = execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-d',
        '--name',
        `erp-minio-test-${process.pid}`,
        '-p',
        '19000:9000',
        '-e',
        'MINIO_ROOT_USER=minioadmin',
        '-e',
        'MINIO_ROOT_PASSWORD=minioadmin123',
        'minio/minio',
        'server',
        '/data',
      ],
      { encoding: 'utf8' },
    ).trim();
    provider = new MinioStorageProvider(config as never);
    let lastError: unknown;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (lastError) {
      throw lastError instanceof Error
        ? lastError
        : new Error('MinIO test service did not become ready');
    }
  });

  afterAll(async () => {
    try {
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    } finally {
      client.destroy();
      if (containerId) {
        execFileSync('docker', ['stop', containerId], { stdio: 'ignore' });
      }
    }
  });

  it('uploads, downloads, checks existence, lists, and deletes a tenant-scoped object', async () => {
    const uploaded = await provider.upload({
      folder: 'permanent/tenant-tenant-a/outlet-outlet-a',
      filename: 'products/item.txt',
      originalName: 'item.txt',
      buffer: Buffer.from('minio-content'),
      contentType: 'text/plain',
      tenantId: 'tenant-a',
      outletId: 'outlet-a',
    });

    expect(uploaded.path).toBe(
      'permanent/tenant-tenant-a/outlet-outlet-a/products/item.txt',
    );
    await expect(provider.exists(uploaded.path)).resolves.toBe(true);
    await expect(provider.download(uploaded.path)).resolves.toEqual({
      buffer: Buffer.from('minio-content'),
      size: 13,
      contentType: 'text/plain',
    });
    await expect(
      provider.listFiles('permanent/tenant-tenant-a'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: uploaded.path, size: 13 }),
      ]),
    );

    await provider.delete(uploaded.path);
    await expect(provider.exists(uploaded.path)).resolves.toBe(false);
  });

  it('reports missing objects as unavailable instead of fabricating success', async () => {
    await expect(provider.exists('missing/object.txt')).resolves.toBe(false);
    await expect(provider.download('missing/object.txt')).rejects.toBeDefined();
  });
});
