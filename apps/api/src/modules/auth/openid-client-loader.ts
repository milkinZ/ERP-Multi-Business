import type * as openidClient from 'openid-client';

export const PLATFORM_OIDC_CLIENT = Symbol('PLATFORM_OIDC_CLIENT');
export type OpenIdClientApi = typeof openidClient;
export type OpenIdClientLoader = () => Promise<OpenIdClientApi>;

// Keep the native import expression intact for the ESM-only dependency in the CommonJS Nest build.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<OpenIdClientApi>;

export const loadOpenIdClient: OpenIdClientLoader = () => {
  return nativeImport('openid-client');
};
