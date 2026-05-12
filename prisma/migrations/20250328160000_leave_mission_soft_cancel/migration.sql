-- Annulation logique : historique conservé, plus pris en compte pour le pointage actif
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT;
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT;
