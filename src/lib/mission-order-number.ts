import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient;

/** Format affiché : 3/06/2026 (séquence / mois de début de mission / année). */
export function formatMissionOrderNumber(seq: number, referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  return `${seq}/${month}/${year}`;
}

export function missionOrderTitle(orderNumber: string | null | undefined, startDate: Date): string {
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, "0");
  const num = orderNumber?.trim() || `____/${month}/${year}`;
  return `ORDRE DE MISSION N°${num}`;
}

async function nextSequenceForYear(tx: Tx, year: number): Promise<number> {
  const rows = await tx.$queryRaw<{ last_seq: number }[]>`
    INSERT INTO mission_order_sequences (year, last_seq)
    VALUES (${year}, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_seq = mission_order_sequences.last_seq + 1
    RETURNING last_seq
  `;
  const seq = rows[0]?.last_seq;
  if (seq == null || seq < 1) {
    throw new Error("Impossible d'allouer un numéro d'ordre de mission");
  }
  return seq;
}

export async function allocateMissionOrderNumber(
  referenceDate: Date,
  tx: Tx = prisma
): Promise<string> {
  const year = referenceDate.getFullYear();
  const seq = await nextSequenceForYear(tx, year);
  return formatMissionOrderNumber(seq, referenceDate);
}

export async function createMissionWithOrderNumber(
  data: Omit<Prisma.MissionUncheckedCreateInput, "orderNumber">
) {
  const start =
    data.startDate instanceof Date
      ? data.startDate
      : new Date(data.startDate as string | number | Date);

  return prisma.$transaction(async (tx) => {
    const orderNumber = await allocateMissionOrderNumber(start, tx);
    return tx.mission.create({
      data: { ...data, orderNumber },
      include: { employee: true },
    });
  });
}
