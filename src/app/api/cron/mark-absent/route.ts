import { NextRequest, NextResponse } from "next/server";
import { runMarkAbsent } from "@/lib/attendance-engine";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await runMarkAbsent();
    return NextResponse.json({
      success: true,
      message: `${count} employé(s) marqué(s) absent/permissionné/mission`,
      count,
    });
  } catch (error) {
    console.error("Mark absent error:", error);
    return NextResponse.json(
      { error: "Erreur lors du marquage des absences" },
      { status: 500 }
    );
  }
}

export const POST = GET;
