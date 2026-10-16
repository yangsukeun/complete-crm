/** 부서 이름이 CS팀인지(별칭 포함). cs-tools-access 의 isCsDepartment 와 같은 기준이지만 클라이언트에서도 쓸 수 있다 */
const CS_DEPARTMENTS = new Set(["CS", "CS팀"]);

function isCsTeam(department: string | null | undefined): boolean {
  return CS_DEPARTMENTS.has((department ?? "").trim());
}

/**
 * 프로젝트·단계 담당자 선택 목록에서 CS팀을 뺀다(CS팀은 프로젝트 담당 대상이 아니라 목록만 길어짐).
 * 이미 지정된 사람(keepIds)은 선택 해제할 수 있도록 남긴다.
 */
export function withoutCsTeam<T extends { id: string; department?: string | null }>(
  users: T[],
  keepIds: Iterable<string> = []
): T[] {
  const keep = new Set(keepIds);
  return users.filter((u) => !isCsTeam(u.department) || keep.has(u.id));
}
