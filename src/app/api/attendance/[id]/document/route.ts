import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "attendance-corrections";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);

type RouteContext = { params: Promise<{ id: string }> };

async function ensureBucket() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });
  }
  return supabase;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;
    const record = await db.attendanceRecord.findUnique({
      where: { id },
      select: { correctionDocument: true },
    });
    if (!record?.correctionDocument) {
      return NextResponse.json({ error: "Aucun justificatif" }, { status: 404 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(record.correctionDocument, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN"]);
    const { id } = await context.params;
    const record = await db.attendanceRecord.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: "Enregistrement non trouvé" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 5 Mo)" }, { status: 400 });
    }
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED.has(mime)) {
      return NextResponse.json({ error: "Formats acceptés : PDF, JPEG, PNG" }, { status: 400 });
    }

    const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
    const path = `${record.employeeId}/${id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = await ensureBucket();
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: mime,
      upsert: true,
    });
    if (error) {
      console.error("[attendance document upload]", error);
      return NextResponse.json({ error: "Échec de l'envoi du fichier" }, { status: 500 });
    }

    const updated = await db.attendanceRecord.update({
      where: { id },
      data: { correctionDocument: path },
      include: { employee: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API attendance document POST]", error);
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
