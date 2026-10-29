import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { PlatformAuditLogService } from '../audit-logs/platform-audit-log.service';
import type { SuperAdminActor } from './super-admin.service';

const PLATFORM_SETTINGS = {
  platformName: {
    label: 'Platform name',
    defaultValue: 'ERP Multi Business',
  },
  supportEmail: { label: 'Support email', defaultValue: '' },
  supportUrl: { label: 'Support URL', defaultValue: '' },
  defaultTimezone: { label: 'Default timezone', defaultValue: 'Asia/Jakarta' },
  defaultCurrency: { label: 'Default display currency', defaultValue: 'IDR' },
} as const;

type PlatformSettingKey = keyof typeof PLATFORM_SETTINGS;

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAuditLog: PlatformAuditLogService,
  ) {}

  async list() {
    const records = await this.prisma.platformSetting.findMany({
      orderBy: { key: 'asc' },
    });
    const byKey = new Map(records.map((record) => [record.key, record]));

    return Object.entries(PLATFORM_SETTINGS).map(([key, definition]) => {
      const record = byKey.get(key);
      return {
        key,
        label: definition.label,
        value: record?.value ?? definition.defaultValue,
        version: record?.version ?? 0,
        updatedAt: record?.updatedAt ?? null,
      };
    });
  }

  async update(
    actor: SuperAdminActor,
    key: string,
    value: string,
    expectedVersion: number,
  ) {
    if (!this.isSettingKey(key)) {
      throw new BadRequestException('Unsupported platform setting');
    }
    const normalizedValue = value.trim();
    this.validateValue(key, normalizedValue);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.platformSetting.findUnique({ where: { key } });
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== expectedVersion) {
        throw new ConflictException(
          'Platform setting changed; reload before updating',
        );
      }

      const nextVersion = currentVersion + 1;
      if (current) {
        const updated = await tx.platformSetting.updateMany({
          where: { key, version: currentVersion },
          data: { value: normalizedValue, version: nextVersion },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Platform setting changed; reload before updating',
          );
        }
      } else {
        const created = await tx.platformSetting.createMany({
          data: [{ key, value: normalizedValue, version: nextVersion }],
          skipDuplicates: true,
        });
        if (created.count !== 1) {
          throw new ConflictException(
            'Platform setting changed; reload before updating',
          );
        }
      }

      await this.platformAuditLog.create(
        {
          actor,
          action: 'super-admin.platform-setting.updated',
          resourceType: 'PLATFORM_SETTING',
          resourceId: key,
          metadata: {
            settingKey: key,
            previousVersion: currentVersion,
            newVersion: nextVersion,
          },
        },
        tx,
      );

      return {
        key,
        label: PLATFORM_SETTINGS[key].label,
        value: normalizedValue,
        version: nextVersion,
      };
    });
  }

  private isSettingKey(key: string): key is PlatformSettingKey {
    return Object.hasOwn(PLATFORM_SETTINGS, key);
  }

  private validateValue(key: PlatformSettingKey, value: string): void {
    const normalized = value.trim();
    if (
      key === 'platformName' &&
      (normalized.length === 0 || normalized.length > 100)
    ) {
      throw new BadRequestException(
        'Platform name must contain between 1 and 100 characters',
      );
    }

    if (key === 'supportEmail' && normalized) {
      if (
        normalized.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
      ) {
        throw new BadRequestException('Support email is invalid');
      }
    }

    if (key === 'supportUrl' && normalized) {
      let url: URL;
      try {
        url = new URL(normalized);
      } catch {
        throw new BadRequestException('Support URL must be a valid HTTPS URL');
      }
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new BadRequestException('Support URL must use HTTPS');
      }
    }

    if (key === 'defaultTimezone') {
      try {
        new Intl.DateTimeFormat('en', { timeZone: normalized });
      } catch {
        throw new BadRequestException('Default timezone is invalid');
      }
    }

    if (
      key === 'defaultCurrency' &&
      !['IDR', 'USD', 'SGD', 'MYR', 'PHP', 'THB', 'VND'].includes(normalized)
    ) {
      throw new BadRequestException('Default display currency is unsupported');
    }
  }
}
