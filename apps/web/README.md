# Frontend architecture

`apps/web` keeps two explicit application surfaces:

- `/platform/*` is the platform control plane. Its layout and navigation are isolated under `app/(platform)/platform` and it uses confirmed `/super-admin/*` and `/health/*` backend contracts only.
- `/app/*` is the tenant ERP application. Its layout and navigation are isolated under `app/(erp)/app`; tenant identity comes from the authenticated JWT, never from a client-selected tenant id.
- `/login` is the public entry point.

## Data flow

Feature API modules under `src/features` call the typed `src/lib/api/client.ts`. TanStack Query owns server state. Zustand currently owns only the in-memory access token needed by the backend bearer-token contract. The refresh and CSRF cookies remain browser-managed by the API; no private credentials are exposed through `NEXT_PUBLIC_*` variables.

The API response wrapper is normalized centrally. Pages show loading, empty, authorization, and error states. Domains without a confirmed API contract render an explicit unavailable shell rather than fake records or invented requests.

## Authorization and tenancy

`src/lib/permissions` is a UX helper only. Backend JWT guards, permission guards, and tenant context remain authoritative. Platform authorization is distinct from tenant permissions; rendering a platform route does not grant access.

## Validation

```text
npm run check-types --workspace web
npm run lint --workspace web
npm run build --workspace web
```

Feature tests can be added around API modules and meaningful components without introducing a second test framework.
