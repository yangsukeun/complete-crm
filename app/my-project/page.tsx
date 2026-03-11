import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { MyProjectClient } from "./my-project-client";
import prisma from "@/lib/prisma";

export default async function MyProjectPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      currentProjectId: true,
      currentProject: {
        select: {
          id: true,
          name: true,
          brand: { select: { id: true, name: true } },
        },
      },
    },
  });

  const project = user?.currentProject ?? null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-2xl mx-auto">
      <MyProjectClient initialProject={project} />
    </div>
  );
}
