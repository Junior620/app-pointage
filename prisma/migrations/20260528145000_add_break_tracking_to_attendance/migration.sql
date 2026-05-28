ALTER TABLE "attendance_records"
ADD COLUMN "break_start_time" TIMESTAMP(3),
ADD COLUMN "break_end_time" TIMESTAMP(3),
ADD COLUMN "break_minutes" INTEGER DEFAULT 0;
