-- Parametres du garage (ecran Parametres) + TVA / timbre fiscal sur les factures.

-- Garage
ALTER TABLE "garages" ADD COLUMN "email" TEXT;
ALTER TABLE "garages" ADD COLUMN "tax_id" TEXT;
ALTER TABLE "garages" ADD COLUMN "opening_hours" JSONB;
ALTER TABLE "garages" ADD COLUMN "mechanic_hours_per_day" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "garages" ADD COLUMN "default_appointment_minutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "garages" ADD COLUMN "planning_slot_minutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "garages" ADD COLUMN "invoice_due_days" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "garages" ADD COLUMN "invoice_footer" TEXT;
ALTER TABLE "garages" ADD COLUMN "vat_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "garages" ADD COLUMN "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 19;
ALTER TABLE "garages" ADD COLUMN "stamp_duty_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "garages" ADD COLUMN "stamp_duty" DECIMAL(12,3) NOT NULL DEFAULT 1;

-- Factures : HT, TVA, timbre. Les factures existantes gardent leur montant :
-- TVA 0, timbre 0, HT = main-d'oeuvre + pieces (= ancien total).
ALTER TABLE "invoices" ADD COLUMN "subtotal" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "vat_amount" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "stamp_duty" DECIMAL(12,3) NOT NULL DEFAULT 0;
UPDATE "invoices" SET "subtotal" = "labor_price" + "parts_total";
