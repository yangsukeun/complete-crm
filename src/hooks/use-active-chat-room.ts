"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
export function useActiveChatRoom(room:string|null){
 const {data:session}=useSession();const user=session?.user?.id;
 useEffect(()=>{
  if(!user||!room)return;
  const key=`crm-chat-view:${user}:${crypto.randomUUID()}`;
  const tick=()=>{try{if(document.visibilityState==="visible")localStorage.setItem(key,JSON.stringify({room,at:Date.now()}));else localStorage.removeItem(key);}catch{/* Storage unavailable: local URL fallback in alert component. */}window.dispatchEvent(new Event("chat-room-view"));};
  tick();const timer=setInterval(tick,5000);document.addEventListener("visibilitychange",tick);
  return ()=>{clearInterval(timer);document.removeEventListener("visibilitychange",tick);try{localStorage.removeItem(key);}catch{}};
 },[room,user]);
}
