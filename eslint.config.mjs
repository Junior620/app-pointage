import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Multi-entreprise : pages et routes passent par requireTenant() / tenantDb() (src/lib/tenant.ts),
    // jamais par le client Prisma brut, qui voit les données de toutes les entreprises.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    // Liens publics : l'employé est d'abord retrouvé sur toutes les entreprises (jeton signé).
    ignores: ["src/app/api/leave-request/**", "src/app/api/mission-request/**", "src/app/api/onboarding/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/prisma",
              message: "Utiliser requireTenant() ou tenantDb() (src/lib/tenant.ts) pour rester dans l'entreprise courante.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
