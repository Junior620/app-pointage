import type { Intent } from "@/types";
import { formatTime } from "./utils";
import type { WhatsAppListSection, WhatsAppReplyButton } from "./whatsapp";

/**
 * Menu WhatsApp : boutons adaptés à l'état du jour, et liste regroupée (9 entrées) derrière « Plus d'options ».
 * Les numéros 1 à 15 restent acceptés en texte (parseIntent) : seul l'affichage change.
 */

type DayRecord = {
  checkInTime: Date | null;
  checkOutTime: Date | null;
  breakStartTime: Date | null;
  breakEndTime: Date | null;
} | null;

export type DayState = "NOT_ARRIVED" | "WORKING" | "ON_BREAK" | "BREAK_DONE" | "DONE";

export function dayState(record: DayRecord): DayState {
  if (!record?.checkInTime) return "NOT_ARRIVED";
  if (record.checkOutTime) return "DONE";
  if (record.breakStartTime && !record.breakEndTime) return "ON_BREAK";
  if (record.breakEndTime) return "BREAK_DONE";
  return "WORKING";
}

/** Bouton « Plus d'options » : ouvre la liste. */
export const MENU_LIST_ID = "menu:LIST";

/** Identifiant de bouton / ligne → intentions existantes, traitées dans l'ordre. */
const MENU_ACTIONS: Record<string, Intent[]> = {
  "menu:CHECK_IN": ["CHECK_IN"],
  "menu:CHECK_OUT": ["CHECK_OUT"],
  "menu:BREAK_START": ["BREAK_START"],
  "menu:BREAK_END": ["BREAK_END"],
  "menu:STATUS": ["STATUS"],
  "menu:HISTORY": ["MY_ATTENDANCE", "MY_WEEK_SUMMARY"],
  "menu:ABSENCES": ["MY_PERMISSIONS", "MY_ABSENCES"],
  "menu:OVERTIME": ["MY_OVERTIME", "MY_OVERTIME_PENDING"],
  "menu:LEAVE_FORM": ["DEMAND_LEAVE_FORM"],
  "menu:MISSIONS": ["MY_MISSIONS", "DEMAND_MISSION_FORM"],
  // Anciens boutons (Arrivé, Départ, Mon statut) encore présents dans les conversations.
  BTN_ARRIVE: ["CHECK_IN"],
  BTN_DEPART: ["CHECK_OUT"],
  BTN_STATUT: ["STATUS"],
};

/** Intentions d'un bouton ou d'une ligne de liste ; "LIST" pour « Plus d'options » ; null si inconnu. */
export function menuChoice(id: string): Intent[] | "LIST" | null {
  if (id === MENU_LIST_ID) return "LIST";
  return MENU_ACTIONS[id] ?? null;
}

const BUTTONS = {
  CHECK_IN: { id: "menu:CHECK_IN", title: "Pointer mon arrivée" },
  CHECK_OUT: { id: "menu:CHECK_OUT", title: "Pointer mon départ" },
  BREAK_START: { id: "menu:BREAK_START", title: "Début de pause" },
  BREAK_END: { id: "menu:BREAK_END", title: "Retour de pause" },
  STATUS: { id: "menu:STATUS", title: "Mon statut du jour" },
  LEAVE_FORM: { id: "menu:LEAVE_FORM", title: "Demander une absence" },
  MORE: { id: MENU_LIST_ID, title: "Plus d'options" },
} satisfies Record<string, WhatsAppReplyButton>;

const STATE_BUTTONS: Record<DayState, WhatsAppReplyButton[]> = {
  NOT_ARRIVED: [BUTTONS.CHECK_IN, BUTTONS.LEAVE_FORM, BUTTONS.MORE],
  WORKING: [BUTTONS.CHECK_OUT, BUTTONS.BREAK_START, BUTTONS.MORE],
  ON_BREAK: [BUTTONS.BREAK_END, BUTTONS.MORE],
  BREAK_DONE: [BUTTONS.CHECK_OUT, BUTTONS.STATUS, BUTTONS.MORE],
  DONE: [BUTTONS.STATUS, BUTTONS.MORE],
};

function stateLine(state: DayState, record: DayRecord): string {
  switch (state) {
    case "NOT_ARRIVED":
      return "Vous n'avez pas encore pointé votre arrivée aujourd'hui.";
    case "WORKING":
      return `Arrivée pointée à ${formatTime(record?.checkInTime)}.`;
    case "ON_BREAK":
      return `En pause depuis ${formatTime(record?.breakStartTime)}.`;
    case "BREAK_DONE":
      return `Arrivée à ${formatTime(record?.checkInTime)}, retour de pause à ${formatTime(record?.breakEndTime)}.`;
    case "DONE":
      return `Journée terminée : départ pointé à ${formatTime(record?.checkOutTime)}.`;
  }
}

/** Boutons du jour. `intro` : salutation, ou « message non compris ». */
export function dayMenu(intro: string, record: DayRecord): { body: string; buttons: WhatsAppReplyButton[] } {
  const state = dayState(record);
  return {
    body: `${intro}\n\n${stateLine(state, record)}\n\nVous pouvez aussi répondre par un numéro (*1* arrivée, *2* départ…).`,
    buttons: STATE_BUTTONS[state],
  };
}

/** Liste regroupée : 9 entrées en 3 rubriques ; la ligne de pause suit l'état du jour. */
export function fullMenu(record: DayRecord): { body: string; buttonText: string; sections: WhatsAppListSection[] } {
  const onBreak = dayState(record) === "ON_BREAK";
  return {
    body:
      "📋 *Toutes les actions*\n\nTouchez « Voir le menu » pour choisir. Les numéros restent valables, par exemple *1* pour l'arrivée.\n\n" +
      "Détail d'un jour : tapez *9* puis la date (ex. *9 15/03*).",
    buttonText: "Voir le menu",
    sections: [
      {
        title: "Pointage",
        rows: [
          { id: "menu:CHECK_IN", title: "Pointer mon arrivée", description: "Lien GPS · raccourci 1" },
          { id: "menu:CHECK_OUT", title: "Pointer mon départ", description: "Lien GPS · raccourci 2" },
          onBreak
            ? { id: "menu:BREAK_END", title: "Retour de pause", description: "Lien GPS · raccourci 14" }
            : { id: "menu:BREAK_START", title: "Début de pause", description: "Lien GPS · raccourci 13" },
          { id: "menu:STATUS", title: "Mon statut du jour", description: "Arrivée, pause, départ · raccourci 3" },
        ],
      },
      {
        title: "Mon historique",
        rows: [
          { id: "menu:HISTORY", title: "Mes pointages", description: "Mois en cours et semaine · raccourcis 4 et 10" },
          { id: "menu:ABSENCES", title: "Mes absences", description: "Autorisations en cours et absences relevées · 5 et 11" },
          { id: "menu:OVERTIME", title: "Mes heures sup", description: "Validées et en attente · raccourcis 6 et 8" },
        ],
      },
      {
        title: "Demandes",
        rows: [
          { id: "menu:LEAVE_FORM", title: "Demander une absence", description: "Formulaire d'autorisation · raccourci 12" },
          { id: "menu:MISSIONS", title: "Mes missions", description: "Liste et lien pour en demander une · 7 et 15" },
        ],
      },
    ],
  };
}
