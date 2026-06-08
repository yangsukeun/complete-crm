/** 본문(description) 관련 최종 수정자 — revision 이력에서 추출 */
export function lastTaskBodyEditorName(
  revisions?: Array<{ field: string; user?: { name?: string | null } | null }> | null
): string | null {
  if (!revisions?.length) return null;
  const descRevs = revisions.filter((r) => r.field === "description");
  const last = (descRevs.length > 0 ? descRevs[descRevs.length - 1] : revisions[revisions.length - 1])
    ?.user?.name;
  return last?.trim() || null;
}
