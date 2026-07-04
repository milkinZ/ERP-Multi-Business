import { PrismaService } from '../prisma.service';
import { getTenantContext } from '../prisma-helpers';

export abstract class BaseRepository {
  constructor(protected readonly prisma: PrismaService) {}

  protected tenantWhere(where: Record<string, any> = {}) {
    const { tenantId } = getTenantContext();

    return {
      ...where,
      tenantId,
    };
  }

  protected outletWhere(where: Record<string, any> = {}) {
    const { tenantId, outletId } = getTenantContext();

    return {
      ...where,
      tenantId,
      outletId,
    };
  }

  protected buildTenantFilter(where: Record<string, any> | string = {}) {
    if (typeof where === 'string') {
      return this.tenantWhere({ tenantId: where });
    }

    return this.tenantWhere(where);
  }

  protected buildOutletFilter(where: Record<string, any> = {}) {
    return this.outletWhere(where);
  }
}
