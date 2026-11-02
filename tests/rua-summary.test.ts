import { describe,it,expect } from "vitest";
import { summaryCommand } from "../src/lib/rua-summary";
import { OWNER,DIRECTOR,RuaWorkStore } from "../src/lib/rua-work";
const input={dateKst:"2026-11-02",sourceMessageIds:["Sentinel_test_02","Sentinel_test_01"],summary:"[합성 검수] 진행: 구현 검토. 결정/대기: 배포 확인 대기. 다음 단계: 재조회."};
const now=new Date("2026-11-01T15:01:00Z");
describe("private nightly summary",()=>{
 it("stores and rereads AI provenance while preserving human diary",()=>{
  const store=new RuaWorkStore();
  store.execute(OWNER,{action:"diary",source:"human",key:"human-original",raw:"기존 개인 일기"});
  const cmd=summaryCommand(OWNER,input,now);store.execute(OWNER,cmd);
  expect(store.readDiary(OWNER).notes).toHaveLength(2);
  expect(store.readDiary(OWNER).notes[1].raw).toContain("AI 업무 요약");
  expect(store.audit(OWNER)[1].source).toBe("ai");
  expect(store.list(DIRECTOR)).toEqual([]);
 });
 it("reordered sources and repeated calls reuse one result; changed text conflicts",()=>{
  const store=new RuaWorkStore();const cmd=summaryCommand(OWNER,input,now);
  const first=store.execute(OWNER,cmd);
  expect(store.execute(OWNER,summaryCommand(OWNER,{...input,sourceMessageIds:[...input.sourceMessageIds].reverse()},now))).toEqual(first);
  expect(()=>store.execute(OWNER,summaryCommand(OWNER,{...input,summary:"변경된 내용"},now))).toThrow("중복");
  expect(store.readDiary(OWNER).notes).toHaveLength(1);
 });
 it.each([null,DIRECTOR,"another-admin"])("rejects non-owner %s",actor=>expect(()=>summaryCommand(actor,input,now)).toThrow());
 it.each(["2026-11-03","2026-02-30"])("rejects invalid/future KST date %s",dateKst=>expect(()=>summaryCommand(OWNER,{...input,dateKst},now)).toThrow());
 it("rejects arbitrary actor/action fields and missing sources",()=>{
  expect(()=>summaryCommand(OWNER,{...input,action:"assign"},now)).toThrow();
  expect(()=>summaryCommand(OWNER,{...input,sourceMessageIds:[]},now)).toThrow();
 });
});
