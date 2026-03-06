import { NextRequest, NextResponse } from "next/server";
import { runMarkAbsent } from "@/lib/attendance-engine";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
