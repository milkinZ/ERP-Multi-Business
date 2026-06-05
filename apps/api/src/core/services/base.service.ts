import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface IAuditableEntity {
  id: string;
  tenantId: string;
  createdById?: string | null;
  createdAt: Date;
  updatedById?: string | null;
  updatedAt: Date;
  deletedById?: string | null;
  deletedAt?: Date | null;
}

/**
 * Base service providing common functionality for all modules:
 * - Soft delete support
 * - Audit trail (createdBy, updatedBy, deletedBy)
 * - Multi-tenant isolation
 * - Pagination helpers
 */
@Injectable()
export class BaseService {
  constructor(protected prisma: PrismaService) {}

  /**
   * Apply tenant filter to any where clause
   */
  protected withTenantFilter<T extends { tenantId?: string }>(
    where: T,
    tenantId: string,
  ): T {
    return {
      ...where,
      tenantId,
    };
  }

  /**
   * Apply soft delete filter (exclude deleted records by default)
   */
  protected withoutDeleted<T extends { deletedAt?: any }>(
    where: T,
    includeDeleted: boolean = false,
  ): T {
    if (includeDeleted) {
      return where;
    }
    return {
      ...where,
      deletedAt: null,
    };
  }

  /**
   * Standardized pagination parameters
   */
  protected getPaginationParams(skip?: number, take?: number) {
    const DEFAULT_SKIP = 0;
    const DEFAULT_TAKE = 10;
    const MAX_TAKE = 100;

    return {
      skip: Math.max(0, skip ?? DEFAULT_SKIP),
      take: Math.min(take ?? DEFAULT_TAKE, MAX_TAKE),
    };
  }

  /**
   * Format paginated response
   */
  protected formatPaginatedResponse<T>(
    data: T[],
    total: number,
    skip: number,
    take: number,
  ) {
    return {
      data,
      pagination: {
        total,
        skip,
        take,
        pages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Soft delete - mark record as deleted
   */
  protected async softDelete(model: any, where: any, userId: string) {
    return model.update({
      where,
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });
  }

  /**
   * Soft restore - unmark deleted record
   */
  protected async softRestore(model: any, where: any) {
    return model.update({
      where,
      data: {
        deletedAt: null,
        deletedById: null,
      },
    });
  }

  /**
   * Add audit fields to create data
   */
  protected addAuditFields(data: any, userId: string) {
    return {
      ...data,
      createdById: userId,
      updatedById: userId,
    };
  }

  /**
   * Add audit fields to update data
   */
  protected addUpdateAuditFields(data: any, userId: string) {
    return {
      ...data,
      updatedById: userId,
      updatedAt: new Date(),
    };
  }
}
