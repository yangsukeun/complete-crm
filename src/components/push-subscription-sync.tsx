"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import OneSignal,{type NotificationForegroundWillDisplayEvent} from "react-onesignal";
import { currentRoomVisible } from "../lib/onesignal/push-policy";
export function OneSignalPushTokenRegister(){
 const {data:session}=useSession();const userId=session?.user?.id;
 useEffect(()=>{
  if(!userId)return;let cancelled=false;
  const sync=async()=>{try{if(cancelled||localStorage.getItem(`crm-web-push:${userId}`)==="off"||OneSignal.User?.externalId!==userId||!OneSignal.User?.PushSubscription?.optedIn)return;const id=OneSignal.User.PushSubscription.id;if(!id)return;await fetch("/api/user/onesignal-register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:id})});}catch{/* Status button provides explicit diagnostics. */}};
  const foreground=(event:NotificationForegroundWillDisplayEvent)=>{const chatId=(event.notification.additionalData as {chatId?:unknown}|undefined)?.chatId;const rooms:string[]=[];try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(`crm-chat-view:${userId}:`)){const entry=JSON.parse(localStorage.getItem(key)??"{}");if(Date.now()-entry.at<11000)rooms.push(entry.room);}}}catch{}if(currentRoomVisible(chatId,document.visibilityState==="visible",rooms))event.preventDefault();};
  let listening=false;
  const ready=()=>{void sync();try{if(!listening){OneSignal.Notifications.addEventListener("foregroundWillDisplay",foreground);listening=true;}}catch{}};window.addEventListener("crm-onesignal-session-ready",ready);const timer=setTimeout(ready,3000);
  return()=>{cancelled=true;clearTimeout(timer);window.removeEventListener("crm-onesignal-session-ready",ready);try{if(listening)OneSignal.Notifications.removeEventListener("foregroundWillDisplay",foreground);}catch{}};
 },[userId]);
 return null;
}
