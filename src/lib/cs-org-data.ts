import prisma from "@/lib/prisma";
import { CS_DEPARTMENT_ALIASES } from "@/lib/cs-tools-access";
import { isCsBirthdayToday } from "@/lib/cs-org";

export const csOrgPeopleWhere = {
  department: { in: [...CS_DEPARTMENT_ALIASES] as string[] },
  accountDisabled: false,
};

export async function loadCsOrgPeople() {
  const rows = await prisma.user.findMany({
    where: csOrgPeopleWhere,
    select: {
      id: true,
      name: true,
      position: true,
      birthDate: true,
      csOrgMember: { select: { reportsToId: true } },
      csClientAssignments: {
        where: { client: { deletedAt: null, isActive: true } },
        select: { client: { select: { name: true } } },
        orderBy: { client: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  const people = rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    birthdayToday: isCsBirthdayToday(row.birthDate),
    clients: row.csClientAssignments.map((a) => a.client.name),
  }));
  const explicit = new Map<string, string>();
  for (const row of rows) {
    if (row.csOrgMember?.reportsToId) {
      explicit.set(row.id, row.csOrgMember.reportsToId);
    }
  }
  return { people, explicit };
}
