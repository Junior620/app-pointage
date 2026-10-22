import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { toInputDateLocal } from "@/lib/period-range";
import {
  resolveAttendanceExportRange,
  fetchAttendanceExportLines,
  buildAttendanceExportBuffer,
  type AttendanceExportPreset,
} from "@/lib/attendance-export";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const { id } = await params;
    const { searchParams } = request.nextUrl;

    const employee = await db.employee.findUnique({
      where: { id },
      select: { id: true, matricule: true },
    });
    if (!employee) {
      return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });
    }

    const preset = (searchParams.get("preset") || "month") as AttendanceExportPreset;
    const fromStr = searchParams.get("from") ?? undefined;
    const toStr = searchParams.get("to") ?? undefined;
    const { from, to } = resolveAttendanceExportRange(preset, fromStr, toStr);

    const lines = await fetchAttendanceExportLines(db, [id], from, to);
    const buffer = await buildAttendanceExportBuffer(lines, "Pointages");
    const filename = `pointages_${employee.matricule}_${toInputDateLocal(from)}_${toInputDateLocal(to)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[API employee attendance-export]", error);
    if (error instanceof Error) {
      if (error.message === "Non authentifié") {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.message === "Accès interdit") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
