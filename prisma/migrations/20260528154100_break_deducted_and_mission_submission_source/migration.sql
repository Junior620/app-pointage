-- 1) Pause : séparer durée mesurée vs durée déduite
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS break_deducted_minutes INTEGER DEFAULT 0;

-- Backfill : par défaut, la pause déduite = min(pause mesurée, 60)
UPDATE public.attendance_records
SET break_deducted_minutes = LEAST(COALESCE(break_minutes, 0), 60)
WHERE break_deducted_minutes IS NULL
   OR break_deducted_minutes = 0;

-- 2) Missions : source de soumission (RH vs employé formulaire WhatsApp)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MissionSubmissionSource') THEN
    CREATE TYPE "MissionSubmissionSource" AS ENUM ('HR_DASHBOARD', 'EMPLOYEE_WHATSAPP_FORM');
  END IF;
END $$;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS submission_source "MissionSubmissionSource" NOT NULL DEFAULT 'HR_DASHBOARD';

UPDATE public.missions
SET submission_source = 'HR_DASHBOARD'
WHERE submission_source IS NULL;
