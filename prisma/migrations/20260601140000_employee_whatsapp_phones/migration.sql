-- Table des numéros WhatsApp liés à un employé (max 2 côté application)
CREATE TABLE IF NOT EXISTS "employee_whatsapp_phones" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_whatsapp_phones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_whatsapp_phones_phone_key" ON "employee_whatsapp_phones"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "employee_whatsapp_phones_employee_id_phone_key" ON "employee_whatsapp_phones"("employee_id", "phone");
CREATE INDEX IF NOT EXISTS "employee_whatsapp_phones_employee_id_idx" ON "employee_whatsapp_phones"("employee_id");

DO $$ BEGIN
  ALTER TABLE "employee_whatsapp_phones" ADD CONSTRAINT "employee_whatsapp_phones_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "employee_whatsapp_phones" ("id", "employee_id", "phone", "sort_order")
SELECT
  'ewp_' || substr(md5(e."id" || e."whatsapp_phone"), 1, 24),
  e."id",
  e."whatsapp_phone",
  0
FROM "employees" e
WHERE e."whatsapp_phone" IS NOT NULL
  AND btrim(e."whatsapp_phone") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "employee_whatsapp_phones" p WHERE p."phone" = e."whatsapp_phone"
  );
