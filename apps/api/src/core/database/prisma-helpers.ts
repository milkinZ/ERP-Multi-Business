import { requestContext } from '../request-context/request-context';

export function getTenantContext() {
  const ctx = requestContext.get();

  if (!ctx?.tenantId) {
    throw new Error('TENANT_CONTEXT_MISSING');
  }

  return {
    tenantId: ctx.tenantId,
    outletId: ctx.outletId ?? null,
  };
}
