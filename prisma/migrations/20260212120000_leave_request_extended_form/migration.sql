-- Champs étendus demande autorisation (formulaire employé WhatsApp)

CREATE TYPE "LeaveAbsenceCategory" AS ENUM (
  'AUTORISATION_COURTE',
  'CONGES_ANNUELS',
  'CONGES_EXCEPTIONNEL',
  'EVENEMENT_FAMILIAL',
  'MALADIE',
  'FORMATION',
  'RTT_RECUPERATION',
  'MATERNITE_PATERNITE',
  'AUTRE'
);

CREATE TYPE "LeaveSubmissionSource" AS ENUM (
  'HR_DASHBOARD',
  'EMPLOYEE_WHATSAPP_FORM'
);

ALTER TABLE "leave_requests"
  ADD COLUMN "absence_category" "LeaveAbsenceCategory",
  ADD COLUMN "notify_or_replace" TEXT,
  ADD COLUMN "submission_source" "LeaveSubmissionSource" NOT NULL DEFAULT 'HR_DASHBOARD';
