import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canAccessCsLounge } from "@/lib/cs-lounge-access";
import { homePathForUser } from "@/lib/org-access";
import { csOrgBand, isCsBirthdayToday } from "@/lib/cs-org";
import { PageHeadline } from "@/components/page-headline";
import { CsScreen } from "@/components/cs-screen";
import { NameWithBirthday } from "@/components/ui/color-chip";

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
    select: { id: true, name: true, position: true, role: true, birthDate: true },
    orderBy: { name: "asc" },
  });

  const withBirthday = people.map((p) => ({
    ...p,
    birthdayToday: isCsBirthdayToday(p.birthDate),
  }));
  const chief = withBirthday.filter((p) => csOrgBand(p.position) === "chief");
  const lead = withBirthday.filter((p) => csOrgBand(p.position) === "lead");
  const staff = withBirthday.filter((p) => csOrgBand(p.position) === "staff");

  return (
    <CsScreen>
      <PageHeadline title="CS 조직도" description="CS팀 직책을 기준으로 자동 배치됩니다." />
      <OrgBand title="센터장" people={chief} />
      <OrgBand title="팀장·부팀장" people={lead} />
      <OrgBand title="사원" people={staff} />
    </CsScreen>
  );
}

function OrgBand({
  title,
  people,
}: {
  title: string;
  people: { id: string; name: string; position: string | null; birthdayToday: boolean }[];
}) {
  return (
    <section>
      <h2 className="cs-section-title mb-4">{title}</h2>
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">해당 직책이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {people.map((p) => (
            <div key={p.id} className="min-w-36 rounded-xl border bg-card px-5 py-4">
              <p className="font-semibold">
                <NameWithBirthday name={p.name} birthdayToday={p.birthdayToday} />
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{p.position || "사원"}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
