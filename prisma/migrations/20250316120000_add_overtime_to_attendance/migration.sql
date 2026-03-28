-- CreateEnum (OvertimeStatus) - skip if already exists
DO $$ BEGIN
  CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add overtime columns to attendance_records if missing
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "overtime_status" "OvertimeStatus";
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "overtime_reason" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "overtime_validated_by" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "overtime_validated_at" TIMESTAMP(3);
