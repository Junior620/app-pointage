import { cache } from "react";
import { headers } from "next/headers";
import type { Organization } from "@prisma/client";
import type { ITXClientDenyList } from "@prisma/client/runtime/library";
import { prisma } from "./prisma";

/**
 * Multi-entreprise.
 *
 * Chaque donnée métier porte un organizationId. L'entreprise courante se déduit de l'adresse :
 * goldenbeans.staf-track.com → « goldenbeans » ; le domaine racine (staf-track.com, www, localhost,
 * URL Vercel…) → l'entreprise par défaut (DEFAULT_ORG_SLUG, « groupe »).
 *
 * Toute lecture ou écriture côté dashboard passe par tenantDb(orgId), qui ajoute l'entreprise
 * à chaque filtre. Le client `prisma` brut n'est utilisé que pour retrouver l'entreprise d'un
 * employé à partir de ce qu'il fournit (numéro WhatsApp, lien signé, code d'onboarding).
 */

export const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG?.trim() || "groupe";

export type OrgInfo = Pick<Organization, "id" | "slug" | "name" | "structures">;

const ORG_SELECT = { id: true, slug: true, name: true, structures: true } as const;

/** Adresse publique de l'entreprise par défaut (liens envoyés sur WhatsApp). */
export function appBaseUrl(): string | null {
  const raw = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

/** Domaine racine : celui de APP_BASE_URL, sans « www. ». */
function rootDomain(): string | null {
  const base = appBaseUrl();
  if (!base) return null;
  try {
    return new URL(base).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Entreprise désignée par un hôte (sous-domaine), ou l'entreprise par défaut. */
export function orgSlugFromHost(host: string | null | undefined): string {
  const hostname = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  for (const root of [rootDomain(), "localhost"]) {
    if (!root || !hostname.endsWith(`.${root}`)) continue;
    const sub = hostname.slice(0, -(root.length + 1));
    if (sub && sub !== "www" && /^[a-z0-9-]+$/.test(sub)) return sub;
  }
  return DEFAULT_ORG_SLUG;
}

/** Adresse de l'espace d'une entreprise : le domaine racine pour l'entreprise par défaut, sinon son sous-domaine. */
export function orgBaseUrl(org: Pick<Organization, "slug">): string | null {
  const base = appBaseUrl();
  if (!base || org.slug === DEFAULT_ORG_SLUG) return base;
  try {
    const url = new URL(base);
    url.hostname = `${org.slug}.${url.hostname.replace(/^www\./, "")}`;
    return url.toString().replace(/\/$/, "");
  } catch {
    return base;
  }
}

export const findOrgBySlug = cache(async (slug: string): Promise<OrgInfo | null> => {
  return prisma.organization.findFirst({ where: { slug, active: true }, select: ORG_SELECT });
});

export const findOrgById = cache(async (id: string): Promise<OrgInfo | null> => {
  return prisma.organization.findFirst({ where: { id, active: true }, select: ORG_SELECT });
});

/** Hôte de la requête en cours (derrière le proxy Vercel, l'hôte d'origine). */
export async function requestHost(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

/** Entreprise de l'adresse ouverte, ou null si le sous-domaine ne correspond à aucune entreprise active. */
export const getCurrentOrg = cache(async (): Promise<OrgInfo | null> => {
  return findOrgBySlug(orgSlugFromHost(await requestHost()));
});

/** L'hôte d'une requête correspond-il à cette entreprise ? (liens ouverts depuis WhatsApp) */
export function hostMatchesOrg(host: string | null | undefined, org: Pick<Organization, "slug">): boolean {
  return orgSlugFromHost(host) === org.slug;
}

/**
 * Entreprise d'un employé identifié par un lien public (GPS, formulaires), à condition que le lien
 * soit ouvert sur l'adresse de cette entreprise. Sinon null : la route répond « lien invalide ».
 */
export async function orgForEmployeeRequest(organizationId: string, request: Request): Promise<OrgInfo | null> {
  const org = await findOrgById(organizationId);
  if (!org) return null;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return hostMatchesOrg(host, org) ? org : null;
}

export const WRONG_ORG_LINK_MESSAGE = "Ce lien n'est pas valable sur cette adresse. Utilisez le dernier lien reçu sur WhatsApp.";

// ---------------------------------------------------------------------------
// Client Prisma cloisonné
// ---------------------------------------------------------------------------

/** Modèles portant un organizationId (tous sauf Organization). */
const TENANT_MODELS = new Set<string>([
  "User",
  "Employee",
  "EmployeeWhatsappPhone",
  "Site",
  "Schedule",
  "AttendanceRecord",
  "LeaveRequest",
  "MissionOrderSequence",
  "Mission",
  "FraudAttempt",
  "Holiday",
  "HrRemark",
  "AuditLog",
  "PublicSubmissionLog",
]);

export class TenantViolationError extends Error {
  constructor(model: string, operation: string) {
    super(`Écriture hors de l'entreprise courante (${model}.${operation})`);
    this.name = "TenantViolationError";
  }
}

type Args = Record<string, unknown>;

function belongsTo(data: unknown, organizationId: string): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { organizationId?: unknown; organization?: { connect?: { id?: unknown } } };
  return d.organizationId === organizationId || d.organization?.connect?.id === organizationId;
}

function changesOrg(data: unknown, organizationId: string): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { organizationId?: unknown; organization?: unknown };
  if (d.organization !== undefined) return true;
  return d.organizationId !== undefined && d.organizationId !== organizationId;
}

function createScopedClient(organizationId: string) {
  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = { ...((args ?? {}) as Args) };

          switch (operation) {
            case "create":
              if (!belongsTo(a.data, organizationId)) throw new TenantViolationError(model, operation);
              break;
            case "createMany":
            case "createManyAndReturn": {
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              if (!rows.every((row) => belongsTo(row, organizationId))) throw new TenantViolationError(model, operation);
              break;
            }
            case "upsert":
              if (!belongsTo(a.create, organizationId) || changesOrg(a.update, organizationId)) {
                throw new TenantViolationError(model, operation);
              }
              a.where = { ...(a.where as Args), organizationId };
              break;
            case "update":
            case "updateMany":
            case "updateManyAndReturn":
              if (changesOrg(a.data, organizationId)) throw new TenantViolationError(model, operation);
              a.where = { ...(a.where as Args), organizationId };
              break;
            default:
              // findUnique / findFirst / findMany / count / aggregate / groupBy / delete / deleteMany…
              a.where = { ...(a.where as Args), organizationId };
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createScopedClient>;
/** Client cloisonné ou transaction ouverte à partir de lui. */
export type Db = Omit<TenantDb, ITXClientDenyList>;

const clients = new Map<string, TenantDb>();

/** Accès aux données limité à une entreprise. */
export function tenantDb(organizationId: string): TenantDb {
  let client = clients.get(organizationId);
  if (!client) {
    client = createScopedClient(organizationId);
    clients.set(organizationId, client);
  }
  return client;
}

/** Entreprise + accès cloisonné, pour les fonctions métier partagées (moteur de pointage, exports…). */
export type TenantScope = { organizationId: string; db: Db };

export function tenantScope(organizationId: string): TenantScope {
  return { organizationId, db: tenantDb(organizationId) };
}

/** Entreprises actives (tâches planifiées : un passage par entreprise). */
export async function listActiveOrgs(): Promise<OrgInfo[]> {
  return prisma.organization.findMany({ where: { active: true }, select: ORG_SELECT, orderBy: { createdAt: "asc" } });
}

/**
 * Tâches planifiées : exécute `task` pour chaque entreprise active, avec son accès cloisonné.
 * Une entreprise en erreur n'empêche pas les autres ; l'erreur est relancée une fois toutes traitées.
 */
export async function forEachOrg<T>(task: (ctx: TenantScope & { org: OrgInfo }) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  const errors: unknown[] = [];
  for (const org of await listActiveOrgs()) {
    try {
      results.push(await task({ org, ...tenantScope(org.id) }));
    } catch (e) {
      console.error(`[tenant] ${org.slug} :`, e);
      errors.push(e);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Erreur dans plusieurs entreprises");
  return results;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
