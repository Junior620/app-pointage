-- Motifs de départ RH + métadonnées sur les employés partis

CREATE TYPE "DepartureReason" AS ENUM (
  'RESIGNATION',
  'END_OF_CONTRACT',
  'DISMISSAL',
  'ABANDONMENT'
);

ALTER TABLE "employees"
  ADD COLUMN "departure_date" DATE,
  ADD COLUMN "departure_reason" "DepartureReason",
  ADD COLUMN "departure_note" TEXT;
