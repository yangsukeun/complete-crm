import { createHash } from "node:crypto";
import { z } from "zod";
import { ownerOnly, WorkError } from "./rua-work";

const schema = z.object({
  dateKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceMessageIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{8,100}$/)).min(1).max(50),
  summary: z.string().trim().min(1).max(6000),
}).strict();
/** Caller supplies a selected business summary, never an automatic conversation export. */
export function summaryCommand(actor: string | null, input: unknown, now = new Date()) {
  ownerOnly(actor);
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new WorkError(400, "요약 날짜·출처·본문을 확인하세요.");
  const { dateKst, summary } = parsed.data;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
  if (Number.isNaN(Date.parse(dateKst + "T00:00:00Z")) || new Date(dateKst + "T00:00:00Z").toISOString().slice(0,10) !== dateKst || dateKst > today)
    throw new WorkError(400, "유효한 KST 기록 날짜가 필요합니다.");
  const ids = [...new Set(parsed.data.sourceMessageIds)].sort();
  const key = "nightly:" + createHash("sha256").update(JSON.stringify([dateKst, ids])).digest("hex");
  return { action: "diary" as const, source: "ai" as const, key,
    raw: `[AI 업무 요약 · ${dateKst} KST]\n${summary}\n\n출처 메시지: ${ids.join(", ")}\n선택한 업무 내용의 요약입니다. 전체 대화 자동 수집·직원 공유·업무 실행은 하지 않습니다.` };
}
