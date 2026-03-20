import { parseStoredTaskBody } from "@/lib/task-body-description";

function readUserIdFromPropsBag(bag: unknown): string | null {
  if (!bag || typeof bag !== "object") return null;
  const b = bag as Record<string, unknown>;
  const uid = b.userId;
  if (typeof uid === "string" && uid.trim()) return uid.trim();
  return null;
}

function tryCollectMentionFromObject(o: Record<string, unknown>, ids: Set<string>) {
  const t = o.type;
  if (t !== "userMention") return;
  for (const key of ["props", "attrs"] as const) {
    const uid = readUserIdFromPropsBag(o[key]);
    if (uid) {
      ids.add(uid);
      return;
    }
  }
  const topUid = o.userId;
  if (typeof topUid === "string" && topUid.trim()) {
    ids.add(topUid.trim());
  }
}

/** 모든 중첩 객체·배열에서 userMention 탐색 (표/열/커스텀 블록 내부 포함) */
function deepCollectUserMentions(value: unknown, ids: Set<string>): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const x of value) deepCollectUserMentions(x, ids);
    return;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    tryCollectMentionFromObject(o, ids);
    for (const k of Object.keys(o)) {
      deepCollectUserMentions(o[k], ids);
    }
  }
}

/** BlockNote 블록 트리에서 userMention 인라인의 userId 수집 */
export function collectUserMentionIdsFromBlocks(blocks: unknown[]): string[] {
  const ids = new Set<string>();
  deepCollectUserMentions(blocks, ids);
  return Array.from(ids);
}

/**
 * 트리 파싱이 비었을 때 원문 문자열에서 userMention 블록의 userId만 긁어 옴.
 * (parse 분기/BlockNote 직렬화 차이 대비)
 */
function extractMentionUserIdsWithRegex(raw: string): string[] {
  const ids = new Set<string>();
  // BlockNote 인라인 청크는 작으므로 짧은 윈도로 userId만 매칭 (다른 필드 userId 오탐 방지)
  const re = /"type"\s*:\s*"userMention"[\s\S]{0,400}?"userId"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const id = m[1]?.trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

/** 저장된 업무 본문(JSON 블록)에서 멘션된 사용자 id (중복 제거) */
export function extractMentionedUserIdsFromTaskDescription(raw: string | null | undefined): string[] {
  const s = raw ?? "";
  const parsed = parseStoredTaskBody(s);
  const ids = new Set<string>();
  if (parsed?.format === "blocks" && Array.isArray(parsed.blocks)) {
    for (const id of collectUserMentionIdsFromBlocks(parsed.blocks)) ids.add(id);
  }
  // 블록 파싱이 일부만 잡거나 직렬화 형태가 달라도 원문에서 보강
  if (s.includes("userMention")) {
    for (const id of extractMentionUserIdsWithRegex(s)) ids.add(id);
  }
  return Array.from(ids);
}
