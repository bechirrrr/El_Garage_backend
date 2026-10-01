-- Numero d'ordre de reparation lisible, par garage (OR-1, OR-2...).
-- Ecrite a la main (et non generee) parce que work_orders contient deja des
-- lignes : on ne peut pas ajouter directement une colonne NOT NULL sans
-- valeur. D'ou 4 etapes : colonne nullable -> remplissage -> NOT NULL -> index.

-- 1. Compteur par garage
ALTER TABLE "garages" ADD COLUMN "work_order_counter" INTEGER NOT NULL DEFAULT 0;

-- 2. Colonne numero, d'abord nullable
ALTER TABLE "work_orders" ADD COLUMN "number" INTEGER;

-- 3. Numerote les ordres existants : 1, 2, 3... par garage, dans l'ordre de creation
UPDATE "work_orders" AS w
SET "number" = s.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "garage_id" ORDER BY "created_at", "id") AS rn
  FROM "work_orders"
) AS s
WHERE w."id" = s."id";

-- 4. Le compteur de chaque garage repart du dernier numero attribue
UPDATE "garages" AS g
SET "work_order_counter" = COALESCE((SELECT MAX(w."number") FROM "work_orders" AS w WHERE w."garage_id" = g."id"), 0);

-- 5. Desormais obligatoire
ALTER TABLE "work_orders" ALTER COLUMN "number" SET NOT NULL;

-- 6. Unique dans un garage
CREATE UNIQUE INDEX "work_orders_garage_id_number_key" ON "work_orders"("garage_id", "number");
