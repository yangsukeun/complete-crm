/** BoardPost / Project 등에 저장하는 멘션 id JSON (`[]` 또는 `["cuid",…]`) 파싱 */
export function parseMentionUserIdsJson(raw: string | null | undefined): string[] {
  if (raw == null || !String(raw).trim()) return [];
  try {
    const a = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(a)) return [];
    return a.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

export function serializeMentionUserIdsJson(ids: string[]): string {
  const uniq = [...new Set(ids.filter((x) => typeof x === "string" && x.trim().length > 0))];
  return JSON.stringify(uniq);
}
