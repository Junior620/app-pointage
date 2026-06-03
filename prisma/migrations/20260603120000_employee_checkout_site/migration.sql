-- Deuxième zone de pointage (ex. usine pour le départ)
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "checkout_site_id" TEXT;

ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_checkout_site_id_fkey";
ALTER TABLE "employees" ADD CONSTRAINT "employees_checkout_site_id_fkey"
  FOREIGN KEY ("checkout_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
