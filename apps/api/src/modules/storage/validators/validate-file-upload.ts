import { BadRequestException } from '@nestjs/common';

type Params = {
  filename: string;
  mimetype: string;
  buffer: Buffer;
};

const MAX_BYTES_DEFAULT = 10 * 1024 * 1024; // 10MB

const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.php',
  '.pl',
  '.py',
  '.rb',
  '.jar',
  '.ws',
  '.ps1',
  '.vbs',
  '.msi',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.pdf',
  '.csv',
  '.txt',
]);

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'text/',
  'application/vnd.ms-excel',
  'text/csv',
];

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.slice(idx).toLowerCase();
}

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.+/g, '.');
  return cleaned;
}

export function validateFileUpload(params: Params): { safeFilename: string } {
  const { filename, mimetype, buffer } = params;

  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Empty file');
  }

  if (buffer.length > MAX_BYTES_DEFAULT) {
    throw new BadRequestException('File too large');
  }

  if (!filename) throw new BadRequestException('filename missing');

  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    throw new BadRequestException('Invalid filename');
  }

  const safeFilename = sanitizeFilename(filename);

  if (!safeFilename || safeFilename.startsWith('.')) {
    throw new BadRequestException('Dangerous filename');
  }

  const ext = getExtension(safeFilename);

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    throw new BadRequestException('Executable content not allowed');
  }

  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestException('Extension not allowed');
  }

  const mimeOk = ALLOWED_MIME_PREFIXES.some((p) => mimetype.startsWith(p));
  if (!mimeOk) {
    throw new BadRequestException('MIME type not allowed');
  }

  if (safeFilename.startsWith('.')) {
    throw new BadRequestException('Hidden files not allowed');
  }

  return { safeFilename };
}
