import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Warehouse } from "lucide-react";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewCsOrg } from "@/lib/cs-client-access";
import { homePathForUser } from "@/lib/org-access";
import { buildCsOrgForest } from "@/lib/cs-org";
import { loadCsOrgPeople } from "@/lib/cs-org-data";
import { CsScreen } from "@/components/cs-screen";
import { Button } from "@/components/ui/button";
import { CsOrgPyramid } from "./cs-org-tree";
import { CsOrgBoard } from "./cs-org-board";

export default async function CsOrgPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  if (!me || !canViewCsOrg(me)) {
    redirect(homePathForUser({ role: me?.role ?? session.user.role, department: me?.department ?? session.user.department }));
  }

  const [{ people, explicit }, memo, hires, phaseClients] = await Promise.all([
    loadCsOrgPeople(),
    prisma.csOrgMemo.upsert({
      where: { id: "cs-org" },
      create: { id: "cs-org", content: "" },
      update: {},
    }),
    prisma.csOrgHire.findMany({ orderBy: [{ joinDate: "asc" }, { name: "asc" }] }),
    prisma.csClient.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        note: true,
        phase: true,
        assignments: { select: { user: { select: { name: true } } }, orderBy: { roleLabel: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const { roots, unassigned } = buildCsOrgForest(people, explicit);
  const incoming = phaseClients.filter((c) => c.phase === "INCOMING").map(mapPhaseClient);
  const outgoing = phaseClients.filter((c) => c.phase === "OUTGOING").map(mapPhaseClient);
  const catalog = phaseClients.map((c) => ({
    id: c.id,
    name: c.name,
    phase: c.phase === "INCOMING" || c.phase === "OUTGOING" ? c.phase : "ACTIVE",
  }));

  return (
    <CsScreen className="gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold tracking-tight">CS 조직도</h1>
        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant="outline">
            <Link href="/cs-org/month">
              <CalendarDays className="size-3.5" />
              월별 담당
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/cs-org/settings">
              <Warehouse className="size-3.5" />
              설정 창고
            </Link>
          </Button>
        </div>
      </div>
      <CsOrgPyramid roots={roots} unassigned={unassigned} />
      <CsOrgBoard
        initialMemo={memo.content}
        initialHires={hires.map((h) => ({
          id: h.id,
          name: h.name,
          joinDate: h.joinDate ?? "",
          note: h.note ?? "",
        }))}
        incoming={incoming}
        outgoing={outgoing}
        catalog={catalog}
      />
    </CsScreen>
  );
}

function mapPhaseClient(c: {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  phase: string;
  assignments: { user: { name: string } }[];
}) {
  return {
    id: c.id,
    name: c.name,
    startDate: c.startDate ?? "",
    endDate: c.endDate ?? "",
    note: c.note ?? "",
    phase: c.phase === "OUTGOING" ? ("OUTGOING" as const) : ("INCOMING" as const),
    assignees: c.assignments.map((a) => a.user.name),
  };
}
