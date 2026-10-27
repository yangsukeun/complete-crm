"use client";
import { useEffect,useRef,useState } from "react";
import { useSession } from "next-auth/react";
import OneSignal from "react-onesignal";
export function WebPushControls(){
 const {data:session}=useSession();const userId=session?.user?.id;const [message,setMessage]=useState("상태 확인을 눌러주세요."),[busy,setBusy]=useState(false);const testKey=useRef<string|null>(null);
 const supported=()=>typeof Notification!=="undefined"&&"serviceWorker" in navigator&&"PushManager" in window&&window.isSecureContext;
 async function status(){if(!supported()){setMessage("현재 환경은 웹푸시를 지원하지 않습니다. iPhone/iPad는 홈 화면에 추가한 앱에서 열어주세요.");return;}const registration=await navigator.serviceWorker.getRegistration();const r=await fetch("/api/user/web-push",{cache:"no-store"});const s=await r.json();setMessage(`브라우저 권한: ${Notification.permission} · 서비스워커: ${registration?.active?.scriptURL.includes("OneSignalSDKWorker")?"활성":"미활성/다른 워커"} · 이 기기 구독: ${OneSignal.User?.PushSubscription?.optedIn?"켜짐":"꺼짐/미연결"} · 서버: ${({connected:"연결 확인",configuration_missing:"서버 설정 없음",not_registered:"계정 구독 연결 전",provider_auth_failed:"서버 인증 실패",provider_unavailable:"연결 확인 실패",identity_mismatch:"계정 연결 불일치"} as Record<string,string>)[s.provider]??s.error} · 연결 기기: ${s.activeSubscriptions??0}`);}
 async function action(kind:"on"|"off"|"test"|"status"){
  if(busy||!userId)return;setBusy(true);try{
   if(kind==="status"){await status();return;}if(!supported())throw new Error("지원되는 HTTPS 브라우저 또는 홈 화면 앱에서 열어주세요.");
   if(kind==="on"){
    if(Notification.permission==="denied")throw new Error("브라우저 사이트 설정에서 알림 차단을 직접 해제해 주세요.");
    if(!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID)throw new Error("웹푸시 앱 설정이 없습니다. 상태 확인 결과를 관리자에게 알려주세요.");
    await OneSignal.Notifications.requestPermission();
    await Promise.race([OneSignal.login(userId),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("웹푸시 연결 시간이 초과됐습니다. 상태 확인 후 다시 시도하세요.")),8000))]);
    await OneSignal.User.PushSubscription.optIn();
    let id=OneSignal.User.PushSubscription.id;for(let i=0;!id&&i<10;i++){await new Promise(r=>setTimeout(r,500));id=OneSignal.User.PushSubscription.id;}
    if(!id||OneSignal.User.externalId!==userId||!OneSignal.User.PushSubscription.optedIn)throw new Error("구독 준비를 확인하지 못했습니다. 잠시 후 다시 시도하세요.");
    const r=await fetch("/api/user/onesignal-register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:id})});const data=await r.json();if(!r.ok)throw new Error(data.error);localStorage.setItem(`crm-web-push:${userId}`,"on");await status();
   }else if(kind==="off"){
    const id=OneSignal.User?.PushSubscription?.id;await OneSignal.User.PushSubscription.optOut();localStorage.setItem(`crm-web-push:${userId}`,"off");if(id){const r=await fetch("/api/user/onesignal-register",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:id})});if(!r.ok)throw new Error("이 기기는 껐지만 서버 구독 정리를 확인하지 못했습니다. 다시 시도하세요.");}setMessage("이 기기 웹푸시를 껐습니다. 다른 기기 설정은 유지됩니다.");
   }else{const id=OneSignal.User?.PushSubscription?.id;if(!id||!OneSignal.User.PushSubscription.optedIn)throw new Error("먼저 이 기기 알림을 켜주세요.");testKey.current??=crypto.randomUUID();const r=await fetch("/api/user/web-push/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:id,key:testKey.current})});const result=await r.json();setMessage(result.message??result.error);if(result.accepted)testKey.current=null;}
  }catch(e){setMessage(e instanceof Error?e.message:"구독 상태를 확인하지 못했습니다.");}finally{setBusy(false);}
 }
 useEffect(()=>{testKey.current=null;setMessage("현재 계정으로 상태 확인을 눌러주세요.");},[userId]);
 return <section className="mt-3 space-y-2 border-t pt-3"><h3 className="font-bold">브라우저 밖 알림</h3><p className="text-sm">탭을 닫아도 받을 수 있는 웹푸시입니다. 브라우저 완전 종료·강제 중지·OS 절전 상태에서는 수신을 보장하지 않습니다. iPhone/iPad는 iOS 16.4 이상에서 홈 화면에 추가 후 열어주세요.</p><div className="flex flex-wrap gap-2">{([["on","알림 켜기"],["off","이 기기 끄기"],["status","상태 확인"],["test","내 기기로 시험 알림"]] as const).map(([value,label])=><button type="button" disabled={busy} key={value} className="min-h-11 rounded border px-2 disabled:opacity-50" onClick={()=>void action(value)}>{label}</button>)}</div><p role="status" className="break-words text-sm">{message}</p><p className="text-xs">시험은 이 기기에만 전송합니다. 실제 OS 알림 소리는 기기 설정에서 조정하세요.</p></section>;
}
