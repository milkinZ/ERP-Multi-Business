# Recipes Gap Register

Verified against the current `apps/api` Recipes, Products, Ingredients, Inventory, Orders, Prisma, and RBAC implementation.

## Backend Contract Gaps

- No `GET /recipes` list endpoint exists. Recipes are only retrieved by product.
- No recipe-by-ID endpoint exists; the supported read route is `GET /recipes/:productId`.
- Recipe update is not exposed.
- Recipe delete is not exposed.
- Recipe item-level mutation is not exposed.
- Recipe usage by ingredient is not exposed.
- Recipe search, filtering, sorting, pagination, duplication, versioning, costing, publishing, and realtime events are not exposed.
- The Recipes API does not expose business-type capability metadata or enforce a business-type restriction at the controller/service layer.

## Frontend Gaps

- The workspace is product-driven because the backend has no recipe list endpoint.
- Existing recipes must be inspected by selecting a product; the UI cannot render a complete recipe catalog without issuing unsupported or inefficient fabricated queries.
- Existing recipes are read-only because no update or delete contract exists.

## Test Infrastructure Gap

- No frontend test runner or existing Recipes frontend test suite was found in `apps/web`.

## Realtime Infrastructure Gap

- No verified Recipe-specific realtime event or shared frontend subscription contract exists.
