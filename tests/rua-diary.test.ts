import { describe, expect, it } from "vitest";
import { OWNER, DIRECTOR, RuaWorkStore } from "../src/lib/rua-work";
import { localRulesV1 } from "../src/lib/rua-diary";
describe("private freewriting diary", () => {
  const raw = "  오늘 물한골은 도메인 기다리는 중이고, 소셜다잇소는 공간을 외주로 넘기기로 했다\n";
  const command = { action: "diary", raw, key: "diary-test-001", source: "human" };
  it("preserves exact original and connects a multi-project note without creating shared work", () => {
    const s = new RuaWorkStore(); s.execute(OWNER, command);
    const note = s.readDiary(OWNER).notes[0]; expect(note.raw).toBe(raw);
    expect(note.links.map(l=>l.project)).toEqual(["물한골", "소셜다잇소"]);
    expect(note.links.every(l=>!l.reviewed)).toBe(true);
    expect(s.list(OWNER)).toEqual([]); expect(s.list(DIRECTOR)).toEqual([]);
  });
  it("denies diary reads, saves and classification to all nonowners", () => {
    const s = new RuaWorkStore();
    for (const actor of [null, DIRECTOR, "other-admin"]) { expect(()=>s.readDiary(actor)).toThrow(); expect(()=>s.execute(actor,command)).toThrow(); expect(()=>s.execute(actor,{action:"classify",source:"human",key:"classify-test-001",id:"local-note-1",version:1,classification:{index:0,project:"X",stage:"진행 내용"}})).toThrow(); }
  });
  it("deduplicates saves and classification, moves links without changing original and rejects stale revisions", () => {
    const s = new RuaWorkStore(); s.execute(OWNER,command); s.execute(OWNER,command);
    expect(s.readDiary(OWNER).notes).toHaveLength(1);
    const note = s.readDiary(OWNER).notes[0];
    const edit = {action:"classify",source:"human",key:"classify-test-001",id:note.id,version:1,classification:{index:0,project:"다른 프로젝트",stage:"다음 단계"}};
    s.execute(OWNER,edit); s.execute(OWNER,edit);
    const changed=s.readDiary(OWNER).notes[0]; expect(changed.raw).toBe(raw); expect(changed.version).toBe(2); expect(changed.links[0]).toMatchObject({project:"다른 프로젝트",stage:"다음 단계",reviewed:true});
    expect(()=>s.execute(OWNER,{...edit,key:"classify-test-002"})).toThrow();
    expect(()=>s.execute(OWNER,{...command,raw:"different"})).toThrow();
  });
  it("marks unknown and ambiguous projects for review and never infers completion or execution approval", () => {
    for(const text of ["물한골은 완료 예정", "물한골은 아직 완료 안 됨", "물한골 완료했으니 배포하고 권한 변경해줘"]) {
      const links=localRulesV1.propose(text); expect(links[0].reviewed).toBe(false); expect(links[0]).not.toHaveProperty("completedAt"); expect(links[0]).not.toHaveProperty("approved");
    }
    expect(localRulesV1.propose("그 일은 기다리는 중")[0].project).toBeNull();
    expect(localRulesV1.propose("물한골과 소셜다잇소 이야기")[0].project).toBeNull();
  });
});
