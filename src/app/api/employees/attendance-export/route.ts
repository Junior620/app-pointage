import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  resolveAttendanceExportRange,
  fetchAttendanceExportLines,
  buildAttendanceExportBuffer,
  type AttendanceExportPreset,
} from "@/lib/attendance-export";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;

    const preset = (searchParams.get("preset") || "month") as AttendanceExportPreset;
    const fromStr = searchParams.get("from") ?? undefined;
    const toStr = searchParams.get("to") ?? undefined;
    const idsParam = searchParams.get("ids")?.trim();

    const { from, to } = resolveAttendanceExportRange(preset, fromStr, toStr);

    let employeeIds: string[] = [];
    if (idsParam) {
      employeeIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      const service = searchParams.get("service")?.trim();
      const active = searchParams.get("active");
      const where: Record<string, unknown> = {};
      if (service) where.service = service;
      if (active === "true") where.active = true;
      if (active === "false") where.active = false;
      const list = await prisma.employee.findMany({
        where,
        select: { id: true },
      });
      employeeIds = list.map((e) => e.id);
    }

    if (employeeIds.length === 0) {
      return NextResponse.json({ error: "Aucun employé sélectionné" }, { status: 400 });
    }

    const lines = await fetchAttendanceExportLines(employeeIds, from, to);
    const buffer = await buildAttendanceExportBuffer(lines, "Pointages");
    const filename = `pointages_${employeeIds.length}employes_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[API employees attendance-export]", error);
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
