ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "correction_reason" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "correction_document" TEXT;
