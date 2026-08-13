import { redirect } from "next/navigation";
import { authWithTimeout } from "@/lib/auth-safe";
import prisma from "@/lib/prisma";
import { homePathForUser } from "@/lib/org-access";

export default async function HomePage() {
  const session = await authWithTimeout();
  if (session?.user) {
    let department = session.user.department ?? null;
    if (department == null || department === "") {
      try {
        const row = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { department: true },
        });
        department = row?.department ?? null;
      } catch {
        /* JWT 부서만 사용 */
      }
    }
    redirect(homePathForUser({ role: session.user.role, department }));
  }
  redirect("/login");
}
