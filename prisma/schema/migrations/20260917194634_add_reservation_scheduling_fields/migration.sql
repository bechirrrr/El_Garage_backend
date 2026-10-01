-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "assigned_mechanic_id" TEXT,
ADD COLUMN     "duration_minutes" INTEGER;

-- CreateIndex
CREATE INDEX "reservations_assigned_mechanic_id_idx" ON "reservations"("assigned_mechanic_id");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_assigned_mechanic_id_fkey" FOREIGN KEY ("assigned_mechanic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
