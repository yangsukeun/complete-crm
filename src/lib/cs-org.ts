import { toKstYmd } from "@/lib/date-kst";

export type CsBirthdayPerson = { id: string; name: string; monthDay: string; isToday: boolean };

export function csBirthMonthDay(birthDate: Date): { month: number; day: number; label: string } {
  const ymd = toKstYmd(birthDate);
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  return { month, day, label: `${month}/${day}` };
}

export function isCsBirthdayToday(birthDate: Date | null | undefined, asOf = new Date()): boolean {
  if (!birthDate) return false;
  const md = csBirthMonthDay(birthDate);
  const ymd = toKstYmd(asOf);
  return md.month === Number(ymd.slice(5, 7)) && md.day === Number(ymd.slice(8, 10));
}

export function pickCsBirthdaysThisMonth(
  users: { id: string; name: string; birthDate: Date | null }[],
  asOf = new Date()
): { birthdays: CsBirthdayPerson[]; missingCount: number } {
  const thisMonth = Number(toKstYmd(asOf).slice(5, 7));
  const birthdays: CsBirthdayPerson[] = [];
  let missingCount = 0;
  for (const u of users) {
    if (!u.birthDate) {
      missingCount += 1;
      continue;
    }
    const md = csBirthMonthDay(u.birthDate);
    if (md.month === thisMonth) {
      birthdays.push({
        id: u.id,
        name: u.name,
        monthDay: md.label,
        isToday: isCsBirthdayToday(u.birthDate, asOf),
      });
    }
  }
  birthdays.sort((a, b) => {
    if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
    return a.monthDay.localeCompare(b.monthDay, "ko") || a.name.localeCompare(b.name, "ko");
  });
  return { birthdays, missingCount };
}

export type CsOrgBand = "chief" | "lead" | "staff";
export type CsOrgRank = "chief" | "lead" | "deputy" | "staff";

export function csOrgBand(position: string | null | undefined): CsOrgBand {
  const rank = csOrgRank(position);
  if (rank === "chief") return "chief";
  if (rank === "lead" || rank === "deputy") return "lead";
  return "staff";
}

export function csOrgRank(position: string | null | undefined): CsOrgRank {
  const p = String(position ?? "").replace(/\s+/g, "");
  if (p.includes("센터장")) return "chief";
  if (p.includes("부팀장")) return "deputy";
  if (p.includes("팀장")) return "lead";
  return "staff";
}

export function csOrgRankLabel(rank: CsOrgRank): string {
  return { chief: "센터장", lead: "팀장", deputy: "부팀장", staff: "사원" }[rank];
}

export type CsOrgPersonInput = {
  id: string;
  name: string;
  position: string | null;
  birthdayToday?: boolean;
  clients?: string[];
};

export type CsOrgPerson = CsOrgPersonInput & {
  reportsToId: string | null;
  clients: string[];
  birthdayToday: boolean;
};

export type CsOrgNode = CsOrgPerson & { children: CsOrgNode[] };

const RANK_ORDER: Record<CsOrgRank, number> = { chief: 0, lead: 1, deputy: 2, staff: 3 };

function sortPeople<T extends { name: string; position: string | null }>(people: T[]): T[] {
  return [...people].sort(
    (a, b) =>
      RANK_ORDER[csOrgRank(a.position)] - RANK_ORDER[csOrgRank(b.position)] ||
      a.name.localeCompare(b.name, "ko")
  );
}

/** 직책상 소속될 수 있는 상사 (센터장은 최상위) */
export function allowedCsOrgManagers<T extends { id: string; position: string | null }>(
  person: T,
  people: T[]
): T[] {
  const rank = csOrgRank(person.position);
  const others = people.filter((p) => p.id !== person.id);
  if (rank === "chief") return [];
  if (rank === "lead") return others.filter((p) => csOrgRank(p.position) === "chief");
  if (rank === "deputy") {
    return others.filter((p) => {
      const r = csOrgRank(p.position);
      return r === "chief" || r === "lead";
    });
  }
  return others.filter((p) => {
    const r = csOrgRank(p.position);
    return r === "chief" || r === "lead" || r === "deputy";
  });
}

/** 설정이 없을 때: 팀장→유일한 센터장, 부팀장→유일한 팀장(없으면 센터장). 사원은 미소속 */
export function defaultCsReportsTo(
  person: { id: string; position: string | null },
  people: { id: string; position: string | null }[]
): string | null {
  const rank = csOrgRank(person.position);
  const chiefs = people.filter((p) => csOrgRank(p.position) === "chief" && p.id !== person.id);
  const leads = people.filter((p) => csOrgRank(p.position) === "lead" && p.id !== person.id);
  if (rank === "chief") return null;
  if (rank === "lead") return chiefs.length === 1 ? chiefs[0]!.id : null;
  if (rank === "deputy") {
    if (leads.length === 1) return leads[0]!.id;
    if (chiefs.length === 1) return chiefs[0]!.id;
    return null;
  }
  if (leads.length === 1) return leads[0]!.id;
  const deputies = people.filter((p) => csOrgRank(p.position) === "deputy" && p.id !== person.id);
  if (deputies.length === 1) return deputies[0]!.id;
  if (chiefs.length === 1) return chiefs[0]!.id;
  return null;
}

export function resolveCsReportsTo(
  person: { id: string; position: string | null },
  people: { id: string; position: string | null }[],
  explicit: Map<string, string>
): string | null {
  const allowed = new Set(allowedCsOrgManagers(person, people).map((p) => p.id));
  if (explicit.has(person.id)) {
    const id = explicit.get(person.id);
    if (id && allowed.has(id)) return id;
  }
  const fallback = defaultCsReportsTo(person, people);
  return fallback && allowed.has(fallback) ? fallback : null;
}

export function csOrgWouldCycle(
  userId: string,
  reportsToId: string,
  parentOf: Map<string, string | null>
): boolean {
  let cur: string | null | undefined = reportsToId;
  const seen = new Set<string>([userId]);
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

export function resolveCsOrgReports(
  people: { id: string; position: string | null }[],
  explicit: Map<string, string>
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const p of people) {
    map.set(p.id, resolveCsReportsTo(p, people, explicit));
  }
  for (const p of people) {
    const parent = map.get(p.id);
    if (parent && csOrgWouldCycle(p.id, parent, map)) {
      map.set(p.id, null);
    }
  }
  return map;
}

export function buildCsOrgForest(
  people: CsOrgPersonInput[],
  explicit: Map<string, string>
): { roots: CsOrgNode[]; unassigned: CsOrgNode[] } {
  const reports = resolveCsOrgReports(people, explicit);
  const nodes = new Map<string, CsOrgNode>();
  for (const p of people) {
    nodes.set(p.id, {
      ...p,
      reportsToId: reports.get(p.id) ?? null,
      clients: p.clients ?? [],
      birthdayToday: Boolean(p.birthdayToday),
      children: [],
    });
  }

  const roots: CsOrgNode[] = [];
  const unassigned: CsOrgNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.reportsToId;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent && parentId !== node.id) {
      parent.children.push(node);
      continue;
    }
    node.reportsToId = null;
    if (csOrgRank(node.position) === "staff") unassigned.push(node);
    else roots.push(node);
  }

  const sortNodes = (list: CsOrgNode[]) => {
    list.sort(
      (a, b) =>
        RANK_ORDER[csOrgRank(a.position)] - RANK_ORDER[csOrgRank(b.position)] ||
        a.name.localeCompare(b.name, "ko")
    );
    for (const n of list) sortNodes(n.children);
  };
  sortNodes(roots);
  sortNodes(unassigned);
  return { roots, unassigned };
}

export function flattenCsOrgPeople(
  people: CsOrgPersonInput[],
  explicit: Map<string, string>
): CsOrgPerson[] {
  const reports = resolveCsOrgReports(people, explicit);
  return sortPeople(
    people.map((p) => ({
      ...p,
      reportsToId: reports.get(p.id) ?? null,
      clients: p.clients ?? [],
      birthdayToday: Boolean(p.birthdayToday),
    }))
  );
}
