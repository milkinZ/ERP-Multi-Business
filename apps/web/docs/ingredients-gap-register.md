# Ingredients Gap Register

Verified against the current `apps/api` Ingredients, Recipes, Inventory, Prisma, and RBAC implementation.

## Backend Contract Gaps

- `PATCH /ingredients/:id` with `ingredient.update` updates the name/unit and linked inventory item atomically; the linked item's `isActive` flag provides reversible deactivation without deleting referenced history.
- `DELETE /ingredients/:id` with `ingredient.delete` hard-deletes an unreferenced ingredient and linked inventory item; if referenced by recipe, inventory, purchase, or transfer history it deactivates the item instead and retains the full record.
- Unit changes are rejected once the linked inventory item has a nonzero stock balance or inventory movement, or when the ingredient is used by a recipe. Unit conversion remains unavailable and requires a separate audited stock/recipe-conversion workflow.
- Ingredient details now consume the existing Inventory stock-balance and paginated movement-history contracts through the linked inventory item ID. Inventory remains the authoritative module for these records.
- `GET /recipes/by-ingredient/:ingredientId?page=&limit=` with `recipe.read` returns tenant-scoped recipe item usage and product summaries with bounded pagination.
- Bulk operations and import/export are not exposed.
- No ingredient-specific realtime events are exposed.

## Supported Contract

- `POST /ingredients` accepts only `name` and `unit`, requires `ingredient.create`, and creates the linked `InventoryItem` atomically.
- `GET /ingredients?page=&limit=&search=&isActive=` and `GET /ingredients/:id` require `ingredient.read` and use the authenticated tenant context. List pagination defaults to 20 and is capped at 100; search matches ingredient name/unit and linked inventory item name/code, and status filtering follows the linked inventory item's active state. Results use deterministic creation-time/ID ordering.
- Ingredient creation rejects duplicate names within the tenant and rolls back the transaction on failure.

## Frontend Gaps

- The ingredient detail UI displays linked inventory stock balances, paginated movement history, and paginated recipe usage, gated independently by `inventory.read` and `recipe.read`.
- The detail UI supports permission-gated edits, active/inactive status changes, and removal with explicit confirmation of the hard-delete/deactivation rule; it explains the unit-change restriction and refreshes inventory and ingredient views after updates.
- The ingredient workspace uses server-side search, active-status filtering, and bounded pagination. Recipe composition continues to load all ingredient options through sequential, bounded API pages so the full tenant catalog remains selectable.

## Test Infrastructure Gap

- No frontend test runner or existing Ingredients frontend test suite was found in `apps/web`.
- Ingredient update, status synchronization, tenant scoping, empty-patch rejection, and unit-change restrictions are covered by API unit tests.
