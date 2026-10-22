import { Document } from "docx";
import {
  DOCX_SECTION_PROPERTIES,
  DOCX_STYLES,
  docxFooter,
  docxHeader,
  docxKeyValues,
  docxNotice,
  docxParagraph,
  docxSectionTitle,
  docxSignatures,
  spacer,
  type DocxLogo,
} from "./docx-kit";
import type { DocContent } from "./types";

/** Rend un contenu de document RH en fichier Word (même mise en page que le PDF). */
export function renderDocumentDocx(content: DocContent, logo: DocxLogo | null): Document {
  return new Document({
    creator: "Pointage RH",
    title: content.title,
    styles: DOCX_STYLES,
    sections: [
      {
        properties: DOCX_SECTION_PROPERTIES,
        footers: { default: docxFooter() },
        children: [
          docxHeader({ title: content.title, subtitle: content.subtitle, logo }),
          ...(content.notice ? [docxNotice(content.notice)] : []),
          ...content.sections.flatMap((s) => [docxSectionTitle(s.title), docxKeyValues(s.rows)]),
          spacer(200),
          ...(content.closing ?? []).map((p) => docxParagraph(p)),
          spacer(120),
          docxSignatures(content.signatures),
        ],
      },
    ],
  });
}
