"use client";

import { useState } from "react";
import { FileText, FileDown } from "lucide-react";
import { downloadBlob, downloadInternshipCertificatePdf } from "@/lib/documents/download";
import type { CertificateData } from "@/lib/documents/internship-certificate";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";

/** Attestation de stage en PDF (généré ici) ou en Word (généré par le serveur). */
export function InternCertificateButtons({ employeeId, compact = false }: { employeeId: string; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const url = `/api/interns/${employeeId}/certificate`;

  const run = async (format: "pdf" | "docx") => {
    setBusy(format);
    try {
      const res = await fetch(format === "pdf" ? `${url}?format=json` : url);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(typeof json.error === "string" ? json.error : "Attestation indisponible.");
      }
      if (format === "pdf") {
        const { data } = (await res.json()) as { data: CertificateData };
        await downloadInternshipCertificatePdf(data);
      } else {
        const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "attestation_stage.docx";
        downloadBlob(await res.blob(), name);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'attestation n'a pas pu être générée.");
    } finally {
      setBusy(null);
    }
  };

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void run("pdf")}
        loading={busy === "pdf"}
        title="Attestation de stage (PDF)"
        aria-label="Attestation de stage (PDF)"
      >
        {busy !== "pdf" && <FileText className="h-4 w-4" />}
      </Button>
    );
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => void run("pdf")} loading={busy === "pdf"} icon={<FileText className="h-4 w-4 text-red-600" />}>
        Attestation PDF
      </Button>
      <Button variant="secondary" size="sm" onClick={() => void run("docx")} loading={busy === "docx"} icon={<FileDown className="h-4 w-4 text-sky-600" />}>
        Word
      </Button>
    </>
  );
}
