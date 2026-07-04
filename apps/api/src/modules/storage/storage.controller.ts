import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';

import {
  UploadMultipleBodyDto,
  UploadSingleBodyDto,
} from './dto/upload-storage.dto';
import { StorageUploadService } from './storage-upload.service';

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageUploadService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadSingle(
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string },
    @Body() body: { category: string; permanent: string },
  ) {
    const dto = plainToInstance(UploadSingleBodyDto, body);
    await validateOrReject(dto);

    const permanent = dto.permanent === 'true';

    return this.storage.uploadSingle({
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      category: dto.category,
      permanent,
    });
  }

  @Post('upload/multiple')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadMultiple(
    @UploadedFiles()
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
    @Body() body: { category: string; permanent: string },
  ) {
    const dto = plainToInstance(UploadMultipleBodyDto, body);
    await validateOrReject(dto);

    const permanent = dto.permanent === 'true';
    return this.storage.uploadMultiple({
      files,

      category: dto.category,
      permanent,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.storage.get({ id });
  }

  @Get('signed-url/:id')
  async signedUrl(@Param('id') id: string) {
    return this.storage.getSignedUrl({ id });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.storage.delete({ id });
    return { success: true, message: 'Deleted', data: {} };
  }
}
