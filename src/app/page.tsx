import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";

export default async function RootPage() {
  const user = await requireUser();
  redirect(user.role === "PROFESSOR" ? "/professor" : "/uta");
}
