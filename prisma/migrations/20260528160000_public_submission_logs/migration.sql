DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PublicSubmissionType') THEN
    CREATE TYPE "PublicSubmissionType" AS ENUM ('LEAVE_REQUEST', 'MISSION_REQUEST');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.public_submission_logs (
  id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  type "PublicSubmissionType" NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  payload_json TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT public_submission_logs_pkey PRIMARY KEY (id),
  CONSTRAINT public_submission_logs_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS public_submission_logs_employee_id_created_at_idx
  ON public.public_submission_logs(employee_id, created_at);

CREATE INDEX IF NOT EXISTS public_submission_logs_type_entity_id_idx
  ON public.public_submission_logs(type, entity_id);
