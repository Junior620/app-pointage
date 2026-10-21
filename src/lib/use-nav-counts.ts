"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { NavCountKey } from "@/lib/navigation";

export type NavCounts = Record<NavCountKey, number>;

const REFRESH_MS = 2 * 60 * 1000;
const MIN_GAP_MS = 30 * 1000;

let counts: NavCounts | null = null;
let lastFetch = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function load(force = false) {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetch < MIN_GAP_MS) return;
  lastFetch = Date.now();
  inFlight = fetch("/api/nav-counts", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && typeof json.overtime === "number") {
        counts = json as NavCounts;
        emit();
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** À appeler après une action qui change un compteur (validation, refus, annulation…). */
export function refreshNavCounts() {
  void load(true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Compteurs « à traiter » partagés (menu latéral, tableau de bord) : un seul appel réseau pour tous. */
export function useNavCounts(): NavCounts | null {
  const value = useSyncExternalStore(subscribe, () => counts, () => null);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return value;
}
