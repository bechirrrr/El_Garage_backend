-- Stock de pieces de rechange + mouvements, et lien Piece d'OR -> article du stock.
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'RETURN', 'ADJUST');

CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "garage_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "location" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pc',
    "supplier" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "purchase_price" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "sale_price" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_items_garage_id_reference_key" ON "stock_items"("garage_id", "reference");
CREATE INDEX "stock_items_garage_id_idx" ON "stock_items"("garage_id");
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "garage_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(12,3),
    "note" TEXT,
    "work_order_id" TEXT,
    "part_id" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_movements_stock_item_id_created_at_idx" ON "stock_movements"("stock_item_id", "created_at");
CREATE INDEX "stock_movements_garage_id_created_at_idx" ON "stock_movements"("garage_id", "created_at");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "parts" ADD COLUMN "stock_item_id" TEXT;
ALTER TABLE "parts" ADD CONSTRAINT "parts_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
