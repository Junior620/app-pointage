import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/ui/Providers";
import { getCurrentOrg } from "@/lib/tenant";
import { APP_NAME } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Pointage RH",
    template: "%s · Pointage RH",
  },
  description: "Système de pointage horaire avec chatbot WhatsApp et portail Web RH/DG",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // L'entreprise se déduit de l'adresse (sous-domaine) : logos et listes de structures en dépendent.
  const org = await getCurrentOrg();

  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {org ? (
          <Providers org={{ slug: org.slug, name: org.name, structures: org.structures }}>{children}</Providers>
        ) : (
          <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 text-center">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Adresse inconnue</h1>
              <p className="mt-2 text-sm text-slate-500">
                Aucune entreprise n&apos;utilise {APP_NAME} à cette adresse. Vérifiez le lien reçu.
              </p>
            </div>
          </main>
        )}
      </body>
    </html>
  );
}
