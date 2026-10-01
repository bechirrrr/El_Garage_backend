-- CreateEnum
CREATE TYPE "GarageStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- AlterTable
ALTER TABLE "garages" ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT,
ADD COLUMN     "status" "GarageStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';

-- AddForeignKey
ALTER TABLE "garages" ADD CONSTRAINT "garages_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
