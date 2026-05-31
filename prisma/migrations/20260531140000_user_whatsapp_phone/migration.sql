ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_whatsapp_phone_key
  ON public.users(whatsapp_phone)
  WHERE whatsapp_phone IS NOT NULL;
