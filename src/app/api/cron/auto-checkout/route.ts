import { NextRequest, NextResponse } from "next/server";
import { runAutoCheckout } from "@/lib/attendance-engine";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await runAutoCheckout();
    return NextResponse.json({
      success: true,
      message: `Auto-checkout effectué pour ${count} employé(s)`,
      count,
    });
  } catch (error) {
    console.error("Auto-checkout error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'auto-checkout" },
      { status: 500 }
    );
  }
}

export const POST = GET;
