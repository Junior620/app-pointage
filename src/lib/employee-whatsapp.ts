import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone, sendWhatsAppMessage } from "./whatsapp";

export const MAX_EMPLOYEE_WHATSAPP_PHONES = 2;

export class EmployeeWhatsappError extends Error {
  constructor(
    message: string,
    public code: "TAKEN" | "MAX" | "INVALID" = "INVALID"
  ) {
    super(message);
    this.name = "EmployeeWhatsappError";
  }
}

export function whatsappPhoneLookupVariants(phone: string): string[] {
  const normalized = normalizePhone(phone.trim());
  const digitsOnly = normalized.replace(/\D/g, "");
  const variants = new Set<string>();
  if (normalized) variants.add(normalized);
  if (digitsOnly) {
    variants.add(digitsOnly);
    variants.add(`+${digitsOnly}`);
    if (digitsOnly.startsWith("00")) variants.add(digitsOnly.slice(2));
  }
  return Array.from(variants);
}

export function normalizeEmployeeWhatsappInput(phone: string): string {
  const normalized = normalizePhone(phone.trim());
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 8) {
    throw new EmployeeWhatsappError("Numéro WhatsApp invalide.", "INVALID");
  }
  return normalized.startsWith("+") ? normalized : `+${digits}`;
}

export function parseEmployeeWhatsappInputs(
  inputs: (string | null | undefined)[]
): string[] {
  const out: string[] = [];
  for (const raw of inputs) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const normalized = normalizeEmployeeWhatsappInput(trimmed);
    if (!out.includes(normalized)) out.push(normalized);
    if (out.length > MAX_EMPLOYEE_WHATSAPP_PHONES) {
      throw new EmployeeWhatsappError(
        `Maximum ${MAX_EMPLOYEE_WHATSAPP_PHONES} numéros WhatsApp par employé.`,
        "MAX"
      );
    }
  }
  return out;
}

export async function findEmployeeByWhatsappPhone(phone: string) {
  const variants = whatsappPhoneLookupVariants(phone);
  if (variants.length === 0) return null;

  const link = await prisma.employeeWhatsappPhone.findFirst({
    where: { phone: { in: variants } },
    include: {
      employee: {
        include: {
          site: true,
          whatsappPhones: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (link?.employee) return link.employee;

  return prisma.employee.findFirst({
    where: {
      OR: variants.map((p) => ({ whatsappPhone: p })),
    },
    include: {
      site: true,
      whatsappPhones: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function getEmployeeWhatsappPhones(employeeId: string): Promise<string[]> {
  const rows = await prisma.employeeWhatsappPhone.findMany({
    where: { employeeId },
    orderBy: { sortOrder: "asc" },
    select: { phone: true },
  });
  if (rows.length > 0) return rows.map((r) => r.phone);

  const legacy = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { whatsappPhone: true },
  });
  return legacy?.whatsappPhone ? [legacy.whatsappPhone] : [];
}

export function phonesFromEmployee(entity: {
  whatsappPhone?: string | null;
  whatsappPhones?: { phone: string }[];
}): string[] {
  if (entity.whatsappPhones?.length) {
    return entity.whatsappPhones.map((p) => p.phone);
  }
  return entity.whatsappPhone ? [entity.whatsappPhone] : [];
}

export async function sendWhatsAppToEmployee(
  employeeId: string,
  text: string
): Promise<void> {
  const phones = await getEmployeeWhatsappPhones(employeeId);
  for (const phone of phones) {
    await sendWhatsAppMessage(phone, text);
  }
}

export async function sendWhatsAppToEmployeeEntity(
  employee: {
    id: string;
    whatsappPhone?: string | null;
    whatsappPhones?: { phone: string }[];
  },
  text: string
): Promise<void> {
  const phones = phonesFromEmployee(employee);
  if (phones.length === 0) {
    const loaded = await getEmployeeWhatsappPhones(employee.id);
    for (const phone of loaded) await sendWhatsAppMessage(phone, text);
    return;
  }
  for (const phone of phones) {
    await sendWhatsAppMessage(phone, text);
  }
}

async function assertPhonesAvailable(
  phones: string[],
  employeeId: string,
  tx: Prisma.TransactionClient
) {
  for (const phone of phones) {
    const taken = await tx.employeeWhatsappPhone.findFirst({
      where: { phone, NOT: { employeeId } },
    });
    if (taken) {
      throw new EmployeeWhatsappError(
        `Le numéro ${phone} est déjà lié à un autre employé.`,
        "TAKEN"
      );
    }
    const legacy = await tx.employee.findFirst({
      where: {
        whatsappPhone: phone,
        NOT: { id: employeeId },
      },
    });
    if (legacy) {
      throw new EmployeeWhatsappError(
        `Le numéro ${phone} est déjà lié à un autre employé.`,
        "TAKEN"
      );
    }
  }
}

export async function syncEmployeeWhatsappPhones(
  employeeId: string,
  inputs: (string | null | undefined)[]
): Promise<string[]> {
  const phones = parseEmployeeWhatsappInputs(inputs);

  return prisma.$transaction(async (tx) => {
    await assertPhonesAvailable(phones, employeeId, tx);
    await tx.employeeWhatsappPhone.deleteMany({ where: { employeeId } });
    for (let i = 0; i < phones.length; i++) {
      await tx.employeeWhatsappPhone.create({
        data: { employeeId, phone: phones[i], sortOrder: i },
      });
    }
    const primary = phones[0] ?? null;
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        whatsappPhone: primary,
        whatsappLinkedAt: primary ? new Date() : null,
      },
    });
    return phones;
  });
}

export function diffNewWhatsappPhones(
  before: string[],
  after: string[]
): string[] {
  const prev = new Set(before);
  return after.filter((p) => !prev.has(p));
}
