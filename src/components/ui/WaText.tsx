import { Fragment } from "react";

/**
 * Affiche un message rédigé pour WhatsApp (gras entre astérisques : *1*) sur une page web,
 * en transformant *texte* en gras au lieu d'afficher les astérisques.
 */
export function WaText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.length > 2 && part.startsWith("*") && part.endsWith("*") ? (
          <strong key={i}>{part.slice(1, -1)}</strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </span>
  );
}
