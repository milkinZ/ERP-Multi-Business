import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextStore = {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  tenantId?: string;
  platformIdentityId?: string;
  outletId?: string | null;
  allowPreAuthUserLookup?: boolean;
  allowPreAuthRefreshTokenLookup?: boolean;
  allowPreAuthInvitationLookup?: boolean;
  systemOperation?: 'outbox-dispatch' | 'xendit-webhook';
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
