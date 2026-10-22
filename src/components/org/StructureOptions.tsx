"use client";

import { STRUCTURE_BRANDS } from "@/lib/brand";
import { useOrg } from "./OrgProvider";

/** Options <select> : les structures de l'entreprise courante. */
export default function StructureOptions() {
  const { structures } = useOrg();
  return (
    <>
      {structures.map((code) => (
        <option key={code} value={code}>
          {STRUCTURE_BRANDS[code].name}
        </option>
      ))}
    </>
  );
}

/** Un filtre « structure » n'a de sens que si l'entreprise en a plusieurs. */
export function useHasSeveralStructures(): boolean {
  return useOrg().structures.length > 1;
}

/** Noms des structures de l'entreprise courante (« SCPB · AFREXIA », « GoldenBeans »). */
export function OrgStructureNames({ separator = " · " }: { separator?: string }) {
  const { structures } = useOrg();
  return <>{structures.map((code) => STRUCTURE_BRANDS[code].name).join(separator)}</>;
}
