-- Journal d'activite etendu aux actions hors OR (clients, vehicules, rendez-vous).
ALTER TABLE "activity_events" ALTER COLUMN "work_order_id" DROP NOT NULL;
ALTER TABLE "activity_events" ADD COLUMN "customer_id" TEXT;
ALTER TABLE "activity_events" ADD COLUMN "vehicle_id" TEXT;
ALTER TABLE "activity_events" ADD COLUMN "reservation_id" TEXT;

CREATE INDEX "activity_events_garage_id_actor_id_created_at_idx" ON "activity_events"("garage_id", "actor_id", "created_at");

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
