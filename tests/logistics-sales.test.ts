import { describe,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import { planSales,salesCommand,requireSalesUser,received,type SalesRecord } from "../src/lib/logistics-sales";
import { WORKSPACE_OWNER } from "../src/lib/workspace-areas";
function fixture(){
 let rows:SalesRecord[]=[];
 const run=(command:Record<string,unknown>)=>{rows=planSales(rows,salesCommand.parse({key:randomUUID(),...command}),randomUUID());return rows.at(-1)!;};
 const cmd=(action:string,id:string,extra:Record<string,unknown>={})=>run({action,id,version:rows.find(r=>r.id===id)!.version,...extra});
 const inquiry=run({action:"inquiry",customerKey:"1234567890",name:"합성 거래처",original:"합성 문의 원문"});
 const quote=cmd("quote",inquiry.id,{supply:100,vat:10,evidence:"견적 근거"});
 const contract=cmd("contract",quote.id,{evidence:"체결 확인 근거"});
 const client=cmd("client",contract.id);
 return {run,cmd,client,quote,contract,get rows(){return rows;}};
}
describe("3PL sales domain",()=>{
 it("uses current department and exact owner, never generic ADMIN",()=>{
  expect(()=>requireSalesUser(null)).toThrow();
  for(const department of ["CS팀","마케팅",null])expect(()=>requireSalesUser({id:"other",department,accountDisabled:false})).toThrow();
  requireSalesUser({id:WORKSPACE_OWNER,department:null,accountDisabled:false});
  requireSalesUser({id:"staff",department:"물류",accountDisabled:false});
  expect(()=>requireSalesUser({id:WORKSPACE_OWNER,department:null,accountDisabled:true})).toThrow();
 });
 it("keeps conversion unique and contract separate from invoiced revenue",()=>{
  const f=fixture();expect(f.rows.filter(r=>r.kind==="invoice")).toHaveLength(0);
  expect(()=>f.cmd("contract",f.quote.id,{evidence:"duplicate"})).toThrow();
  expect(()=>f.cmd("client",f.contract.id)).toThrow();
  expect(f.rows[0].data.original).toBe("합성 문의 원문");
 });
 it("supports multiple monthly invoices, partial receipts and corrections",()=>{
  const f=fixture();const args={month:"2026-09",issuedOn:"2026-10-27",supply:100,vat:10,evidence:"합성 근거"};
  const a=f.cmd("invoice",f.client.id,{...args,reference:"INV-1"});f.cmd("invoice",f.client.id,{...args,reference:"INV-2"});
  expect(a.data.month).toBe("2026-09");expect(()=>f.cmd("invoice",f.client.id,{...args,reference:"INV-1"})).toThrow();
  const receipt=f.cmd("receive",a.id,{amount:40,receivedOn:"2026-10-27",reference:"BANK-1",evidence:"합성 입금증"});
  expect(received(f.rows,a.id)).toBe(40);
  expect(()=>f.cmd("receive",a.id,{amount:80,receivedOn:"2026-10-27",reference:"BANK-2",evidence:"x"})).toThrow();
  expect(()=>f.cmd("revise",a.id,{supply:20,vat:2,reason:"x",evidence:"x"})).toThrow();
  expect(()=>f.cmd("cancel",a.id,{reason:"x"})).toThrow();
  f.cmd("revise",a.id,{supply:120,vat:12,reason:"정정",evidence:"수정 근거"});
  f.cmd("cancel",receipt.id,{reason:"입금 기록 오류 정정; 실제 환불 아님"});
  expect(received(f.rows,a.id)).toBe(0);f.cmd("cancel",a.id,{reason:"청구 취소"});
  expect(f.rows.find(r=>r.id===receipt.id)?.data.status).toBe("cancelled");
 });
 it("links additional contracts to one existing customer and preserves client on contract cancellation",()=>{
  const f=fixture();const i=f.run({action:"inquiry",customerKey:"1234567890",name:"합성 거래처",original:"추가 문의"});
  const q=f.cmd("quote",i.id,{supply:10,vat:1,evidence:"x"});const c=f.cmd("contract",q.id,{evidence:"x"});f.cmd("client",c.id);
  expect(f.rows.filter(r=>r.kind==="client")).toHaveLength(1);expect(f.rows.find(r=>r.id===c.id)?.data.clientId).toBe(f.client.id);
  expect(()=>f.cmd("cancel",f.client.id,{reason:"x"})).toThrow();f.cmd("cancel",c.id,{reason:"계약 취소"});
  expect(f.rows.find(r=>r.id===f.client.id)?.data.status).toBe("active");
 });
 it("rejects stale versions, forged fields and invalid dates",()=>{
  const f=fixture();expect(()=>f.run({action:"contract",id:f.quote.id,version:1,evidence:"x"})).toThrow();
  expect(salesCommand.safeParse({key:randomUUID(),action:"inquiry",customerKey:"1234567890",name:"x",original:"x",actor:"owner",department:"물류"}).success).toBe(false);
  expect(()=>f.cmd("invoice",f.client.id,{month:"2026-13",issuedOn:"2026-02-30",supply:1,vat:0,reference:"bad",evidence:"x"})).toThrow();
 });
});
