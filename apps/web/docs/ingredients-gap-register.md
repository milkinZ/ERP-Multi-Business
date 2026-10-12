# Ingredients Gap Register

Verified against the current `apps/api` Ingredients, Recipes, Inventory, Prisma, and RBAC implementation.

## Backend Contract Gaps

- Ingredient search, filtering, sorting, and pagination are not exposed by `GET /ingredients`.
- Ingredient update is not exposed.
- Ingredient delete or deactivation is not exposed.
- Ingredient-specific inventory stock or movement lookup is not exposed by the Ingredients API.
- Ingredient-specific recipe usage lookup is not exposed. The Recipes API only looks up a recipe by product.
- Bulk operations and import/export are not exposed.
- No ingredient-specific realtime events are exposed.

## Supported Contract

- `POST /ingredients` accepts only `name` and `unit`, requires `ingredient.create`, and creates the linked `InventoryItem` atomically.
- `GET /ingredients` and `GET /ingredients/:id` require `ingredient.read` and use the authenticated tenant context.
- Ingredient creation rejects duplicate names within the tenant and rolls back the transaction on failure.

## Frontend Gaps

- The UI cannot offer edit, delete, stock, or recipe-usage controls without backend contracts.
- The list renders the backend response as returned and does not provide client-side pseudo-search or pagination.

## Test Infrastructure Gap

- No frontend test runner or existing Ingredients frontend test suite was found in `apps/web`.
