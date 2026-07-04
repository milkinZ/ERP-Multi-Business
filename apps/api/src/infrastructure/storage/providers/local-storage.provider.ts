import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  StorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
  StorageDownloadResult,
} from './storage.provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseDir: string;
  private readonly baseDirResolved: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseDir =
      this.configService.get<string>('STORAGE_LOCAL_PATH') || './uploads';
    this.baseDirResolved = path.resolve(this.baseDir);
    this.baseUrl =
      this.configService.get<string>('STORAGE_LOCAL_URL') ||
      'http://localhost:3000/uploads';
  }

  private sanitizeSegment(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private resolvePath(inputPath: string): string {
    const normalized = inputPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const targetPath = path.resolve(this.baseDirResolved, normalized);
    if (
      targetPath !== this.baseDirResolved &&
      !targetPath.startsWith(this.baseDirResolved + path.sep)
    ) {
      throw new Error('Invalid path');
    }
    return targetPath;
  }

  async upload(options: StorageUploadOptions): Promise<StorageUploadResult> {
    try {
      const folder =
        options.folder?.replace(/\\/g, '/').replace(/^\/+/, '') || 'general';
      const folderSegments = folder
        .split('/')
        .filter(Boolean)
        .map((s) => this.sanitizeSegment(s));

      const normalized = options.filename
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
      if (normalized.includes('..')) {
        throw new Error('Invalid filename');
      }

      const filenameSegments = normalized
        .split('/')
        .filter(Boolean)
        .map((s) => this.sanitizeSegment(s));

      const relativePath = [...folderSegments, ...filenameSegments].join('/');
      const fullPath = this.resolvePath(relativePath);

      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      let finalPath = fullPath;
      if (await this.exists(relativePath)) {
        const timestamp = Date.now();
        const ext = path.extname(fullPath);
        const base = path.basename(fullPath, ext);
        finalPath = path.join(
          path.dirname(fullPath),
          `${base}-${timestamp}${ext}`,
        );
      }

      await fs.writeFile(finalPath, options.buffer);

      const stats = await fs.stat(finalPath);
      const storedRelative = path
        .relative(this.baseDirResolved, finalPath)
        .replace(/\\/g, '/');

      return {
        id: storedRelative,
        path: storedRelative,
        filename: path.basename(finalPath),
        originalName: options.originalName,
        mimeType: options.contentType,
        size: stats.size,
        provider: 'local',
        tenantId: options.tenantId,
        outletId: options.outletId,
        createdAt: stats.birthtime
          ? stats.birthtime.toISOString()
          : new Date().toISOString(),
        publicUrl: `${this.baseUrl}/${storedRelative}`,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error}`, error);
      throw error;
    }
  }

  async download(filePath: string): Promise<StorageDownloadResult> {
    try {
      const fullPath = this.resolvePath(filePath);
      const buffer = await fs.readFile(fullPath);
      const stats = await fs.stat(fullPath);

      return {
        buffer,
        size: stats.size,
      };
    } catch (error) {
      this.logger.error(`Failed to download file: ${error}`, error);
      throw error;
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      const fullPath = this.resolvePath(filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error}`, error);
      throw error;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  getUrl(filePath: string): string {
    return `${this.baseUrl}/${filePath.replace(/\\/g, '/')}`;
  }

  async listFiles(folder: string): Promise<StorageUploadResult[]> {
    try {
      const folderPath = this.resolvePath(folder);
      const files = await fs.readdir(folderPath);

      const results: StorageUploadResult[] = [];

      for (const file of files) {
        const filePath = path.join(folderPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          const relativePath = path
            .relative(this.baseDirResolved, filePath)
            .replace(/\\/g, '/');
          results.push({
            id: relativePath,
            path: relativePath,
            filename: file,
            mimeType: undefined,
            size: stats.size,
            provider: 'local',
            createdAt: (stats.birthtime || stats.mtime).toISOString(),
            publicUrl: this.getUrl(relativePath),
          });
        }
      }

      return results;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      this.logger.error(`Failed to list files: ${error}`, error);
      throw error;
    }
  }
}
