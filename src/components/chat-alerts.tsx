"use client";
import { useEffect,useRef,useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { chatAlertKey,shouldAlert,type ChatAlert } from "../lib/chat-alert-policy";
type Settings={enabled:boolean;sound:boolean};
export function ChatAlerts(){
 const {data:session}=useSession();const user=session?.user?.id;const pathname=usePathname();
 const [settings,setSettings]=useState<Settings>({enabled:true,sound:false}),[opened,setOpened]=useState(false),[alerts,setAlerts]=useState<ChatAlert[]>([]);
 const audio=useRef<AudioContext|null>(null),latestSettings=useRef(settings),path=useRef(pathname);
 useEffect(()=>{latestSettings.current=settings;},[settings]);useEffect(()=>{path.current=pathname;},[pathname]);
 useEffect(()=>{
  if(!user)return;const key=`crm-chat-alert-settings:${user}`;
  const load=()=>{try{const value=JSON.parse(localStorage.getItem(key)??"null");setSettings(value?{enabled:value.enabled!==false,sound:value.sound===true}:{enabled:true,sound:false});}catch{setSettings({enabled:true,sound:false});}};
  load();window.addEventListener("storage",load);return()=>window.removeEventListener("storage",load);
 },[user]);
 useEffect(()=>{
  if(!user)return;let disposed=false,busy=false,initialized=false,lastShown=0;const seen=new Set<string>();
  const activeRooms=()=>{const rooms:string[]=[];const route=/^\/chat\/([^/?#]+)$/.exec(path.current??"");if(route)rooms.push(route[1]);try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(`crm-chat-view:${user}:`)){const value=JSON.parse(localStorage.getItem(key)??"{}");if(Date.now()-value.at<11000)rooms.push(value.room);}}}catch{}return rooms;};
  const claim=(key:string)=>{try{const storageKey=`crm-chat-alert-seen:${user}`;const cache=JSON.parse(localStorage.getItem(storageKey)??"{}");const now=Date.now();if(cache[key])return false;for(const old of Object.keys(cache))if(now-cache[old]>86400000)delete cache[old];cache[key]=now;localStorage.setItem(storageKey,JSON.stringify(cache));return true;}catch{return false;}};
  const tick=async()=>{
   if(busy||document.visibilityState!=="visible")return;busy=true;
   try{const response=await fetch("/api/notifications?limit=50",{cache:"no-store"});if(!response.ok)return;const list:ChatAlert[]=await response.json();if(disposed||!Array.isArray(list))return;
    setAlerts(current=>current.filter(a=>list.some(n=>n.id===a.id&&!n.isRead)&&!activeRooms().includes(a.link.split("/")[2])));
    if(!initialized){for(const n of list)seen.add(chatAlertKey(n));initialized=true;return;}
    for(const n of [...list].reverse()){
     const key=chatAlertKey(n);const allowed=shouldAlert(n,{...latestSettings.current,visible:document.visibilityState==="visible",activeRooms:activeRooms(),seen});seen.add(key);
     if(!allowed)continue;
     const show=()=>{if(disposed||document.visibilityState!=="visible"||!latestSettings.current.enabled||activeRooms().includes(n.link.split("/")[2])||!claim(key))return;
      setAlerts(current=>[...current.filter(a=>a.link!==n.link),n].slice(-3));
      if(latestSettings.current.sound&&Date.now()-lastShown>10000&&audio.current?.state==="running"){const oscillator=audio.current.createOscillator(),gain=audio.current.createGain();oscillator.connect(gain);gain.connect(audio.current.destination);gain.gain.value=0.025;oscillator.frequency.value=660;oscillator.start();oscillator.stop(audio.current.currentTime+0.12);}lastShown=Date.now();};
     // Never race two visible tabs. Without Web Locks, keep badges/push and skip popup.
     if(navigator.locks)await navigator.locks.request(`crm-chat-alert:${user}`,show);
    }
    if(seen.size>1000){seen.clear();for(const n of list)seen.add(chatAlertKey(n));}
   }catch{/* Existing badges/push remain available. No delivery success claims. */}finally{busy=false;}
  };
  void tick();const timer=setInterval(()=>void tick(),15000);const update=()=>void tick();const viewing=()=>setAlerts(v=>v.filter(a=>!activeRooms().includes(a.link.split("/")[2])));window.addEventListener("notification-realtime",update);window.addEventListener("chat-room-view",viewing);window.addEventListener("storage",viewing);document.addEventListener("visibilitychange",update);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener("notification-realtime",update);window.removeEventListener("chat-room-view",viewing);window.removeEventListener("storage",viewing);document.removeEventListener("visibilitychange",update);};
 },[user]);
 useEffect(()=>{if(!settings.enabled)setAlerts([]);},[settings.enabled]);
 async function change(next:Settings){setSettings(next);latestSettings.current=next;try{localStorage.setItem(`crm-chat-alert-settings:${user}`,JSON.stringify(next));}catch{}if(next.sound){try{audio.current??=new AudioContext();await audio.current.resume();}catch{}}}
 if(!user)return null;
 return <aside className="fixed bottom-3 left-3 z-50 w-80 max-w-[calc(100vw-24px)] space-y-2" aria-label="채팅 알림"><button className="min-h-11 rounded border bg-white px-3 text-gray-900 shadow" aria-expanded={opened} onClick={()=>setOpened(!opened)}>채팅 알림 설정</button>{opened&&<div className="rounded border bg-white p-3 text-gray-900 shadow"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={settings.enabled} onChange={e=>void change({...settings,enabled:e.target.checked})}/>다른 채팅방 팝업</label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={settings.sound} onChange={e=>void change({...settings,sound:e.target.checked})}/>소리 사용 (기본 꺼짐)</label><p className="text-sm">이 브라우저 설정입니다. 기기 알림 권한은 바꾸지 않습니다. 새로 연 탭에서는 소리를 다시 켜야 할 수 있습니다.</p></div>}<div aria-live="polite">{alerts.map(a=><div key={a.id} className="mb-2 rounded-xl border border-purple-300 bg-white p-3 text-gray-900 shadow-lg"><p className="font-bold">새 채팅</p><p className="break-words">{a.message}</p><div className="flex justify-between"><Link className="inline-flex min-h-11 items-center text-purple-800 underline" href={a.link} onClick={()=>setAlerts(v=>v.filter(n=>n.id!==a.id))}>대화 열기</Link><button className="min-h-11 px-3" onClick={()=>setAlerts(v=>v.filter(n=>n.id!==a.id))}>닫기</button></div></div>)}</div></aside>;
}
