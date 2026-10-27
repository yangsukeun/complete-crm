export const FLOW_STAGES = ["요청", "진행 내용", "결정/대기", "다음 단계"] as const;
export type FlowStage = typeof FLOW_STAGES[number];
export type DiaryLink = { index: number; excerpt: string; project: string | null; stage: FlowStage; reviewed: boolean };
export type DiaryNote = { id: string; raw: string; createdAt: string; version: number; classifier: "local-rules-v1"; links: DiaryLink[] };
export type DiaryView = { notes: DiaryNote[] };
export interface DiaryClassificationAdapter { kind: "local-rules-v1"; propose(raw: string): DiaryLink[] }
/** Versioned and deterministic; keep v1 unchanged so journal replay is stable.
 * These are explicit demo project-name matches, not LLM semantic analysis.
 * Suggestions never create shared work, execute instructions or mark anything complete.
 */
export const localRulesV1: DiaryClassificationAdapter = {
  kind: "local-rules-v1",
  propose(raw) {
    const projects = ["물한골", "소셜다잇소"];
    return raw.split(/[,\n.!?]+/u).map(s => s.trim()).filter(Boolean).map((excerpt, index) => {
      const matches = projects.filter(p => excerpt.includes(p));
      let stage: FlowStage = "진행 내용";
      if (/요청|해줘|해주세요/.test(excerpt)) stage = "요청";
      else if (/기다|대기|결정|하기로|넘기기로/.test(excerpt)) stage = "결정/대기";
      else if (/다음|예정|할 계획/.test(excerpt)) stage = "다음 단계";
      return { index, excerpt, project: matches.length === 1 ? matches[0] : null, stage, reviewed: false };
    });
  },
};
