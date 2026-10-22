"use client";

import {
  addPdfHeader,
  addPdfKeyValues,
  addPdfNotice,
  addPdfParagraph,
  addPdfSectionTitle,
  addPdfSignatures,
  createPdf,
  savePdf,
} from "@/lib/pdf-kit";
import { logoMeta, type DocxLogo } from "./logo";
import { leaveRequestContent, type LeaveDocInput } from "./leave-request";
import { missionOrderContent, type MissionDocInput } from "./mission-order";
import type { DocContent } from "./types";

/** Téléchargements des documents RH générés dans le navigateur. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function renderDocumentPdf(content: DocContent) {
  const doc = await createPdf({ unit: "mm", format: "a4" });
  const { autoTable } = await import("jspdf-autotable");
  let y = await addPdfHeader(doc, { title: content.title, subtitle: content.subtitle, structures: [content.structure] });
  if (content.notice) y = addPdfNotice(doc, content.notice, y);
  for (const section of content.sections) {
    y = addPdfSectionTitle(doc, section.title, y);
    y = addPdfKeyValues(doc, autoTable, section.rows, y) + 8;
  }
  for (const paragraph of content.closing ?? []) {
    y = addPdfParagraph(doc, paragraph, y);
  }
  addPdfSignatures(doc, content.signatures, y + 2);
  return doc;
}

async function fetchDocxLogo(structure: string | null): Promise<DocxLogo | null> {
  const meta = logoMeta(structure);
  if (!meta) return null;
  try {
    const res = await fetch(meta.path);
    if (!res.ok) return null;
    return { data: new Uint8Array(await res.arrayBuffer()), aspect: meta.aspect, name: meta.name, color: meta.color };
  } catch {
    return null;
  }
}

async function downloadContentPdf(content: DocContent): Promise<void> {
  const doc = await renderDocumentPdf(content);
  savePdf(doc, `${content.fileBase}.pdf`);
}

async function downloadContentDocx(content: DocContent): Promise<void> {
  const [{ Packer }, { renderDocumentDocx }, logo] = await Promise.all([
    import("docx"),
    import("./render-docx"),
    fetchDocxLogo(content.structure),
  ]);
  const blob = await Packer.toBlob(renderDocumentDocx(content, logo));
  downloadBlob(blob, `${content.fileBase}.docx`);
}

export function downloadLeaveRequestPdf(leave: LeaveDocInput): Promise<void> {
  return downloadContentPdf(leaveRequestContent(leave));
}

export function downloadMissionOrderPdf(mission: MissionDocInput): Promise<void> {
  return downloadContentPdf(missionOrderContent(mission));
}

export function downloadMissionOrderDocx(mission: MissionDocInput): Promise<void> {
  return downloadContentDocx(missionOrderContent(mission));
}
