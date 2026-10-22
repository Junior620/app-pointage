import { Packer } from "docx";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { leaveRequestContent } from "@/lib/documents/leave-request";
import { renderDocumentDocx } from "@/lib/documents/render-docx";
import { loadDocxLogo } from "@/lib/documents/docx-logo-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;

    const leave = await db.leaveRequest.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!leave) {
      return new Response("Non trouvé", { status: 404 });
    }

    const content = leaveRequestContent(leave);
    const doc = renderDocumentDocx(content, await loadDocxLogo(content.structure));
    const buffer = await Packer.toBuffer(doc);
    const name = `${content.fileBase}.docx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié")
        return new Response(JSON.stringify({ error: error.message }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      if (error.message === "Accès interdit")
        return new Response(JSON.stringify({ error: error.message }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
