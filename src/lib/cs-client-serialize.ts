/** endDate가 비어 있으면 활성. 토글을 같이 보내면 토글이 우선. */
export function csClientActiveFromPatch(opts: {
  endDate?: string | null;
  isActive?: boolean;
}): boolean | undefined {
  if (typeof opts.isActive === "boolean") return opts.isActive;
  if (opts.endDate !== undefined) return !opts.endDate;
  return undefined;
}

export function serializeCsClient(row: {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  isActive: boolean;
  phase?: string;
  updatedAt: Date;
  assignments: {
    id: string;
    userId: string;
    roleLabel: string;
    user: { name: string };
  }[];
}) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate ?? "",
    endDate: row.endDate ?? "",
    note: row.note ?? "",
    isActive: row.isActive,
    phase: row.phase === "INCOMING" || row.phase === "OUTGOING" ? row.phase : "ACTIVE",
    updatedAt: row.updatedAt.toISOString(),
    assignments: row.assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      name: a.user.name,
      roleLabel: a.roleLabel,
    })),
  };
}

export const csClientInclude = {
  assignments: {
    select: {
      id: true,
      userId: true,
      roleLabel: true,
      user: { select: { name: true } },
    },
    orderBy: { roleLabel: "asc" as const },
  },
};
