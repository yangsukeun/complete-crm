/**
 * 결제 요청 1차 승인: 이체 담당자·김소윤 님이 올린 건은 대표/임원(EXECUTIVE·ADMIN)도 승인 가능.
 * (팀장 승인 경로는 그대로 유지)
 */

export function isNamedKimSoYoon(name: string | null | undefined): boolean {
  const n = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return n === "김소윤";
}

/** 요청자가 이체 담당자이거나 이름이 김소윤이면 → 1차 승인에 대표/임원 참여 */
export function paymentRequestNeedsExecutiveFirstLineApproval(
  requesterId: string | null | undefined,
  requesterName: string | null | undefined,
  transferExecutorIds: readonly string[]
): boolean {
  if (!requesterId) return false;
  if (transferExecutorIds.includes(requesterId)) return true;
  return isNamedKimSoYoon(requesterName);
}
