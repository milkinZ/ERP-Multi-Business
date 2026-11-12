# Recipes Gap Register

Verified against the current `apps/api` Recipes, Products, Ingredients, Inventory, Orders, Prisma, and RBAC implementation.

## Backend Contract Gaps

- `GET /recipes?page=&limit=&search=` with `recipe.read` returns a tenant-scoped, bounded recipe catalog searchable by product name or SKU, with product metadata and ingredient counts. Recipe composition is still retrieved by product.
- `GET /recipes/by-ingredient/:ingredientId?page=&limit=` with `recipe.read` returns tenant-scoped recipe lines using an ingredient with product summaries.
- No recipe-by-ID endpoint exists; the supported read route is `GET /recipes/:productId`.
- `PUT /recipes/:productId` updates composition using an expected revision; conflicting edits are rejected, and ingredient/product tenancy and active state are validated in the transaction.
- `DELETE /recipes/:productId` archives the recipe without deleting composition/history; `POST /recipes/:productId/restore` restores it. Lifecycle and composition mutations are audited.
- Recipe quantity supports positive values up to six decimal places. Ingredient unit changes update active recipe quantities transactionally; released order snapshots remain independent of current recipe edits.
- Product stock policy is explicit: `RECIPE` menus require an active, non-empty recipe of active tenant-owned ingredients; cafe products may instead track finished goods or be explicitly untracked. Creating a recipe sets its product to `RECIPE`.
- Recipe lines may use a unit different from the ingredient's stock unit when a valid standard, tenant, or ingredient conversion exists. Order reservation snapshots preserve recipe quantities and both units; ingredient unit conversions update open snapshots transactionally.
- Recipe usage by ingredient is exposed with bounded pagination.
- Recipe filtering, sorting, duplication, costing, publishing, and realtime events are not exposed. Catalog search and pagination are supported.
- Recipe reads and mutations are restricted to CAFE tenants.

## Frontend Gaps

- The workspace provides a searchable, paginated recipe catalog. Recipe composition is inspected by selecting a product from the catalog or product selector.
- The workspace supports composition edits, archive/restore, archived filtering, and optimistic revision conflict handling.
- Recipe composition accepts an optional recipe unit, and the Product workspace shows stock policy and recipe readiness with a link to recipe setup.

## Test Infrastructure Gap

- The shared web Vitest runner covers product stock-policy and recipe-unit schema validation; dedicated recipe component interaction tests are not present.
- Focused API tests cover missing recipes, captured recipe quantities/units, invalid unit conversions, product stock-mode defaults, and no opening balance on product creation. PostgreSQL transaction/concurrency coverage remains required before deployment; the product stock-policy migration has not been applied as part of this change.

## Realtime Infrastructure Gap

- No verified Recipe-specific realtime event or shared frontend subscription contract exists.
