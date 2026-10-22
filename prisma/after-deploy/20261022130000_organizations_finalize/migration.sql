-- Multi-entreprise, étape 2/2. À appliquer seulement APRÈS le déploiement du code multi-entreprise
-- (déplacer ce dossier dans prisma/migrations/, puis `prisma migrate deploy`).
-- Dès lors, une création sans entreprise échoue au lieu de partir silencieusement dans « groupe ».

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'employees', 'employee_whatsapp_phones', 'sites', 'schedules', 'attendance_records',
    'leave_requests', 'mission_order_sequences', 'missions', 'fraud_attempts', 'holidays',
    'hr_remarks', 'audit_logs', 'public_submission_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "organization_id" DROP DEFAULT', t);
  END LOOP;
END $$;

-- Anciennes unicités globales, remplacées par les index par entreprise de l'étape 1/2.
DROP INDEX IF EXISTS "employees_matricule_key";
DROP INDEX IF EXISTS "missions_order_number_key";

-- Clé primaire des compteurs d'ordres de mission : (organization_id, year) au lieu de (year).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'mission_order_sequences_organization_id_year_key') THEN
    ALTER TABLE "mission_order_sequences" DROP CONSTRAINT IF EXISTS "mission_order_sequences_pkey";
    ALTER TABLE "mission_order_sequences"
      ADD CONSTRAINT "mission_order_sequences_pkey" PRIMARY KEY USING INDEX "mission_order_sequences_organization_id_year_key";
  END IF;
END $$;
