-- Multi-entreprise, étape 1/2 : table organizations et colonne organization_id sur les tables métier.
-- Compatible avec le code déjà en ligne : toutes les lignes existantes (et celles créées par l'ancien code)
-- sont rattachées à l'entreprise par défaut « groupe » grâce à la valeur par défaut de la colonne.
-- L'étape 2/2 (20261022130000_organizations_finalize) retire ces valeurs par défaut et les anciennes
-- contraintes d'unicité globales : elle ne s'applique qu'APRÈS le déploiement du nouveau code.

ALTER TYPE "Structure" ADD VALUE IF NOT EXISTS 'GOLDENBEANS';

CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "structures" "Structure"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");

-- Même règle que les autres tables (cf. 20260403120000_enable_rls_public_tables) : pas d'accès via PostgREST.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;

INSERT INTO "organizations" ("id", "slug", "name", "structures", "updated_at")
VALUES ('org_groupe', 'groupe', 'SCPB · AFREXIA', ARRAY['SCPB', 'AFREXIA']::"Structure"[], CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- organization_id : valeur par défaut constante (pas de réécriture des tables), clé étrangère et index.
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
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT %L', t, 'org_groupe'
    );
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_organization_id_fkey') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
        t, t || '_organization_id_fkey'
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS "users_organization_id_idx" ON "users"("organization_id");
CREATE INDEX IF NOT EXISTS "employee_whatsapp_phones_organization_id_idx" ON "employee_whatsapp_phones"("organization_id");
CREATE INDEX IF NOT EXISTS "sites_organization_id_idx" ON "sites"("organization_id");
CREATE INDEX IF NOT EXISTS "schedules_organization_id_idx" ON "schedules"("organization_id");
CREATE INDEX IF NOT EXISTS "attendance_records_organization_id_idx" ON "attendance_records"("organization_id");
CREATE INDEX IF NOT EXISTS "leave_requests_organization_id_idx" ON "leave_requests"("organization_id");
CREATE INDEX IF NOT EXISTS "fraud_attempts_organization_id_idx" ON "fraud_attempts"("organization_id");
CREATE INDEX IF NOT EXISTS "holidays_organization_id_idx" ON "holidays"("organization_id");
CREATE INDEX IF NOT EXISTS "hr_remarks_organization_id_idx" ON "hr_remarks"("organization_id");
CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
CREATE INDEX IF NOT EXISTS "public_submission_logs_organization_id_idx" ON "public_submission_logs"("organization_id");

-- Unicité par entreprise. Les anciennes contraintes globales (matricule, numéro d'ordre, année)
-- restent en place jusqu'à l'étape 2/2 : l'ancien code s'appuie encore sur ON CONFLICT ("year").
CREATE UNIQUE INDEX IF NOT EXISTS "employees_organization_id_matricule_key"
  ON "employees"("organization_id", "matricule");
CREATE UNIQUE INDEX IF NOT EXISTS "missions_organization_id_order_number_key"
  ON "missions"("organization_id", "order_number");
CREATE UNIQUE INDEX IF NOT EXISTS "mission_order_sequences_organization_id_year_key"
  ON "mission_order_sequences"("organization_id", "year");
