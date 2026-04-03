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

const STATUS_KEYWORDS = ["statut", "status", "état", "etat"];

const MY_ATTENDANCE_KEYWORDS = [
  "mes pointages",
  "mon historique",
  "pointages du mois",
  "mes pointages du mois",
  "historique pointage",
  "mon mois",
];

const MY_ABSENCES_KEYWORDS = [
  "mes absences",
  "absence",
  "combien absence",
  "jours absent",
];

const MY_OVERTIME_KEYWORDS = [
  "mes heures sup",
  "heures supplementaires",
  "heures supplémentaires",
  "overtime",
  "mes heures",
  "heure sup",
];

const MY_OVERTIME_PENDING_KEYWORDS = [
  "mes heures sup en attente",
  "heures sup en attente",
  "heures supplementaires en attente",
  "heures supplémentaires en attente",
  "overtime en attente",
];

const DAY_DETAIL_KEYWORDS = [
  "detail jour",
  "détail jour",
  "detail du",
  "détail du",
  "detail",
  "détail",
];

const MY_PERMISSIONS_KEYWORDS = [
  "mes permissions",
  "permissions en cours",
  "ma permission",
  "mes demandes de permission",
  "demandes de permission",
  "permission en cours",
];

const MY_MISSIONS_KEYWORDS = ["mes missions", "mission en cours"];

const MY_WEEK_SUMMARY_KEYWORDS = [
  "resume semaine",
  "résumé semaine",
  "resumé semaine",
  "historique semaine",
  "ma semaine",
  "semaine en cours",
  "pointages semaine",
];

const HELP_KEYWORDS = ["aide", "help", "menu", "commandes", "?"];

export type ParseIntentOptions = {
  /** Quand l'employé doit saisir un motif d'heures sup : ne pas interpréter 1–11 comme le menu (évite que « 2 » = Départ au lieu du motif). */
  skipNumericMenuShortcuts?: boolean;
};

export function parseIntent(
  message: string,
  options?: ParseIntentOptions
): {
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

  // Réponse par numéro : 1–7 menu principal, 8 heures sup attente, 9 détail jour, 10 résumé semaine, 11 permissions en cours
  if (!options?.skipNumericMenuShortcuts) {
    if (normalized === "1") return { intent: "CHECK_IN" };
    if (normalized === "2") return { intent: "CHECK_OUT" };
    if (normalized === "3") return { intent: "STATUS" };
    if (normalized === "4") return { intent: "MY_ATTENDANCE" };
    if (normalized === "5") return { intent: "MY_ABSENCES" };
    if (normalized === "6") return { intent: "MY_OVERTIME" };
    if (normalized === "7") return { intent: "MY_MISSIONS" };
    if (normalized === "8") return { intent: "MY_OVERTIME_PENDING" };
    if (normalized === "9" || normalized.startsWith("9 ")) {
      const rest = message
        .trim()
        .replace(/^9\s*/i, "")
        .trim();
      return { intent: "DAY_DETAIL", comment: rest || undefined };
    }
    if (normalized === "10") return { intent: "MY_WEEK_SUMMARY" };
    if (normalized === "11") return { intent: "MY_PERMISSIONS" };
  }

  const parts = normalized.split(/\s+/);

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

  for (const keyword of MY_ATTENDANCE_KEYWORDS) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(nk)) {
      return { intent: "MY_ATTENDANCE" };
    }
  }

  for (const keyword of MY_ABSENCES_KEYWORDS) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(nk)) {
      return { intent: "MY_ABSENCES" };
    }
  }

  for (const keyword of MY_OVERTIME_PENDING_KEYWORDS) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(nk)) {
      return { intent: "MY_OVERTIME_PENDING" };
    }
  }

  for (const keyword of MY_OVERTIME_KEYWORDS) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(nk)) {
      return { intent: "MY_OVERTIME" };
    }
  }

  for (const keyword of MY_MISSIONS_KEYWORDS) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(nk)) {
      return { intent: "MY_MISSIONS" };
    }
  }

  for (const keyword of MY_PERMISSIONS_KEYWORDS) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(nk)) {
      return { intent: "MY_PERMISSIONS" };
    }
  }

  for (const keyword of MY_WEEK_SUMMARY_KEYWORDS) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(nk)) {
      return { intent: "MY_WEEK_SUMMARY" };
    }
  }

  // Détail jour JJ/MM ou JJ/MM/AAAA
  for (const keyword of DAY_DETAIL_KEYWORDS) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.startsWith(nk)) {
      const raw = message.slice(keyword.length).trim();
      return { intent: "DAY_DETAIL", comment: raw || undefined };
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

1️⃣ *Arrivé* — Pointer votre arrivée
2️⃣ *Départ* — Pointer votre départ
3️⃣ *Statut* — Pointage du jour
4️⃣ *Mes pointages* — Historique du mois
5️⃣ *Mes absences* — Voir vos absences
6️⃣ *Mes heures sup* — Heures supplémentaires validées
7️⃣ *Mes missions* — Missions et permissions (historique récent)
8️⃣ *Heures sup en attente* — Heures sup à valider par la RH
9️⃣ *Détail jour* — Tapez *9* puis JJ/MM (ex. *9 15/03*)
🔟 *Résumé semaine* — Historique lundi → samedi
1️⃣1️⃣ *Mes permissions* — En attente ou période approuvée en cours

Répondez par le *numéro* (1 à 11) ou tapez la commande.`;

export function getWelcomeMessage(firstName: string): string {
  return `👋 Bonjour ${firstName}

Que souhaitez-vous faire ?

1️⃣ Pointer mon arrivée
2️⃣ Pointer mon départ
3️⃣ Voir mon statut
4️⃣ Mes pointages du mois
5️⃣ Mes absences
6️⃣ Mes heures sup
7️⃣ Mes missions
8️⃣ Mes heures sup en attente
9️⃣ Détail jour — répondez *9* puis JJ/MM (ex. *9 15/03*)
🔟 Résumé / historique de la semaine
1️⃣1️⃣ Mes permissions en cours

Répondez par le *numéro* (1 à 11) correspondant.`;
}
