import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { StorageService as InfrastructureStorageService } from '../../infrastructure/storage/storage.service';

import { requestContext } from '../../core/request-context/request-context';

import type {
  StorageDownloadResult,
  StorageUploadOptions,
  StorageUploadResult,
} from '../../infrastructure/storage/storage.provider.interface';

import type { StorageMetadata } from './storage.interface';

import {
  STORAGE_DEFAULT_UPLOAD_PERMANENT_FOLDER,
  STORAGE_DEFAULT_UPLOAD_TEMP_FOLDER,
} from './storage.constants';

import { validateFileUpload } from './validators/validate-file-upload';

@Injectable()
export class StorageUploadService {
  constructor(
    private readonly config: ConfigService,
    private readonly storage: InfrastructureStorageService,
  ) {}

  /**
   * Upload from memory (buffer) with tenant/outlet isolation.
   */
  async uploadSingle(params: {
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    };
    category: string; // e.g. products, avatars, purchase-orders
    permanent: boolean;
    overwrite?: boolean;
  }): Promise<StorageMetadata> {
    const ctx = requestContext.get();
    const tenantId = ctx?.tenantId;
    const outletId = (ctx?.outletId as string | undefined) ?? null;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    const { buffer, originalname, mimetype } = params.file;

    const validation = validateFileUpload({
      filename: originalname,
      mimetype,
      buffer,
    });

    const safeCategory = this.sanitizeSegment(params.category);

    const id = this.buildStorageId({
      tenantId,
      outletId,
      category: safeCategory,
      originalFilename: validation.safeFilename,
      permanent: params.permanent,
    });

    const providerFolder = this.getProviderFolder(params.permanent);

    const storageOptions: StorageUploadOptions = {
      folder: providerFolder,
      filename: id,
      buffer,
      contentType: mimetype,
    };

    const res: StorageUploadResult = await this.storage.upload(storageOptions);

    const provider = this.storage.getStorageType();

    return {
      id,
      filename: validation.safeFilename,
      mimeType: mimetype,
      size: res.size,
      provider,
      tenantId,
      outletId,
      createdAt: new Date(),
      publicUrl: res.publicUrl ?? '',
      signedUrl: res.signedUrl ?? res.publicUrl ?? '',
    };
  }

  async uploadMultiple(params: {
    files: Array<{
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    }>;
    category: string;
    permanent: boolean;
  }): Promise<StorageMetadata[]> {
    const out: StorageMetadata[] = [];
    for (const f of params.files) {
      out.push(
        await this.uploadSingle({
          file: f,
          category: params.category,
          permanent: params.permanent,
        }),
      );
    }
    return out;
  }

  async delete(params: { id: string; category?: string }): Promise<void> {
    const ctx = requestContext.get();
    const tenantId = ctx?.tenantId;
    const outletId = (ctx?.outletId as string | undefined) ?? null;

    if (!tenantId) throw new ForbiddenException('Tenant context missing');

    // Cross-tenant protection: id must start with tenant root.
    const expectedRoot = this.storageIdRoot({ tenantId, outletId });
    if (!params.id.startsWith(expectedRoot)) {
      throw new BadRequestException('Invalid storage id');
    }

    const providerFolder = this.getProviderFolder(true);

    // Local provider expects relative path without baseDir.
    // In our Local provider, path is stored as {folder}/{filename}
    const relativePath = `${providerFolder}/${params.id}`;
    await this.storage.delete(relativePath);
  }

  async get(params: { id: string }): Promise<StorageMetadata> {
    const ctx = requestContext.get();
    const tenantId = ctx?.tenantId;
    const outletId = (ctx?.outletId as string | undefined) ?? null;

    if (!tenantId) throw new ForbiddenException('Tenant context missing');

    const expectedRoot = this.storageIdRoot({ tenantId, outletId });
    if (!params.id.startsWith(expectedRoot)) {
      throw new BadRequestException('Invalid storage id');
    }

    const providerFolder = this.getProviderFolder(true);
    const relativePath = `${providerFolder}/${params.id}`;

    const exists = await this.storage.exists(relativePath);
    if (!exists) throw new BadRequestException('File not found');

    const dl: StorageDownloadResult = await this.storage.download(relativePath);

    const provider = this.storage.getStorageType();

    const filename = params.id.split('/').pop() ?? params.id;

    const url = this.storage.getUrl(relativePath);

    return {
      id: params.id,
      filename,
      size: dl.size,
      provider,
      tenantId,
      outletId,
      createdAt: new Date(),
      publicUrl: url,
      signedUrl: url,
      mimeType: undefined,
    };
  }

  async getSignedUrl(params: {
    id: string;
  }): Promise<{ signedUrl: string; publicUrl: string }> {
    const meta = await this.get(params);
    return { signedUrl: meta.signedUrl, publicUrl: meta.publicUrl };
  }

  private sanitizeSegment(input: string): string {
    const s = (input ?? '').trim().toLowerCase();
    if (!s) throw new BadRequestException('Invalid category');
    if (s.includes('..') || s.includes('/') || s.includes('\\')) {
      throw new BadRequestException('Invalid category');
    }
    return s;
  }

  private getProviderFolder(permanent: boolean): string {
    return permanent
      ? STORAGE_DEFAULT_UPLOAD_PERMANENT_FOLDER
      : STORAGE_DEFAULT_UPLOAD_TEMP_FOLDER;
  }

  private storageIdRoot(params: {
    tenantId: string;
    outletId?: string | null;
  }): string {
    const outletPart = params.outletId ? `outlet-${params.outletId}/` : '';
    return `tenant-${params.tenantId}/${outletPart}`;
  }

  private buildStorageId(params: {
    tenantId: string;
    outletId?: string | null;
    category: string;
    originalFilename: string;
    permanent: boolean;
  }): string {
    // Generate a stable id component using timestamp.
    const timestamp = Date.now();
    const ext = this.getExtension(params.originalFilename);
    const nameWithoutExt = params.originalFilename.slice(0, -ext.length);
    const safeExt = ext ? ext : '';
    const idFile = `${timestamp}-${nameWithoutExt}${safeExt}`;

    // {tenant-{id}/outlet-{id}/category/filename}
    return `${this.storageIdRoot({ tenantId: params.tenantId, outletId: params.outletId })}${params.category}/${idFile}`;
  }

  private getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    if (idx < 0) return '';
    return filename.slice(idx);
  }
}
