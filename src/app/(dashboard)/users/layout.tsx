import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/require-admin-page";

export const metadata: Metadata = {
  title: "Utilisateurs",
};

export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return children;
}
