import { it,expect,vi,beforeEach } from "vitest";
const f=vi.hoisted(()=>({id:"user" as string|null,user:vi.fn(),verified:vi.fn(),other:vi.fn(),existing:vi.fn(),write:vi.fn(),remove:vi.fn(),upsert:vi.fn()}));
vi.mock("@/auth",()=>({getAppSession:async()=>f.id?{user:{id:f.id}}:null}));
vi.mock("@/lib/onesignal/verified-subscriptions",()=>({verifiedSubscriptions:f.verified}));
vi.mock("@/lib/prisma",()=>({default:{user:{findUnique:f.user},$executeRaw:f.write,oneSignalSubscription:{deleteMany:f.remove},$transaction:async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:vi.fn(),user:{findFirst:f.other},oneSignalSubscription:{findUnique:f.existing,upsert:f.upsert},$executeRaw:f.write})}}));
import { POST,DELETE } from "../app/api/user/web-push/register/route";
const sid="00000000-0000-4000-8000-000000000001";
const request=(method="POST",id=sid)=>new Request("https://www.cpcrm.co.kr/api/user/onesignal-register",{method,headers:{origin:"https://www.cpcrm.co.kr"},body:JSON.stringify({subscriptionId:id})});
beforeEach(()=>{vi.clearAllMocks();f.id="user";f.user.mockResolvedValue({accountDisabled:false,playerIds:[sid],playerId:sid,oneSignalPlayerId:sid});f.verified.mockResolvedValue({status:"connected",ids:[sid]});f.other.mockResolvedValue(null);f.existing.mockResolvedValue(null);});
it("denies anonymous, inactive, mismatched and another-account subscriptions before writes",async()=>{
 f.id=null;expect((await POST(request())).status).toBe(401);f.id="user";f.user.mockResolvedValueOnce({accountDisabled:true});expect((await POST(request())).status).toBe(403);f.verified.mockResolvedValueOnce({ids:[]});expect((await POST(request())).status).toBe(409);f.other.mockResolvedValueOnce({id:"other"});expect((await POST(request())).status).toBe(409);expect(f.write).not.toHaveBeenCalled();
});
it("registers verified current account and removes only its known current device",async()=>{
 expect((await POST(request())).status).toBe(200);expect(f.upsert).toHaveBeenCalled();f.write.mockClear();expect((await DELETE(request("DELETE","00000000-0000-4000-8000-000000000002"))).status).toBe(200);expect(f.write).not.toHaveBeenCalled();expect((await DELETE(request("DELETE"))).status).toBe(200);expect(f.remove).toHaveBeenCalledWith({where:{userId:"user",subscriptionId:sid}});
});
it("blocks cross-origin and malformed requests; no successful response on failed write",async()=>{
 expect((await POST(new Request("https://www.cpcrm.co.kr/api/user/onesignal-register",{method:"POST",headers:{origin:"https://elsewhere.example"},body:"{}"}))).status).toBe(403);expect((await POST(request("POST","invalid"))).status).toBe(400);f.write.mockRejectedValueOnce(new Error("synthetic"));expect((await POST(request())).status).toBe(503);
});
