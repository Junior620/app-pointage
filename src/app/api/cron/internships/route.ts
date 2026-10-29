import { NextRequest, NextResponse } from "next/server";
import { runInternshipLifecycle } from "@/lib/internship-lifecycle";
import { forEachOrg } from "@/lib/tenant";

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

/** Chaque matin : fin automatique des stages terminés et rappel aux RH 7 jours avant la fin. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await forEachOrg((scope) => runInternshipLifecycle(scope));
    const ended = results.reduce((n, r) => n + r.ended, 0);
    const reminded = results.reduce((n, r) => n + r.reminded, 0);
    return NextResponse.json({
      success: true,
      message: `${ended} stage(s) terminé(s), ${reminded} rappel(s) de fin envoyé(s) aux RH`,
      ended,
      reminded,
    });
  } catch (error) {
    console.error("Internships cron error:", error);
    return NextResponse.json({ error: "Erreur lors du suivi des stages" }, { status: 500 });
  }
}

export const POST = GET;
