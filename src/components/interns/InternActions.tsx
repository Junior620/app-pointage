"use client";

import { useState } from "react";
import { BadgeCheck, CalendarPlus, LogOut } from "lucide-react";
import { dayKey } from "@/lib/interns";
import { fmtDayFr } from "@/lib/export-format";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toaster";

/** Stagiaire visé par une action (dates en ISO, comme renvoyées par l'API). */
export type InternTarget = {
  id: string;
  firstName: string;
  lastName: string;
  kind: "EMPLOYEE" | "INTERN";
  active: boolean;
  departureReason?: string | null;
  internship: { startDate: string; endDate: string };
};

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function patchIntern(id: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`/api/interns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return typeof json.error === "string" ? json.error : "L'opération a échoué.";
  } catch {
    return "Erreur réseau : réessayez.";
  }
}

/**
 * Prolonger, terminer (sortie anticipée) ou embaucher un stagiaire.
 * `compact` : boutons-icônes pour une ligne de tableau ; sinon boutons avec libellé.
 */
export function InternActions({ intern, onDone, compact = false }: { intern: InternTarget; onDone: () => void; compact?: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState<"extend" | "end" | null>(null);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const name = `${intern.firstName} ${intern.lastName}`;
  const isIntern = intern.kind === "INTERN";
  // Sorti à la fin du stage : on peut encore prolonger (la personne est réactivée).
  const endedByInternship = !intern.active && intern.departureReason === "INTERNSHIP_END";
  const canExtend = isIntern && (intern.active || endedByInternship);
  const canEnd = isIntern && intern.active;
  const canHire = isIntern && (intern.active || endedByInternship);
  if (!canExtend && !canEnd && !canHire) return null;

  const openModal = (kind: "extend" | "end") => {
    setModal(kind);
    setError(null);
    setNote("");
    setDate(kind === "extend" ? intern.internship.endDate.slice(0, 10) : todayInput());
  };

  const submit = async () => {
    if (!date) {
      setError("Choisissez une date.");
      return;
    }
    setSubmitting(true);
    const err = await patchIntern(
      intern.id,
      modal === "extend" ? { action: "extend", endDate: date } : { action: "end", date, note: note.trim() || undefined }
    );
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    toast.success(
      modal === "extend"
        ? `Stage de ${name} prolongé jusqu'au ${fmtDayFr(`${date}T00:00:00.000Z`)}.`
        : `Fin de stage enregistrée pour ${name} : il ne peut plus pointer.`
    );
    setModal(null);
    onDone();
  };

  const hire = async () => {
    const ok = await confirm({
      title: "Embaucher le stagiaire",
      message: `${name} devient employé : heures sup comptées, plus de fin automatique. Son stage reste dans l'historique et l'attestation reste disponible.`,
      confirmLabel: "Embaucher",
      tone: "primary",
    });
    if (!ok) return;
    const err = await patchIntern(intern.id, { action: "hire" });
    if (err) toast.error(err);
    else {
      toast.success(`${name} est maintenant employé.`);
      onDone();
    }
  };

  const size = compact ? "icon-sm" : "sm";
  return (
    <>
      {canExtend && (
        <Button variant={compact ? "ghost" : "secondary"} size={size} onClick={() => openModal("extend")} title="Prolonger le stage" aria-label={`Prolonger le stage de ${name}`} icon={compact ? undefined : <CalendarPlus className="h-4 w-4" />}>
          {compact ? <CalendarPlus className="h-4 w-4" /> : "Prolonger"}
        </Button>
      )}
      {canHire && (
        <Button variant={compact ? "ghost" : "secondary"} size={size} onClick={() => void hire()} title="Embaucher" aria-label={`Embaucher ${name}`} icon={compact ? undefined : <BadgeCheck className="h-4 w-4" />}>
          {compact ? <BadgeCheck className="h-4 w-4" /> : "Embaucher"}
        </Button>
      )}
      {canEnd && (
        <Button
          variant="ghost"
          size={size}
          onClick={() => openModal("end")}
          className="hover:bg-red-50 hover:text-red-600"
          title="Terminer le stage maintenant"
          aria-label={`Terminer le stage de ${name}`}
          icon={compact ? undefined : <LogOut className="h-4 w-4" />}
        >
          {compact ? <LogOut className="h-4 w-4" /> : "Terminer"}
        </Button>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        dismissible={!submitting}
        title={modal === "extend" ? "Prolonger le stage" : "Terminer le stage"}
        description={name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)} disabled={submitting}>
              Annuler
            </Button>
            <Button variant={modal === "end" ? "danger" : "primary"} onClick={() => void submit()} loading={submitting}>
              {modal === "extend" ? "Prolonger" : "Terminer le stage"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {modal === "extend" ? (
            <p className="text-sm text-slate-600">
              Fin prévue actuellement : <strong>{fmtDayFr(intern.internship.endDate)}</strong>. Le rappel aux RH repartira 7 jours avant la nouvelle date
              {endedByInternship ? ", et le stagiaire pourra de nouveau pointer" : ""}.
            </p>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Le stagiaire passera en « Parti » avec le motif « Fin de stage » et ne pourra plus pointer. L&apos;attestation reprendra cette date.
            </p>
          )}
          <Field label={modal === "extend" ? "Nouvelle date de fin" : "Dernier jour du stage"} required>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={date}
                min={dayKey(intern.internship.startDate)}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          {modal === "end" && (
            <Field label="Commentaire (optionnel)">
              {(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ex. fin anticipée à la demande de l'école" />}
            </Field>
          )}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
