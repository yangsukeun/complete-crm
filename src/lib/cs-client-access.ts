import { canAccessCsLounge, canPostCsNotice } from "@/lib/cs-lounge-access";

export function canViewCsClients(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  return canAccessCsLounge(opts);
}

export function canManageCsClients(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  return canPostCsNotice(opts);
}

export function csClientNavLabel(canManage: boolean): string {
  return canManage ? "업체 관리" : "내 담당 업체";
}

export function csClientNavDescription(canManage: boolean): string {
  return canManage
    ? "전체 업체 리스트를 보고 담당을 배정합니다."
    : "내가 맡은 업체를 확인합니다.";
}

/** 관리자=전체, 직원=본인 배정 업체만 */
export function csClientListWhere(userId: string, canManage: boolean) {
  if (canManage) return { deletedAt: null };
  return { deletedAt: null, assignments: { some: { userId } } };
}
