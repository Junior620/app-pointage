/**
 * Crée une entreprise (multi-entreprise) et, si demandé, son premier compte administrateur.
 *
 *   pnpm org:create --slug goldenbeans --name "GoldenBeans" --structures GOLDENBEANS \
 *     --admin-email admin@goldenbeans.cm --admin-name "Prénom Nom"
 *
 * - L'espace de l'entreprise répond sur <slug>.<domaine de APP_BASE_URL>.
 * - Les jours fériés de l'entreprise par défaut sont recopiés.
 * - Le mot de passe de l'administrateur est demandé dans le terminal (saisie masquée) :
 *   il n'apparaît ni dans la commande ni dans l'historique.
 * - Relancer la commande ne recrée rien : une entreprise ou un compte existants sont conservés.
 */
import { PrismaClient, Structure } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const DEFAULT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG?.trim() || "groupe";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("Saisie du mot de passe impossible : lancez la commande dans un terminal interactif (PowerShell)."));
      return;
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const slug = arg("slug")?.toLowerCase();
  const name = arg("name");
  const structures = (arg("structures") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const adminEmail = arg("admin-email")?.toLowerCase();
  const adminName = arg("admin-name");

  if (!slug || !/^[a-z0-9-]+$/.test(slug) || slug === "www") fail("--slug requis (lettres minuscules, chiffres, tirets).");
  if (!name) fail("--name requis.");
  const known = Object.values(Structure) as string[];
  const unknown = structures.filter((s) => !known.includes(s));
  if (structures.length === 0 || unknown.length > 0) {
    fail(`--structures requis, parmi : ${known.join(", ")}${unknown.length ? ` (inconnu : ${unknown.join(", ")})` : ""}.`);
  }
  if (adminEmail && !adminName) fail("--admin-name requis avec --admin-email.");

  // 1. Entreprise
  let org = await prisma.organization.findUnique({ where: { slug } });
  if (org) {
    console.log(`• L'entreprise « ${org.name} » (${slug}) existe déjà : conservée.`);
  } else {
    org = await prisma.organization.create({
      data: { slug, name, structures: structures as Structure[] },
    });
    console.log(`✔ Entreprise créée : ${org.name} (${slug}).`);

    // 2. Jours fériés de l'entreprise par défaut
    const source = await prisma.organization.findUnique({ where: { slug: DEFAULT_ORG_SLUG } });
    if (source && source.id !== org.id) {
      const holidays = await prisma.holiday.findMany({ where: { organizationId: source.id } });
      if (holidays.length > 0) {
        await prisma.holiday.createMany({
          data: holidays.map((h) => ({ organizationId: org!.id, name: h.name, date: h.date, recurring: h.recurring })),
        });
      }
      console.log(`✔ ${holidays.length} jour(s) férié(s) recopié(s) depuis « ${source.name} ».`);
    }
  }

  // 3. Premier administrateur
  if (!adminEmail) return;
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    if (existing.organizationId !== org.id) fail(`${adminEmail} est déjà un compte d'une autre entreprise.`);
    console.log(`• Le compte ${adminEmail} existe déjà : conservé.`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires pour créer le compte.");

  const password = await promptHidden(`Mot de passe pour ${adminEmail} (8 caractères minimum) : `);
  if (password.length < 8) fail("Mot de passe trop court.");
  const confirm = await promptHidden("Confirmez le mot de passe : ");
  if (confirm !== password) fail("Les deux saisies ne correspondent pas.");

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: { name: adminName, role: "ADMIN" },
  });
  if (error || !data.user) fail(`Supabase Auth : ${error?.message ?? "création sans identifiant"}.`);

  try {
    await prisma.user.create({
      data: {
        organizationId: org.id,
        supabaseAuthId: data.user.id,
        email: adminEmail,
        name: adminName!,
        role: "ADMIN",
      },
    });
  } catch (e) {
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
    throw e;
  }
  console.log(`✔ Administrateur créé : ${adminName} <${adminEmail}>.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `✖ ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
