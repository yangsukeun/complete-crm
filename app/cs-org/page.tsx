import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canAccessCsLounge } from "@/lib/cs-lounge-access";
import { homePathForUser } from "@/lib/org-access";
import { csOrgBand } from "@/lib/cs-org";
import { PageHeadline } from "@/components/page-headline";

export default async function CsOrgPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  if (!me || !canAccessCsLounge(me)) {
    redirect(homePathForUser({ role: me?.role ?? session.user.role, department: me?.department ?? session.user.department }));
  }

  const people = await prisma.user.findMany({
    where: { department: "CS팀" },
    select: { id: true, name: true, position: true, role: true },
    orderBy: { name: "asc" },
  });

  const chief = people.filter((p) => csOrgBand(p.position) === "chief");
  const lead = people.filter((p) => csOrgBand(p.position) === "lead");
  const staff = people.filter((p) => csOrgBand(p.position) === "staff");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline title="CS 조직도" description="CS팀 직책을 기준으로 자동 배치됩니다." />
      <OrgBand title="센터장" people={chief} />
      <OrgBand title="팀장·부팀장" people={lead} />
      <OrgBand title="사원" people={staff} />
    </div>
  );
}

function OrgBand({
  title,
  people,
}: {
  title: string;
  people: { id: string; name: string; position: string | null }[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">해당 직책이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {people.map((p) => (
            <div key={p.id} className="min-w-36 rounded-lg border bg-card px-4 py-3">
              <p className="font-medium">{p.name}</p>
              <p className="text-muted-foreground text-xs">{p.position || "사원"}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
