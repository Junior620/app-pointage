import type { Intent } from "@/types";

const GREETING_KEYWORDS = [
  "bonjour",
  "salut",
  "hello",
  "hi",
  "coucou",
  "debut",
  "début",
  "start",
  "allo",
];

const CHECK_IN_KEYWORDS = [
  "arrivé",
  "arrivee",
  "arrive",
  "checkin",
  "check-in",
  "check in",
  "present",
  "présent",
];

const CHECK_OUT_KEYWORDS = [
  "départ",
  "depart",
  "checkout",
  "check-out",
  "check out",
  "je pars",
  "au revoir",
  "fin",
  "sortie",
];

const STATUS_KEYWORDS = ["statut", "status", "état", "etat", "historique"];

const HELP_KEYWORDS = ["aide", "help", "menu", "commandes", "?"];

export function parseIntent(message: string): {
  intent: Intent;
  comment?: string;
} {
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Commande "/" → afficher la liste des commandes (Arrivé, Départ, Mon statut)
  if (normalized === "/" || normalized.startsWith("/")) {
    return { intent: "HELP" };
  }

  // Réponse par numéro : 1 = Arrivée, 2 = Départ, 3 = Statut
  if (normalized === "1") return { intent: "CHECK_IN" };
  if (normalized === "2") return { intent: "CHECK_OUT" };
  if (normalized === "3") return { intent: "STATUS" };

  const parts = normalized.split(/\s+/);
  const firstWord = parts[0];
  const rest = parts.slice(1).join(" ").trim() || undefined;

  for (const keyword of GREETING_KEYWORDS) {
    const normalizedKeyword = keyword
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalized === normalizedKeyword || normalized.startsWith(normalizedKeyword + " ")) {
      return { intent: "GREETING" };
    }
  }

  for (const keyword of CHECK_IN_KEYWORDS) {
    const normalizedKeyword = keyword
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalized.startsWith(normalizedKeyword)) {
      const comment = message.slice(keyword.length).trim() || undefined;
      return { intent: "CHECK_IN", comment };
    }
  }

  for (const keyword of CHECK_OUT_KEYWORDS) {
    const normalizedKeyword = keyword
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalized.startsWith(normalizedKeyword)) {
      const comment = message.slice(keyword.length).trim() || undefined;
      return { intent: "CHECK_OUT", comment };
    }
  }

  for (const keyword of STATUS_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { intent: "STATUS" };
    }
  }

  for (const keyword of HELP_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { intent: "HELP" };
    }
  }

  return { intent: "UNKNOWN" };
}

export const HELP_MESSAGE = `📋 *Commandes disponibles :*

✅ *ARRIVÉ* — Pointer votre arrivée
   Ex: "Arrivé" ou "Arrivé embouteillage"

🚪 *DÉPART* — Pointer votre départ
   Ex: "Départ" ou "Départ rdv médecin"

📊 *STATUT* — Voir votre pointage du jour

📍 Envoyez votre *localisation* pour valider le pointage

❓ *AIDE* — Afficher ce menu`;

/** Message envoyé au premier contact (Bonjour ou /) : personnalisé avec le prénom */
export function getWelcomeMessage(firstName: string): string {
  return `👋 Bonjour ${firstName}

Que souhaitez-vous faire ?

1️⃣ Pointer mon arrivée
2️⃣ Pointer mon départ
3️⃣ Voir mon statut

Répondez *1*, *2* ou *3* (ou tapez Arrivé / Départ / Statut).`;
}
