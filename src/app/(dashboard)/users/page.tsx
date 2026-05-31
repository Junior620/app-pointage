import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import UsersAdminClient from "./UsersAdminClient";

export default async function UsersAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  return <UsersAdminClient currentUserId={session.id} />;
}
