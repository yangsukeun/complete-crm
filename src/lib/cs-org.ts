import { toKstYmd } from "@/lib/date-kst";

export type CsBirthdayPerson = { id: string; name: string; monthDay: string };

export function csBirthMonthDay(birthDate: Date): { month: number; day: number; label: string } {
  const ymd = toKstYmd(birthDate);
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  return { month, day, label: `${month}/${day}` };
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
      birthdays.push({ id: u.id, name: u.name, monthDay: md.label });
    }
  }
  birthdays.sort((a, b) => a.monthDay.localeCompare(b.monthDay, "ko") || a.name.localeCompare(b.name, "ko"));
  return { birthdays, missingCount };
}

export type CsOrgBand = "chief" | "lead" | "staff";

export function csOrgBand(position: string | null | undefined): CsOrgBand {
  const p = String(position ?? "").replace(/\s+/g, "");
  if (p.includes("센터장")) return "chief";
  if (p.includes("부팀장")) return "lead";
  if (p.includes("팀장")) return "lead";
  return "staff";
}
