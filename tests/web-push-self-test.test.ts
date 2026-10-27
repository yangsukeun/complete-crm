import { it,expect,vi,beforeEach } from "vitest";
const f=vi.hoisted(()=>({id:"owner" as string|null,disabled:false,rows:new Map<string,Record<string,unknown>>(),tail:Promise.resolve(),ids:["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000003"]}));
vi.mock("@/auth",()=>({getAppSession:async()=>f.id?{user:{id:f.id}}:null}));
vi.mock("@/lib/onesignal/verified-subscriptions",()=>({pushConfig:()=>({appId:"synthetic",key:"synthetic"}),verifiedSubscriptions:async()=>({ids:f.ids,status:"connected"})}));
vi.mock("@/lib/prisma",()=>({default:{user:{findUnique:async()=>({accountDisabled:f.disabled})},notification:{update:async({where,data}:{where:{id:string};data:object})=>Object.assign(f.rows.get(where.id)!,data)},$transaction:async(fn:(t:unknown)=>unknown)=>{const prior=f.tail;let release!:()=>void;f.tail=new Promise<void>(r=>{release=r});await prior;try{return await fn({$queryRaw:vi.fn(),notification:{findUnique:async({where}:{where:{id:string}})=>f.rows.get(where.id),findFirst:async()=>[...f.rows.values()].find(r=>r.userId===f.id&&(r.createdAt as Date).getTime()>Date.now()-600000),create:async({data}:{data:Record<string,unknown>})=>{const row={...data,createdAt:new Date(),oneSignalNotificationId:null};f.rows.set(data.id as string,row);return row}}});}finally{release();}}}}));
import { GET,POST } from "../app/api/user/web-push/test/route";
const key="00000000-0000-4000-8000-000000000002";
const req=(extra:object={},origin="https://www.cpcrm.co.kr")=>new Request("https://www.cpcrm.co.kr/api/user/web-push/test",{method:"POST",headers:{origin},body:JSON.stringify({subscriptionId:f.ids[0],key,...extra})});
beforeEach(()=>{f.id="owner";f.disabled=false;f.rows.clear();vi.clearAllMocks();vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>Response.json({id:"accepted",recipients:1})));});
it("blocks GET, CSRF, anonymous, disabled and other user/device targets",async()=>{
 expect((await GET()).status).toBe(405);expect((await POST(req({},"https://other.invalid"))).status).toBe(403);f.id=null;expect((await POST(req())).status).toBe(401);f.id="owner";f.disabled=true;expect((await POST(req())).status).toBe(403);f.disabled=false;expect((await POST(req({userId:"other"}))).status).toBe(400);expect((await POST(req({subscriptionId:"00000000-0000-4000-8000-000000000099"}))).status).toBe(409);expect(fetch).not.toHaveBeenCalled();
});
it("schedules at provider with one owned subscription and no delivery claim",async()=>{
 expect(await (await POST(req())).json()).toMatchObject({accepted:true,delivered:false});const body=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);expect(body.include_subscription_ids).toEqual([f.ids[0]]);expect(body.idempotency_key).toBe(key);expect(Date.parse(body.send_after)-Date.now()).toBeGreaterThan(15000);
});
it("rejects same key with another owned device, user or kind and expiry",async()=>{
 await POST(req());vi.mocked(fetch).mockClear();expect((await POST(req({subscriptionId:f.ids[1]}))).status).toBe(409);f.id="other";expect((await POST(req())).status).toBe(409);f.id="owner";const row=f.rows.get(key)!;row.relatedId="different-kind";expect((await POST(req())).status).toBe(409);row.relatedId="web-push-test-v1:"+f.ids[0];row.createdAt=new Date(Date.now()-600001);expect((await POST(req())).status).toBe(410);expect(fetch).not.toHaveBeenCalled();
});
it("accepted replay never sends again; new key within ten minutes is blocked",async()=>{
 await POST(req());expect(await (await POST(req())).json()).toMatchObject({accepted:true,delivered:false});expect(fetch).toHaveBeenCalledTimes(1);expect((await POST(req({key:"00000000-0000-4000-8000-000000000004"}))).status).toBe(429);
});
it("lost response retry keeps key, target and scheduled time identical",async()=>{
 vi.mocked(fetch).mockRejectedValueOnce(new Error("lost response"));expect((await POST(req())).status).toBe(503);expect((await POST(req())).status).toBe(200);const calls=vi.mocked(fetch).mock.calls;expect(calls[0][1]!.body).toBe(calls[1][1]!.body);
});
it("simultaneous tabs with different keys reserve only one request",async()=>{
 const results=await Promise.all([POST(req()),POST(req({key:"00000000-0000-4000-8000-000000000004"}))]);expect(results.map(r=>r.status).sort()).toEqual([200,429]);expect(fetch).toHaveBeenCalledTimes(1);
});
it("provider failure is not accepted",async()=>{vi.mocked(fetch).mockResolvedValueOnce(Response.json({id:"",recipients:0}));expect((await POST(req())).status).toBe(502);});
it("rapid same-key requests use the identical provider idempotency payload",async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r});
 vi.mocked(fetch).mockImplementation(async()=>{await gate;return Response.json({id:"accepted",recipients:1});});
 const first=POST(req());const second=POST(req());
 await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));release();
 await Promise.all([first,second]);const calls=vi.mocked(fetch).mock.calls;expect(calls[0][1]!.body).toBe(calls[1][1]!.body);
});
