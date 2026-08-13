import { toKstYmd } from "@/lib/date-kst";

export function isBlank(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

/** 빈 문자열 필드만 보완. 이미 값이 있으면 덮어쓰지 않음. */
export function fillEmptyString(
  current: string | null | undefined,
  incoming: string | null | undefined
): string | undefined {
  if (isBlank(incoming)) return undefined;
  if (!isBlank(current)) return undefined;
  return String(incoming).trim();
}

/**
 * joinDate는 스키마 기본값(now)이라 비어 있지 않음.
 * 계정 생성일과 같은 KST 날짜면 플레이스홀더로 보고 엑셀 입사일로 보완.
 */
export function shouldFillJoinDate(joinDate: Date, createdAt: Date): boolean {
  return toKstYmd(joinDate) === toKstYmd(createdAt);
}
