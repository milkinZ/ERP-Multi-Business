import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextStore = {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  tenantId?: string;
  outletId?: string | null;
  /** Optional W3C traceparent header value when tracing is enabled */
  traceparent?: string;
};

const storage = new AsyncLocalStorage<RequestContextStore>();

export const requestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  get(): RequestContextStore {
    return storage.getStore() ?? {};
  },
  set(patch: Partial<RequestContextStore>) {
    const current = storage.getStore() ?? {};
    storage.enterWith({ ...current, ...patch });
  },
};
