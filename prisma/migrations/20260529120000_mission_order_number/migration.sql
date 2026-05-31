CREATE TABLE IF NOT EXISTS public.mission_order_sequences (
  year INTEGER NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT mission_order_sequences_pkey PRIMARY KEY (year)
);

ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS order_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS missions_order_number_key
  ON public.missions(order_number)
  WHERE order_number IS NOT NULL;
