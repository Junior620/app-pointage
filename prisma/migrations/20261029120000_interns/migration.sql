-- Stagiaires : type d'employé, motif « Fin de stage » et fiche de stage.
-- Migration additive : le code déjà en service ignore ces colonnes et cette table.

-- CreateEnum
CREATE TYPE "EmployeeKind" AS ENUM ('EMPLOYEE', 'INTERN');

-- AlterEnum
ALTER TYPE "DepartureReason" ADD VALUE 'INTERNSHIP_END';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "kind" "EmployeeKind" NOT NULL DEFAULT 'EMPLOYEE';

-- CreateTable
CREATE TABLE "internships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "school" TEXT NOT NULL,
    "field_of_study" TEXT,
    "level" TEXT,
    "supervisor_id" TEXT,
    "monthly_allowance" INTEGER,
    "end_reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "internships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internships_employee_id_key" ON "internships"("employee_id");
CREATE INDEX "internships_organization_id_idx" ON "internships"("organization_id");
CREATE INDEX "internships_organization_id_end_date_idx" ON "internships"("organization_id", "end_date");

-- AddForeignKey
ALTER TABLE "internships" ADD CONSTRAINT "internships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "internships" ADD CONSTRAINT "internships_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internships" ADD CONSTRAINT "internships_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Même règle que les autres tables applicatives (§9) : pas d'accès PostgREST anon / authenticated.
ALTER TABLE "internships" ENABLE ROW LEVEL SECURITY;
