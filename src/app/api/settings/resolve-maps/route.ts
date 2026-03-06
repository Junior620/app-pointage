import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

function extractCoords(url: string): { lat: number; lng: number } | null {
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

  const qMatch = url.match(/[?&](?:q|ll|query|center)=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };

  const placeMatch = url.match(/place\/[^/]+\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeMatch) return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };

  const ftidMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (ftidMatch) return { lat: parseFloat(ftidMatch[1]), lng: parseFloat(ftidMatch[2]) };

  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN"]);
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL requise" }, { status: 400 });
    }

    const directCoords = extractCoords(url);
    if (directCoords) {
      return NextResponse.json({ data: directCoords });
    }

    const isShortLink = /goo\.gl|maps\.app/.test(url);
    if (!isShortLink) {
      return NextResponse.json({ error: "Coordonnées non trouvées dans le lien" }, { status: 400 });
    }

    const response = await fetch(url, { redirect: "follow" });
    const finalUrl = response.url;

    const coords = extractCoords(finalUrl);
    if (!coords) {
      const html = await response.text();
      const metaMatch = html.match(/center=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (metaMatch) {
        return NextResponse.json({ data: { lat: parseFloat(metaMatch[1]), lng: parseFloat(metaMatch[2]) } });
      }
      const coordMatch = html.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch) {
        return NextResponse.json({ data: { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) } });
      }
      const dataMatch = html.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
      if (dataMatch) {
        return NextResponse.json({ data: { lat: parseFloat(dataMatch[1]), lng: parseFloat(dataMatch[2]) } });
      }
      return NextResponse.json({ error: "Coordonnées non trouvées après redirection" }, { status: 400 });
    }

    return NextResponse.json({ data: coords });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur lors de la résolution du lien" }, { status: 500 });
  }
}
