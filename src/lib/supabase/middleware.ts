import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authUnavailableResponse, checkUser } from "./check-user";

/** Cookie de session posé par @supabase/ssr : `sb-<ref>-auth-token`, éventuellement découpé en `.0`, `.1`… */
function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const auth = await checkUser(supabase);
  const user = auth.status === "authenticated" ? auth.user : null;

  const { pathname } = request.nextUrl;

  // Routes publiques (pas de protection)
  const publicRoutes = ["/login", "/onboarding", "/geoloc", "/qr-chatbot", "/privacy", "/leave-request", "/mission-request", "/apple-icon", "/icon", "/brand/"];
  const isPublic =
    publicRoutes.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/geoloc") ||
    pathname.startsWith("/api/onboarding") ||
    pathname.startsWith("/api/qr-chatbot") ||
    pathname.startsWith("/api/leave-request") ||
    pathname.startsWith("/api/mission-request");

  if (isPublic) {
    return supabaseResponse;
  }

  // Supabase injoignable alors qu'une session est présente : ce n'est pas une déconnexion.
  // Les pages continuent (le layout revérifie via getSession()), les API répondent 503.
  // Rien n'est accordé ici : requireRole() / getSession() restent l'autorité.
  if (auth.status === "unavailable" && hasSessionCookie(request)) {
    if (pathname.startsWith("/api/")) return authUnavailableResponse();
    return supabaseResponse;
  }

  // Rediriger vers login si pas authentifié
  if (!user && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Retourner 401 pour les API si pas authentifié
  if (!user && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Pages réservées aux administrateurs (rôle dans les métadonnées Supabase si présent)
  const adminOnlyPaths = ["/users"];
  const isAdminOnlyPage = adminOnlyPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  const isAdminOnlyApi = pathname.startsWith("/api/users");

  if (user && (isAdminOnlyPage || isAdminOnlyApi)) {
    const metaRole = user.user_metadata?.role as string | undefined;
    if (metaRole && metaRole !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
