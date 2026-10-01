-- Le dinar tunisien a 3 decimales (millimes) : montants en DECIMAL(12,3).
-- Elargissement sans perte : les valeurs existantes (2 decimales) sont conservees telles quelles.
ALTER TABLE "invoices" ALTER COLUMN "labor_price" SET DATA TYPE DECIMAL(12,3);
ALTER TABLE "invoices" ALTER COLUMN "parts_total" SET DATA TYPE DECIMAL(12,3);
ALTER TABLE "invoices" ALTER COLUMN "total_price" SET DATA TYPE DECIMAL(12,3);
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,3);
ALTER TABLE "parts" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(12,3);
