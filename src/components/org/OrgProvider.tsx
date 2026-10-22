"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { StructureCode } from "@/lib/brand";

/** Entreprise de l'adresse ouverte, telle que l'interface en a besoin (logos, listes de structures). */
export type OrgClientInfo = {
  slug: string;
  name: string;
  structures: StructureCode[];
};

// Sans entreprise connue, aucune marque n'est affichée plutôt que celle d'une autre entreprise.
const OrgContext = createContext<OrgClientInfo>({ slug: "", name: "", structures: [] });

export function OrgProvider({ org, children }: { org: OrgClientInfo; children: ReactNode }) {
  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgClientInfo {
  return useContext(OrgContext);
}
