# Ingredients Gap Register

Verified against the current `apps/api` Ingredients, Recipes, Inventory, Prisma, and RBAC implementation.

## Backend Contract Gaps

- `PATCH /ingredients/:id` with `ingredient.update` updates the name and active state on the authoritative inventory item. Unit changes must use the separately authorized, audited conversion operation; the linked item's `isActive` flag provides reversible deactivation without deleting referenced history.
- `DELETE /ingredients/:id` with `ingredient.delete` hard-deletes an unreferenced ingredient and linked inventory item; if referenced by recipe, inventory, purchase, or transfer history it deactivates the item instead and retains the full record.
- Built-in metric/count conversions and tenant-configured custom factors support same-family and cross-family conversions. Conversion transactionally updates stock, costing, reorder rules, active recipes and open purchase/transfer documents; historical transaction rows remain unchanged by default and can only be converted through the explicit `convertHistory` choice. Each conversion writes a conversion record and audit event.
- Ingredient details now consume the existing Inventory stock-balance and paginated movement-history contracts through the linked inventory item ID. Inventory remains the authoritative module for these records.
- `GET /recipes/by-ingredient/:ingredientId?page=&limit=` with `recipe.read` returns tenant-scoped recipe item usage and product summaries with bounded pagination.
- Bulk operations and import/export are not exposed.
- No ingredient-specific realtime events are exposed.

## Supported Contract

- `POST /ingredients` accepts only `name` and `unit`, requires `ingredient.create`, and creates the linked `InventoryItem` atomically.
- `GET /ingredients?page=&limit=&search=&isActive=` and `GET /ingredients/:id` require `ingredient.read` and use the authenticated tenant context. List pagination defaults to 20 and is capped at 100; search matches ingredient name/unit and linked inventory item name/code, and status filtering follows the linked inventory item's active state. Results use deterministic creation-time/ID ordering.
- Ingredient creation rejects duplicate names within the tenant and rolls back the transaction on failure.
- `GET /ingredients/unit-conversions` and `POST /ingredients/unit-conversions` manage tenant-wide conversion factors. A conversion path cannot be duplicated or made ambiguous.
- `POST /ingredients/:id/convert-unit` requires both ingredient-update and inventory-adjust permissions and records source/target units, factor, actor, and whether stored transaction history was converted.

## Frontend Gaps

- The ingredient detail UI displays linked inventory stock balances, paginated movement history, and paginated recipe usage, gated independently by `inventory.read` and `recipe.read`.
- The detail UI supports permission-gated edits, active/inactive status changes, unit conversion with explicit confirmation/history choice, and removal with confirmation of the hard-delete/deactivation rule; successful changes refresh ingredient, inventory, and recipe views.
- The ingredient workspace uses server-side search, active-status filtering, and bounded pagination. Recipe composition continues to load all ingredient options through sequential, bounded API pages so the full tenant catalog remains selectable.

## Test Infrastructure Gap

- No frontend test runner or existing Ingredients frontend test suite was found in `apps/web`.
- Ingredient update, status synchronization, tenant scoping, empty-patch rejection, and standard/custom factor behavior are covered by API unit tests. The latest migration is applied to the local development database; PostgreSQL conversion/concurrency integration coverage remains required before deployment.
