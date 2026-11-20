import { describe, expect, it, beforeEach, vi } from "vitest";
import { OWNER, DIRECTOR, RuaWorkStore, durableRuaCommand } from "../src/lib/rua-work";
import { buildTimeline, projectHandoff, sourceUrl, suggestTopic } from "../src/lib/rua-timeline";
import { localRulesV1 } from "../src/lib/rua-diary";

const fixture = vi.hoisted(() => ({ actor: null as string | null, store: vi.fn() }));
vi.mock("@/auth", () => ({ getAppSession: async () => fixture.actor ? { user: { id: fixture.actor, role: "ADMIN" } } : null }));
vi.mock("@/lib/rua-store", () => ({ openRuaStore: fixture.store }));
import { GET, POST } from "../app/api/rua-work/route";

const request = (body: unknown, origin = "https://crm.example.test") => new Request("https://crm.example.test/api/rua-work", {
  method: "POST", headers: { origin }, body: JSON.stringify(body),
});
const diaryRequest = () => new Request("https://crm.example.test/api/rua-work?view=diary");
const raw = "  물한골: 시안 확인\n소셜다잇소: 장비 대기\n물류 자동화: 새 계획\n라벨: 검수하기\n인쇄: 예산 조정\n대표 홈: 다음 화면 검토  ";
const newEntry = {
  action: "checkpoint", key: "checkpoint-001", source: "human",
  checkpoint: { topic: "물한골", stage: "진행 내용", summary: "수정안 고객 검토 중", decision: "1차 시안 유지", progress: "예시 화면 정리", blocker: "검토 회신 대기", nextStep: "회신 후 수정",
    evidence: "자료에서 확인", sources: [{ url: "https://example.test/fixture", label: "검토 자료" }] },
};
const secondEntry = {
  ...newEntry, key: "checkpoint-002",
  checkpoint: { ...newEntry.checkpoint, topic: " 물한골 ", summary: "고객 회신 완료", nextStep: "확정안 반영" },
};
beforeEach(() => {
  fixture.actor = null;
  fixture.store.mockReset();
  fixture.store.mockResolvedValue(new RuaWorkStore());
});

describe("private Rua project timeline", () => {
  it("retains six-line legacy original and groups only relevant note excerpts", () => {
    const store = new RuaWorkStore(() => "2026-11-18T08:00:00.000Z");
    store.execute(OWNER, { action: "diary", key: "legacy-case-01", source: "human", raw });
    const view = store.readDiary(OWNER);
    expect(view.notes[0].raw).toBe(raw);
    expect(view.notes[0].links).toHaveLength(6);
    const grouped = buildTimeline(view);
    expect(grouped.map(group => group.title).sort()).toEqual(["물한골", "소셜다잇소"]);
    expect(grouped.find(group => group.title === "물한골")?.latest.link.excerpt).not.toContain("소셜다잇소");
    expect(view.notes[0].links.filter(link => !link.project)).toHaveLength(4);
    expect(projectHandoff(grouped[0])).toBe("");
  });

  it("adds a new title, keeps follow-ups in the same project, and copies only the selected verified project", () => {
    let time = "2026-11-18T08:00:00.000Z";
    const s = new RuaWorkStore(() => time);
    s.execute(OWNER, { action: "diary", key: "legacy-case-02", source: "human", raw });
    time = "2026-11-18T09:00:00.000Z";
    s.execute(OWNER, newEntry);
    time = "2026-11-19T09:00:00.000Z";
    s.execute(OWNER, secondEntry);
    time = "2026-11-20T09:00:00.000Z";
    s.execute(OWNER, { ...newEntry, key: "checkpoint-003", checkpoint: { ...newEntry.checkpoint, topic: "디자인 자동화", summary: "테스트 품목 1개 선정" } });
    const [newTopic, oldTopic] = buildTimeline(s.readDiary(OWNER));
    expect(newTopic.title).toBe("디자인 자동화");
    expect(oldTopic.entries).toHaveLength(3);
    expect(oldTopic.latest.link.excerpt).toBe("고객 회신 완료");
    const copy = projectHandoff(oldTopic);
    expect(copy).toContain("미확인 분류 1건은 제외");
    for (const term of ["KST", "결정", "다음 단계(최신 기록 기준): 확정안 반영", "막힌 일", "근거 상태", "https://example.test/fixture"]) expect(copy).toContain(term);
    expect(copy).not.toContain("소셜다잇소");
    expect(copy).not.toContain("테스트 품목 1개 선정");
    expect(copy.indexOf("수정안 고객 검토 중")).toBeLessThan(copy.lastIndexOf("고객 회신 완료"));
  });

  it("suggests without saving, and lets the owner correct ambiguous/unmatched originals", () => {
    expect(suggestTopic("라벨: 새 시안", ["물한골"])).toBe("라벨");
    expect(suggestTopic("물한골 회신 및 라벨 문의", ["물한골", "라벨"])).toBe("");
    expect(suggestTopic("물한골 회신", ["물한골"])).toBe("물한골");
    expect(suggestTopic("그쪽 확인", ["물한골"])).toBe("");
    const s = new RuaWorkStore();
    const note = s.execute(OWNER, { action: "diary", key: "legacy-case-03", source: "human", raw: "라벨: 새 시안" }) as { id: string; version: number };
    s.execute(OWNER, { action: "classify", key: "review-test-01", source: "human", id: note.id, version: note.version,
      classification: { index: 0, project: "라벨", stage: "다음 단계" } });
    const view = s.readDiary(OWNER);
    expect(view.notes[0].raw).toBe("라벨: 새 시안");
    expect(buildTimeline(view)[0].title).toBe("라벨");
  });

  it("keeps the durable log replayable by the prior diary implementation and does not duplicate retries", () => {
    const command = durableRuaCommand(newEntry) as { action: string; raw: string };
    expect(command.action).toBe("diary");
    const old = localRulesV1.propose(command.raw);
    expect(old).toHaveLength(1);
    expect(old[0].project).toBeNull();
    const s = new RuaWorkStore();
    s.execute(OWNER, command); s.execute(OWNER, command);
    expect(s.readDiary(OWNER).notes).toHaveLength(1);
    expect(s.readDiary(OWNER).notes[0]).toMatchObject({ checkpoint: { summary: newEntry.checkpoint.summary }, links: [{ project: "물한골", reviewed: true }] });
    expect(() => durableRuaCommand({ ...newEntry, checkpoint: { ...newEntry.checkpoint, progress: "가".repeat(4000) } })).toThrow("너무 깁니다");
    expect(() => s.execute(DIRECTOR, command)).toThrow();
    expect(() => s.execute(OWNER, { ...newEntry, source: "ai" })).toThrow();
  });

  it("retains owner-only same-origin access and rejects unsafe sources and unsupported verified status", async () => {
    for (const id of [null, DIRECTOR, "other-admin"]) {
      fixture.actor = id;
      expect((await POST(request(newEntry))).status).toBe(id ? 404 : 401);
      expect((await GET(diaryRequest())).status).toBe(id ? 404 : 401);
    }
    expect(fixture.store).not.toHaveBeenCalled();
    fixture.actor = OWNER;
    expect((await POST(request(newEntry, "https://invalid.example.test"))).status).toBe(403);
    for (const url of ["javascript:alert(1)", "http://example.test", "https://x:y@example.test/"]) {
      expect(sourceUrl(url)).toBeUndefined();
      expect((await POST(request({ ...newEntry, checkpoint: { ...newEntry.checkpoint, sources: [{ url }] } }))).status).toBe(400);
    }
    expect((await POST(request({ ...newEntry, checkpoint: { ...newEntry.checkpoint, sources: [] } }))).status).toBe(400);
    expect((await POST(request(newEntry))).status).toBe(200);
    const response = await GET(diaryRequest());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).notes).toHaveLength(1);
  });
});
