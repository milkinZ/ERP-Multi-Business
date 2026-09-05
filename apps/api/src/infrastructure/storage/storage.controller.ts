import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Param,
  Res,
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StorageService } from './storage.service';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { requestContext } from '../../core/request-context/request-context';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { UploadFileDto } from './dto/upload-file.dto';
import { validateFileUpload } from '../../modules/storage/validators/validate-file-upload';
import {
  STORAGE_DEFAULT_UPLOAD_PERMANENT_FOLDER,
  STORAGE_DEFAULT_UPLOAD_TEMP_FOLDER,
} from '../../modules/storage/storage.constants';

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Partial<UploadFileDto>,
  ) {
    if (!file) throw new BadRequestException('file required');

    const dto = plainToInstance(UploadFileDto, body);
    await validateOrReject(dto);

    const { tenantId, outletId } = requestContext.get();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    const validation = validateFileUpload({
      filename: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer || Buffer.from(''),
    });

    const category = this.sanitizeCategory(dto.category);
    const permanent = dto.permanent === 'true';
    const providerFolder = this.getProviderFolder(permanent);

    const storageId = this.buildStorageId({
      providerFolder,
      tenantId,
      outletId: outletId ?? null,
      category,
      originalFilename: validation.safeFilename,
      permanent,
      folder: dto.folder,
    });

    const result = await this.storageService.upload({
      filename: storageId,
      originalName: file.originalname,
      buffer: file.buffer || Buffer.from(''),
      contentType: file.mimetype,
      tenantId,
      outletId: outletId ?? undefined,
      folder: providerFolder,
      permanent,
    });

    const signed = await this.storageService.generateSignedUrl(result.path);
    return {
      ...result,
      id: result.path,
      signedUrl: signed ?? result.publicUrl,
    };
  }

  @Post('upload/multiple')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: Partial<UploadFileDto>,
  ) {
    if (!files || files.length === 0)
      throw new BadRequestException('files required');

    const dto = plainToInstance(UploadFileDto, body);
    await validateOrReject(dto);

    const { tenantId, outletId } = requestContext.get();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    const category = this.sanitizeCategory(dto.category);
    const permanent = dto.permanent === 'true';
    const providerFolder = this.getProviderFolder(permanent);

    const results = [] as Array<
      Awaited<ReturnType<typeof this.storageService.upload>>
    >;

    for (const file of files) {
      const validation = validateFileUpload({
        filename: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer || Buffer.from(''),
      });

      const storageId = this.buildStorageId({
        providerFolder,
        tenantId,
        outletId: outletId ?? null,
        category,
        originalFilename: validation.safeFilename,
        permanent,
        folder: dto.folder,
      });

      const res = await this.storageService.upload({
        filename: storageId,
        originalName: file.originalname,
        buffer: file.buffer || Buffer.from(''),
        contentType: file.mimetype,
        tenantId,
        outletId: outletId ?? undefined,
        folder: providerFolder,
        permanent,
      });

      const signed = await this.storageService.generateSignedUrl(res.path);
      results.push({
        ...res,
        id: res.path,
        signedUrl: signed ?? res.publicUrl,
      });
    }

    return results;
  }

  @Get('signed-url/*id')
  async signedUrl(@Param('id') id: string) {
    const { tenantId, outletId } = requestContext.get();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    this.verifyTenantPath(id, tenantId, outletId ?? null);

    const url = await this.storageService.generateSignedUrl(id);
    if (!url) throw new BadRequestException('Signed URL not available');
    return { url };
  }

  @Get('*id')
  async getFile(@Param('id') id: string, @Res() res: Response) {
    const { tenantId, outletId } = requestContext.get();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    this.verifyTenantPath(id, tenantId, outletId ?? null);

    const download = await this.storageService.download(id);
    res.setHeader('Content-Length', String(download.size));
    if (download.contentType) {
      res.setHeader('Content-Type', download.contentType);
    }
    return res.send(download.buffer);
  }

  @Delete('*id')
  async deleteFile(@Param('id') id: string) {
    const { tenantId, outletId } = requestContext.get();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    this.verifyTenantPath(id, tenantId, outletId ?? null);
    await this.storageService.delete(id);
    return { ok: true };
  }

  private sanitizeCategory(input: string): string {
    const category = (input ?? '').trim().toLowerCase();
    if (!category) throw new BadRequestException('Invalid category');
    if (
      category.includes('..') ||
      category.includes('/') ||
      category.includes('\\')
    ) {
      throw new BadRequestException('Invalid category');
    }
    return category.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private getProviderFolder(permanent: boolean): string {
    return permanent
      ? STORAGE_DEFAULT_UPLOAD_PERMANENT_FOLDER
      : STORAGE_DEFAULT_UPLOAD_TEMP_FOLDER;
  }

  private buildStorageId(params: {
    providerFolder: string;
    tenantId: string;
    outletId?: string | null;
    category: string;
    originalFilename: string;
    permanent: boolean;
    folder?: string;
  }): string {
    const outletPart = params.outletId ? `outlet-${params.outletId}/` : '';
    const extraFolder = params.folder
      ? `${this.sanitizeCategory(params.folder)}/`
      : '';
    const timestamp = Date.now();
    const ext = this.getExtension(params.originalFilename);
    const nameWithoutExt = params.originalFilename.slice(0, -ext.length);
    const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
    const idFile = `${timestamp}-${safeName}${ext}`;

    return `${params.providerFolder}/tenant-${params.tenantId}/${outletPart}${params.category}/${extraFolder}${idFile}`;
  }

  private getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    if (idx < 0) return '';
    return filename.slice(idx);
  }

  private verifyTenantPath(
    id: string,
    tenantId: string,
    outletId: string | null,
  ) {
    if (!id) throw new BadRequestException('Invalid storage id');

    const segments = id.split('/').filter(Boolean);
    if (segments.length < 3) {
      throw new BadRequestException('Invalid storage id');
    }

    const root = segments[0];
    if (
      root !== STORAGE_DEFAULT_UPLOAD_PERMANENT_FOLDER &&
      root !== STORAGE_DEFAULT_UPLOAD_TEMP_FOLDER
    ) {
      throw new BadRequestException('Invalid storage id');
    }

    const tenantSegment = segments[1];
    if (tenantSegment !== `tenant-${tenantId}`) {
      throw new BadRequestException('Invalid storage id');
    }

    if (outletId) {
      const outletSegment = segments[2];
      if (outletSegment !== `outlet-${outletId}`) {
        throw new BadRequestException('Invalid storage id');
      }
    }
  }
}
