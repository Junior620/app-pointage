import type { TenantScope } from "./tenant";

export async function createAuditLog(
  { db, organizationId }: TenantScope,
  params: {
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }
) {
  await db.auditLog.create({
    data: {
      organizationId,
      actorId: params.actorId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      beforeJson: params.before ? JSON.stringify(params.before) : null,
      afterJson: params.after ? JSON.stringify(params.after) : null,
    },
  });
}
