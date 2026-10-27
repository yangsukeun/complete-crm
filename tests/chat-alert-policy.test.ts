import { it,expect } from "vitest";
import { shouldAlert,chatAlertKey,type ChatAlert } from "../src/lib/chat-alert-policy";
const alert:ChatAlert={id:"notice",type:"CHAT_MESSAGE",link:"/chat/room-1",message:"합성 알림",createdAt:"2026-10-27T00:00:00Z",isRead:false};
const options={enabled:true,visible:true,activeRooms:[] as string[],seen:new Set<string>()};
it("shows other-room unread messages but suppresses any visible tab viewing the same room",()=>{
 expect(shouldAlert(alert,options)).toBe(true);expect(shouldAlert(alert,{...options,activeRooms:["room-2"]})).toBe(true);expect(shouldAlert(alert,{...options,activeRooms:["room-1"]})).toBe(false);
});
it("respects off/background/read state and limits links to chat destinations",()=>{
 expect(shouldAlert(alert,{...options,enabled:false})).toBe(false);expect(shouldAlert(alert,{...options,visible:false})).toBe(false);expect(shouldAlert({...alert,isRead:true},options)).toBe(false);expect(shouldAlert({...alert,link:"https://other.example"},options)).toBe(false);
});
it("deduplicates an event while admitting a newly merged unread message",()=>{
 const seen=new Set([chatAlertKey(alert)]);expect(shouldAlert(alert,{...options,seen})).toBe(false);expect(shouldAlert({...alert,createdAt:"2026-10-27T00:01:00Z"},{...options,seen})).toBe(true);
});
