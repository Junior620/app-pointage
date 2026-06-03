import { requireAdminPage } from "@/lib/require-admin-page";

export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return children;
}
