import { beforeEach,it,expect,vi } from "vitest";
const f=vi.hoisted(()=>{process.env.ONESIGNAL_APP_ID="synthetic";process.env.ONESIGNAL_REST_API_KEY="synthetic";return {disabled:false,update:vi.fn()};});
vi.mock("server-only",()=>({}));
vi.mock("@/lib/prisma",()=>({default:{user:{findMany:async({where}:{where:{accountDisabled?:boolean}})=>where.accountDisabled===false&&f.disabled?[]:[{id:"synthetic",playerIds:["00000000-0000-4000-8000-000000000001"],playerId:null,oneSignalPlayerId:null,lastActiveAt:new Date()}]},notification:{update:f.update}}}));
vi.mock("../src/lib/onesignal/verified-subscriptions",()=>({verifiedSubscriptions:async()=>({status:"connected",ids:["00000000-0000-4000-8000-000000000001"]})}));
import { sendPushToUsers } from "../src/lib/notifications/push";
const payload={userIds:["synthetic"],title:"synthetic",message:"generic",url:"/chat/synthetic"};
beforeEach(()=>{f.disabled=false;vi.clearAllMocks();vi.stubGlobal("fetch",vi.fn());vi.spyOn(console,"log").mockImplementation(()=>{});vi.spyOn(console,"warn").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});});
it("sends chat despite recent generic CRM presence and does not duplicate accepted unknown recipient result",async()=>{
 vi.mocked(fetch).mockResolvedValue(Response.json({id:"accepted"}));await sendPushToUsers(payload);expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not fall back after provider auth failure or unknown transport outcome",async()=>{
 vi.mocked(fetch).mockResolvedValue(new Response("",{status:401}));await sendPushToUsers(payload);expect(fetch).toHaveBeenCalledTimes(1);
});
it("never sends to a disabled CRM account",async()=>{f.disabled=true;await sendPushToUsers(payload);expect(fetch).not.toHaveBeenCalled();});
