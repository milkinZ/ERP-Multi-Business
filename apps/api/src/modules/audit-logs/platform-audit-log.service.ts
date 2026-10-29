import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { requestContext } from '../../core/request-context/request-context';
import { PrismaService } from '../../core/database/prisma.service';
import { ListPlatformAuditLogsDto } from './dto/list-platform-audit-logs.dto';
import type { PlatformAuditLogResponse } from './dto/platform-audit-log-response.dto';

export type PlatformAuditActor = {
  platformIdentityId: string;
};

export type CreatePlatformAuditLogInput = {
  actor: PlatformAuditActor;
  action: string;
  resourceType: string;
  resourceId: string;
  targetTenantId?: string | null;
  metadata?: Prisma.InputJsonValue;
  outcome?: string;
};

@Injectable()
export class PlatformAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreatePlatformAuditLogInput,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<PlatformAuditLogResponse> {
    const context = requestContext.get();
    const record = await client.platformAuditLog.create({
      data: {
        actorPlatformIdentityId: input.actor.platformIdentityId,
        actorUserId: null,
        actorTenantId: null,
        actorType: 'PLATFORM_IDENTITY',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        targetTenantId: input.targetTenantId ?? null,
        requestId: context.requestId ?? null,
        correlationId: context.correlationId ?? null,
        outcome: input.outcome ?? 'SUCCESS',
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });

    return this.toResponse(record);
  }

  async list(dto: ListPlatformAuditLogsDto) {
    const page = dto.page;
    const limit = Math.min(dto.limit, 100);
    const where: Prisma.PlatformAuditLogWhereInput = {
      ...(dto.action ? { action: dto.action } : {}),
      ...(dto.resourceType ? { resourceType: dto.resourceType } : {}),
      ...(dto.resourceId ? { resourceId: dto.resourceId } : {}),
      ...(dto.actorUserId ? { actorUserId: dto.actorUserId } : {}),
      ...(dto.actorPlatformIdentityId
        ? { actorPlatformIdentityId: dto.actorPlatformIdentityId }
        : {}),
      ...(dto.targetTenantId ? { targetTenantId: dto.targetTenantId } : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.platformAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.platformAuditLog.count({ where }),
    ]);

    return {
      data: records.map((record) => this.toResponse(record)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string) {
    const record = await this.prisma.platformAuditLog.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Platform audit log not found');
    return this.toResponse(record);
  }

  private toResponse(record: {
    id: string;
    actorUserId: string | null;
    actorTenantId: string | null;
    actorPlatformIdentityId: string | null;
    actorType: string;
    action: string;
    resourceType: string;
    resourceId: string;
    targetTenantId: string | null;
    requestId: string | null;
    correlationId: string | null;
    metadata: Prisma.JsonValue | null;
    outcome: string;
    createdAt: Date;
  }): PlatformAuditLogResponse {
    return {
      ...record,
      metadata:
        record.metadata && typeof record.metadata === 'object'
          ? (record.metadata as Record<string, unknown>)
          : null,
    };
  }
}
