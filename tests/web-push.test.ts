import { it,expect,vi,beforeEach } from "vitest";
vi.mock("server-only",()=>({}));
import { verifiedSubscriptions } from "../src/lib/onesignal/verified-subscriptions";
import { suppressMergedPush,allowSubscriptionFallback,currentRoomVisible } from "../src/lib/onesignal/push-policy";
beforeEach(()=>{vi.unstubAllGlobals();vi.stubEnv("ONESIGNAL_APP_ID","synthetic-app");vi.stubEnv("ONESIGNAL_REST_API_KEY","synthetic-key");});
it("verifies account identity and excludes disabled/email subscriptions",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>Response.json({identity:{external_id:"owner"},subscriptions:[{id:"active",enabled:true,type:"ChromePush"},{id:"off",enabled:false,type:"ChromePush"},{id:"email",enabled:true,type:"Email"}]})));
 expect((await verifiedSubscriptions("owner")).ids).toEqual(["active"]);expect((await verifiedSubscriptions("other")).status).toBe("identity_mismatch");
});
it("fails closed on provider authentication, network and malformed response",async()=>{
 for(const code of [401,403,500]){vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("",{status:code})));expect((await verifiedSubscriptions("owner")).ids).toEqual([]);}
 vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("synthetic")));expect((await verifiedSubscriptions("owner")).status).toBe("provider_unavailable");
});
it("limits repeated unread pushes but permits a new message after a quiet minute",()=>{
 expect(suppressMergedPush("CHAT_MESSAGE",new Date(0),59000)).toBe(true);expect(suppressMergedPush("CHAT_MESSAGE",new Date(0),60000)).toBe(false);expect(suppressMergedPush("COMMENT",new Date(0),90000)).toBe(true);
});
it("does not double-send when provider accepted or outcome is uncertain",()=>{
 expect(allowSubscriptionFallback({recipients:0,oneSignalId:null})).toBe(true);expect(allowSubscriptionFallback({recipients:0,oneSignalId:"accepted"})).toBe(false);expect(allowSubscriptionFallback({recipients:-1})).toBe(false);
});
it("suppresses only the foreground room, not hidden tabs or another room",()=>{
 expect(currentRoomVisible("a",true,["a"])).toBe(true);expect(currentRoomVisible("a",false,["a"])).toBe(false);expect(currentRoomVisible("b",true,["a"])).toBe(false);
});
