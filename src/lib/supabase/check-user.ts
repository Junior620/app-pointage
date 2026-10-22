import { isAuthRetryableFetchError, type AuthError, type SupabaseClient, type User } from "@supabase/supabase-js";

/** Message renvoyé quand Supabase Auth ne répond pas : la session n'est pas jugée invalide pour autant. */
export const AUTH_UNAVAILABLE_MESSAGE =
  "Service de connexion momentanément injoignable. Réessayez dans quelques secondes.";

export type AuthCheck =
  | { status: "authenticated"; user: User }
  | { status: "anonymous" }
  | { status: "unavailable"; error: unknown };

const RETRY_DELAY_MS = 300;
// Si le premier essai a déjà attendu un timeout réseau, on ne double pas l'attente.
const RETRY_BUDGET_MS = 3000;

/**
 * Vérifie l'utilisateur auprès de Supabase Auth en séparant « pas de session valide » (`anonymous`)
 * de « Supabase injoignable » (`unavailable` : réseau coupé, 5xx, réponse illisible).
 * Dans le second cas, un seul nouvel essai court est tenté. `unavailable` n'accorde jamais d'accès.
 */
export async function checkUser(supabase: Pick<SupabaseClient, "auth">): Promise<AuthCheck> {
  const startedAt = Date.now();
  let result = await attempt(supabase);
  if (result.status === "unavailable" && Date.now() - startedAt < RETRY_BUDGET_MS) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    result = await attempt(supabase);
  }
  if (result.status === "unavailable") {
    console.warn("[auth] Supabase Auth injoignable, session non vérifiée :", describe(result.error));
  }
  return result;
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const status = "status" in error && error.status ? ` ${error.status}` : "";
  return `${error.name}${status} ${error.message}`;
}

async function attempt(supabase: Pick<SupabaseClient, "auth">): Promise<AuthCheck> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { status: "authenticated", user: data.user };
    if (error && isTransient(error)) return { status: "unavailable", error };
    return { status: "anonymous" };
  } catch (error) {
    // getUser() ne lève que sur une erreur inattendue (hors AuthError) : on ne peut pas trancher.
    return { status: "unavailable", error };
  }
}

/** Erreurs qui ne disent rien de la session : fetch échoué, 502/503/504, autre 5xx, corps illisible. */
function isTransient(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) || error.name === "AuthUnknownError" || (error.status ?? 0) >= 500;
}
