/**
 * Contrôle du cloisonnement entre entreprises (src/lib/tenant.ts), sur une base LOCALE uniquement.
 *
 *   pnpm tenant:check
 *
 * Crée deux entreprises de test A et B, des données dans B, puis vérifie qu'avec tenantDb(A) aucune
 * donnée de B n'est lisible, modifiable ni supprimable, et qu'aucune écriture ne peut viser B.
 * Tout est supprimé à la fin.
 */
import { prisma } from "../src/lib/prisma";
import { tenantDb, TenantViolationError } from "../src/lib/tenant";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
  console.error("✖ Ce contrôle écrit dans la base : il ne s'exécute que sur une base locale (localhost).");
  process.exit(1);
}

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✔" : "✖"} ${label}`);
  if (!ok) failures++;
}
async function rejects(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false);
  } catch (e) {
    check(label, e instanceof TenantViolationError || (e as { code?: string }).code === "P2025");
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({ data: { slug: `test-a-${suffix}`, name: "Test A", structures: ["SCPB"] } }),
    prisma.organization.create({ data: { slug: `test-b-${suffix}`, name: "Test B", structures: ["GOLDENBEANS"] } }),
  ]);
  const a = tenantDb(orgA.id);
  const b = tenantDb(orgB.id);

  try {
    // Données de B
    const siteB = await b.site.create({
      data: { organizationId: orgB.id, name: "Site B", centerLat: 4, centerLng: 9, radiusM: 100 },
    });
    const empB = await b.employee.create({
      data: {
        organizationId: orgB.id,
        matricule: "M001",
        firstName: "Bea",
        lastName: "B",
        service: "Achats",
        structure: "GOLDENBEANS",
        siteId: siteB.id,
      },
    });
    const day = new Date(Date.UTC(2026, 9, 21));
    const recB = await b.attendanceRecord.create({
      data: { organizationId: orgB.id, employeeId: empB.id, date: day, finalStatus: "PRESENT" },
    });
    const leaveB = await b.leaveRequest.create({
      data: { organizationId: orgB.id, employeeId: empB.id, startDate: day, endDate: day, reason: "Test" },
    });
    const holB = await b.holiday.create({ data: { organizationId: orgB.id, name: "Férié B", date: day } });
    const internB = await b.internship.create({
      data: { organizationId: orgB.id, employeeId: empB.id, startDate: day, endDate: day, school: "École B" },
    });

    // Même matricule autorisé dans une autre entreprise
    const empA = await a.employee.create({
      data: { organizationId: orgA.id, matricule: "M001", firstName: "Abel", lastName: "A", service: "RH", structure: "SCPB" },
    });
    check("Même matricule possible dans deux entreprises", Boolean(empA));

    // Lectures
    check("findUnique par id → introuvable", (await a.employee.findUnique({ where: { id: empB.id } })) === null);
    check("findFirst → introuvable", (await a.site.findFirst({ where: { id: siteB.id } })) === null);
    check("findMany → seulement A", (await a.employee.findMany()).every((e) => e.organizationId === orgA.id));
    check("count → 0 donnée de B", (await a.attendanceRecord.count({ where: { employeeId: empB.id } })) === 0);
    check(
      "clé composée employeeId_date → introuvable",
      (await a.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: empB.id, date: day } } })) === null
    );
    check("findMany sur une relation → rien", (await a.leaveRequest.findMany({ where: { employee: { id: empB.id } } })).length === 0);
    check("aggregate → 0", (await a.holiday.aggregate({ _count: true, where: { id: holB.id } }))._count === 0);
    check("stage de B → introuvable", (await a.internship.findUnique({ where: { id: internB.id } })) === null);
    check(
      "stage par employeeId de B → introuvable",
      (await a.internship.findUnique({ where: { employeeId: empB.id } })) === null
    );
    check(
      "groupBy → rien de B",
      (await a.employee.groupBy({ by: ["structure"], _count: true })).every((g) => g.structure !== "GOLDENBEANS")
    );

    // Écritures
    await rejects("update d'une ligne de B → refusé", () => a.employee.update({ where: { id: empB.id }, data: { firstName: "X" } }));
    check("updateMany sur B → 0", (await a.leaveRequest.updateMany({ where: { id: leaveB.id }, data: { reason: "X" } })).count === 0);
    await rejects("delete d'une ligne de B → refusé", () => a.attendanceRecord.delete({ where: { id: recB.id } }));
    check("deleteMany sur B → 0", (await a.holiday.deleteMany({ where: { id: holB.id } })).count === 0);
    await rejects("prolonger le stage de B → refusé", () =>
      a.internship.update({ where: { id: internB.id }, data: { endDate: day } })
    );
    await rejects("create avec l'entreprise B → refusé", () =>
      a.holiday.create({ data: { organizationId: orgB.id, name: "Intrus", date: day } })
    );
    await rejects("createMany avec l'entreprise B → refusé", () =>
      a.holiday.createMany({ data: [{ organizationId: orgB.id, name: "Intrus", date: day }] })
    );
    await rejects("update qui change d'entreprise → refusé", () =>
      a.employee.update({ where: { id: empA.id }, data: { organizationId: orgB.id } })
    );
    await rejects("upsert vers l'entreprise B → refusé", () =>
      a.holiday.upsert({
        where: { id: holB.id },
        create: { organizationId: orgB.id, name: "Intrus", date: day },
        update: { name: "Intrus" },
      })
    );
    const inTx = await a.$transaction(async (tx) => tx.employee.findUnique({ where: { id: empB.id } }));
    check("transaction → toujours cloisonnée", inTx === null);

    // B est intact
    const stillB = await b.employee.findUnique({ where: { id: empB.id } });
    check("Données de B intactes", stillB?.firstName === "Bea");
  } finally {
    for (const org of [orgA, orgB]) {
      const where = { organizationId: org.id };
      await prisma.internship.deleteMany({ where });
      await prisma.attendanceRecord.deleteMany({ where });
      await prisma.leaveRequest.deleteMany({ where });
      await prisma.holiday.deleteMany({ where });
      await prisma.employee.deleteMany({ where });
      await prisma.site.deleteMany({ where });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  }

  console.log(failures === 0 ? "\nCloisonnement : OK" : `\nCloisonnement : ${failures} échec(s)`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
