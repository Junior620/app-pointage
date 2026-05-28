import { prisma } from "./prisma";
import type { PublicSubmissionType } from "@prisma/client";

export function clientIpFromRequest(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim().slice(0, 64);
  return null;
}

export async function logPublicSubmission(params: {
  employeeId: string;
  type: PublicSubmissionType;
  entity: string;
  entityId: string;
  request: Request;
  payload?: unknown;
}) {
  const userAgent = params.request.headers.get("user-agent");
  await prisma.publicSubmissionLog.create({
    data: {
      employeeId: params.employeeId,
      type: params.type,
      entity: params.entity,
      entityId: params.entityId,
      ipAddress: clientIpFromRequest(params.request),
      userAgent: userAgent ? userAgent.slice(0, 2000) : null,
      payloadJson: params.payload ? JSON.stringify(params.payload) : null,
    },
  });
}
