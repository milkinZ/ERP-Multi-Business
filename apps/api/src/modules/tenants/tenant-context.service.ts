import { Injectable } from '@nestjs/common';

import { requestContext } from '../../core/request-context/request-context';

@Injectable()
export class TenantContextService {
  getTenantId(): string {
    const tenantId = requestContext.get().tenantId;
    if (!tenantId) {
      throw new Error('TENANT_CONTEXT_MISSING');
    }
    return tenantId;
  }

  getOutletId(): string | null | undefined {
    return requestContext.get().outletId;
  }

  requireTenant(): string {
    return this.getTenantId();
  }
}
