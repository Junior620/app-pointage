"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { downloadBlob } from "@/lib/documents/download";
import { EXCEL_DATE_FORMAT, excelDay, finishSheet, setColumnFormats } from "@/lib/excel-format";
import { fmtDayFr, generatedAtLabel } from "@/lib/export-format";
import { fmtFcfa } from "@/lib/interns";
import { PDF_TABLE, addPdfHeader, createPdf, savePdf } from "@/lib/pdf-kit";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";

type RecapRow = {
  employeeId: string;
  name: string;
  matricule: string;
  service: string;
  structure: string;
  school: string;
  supervisor: string | null;
  from: string;
  to: string;
  workingDays: number;
  present: number;
  missions: number;
  permissions: number;
  absences: number;
  monthlyAllowance: number | null;
  prorata: number | null;
};

type Recap = { month: string; monthWorkingDays: number; asOf: string | null; rows: RecapRow[] };

const FORMULA =
  "Montant au prorata (indicatif) = gratification × (jours ouvrés du stage dans le mois − absences non justifiées) ÷ jours ouvrés du mois. Les autorisations d'absence ne sont pas retirées ; la RH fixe le montant final.";

/** Mois proposé : le mois précédent en début de mois (paie), sinon le mois en cours. */
function defaultMonth(): string {
  const d = new Date();
  if (d.getDate() <= 10) d.setMonth(d.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

const dayOf = (key: string) => `${key}T00:00:00.000Z`;

async function exportExcel(recap: Recap) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(`Gratifications ${recap.month}`);
  ws.columns = [
    { header: "Stagiaire", key: "name", width: 26 },
    { header: "Matricule", key: "matricule", width: 16 },
    { header: "Service", key: "service", width: 14 },
    { header: "École", key: "school", width: 34 },
    { header: "Encadrant", key: "supervisor", width: 22 },
    { header: "Du", key: "from", width: 12 },
    { header: "Au", key: "to", width: 12 },
    { header: "Jours ouvrés du stage", key: "workingDays", width: 12 },
    { header: "Présents", key: "present", width: 10 },
    { header: "Missions", key: "missions", width: 10 },
    { header: "Autorisations", key: "permissions", width: 13 },
    { header: "Absences non justifiées", key: "absences", width: 13 },
    { header: "Gratification (FCFA)", key: "monthlyAllowance", width: 14 },
    { header: "Prorata indicatif (FCFA)", key: "prorata", width: 14 },
  ];
  recap.rows.forEach((r) => ws.addRow({ ...r, supervisor: r.supervisor ?? "", from: excelDay(dayOf(r.from)), to: excelDay(dayOf(r.to)) }));
  setColumnFormats(ws, { from: EXCEL_DATE_FORMAT, to: EXCEL_DATE_FORMAT, monthlyAllowance: "#,##0", prorata: "#,##0" });
  finishSheet(ws);
  // Rappel du calcul sous le tableau (hors filtre).
  ws.addRow([]);
  ws.addRow([`Jours ouvrés du mois : ${recap.monthWorkingDays}${recap.asOf ? ` · chiffres arrêtés au ${fmtDayFr(dayOf(recap.asOf))}` : ""}`]);
  ws.addRow([FORMULA]);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `gratifications_stagiaires_${recap.month}.xlsx`
  );
}

async function exportPdf(recap: Recap) {
  const { autoTable } = await import("jspdf-autotable");
  const doc = await createPdf({ orientation: "landscape", unit: "mm", format: "a4" });
  const total = recap.rows.reduce((s, r) => s + (r.prorata ?? 0), 0);
  const startY = await addPdfHeader(doc, {
    title: `Gratifications des stagiaires — ${monthLabel(recap.month)}`,
    structures: recap.rows.map((r) => r.structure),
    subtitle: [
      `${recap.rows.length} stagiaire${recap.rows.length > 1 ? "s" : ""} · ${recap.monthWorkingDays} jours ouvrés dans le mois${recap.asOf ? ` · arrêté au ${fmtDayFr(dayOf(recap.asOf))} (provisoire)` : ""} · généré le ${generatedAtLabel()}`,
      `Total au prorata (indicatif) : ${fmtFcfa(total)}`,
    ],
  });
  autoTable(doc, {
    ...PDF_TABLE,
    startY,
    head: [["Stagiaire", "Service", "École", "Période", "Jours ouvrés", "Présents", "Missions", "Autoris.", "Absences", "Gratification", "Prorata"]],
    body: recap.rows.map((r) => [
      `${r.name}\n${r.matricule}`,
      r.service,
      r.school,
      `${fmtDayFr(dayOf(r.from))} – ${fmtDayFr(dayOf(r.to))}`,
      r.workingDays,
      r.present,
      r.missions,
      r.permissions,
      r.absences,
      fmtFcfa(r.monthlyAllowance),
      fmtFcfa(r.prorata),
    ]),
    columnStyles: {
      2: { cellWidth: 52 },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "center" },
      7: { halign: "center" },
      8: { halign: "center" },
      9: { halign: "right" },
      10: { halign: "right", fontStyle: "bold" },
    },
  });
  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? startY;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(doc.splitTextToSize(FORMULA, 269), 14, finalY + 7);
  savePdf(doc, `gratifications_stagiaires_${recap.month}.pdf`);
}

/** Bouton + fenêtre du récapitulatif mensuel des gratifications (Excel / PDF). */
export default function AllowanceRecap() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(defaultMonth);
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);

  const run = async (kind: "excel" | "pdf") => {
    setBusy(kind);
    try {
      const res = await fetch(`/api/interns/allowances?month=${month}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Récapitulatif indisponible.");
      const recap = json as Recap;
      if (recap.rows.length === 0) {
        toast.warning(`Aucun stagiaire en stage en ${monthLabel(month)}.`);
        return;
      }
      if (kind === "excel") await exportExcel(recap);
      else await exportPdf(recap);
      toast.success(`Récapitulatif de ${monthLabel(month)} exporté (${recap.rows.length} stagiaire${recap.rows.length > 1 ? "s" : ""}).`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}>
        <span className="hidden sm:inline">Gratifications</span>
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        dismissible={busy === null}
        title="Récapitulatif des gratifications"
        description="Présences du mois et montant au prorata pour chaque stagiaire."
        footer={
          <>
            <Button variant="secondary" onClick={() => void run("excel")} loading={busy === "excel"} disabled={busy !== null} icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}>
              Excel
            </Button>
            <Button onClick={() => void run("pdf")} loading={busy === "pdf"} disabled={busy !== null} icon={<FileText className="h-4 w-4" />}>
              PDF
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Mois" required>
            {(id) => <Input id={id} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}
          </Field>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{FORMULA}</p>
        </div>
      </Modal>
    </>
  );
}
