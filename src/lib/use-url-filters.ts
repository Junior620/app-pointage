"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filtres d'une liste gardés dans l'adresse de la page (?status=…&page=…) :
 * ils survivent au rechargement, au bouton Retour et se partagent par lien.
 * Une valeur égale à sa valeur par défaut est retirée de l'adresse.
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const defaultsKey = JSON.stringify(defaults);

  const values = useMemo(() => {
    const base = JSON.parse(defaultsKey) as T;
    const out = { ...base };
    for (const key of Object.keys(base) as (keyof T)[]) {
      const v = searchParams.get(key as string);
      if (v !== null) out[key] = v as T[keyof T];
    }
    return out;
  }, [searchParams, defaultsKey]);

  const setValues = useCallback(
    (patch: Partial<T>) => {
      const base = JSON.parse(defaultsKey) as T;
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === base[key]) params.delete(key);
        else params.set(key, value as string);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router, defaultsKey]
  );

  return [values, setValues] as const;
}
