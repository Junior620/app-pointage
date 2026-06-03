import { requireAdminPage } from "@/lib/require-admin-page";
import UsersAdminClient from "./UsersAdminClient";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const session = await requireAdminPage();
  return <UsersAdminClient currentUserId={session.id} />;
}
