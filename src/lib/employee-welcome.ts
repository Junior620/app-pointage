import { sendWhatsAppMessage } from "./whatsapp";

export type EmployeeWelcomeInput = {
  firstName: string;
  lastName: string;
  matricule: string;
  service: string;
  structure: string;
};

export function isEmployeeWelcomeEnabled(): boolean {
  const flag = process.env.WHATSAPP_EMPLOYEE_WELCOME?.trim().toLowerCase();
  return flag !== "false" && flag !== "0" && flag !== "off";
}

export function buildEmployeeWelcomeMessage(emp: EmployeeWelcomeInput): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")?.trim();
  const businessPhone = process.env.WHATSAPP_BUSINESS_PHONE?.trim();

  let msg =
    `👋 *Bienvenue ${emp.firstName} !*\n\n` +
    `Votre compte *Pointage RH* est activé.\n\n` +
    `📋 Matricule : *${emp.matricule}*\n` +
    `🏢 ${emp.structure} — ${emp.service}\n\n` +
    `*Pour utiliser le bot :* envoyez *Bonjour* ou *menu* sur ce chat.\n\n` +
    `Rappel rapide :\n` +
    `• *1* Arrivée · *2* Départ · *3* Statut\n` +
    `• *13* Début pause · *14* Retour pause\n` +
    `• *12* Demande d'autorisation d'absence\n\n` +
    `Le pointage (1, 2, 13, 14) se fait via le *lien GPS* envoyé par le bot — n'envoyez pas votre position WhatsApp.`;

  if (baseUrl) {
    msg += `\n\n📱 QR code (scan pour ouvrir le chat) :\n${baseUrl}/qr-chatbot`;
  } else if (businessPhone && /^\d{10,15}$/.test(businessPhone)) {
    msg += `\n\n📱 Lien direct :\nhttps://wa.me/${businessPhone}?text=${encodeURIComponent("Bonjour")}`;
  }

  msg += `\n\nEn cas de problème, contactez les RH.`;

  return msg;
}

/** Message business-initiated : nécessite que le numéro soit joignable via l'API WhatsApp (souvent après un premier contact ou modèle approuvé Meta). */
export async function sendEmployeeWelcomeWhatsAppToPhones(
  phones: string[],
  emp: EmployeeWelcomeInput
): Promise<boolean> {
  if (!isEmployeeWelcomeEnabled()) return false;
  let sent = false;
  for (const phone of phones) {
    if (await sendEmployeeWelcomeWhatsApp(phone, emp)) sent = true;
  }
  return sent;
}

export async function sendEmployeeWelcomeWhatsApp(
  phone: string,
  emp: EmployeeWelcomeInput
): Promise<boolean> {
  if (!isEmployeeWelcomeEnabled()) return false;
  const to = phone.trim();
  if (!to) return false;

  try {
    await sendWhatsAppMessage(to, buildEmployeeWelcomeMessage(emp));
    return true;
  } catch (e) {
    console.error("[employee-welcome] send failed:", e);
    return false;
  }
}

export function shouldSendWelcomeOnPhoneChange(
  beforePhone: string | null | undefined,
  afterPhone: string | null | undefined
): boolean {
  const prev = (beforePhone ?? "").trim();
  const next = (afterPhone ?? "").trim();
  return !prev && !!next;
}
