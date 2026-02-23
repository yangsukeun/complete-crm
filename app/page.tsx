import { redirect } from "next/navigation";
import { authWithTimeout } from "@/lib/auth-safe";

export default async function HomePage() {
  const session = await authWithTimeout();
  if (session?.user) {
    redirect("/dashboard");
  }
  redirect("/login");
}
