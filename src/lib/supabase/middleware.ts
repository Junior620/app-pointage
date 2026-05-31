import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Routes publiques (pas de protection)
  const publicRoutes = ["/login", "/onboarding", "/geoloc", "/qr-chatbot", "/privacy", "/leave-request", "/mission-request"];
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


  // Pages et API réservées aux administrateurs (métadonnées Supabase si présentes)
  const isAdminOnlyPage =
    pathname === "/users" || pathname.startsWith("/users/");
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
