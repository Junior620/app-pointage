import type { Intent } from "@/types";

const CHECK_IN_KEYWORDS = [
  "arrivé",
  "arrivee",
  "arrive",
  "checkin",
  "check-in",
  "check in",
  "bonjour",
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

  const parts = normalized.split(/\s+/);
  const firstWord = parts[0];
  const rest = parts.slice(1).join(" ").trim() || undefined;

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
