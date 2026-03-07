import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(request: NextRequest) {
  const phone = process.env.WHATSAPP_BUSINESS_PHONE;
  if (!phone || !/^\d{10,15}$/.test(phone.trim())) {
    return NextResponse.json(
      { error: "WHATSAPP_BUSINESS_PHONE non configuré (format: 237690000000)" },
      { status: 503 }
    );
  }

  const link = `https://wa.me/${phone.trim()}`;
  const download = request.nextUrl.searchParams.get("download") === "1";

  try {
    const png = await QRCode.toBuffer(link, {
      type: "png",
      width: 400,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": download
          ? "attachment; filename=qr-chatbot-pointage.png"
          : "inline; filename=qr-chatbot-pointage.png",
      },
    });
  } catch (e) {
    console.error("QR generation error:", e);
    return NextResponse.json({ error: "Erreur génération QR" }, { status: 500 });
  }
}
