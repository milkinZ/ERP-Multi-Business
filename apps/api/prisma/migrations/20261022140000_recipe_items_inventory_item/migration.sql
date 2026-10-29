ALTER TABLE "RecipeItem" ADD COLUMN "inventoryItemId" TEXT;

UPDATE "RecipeItem" AS recipe_item
SET "inventoryItemId" = ingredient."inventoryItemId"
FROM "Ingredient" AS ingredient
WHERE recipe_item."ingredientId" = ingredient."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RecipeItem"
    WHERE "inventoryItemId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate RecipeItem: an ingredient has no linked inventory item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RecipeItem" AS recipe_item
    JOIN "Ingredient" AS ingredient
      ON ingredient."id" = recipe_item."ingredientId"
    JOIN "Recipe" AS recipe
      ON recipe."id" = recipe_item."recipeId"
    JOIN "InventoryItem" AS inventory_item
      ON inventory_item."id" = ingredient."inventoryItemId"
    WHERE ingredient."tenantId" <> recipe."tenantId"
       OR ingredient."tenantId" <> inventory_item."tenantId"
       OR inventory_item."type" <> 'INGREDIENT'
  ) THEN
    RAISE EXCEPTION 'Cannot migrate RecipeItem: linked inventory item has a different tenant or is not an ingredient';
  END IF;
END $$;

ALTER TABLE "RecipeItem"
  DROP CONSTRAINT "RecipeItem_ingredientId_fkey",
  ALTER COLUMN "inventoryItemId" SET NOT NULL,
  DROP COLUMN "ingredientId";

ALTER TABLE "RecipeItem"
  ADD CONSTRAINT "RecipeItem_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RecipeItem_inventoryItemId_idx"
  ON "RecipeItem"("inventoryItemId");

DROP TABLE "Ingredient";
