import { it,expect,vi,beforeEach } from "vitest";
const f=vi.hoisted(()=>({id:"owner" as string|null,disabled:false,recent:false,create:vi.fn(),update:vi.fn(),ids:["00000000-0000-4000-8000-000000000001"]}));
vi.mock("@/auth",()=>({getAppSession:async()=>f.id?{user:{id:f.id}}:null}));
vi.mock("@/lib/onesignal/verified-subscriptions",()=>({pushConfig:()=>({appId:"synthetic",key:"synthetic"}),verifiedSubscriptions:async()=>({ids:f.ids,status:"connected"})}));
vi.mock("@/lib/prisma",()=>({default:{user:{findUnique:async()=>({accountDisabled:f.disabled})},notification:{update:f.update},$transaction:async(fn:(t:unknown)=>unknown)=>fn({$queryRaw:vi.fn(),notification:{findUnique:async()=>null,findFirst:async()=>f.recent?{}:null,create:f.create}})}}));
import { GET,POST } from "../app/api/user/web-push/test/route";
const req=(extra:object={})=>new Request("https://www.cpcrm.co.kr/api/user/web-push/test",{method:"POST",headers:{origin:"https://www.cpcrm.co.kr"},body:JSON.stringify({subscriptionId:f.ids[0],key:"00000000-0000-4000-8000-000000000002",...extra})});
beforeEach(()=>{f.id="owner";f.disabled=false;f.recent=false;vi.clearAllMocks();vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>Response.json({id:"accepted",recipients:1})));});
it("never sends from GET, anonymous/disabled calls, foreign target or repeated requests",async()=>{
 expect((await GET()).status).toBe(405);f.id=null;expect((await POST(req())).status).toBe(401);f.id="owner";f.disabled=true;expect((await POST(req())).status).toBe(403);f.disabled=false;expect((await POST(req({userId:"other"}))).status).toBe(400);f.recent=true;expect((await POST(req())).status).toBe(429);expect(fetch).not.toHaveBeenCalled();
});
it("sends only caller device with idempotency key and never claims actual delivery",async()=>{
 const r=await POST(req());expect((await r.json())).toMatchObject({accepted:true,delivered:false});const body=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);expect(body.include_subscription_ids).toEqual(f.ids);expect(body.idempotency_key).toBe("00000000-0000-4000-8000-000000000002");expect(body.contents.en).not.toContain("owner");expect(Date.parse(body.send_after)-Date.now()).toBeGreaterThan(15000);
});
it("reports provider zero recipients and errors without success",async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({id:"",recipients:0}));expect((await POST(req())).status).toBe(502);vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));expect((await POST(req())).status).toBe(503);
});
