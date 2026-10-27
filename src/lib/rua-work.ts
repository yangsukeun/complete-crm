import { z } from "zod";
import { FLOW_STAGES, localRulesV1, type DiaryNote, type DiaryView } from "./rua-diary";

export const OWNER = "cmmitn4830000fc0jt8c1l2jf";
export const DIRECTOR = "cmmius59l000ihlpo4a4cpfq2";
export class WorkError extends Error { constructor(public status: number, message: string) { super(message); } }
export function signedIn(actor: string | null): asserts actor is string {
  if (!actor) throw new WorkError(401, "로그인이 필요합니다.");
}
export function ownerOnly(actor: string | null) {
  signedIn(actor);
  if (actor !== OWNER) throw new WorkError(404, "찾을 수 없습니다.");
}
const text = z.string().trim().min(1).max(4000);
const link = z.string().url().refine(v => new URL(v).protocol === "https:");
const projectInput = z.object({ name: text, status: text, lastProgress: text, blocker: text, nextStep: text, userAction: text, verifiedAt: z.string().datetime(), resultLinks: z.array(link).max(10) }).strict();
const sharedInput = z.object({ instruction: text, deadline: z.string().datetime(), acceptance: text, materials: z.array(link).max(10) }).strict();
export const commandSchema = z.object({
  action: z.enum(["project", "draft", "assign", "acknowledge", "view", "start", "report", "review", "complete", "diary", "classify"]),
  key: z.string().min(8).max(100), id: z.string().optional(), version: z.number().int().positive().optional(),
  source: z.enum(["human", "ai"]), confirmed: z.boolean().optional(),
  project: projectInput.optional(), shared: sharedInput.optional(), report: text.optional(),
  raw: z.string().max(12000).refine(v => v.trim().length > 0).optional(),
  classification: z.object({ index: z.number().int().nonnegative(), project: z.string().trim().min(1).max(100).nullable(), stage: z.enum(FLOW_STAGES) }).strict().optional(),
}).strict();
type Command = z.infer<typeof commandSchema>;
export type Project = z.infer<typeof projectInput> & { version: number };
export type WorkItem = z.infer<typeof sharedInput> & {
  id: string; assignee: string; state: "draft" | "assigned" | "in_progress" | "review_requested" | "completed";
  version: number; acknowledgedAt: string | null; notification: "unconnected";
  viewedAt: string | null;
  report: string | null; completedAt: string | null;
};
type Event = { actor: string; target: string; source: "human" | "ai"; action: string; version: number; at: string; key: string; confirmed: boolean };
type WorkResult = Project | WorkItem | DiaryNote;
/** Local mock only: no DB, notifications, search index, or external AI calls. */
export class RuaWorkStore {
  constructor(private clock: () => string = () => new Date().toISOString()) {}
  private project: Project | null = null;
  private items = new Map<string, WorkItem>();
  private events: Event[] = [];
  private receipts = new Map<string, { body: string; result: WorkResult }>();
  private notes = new Map<string, DiaryNote>();
  private noteSequence = 0;
  private sequence = 0;
  readProject(actor: string | null) { ownerOnly(actor); return structuredClone(this.project); }
  readDiary(actor: string | null): DiaryView { ownerOnly(actor); return structuredClone({ notes: [...this.notes.values()] }); }
  list(actor: string | null) {
    signedIn(actor);
    return structuredClone([...this.items.values()].filter(i => actor === OWNER || (i.assignee === actor && i.state !== "draft")));
  }
  audit(actor: string | null) { ownerOnly(actor); return structuredClone(this.events); }
  execute(actor: string | null, input: unknown): WorkResult {
    signedIn(actor);
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) throw new WorkError(400, "입력 형식이 올바르지 않습니다.");
    const c: Command = parsed.data;
    const ownerAction = ["project", "draft", "assign", "review", "complete", "diary", "classify"].includes(c.action);
    if (ownerAction) ownerOnly(actor);
    else if (actor !== DIRECTOR) throw new WorkError(404, "찾을 수 없습니다.");
    const receiptKey = `${actor}:${c.key}`;
    const body = JSON.stringify(c);
    const receipt = this.receipts.get(receiptKey);
    if (receipt) {
      if (receipt.body !== body) throw new WorkError(409, "중복 방지 키가 다른 요청에 사용되었습니다.");
      return structuredClone(receipt.result);
    }
    const now = this.clock();
    let result: WorkResult;
    if (c.action === "diary") {
      if (!c.raw) throw new WorkError(400, "남길 이야기를 적어 주세요.");
      const links = localRulesV1.propose(c.raw);
      if (links.length === 0) links.push({ index: 0, excerpt: c.raw, project: null, stage: "진행 내용", reviewed: false });
      result = { id: `local-note-${++this.noteSequence}`, raw: c.raw, createdAt: now, version: 1, classifier: "local-rules-v1", links };
      this.notes.set(result.id, result);
    } else if (c.action === "classify") {
      const note = this.notes.get(c.id ?? "");
      if (!note) throw new WorkError(404, "기록을 찾을 수 없습니다.");
      if (c.version !== note.version) throw new WorkError(409, "기록이 바뀌었습니다. 새로고침 후 확인하세요.");
      if (!c.classification || !note.links.some(l => l.index === c.classification!.index)) throw new WorkError(400, "분류할 항목을 확인하세요.");
      result = structuredClone(note);
      const link = result.links.find(l => l.index === c.classification!.index)!;
      Object.assign(link, c.classification, { reviewed: c.classification.project !== null });
      result.version++;
      this.notes.set(result.id, result);
    } else if (c.action === "project") {
      if (!c.project || (this.project && c.version !== this.project.version)) throw new WorkError(409, "프로젝트 내용 또는 버전을 확인하세요.");
      if (Date.parse(c.project.verifiedAt) > Date.now()) throw new WorkError(400, "미래 시각은 확인 시각이 될 수 없습니다.");
      result = { ...c.project, version: (this.project?.version ?? 0) + 1 };
      this.project = result;
    } else if (c.action === "draft") {
      if (!c.shared) throw new WorkError(400, "선택한 공유 내용이 필요합니다.");
      result = { ...c.shared, id: `local-work-${++this.sequence}`, assignee: DIRECTOR, state: "draft", version: 1, acknowledgedAt: null, viewedAt: null, notification: "unconnected", report: null, completedAt: null };
      this.items.set(result.id, result);
    } else {
      const item = this.items.get(c.id ?? "");
      if (!item || (actor !== OWNER && (item.assignee !== actor || item.state === "draft"))) throw new WorkError(404, "찾을 수 없습니다.");
      if (c.version !== item.version) throw new WorkError(409, "새로고침 후 다시 시도하세요.");
      result = structuredClone(item);
      const requireState = (...states: WorkItem["state"][]) => { if (!states.includes(item.state)) throw new WorkError(409, "허용되지 않는 상태 변경입니다."); };
      switch (c.action) {
        case "view": requireState("assigned", "in_progress", "review_requested", "completed"); result.viewedAt ??= now; break;
        case "assign": requireState("draft"); if (!c.confirmed) throw new WorkError(400, "공유 내용 확인이 필요합니다."); result.state = "assigned"; break;
        case "acknowledge": requireState("assigned", "in_progress"); result.acknowledgedAt ??= now; break;
        case "start": requireState("assigned"); result.state = "in_progress"; break;
        case "report": requireState("in_progress"); if (!c.report || !c.confirmed) throw new WorkError(400, "본인이 확인한 보고만 제출할 수 있습니다."); result.report = c.report; result.state = "review_requested"; break;
        case "review": requireState("review_requested"); result.state = "in_progress"; break;
        case "complete": requireState("review_requested"); if (!c.confirmed || c.source !== "human") throw new WorkError(400, "사람의 명시적 완료 확인이 필요합니다."); result.state = "completed"; result.completedAt = now; break;
      }
      result.version++;
      this.items.set(result.id, result);
    }
    this.events.push({ actor, target: "id" in result ? result.id : "private-project", source: c.source, action: c.action, version: result.version, at: now, key: c.key, confirmed: c.confirmed === true });
    this.receipts.set(receiptKey, { body, result: structuredClone(result) });
    return structuredClone(result);
  }
}
