-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "estimated_minutes" INTEGER,
ADD COLUMN     "scheduled_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "work_orders_garage_id_scheduled_at_idx" ON "work_orders"("garage_id", "scheduled_at");
