import { canSeeCsToolsDashboardCard, isCsDepartment } from "@/lib/cs-tools-access";
import { isExecutiveOrAdmin } from "@/lib/role-access";

export function canAccessCsLounge(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  return canSeeCsToolsDashboardCard(opts);
}

export function canPostCsNotice(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  if (isExecutiveOrAdmin(opts.role)) return true;
  const r = String(opts.role ?? "").toUpperCase();
  if (r !== "TEAM_LEAD" && r !== "CENTER_CHIEF") return false;
  return isCsDepartment(opts.department);
}

export function canModerateCsLounge(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  return canPostCsNotice(opts);
}

export function escapePlainText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ADJECTIVES = [
  "포근한",
  "명랑한",
  "고요한",
  "빠른",
  "솔직한",
  "느긋한",
  "단단한",
  "밝은",
  "차분한",
  "씩씩한",
] as const;

const NOUNS = [
  "구름",
  "돌멩이",
  "바람",
  "별빛",
  "나무",
  "고양이",
  "파도",
  "연필",
  "찻잔",
  "지우개",
] as const;

export function randomCsLoungeNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? ADJECTIVES[0];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)] ?? NOUNS[0];
  return `${adj} ${noun}`;
}
