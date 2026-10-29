# Recipes Gap Register

Verified against the current `apps/api` Recipes, Products, Ingredients, Inventory, Orders, Prisma, and RBAC implementation.

## Backend Contract Gaps

- `GET /recipes?page=&limit=&search=` with `recipe.read` returns a tenant-scoped, bounded recipe catalog searchable by product name or SKU, with product metadata and ingredient counts. Recipe composition is still retrieved by product.
- `GET /recipes/by-ingredient/:ingredientId?page=&limit=` with `recipe.read` returns tenant-scoped recipe lines using an ingredient with product summaries.
- No recipe-by-ID endpoint exists; the supported read route is `GET /recipes/:productId`.
- Recipe update is not exposed.
- Recipe delete is not exposed.
- Recipe item-level mutation is not exposed.
- Recipe usage by ingredient is exposed with bounded pagination.
- Recipe filtering, sorting, duplication, versioning, costing, publishing, and realtime events are not exposed. Catalog search and pagination are supported.
- The Recipes API does not expose business-type capability metadata or enforce a business-type restriction at the controller/service layer.

## Frontend Gaps

- The workspace provides a searchable, paginated recipe catalog. Recipe composition is inspected by selecting a product from the catalog or product selector.
- Existing recipes are read-only because no update or delete contract exists.

## Test Infrastructure Gap

- No frontend test runner or existing Recipes frontend test suite was found in `apps/web`.

## Realtime Infrastructure Gap

- No verified Recipe-specific realtime event or shared frontend subscription contract exists.
