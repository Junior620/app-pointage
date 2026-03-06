import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Créer l'utilisateur admin dans Supabase Auth
  const { data: authUser, error: authError } =
    await supabase.auth.admin.createUser({
      email: "admin@pointage.com",
      password: "admin123456",
      email_confirm: true,
    });

  if (authError && !authError.message.includes("already been registered")) {
    throw authError;
  }

  const supabaseAuthId =
    authUser?.user?.id ??
    (
      await supabase.auth.admin.listUsers()
    ).data.users.find((u) => u.email === "admin@pointage.com")?.id;

  if (!supabaseAuthId) throw new Error("Impossible de créer l'utilisateur admin");

  // Créer l'admin dans notre table users
  await prisma.user.upsert({
    where: { email: "admin@pointage.com" },
    update: {},
    create: {
      supabaseAuthId,
      email: "admin@pointage.com",
      name: "Administrateur",
      role: "ADMIN",
    },
  });

  // Créer un utilisateur RH
  const { data: hrAuth } = await supabase.auth.admin.createUser({
    email: "rh@pointage.com",
    password: "rh123456",
    email_confirm: true,
  });

  const hrSupabaseId =
    hrAuth?.user?.id ??
    (
      await supabase.auth.admin.listUsers()
    ).data.users.find((u) => u.email === "rh@pointage.com")?.id;

  if (hrSupabaseId) {
    await prisma.user.upsert({
      where: { email: "rh@pointage.com" },
      update: {},
      create: {
        supabaseAuthId: hrSupabaseId,
        email: "rh@pointage.com",
        name: "Responsable RH",
        role: "HR",
      },
    });
  }

  // Créer un site par défaut
  const site = await prisma.site.upsert({
    where: { id: "default-site" },
    update: {},
    create: {
      id: "default-site",
      name: "Siège principal",
      centerLat: 5.3599517,
      centerLng: -4.0082563,
      radiusM: 200,
    },
  });

  // Créer un horaire par défaut
  await prisma.schedule.upsert({
    where: { id: "default-schedule" },
    update: {},
    create: {
      id: "default-schedule",
      siteId: site.id,
      startTime: "08:30",
      endTime: "18:00",
      closureTime: "22:00",
      lateGraceMin: 15,
    },
  });

  // Créer quelques employés de test
  const employees = [
    { matricule: "EMP001", firstName: "Kouadio", lastName: "Jean", service: "IT" },
    { matricule: "EMP002", firstName: "Traoré", lastName: "Aminata", service: "Finance" },
    { matricule: "EMP003", firstName: "Koné", lastName: "Ibrahim", service: "RH" },
  ];

  for (const emp of employees) {
    await prisma.employee.upsert({
      where: { matricule: emp.matricule },
      update: {},
      create: {
        ...emp,
        siteId: site.id,
      },
    });
  }

  console.log("Seed terminé avec succès !");
  console.log("Admin: admin@pointage.com / admin123456");
  console.log("RH: rh@pointage.com / rh123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
