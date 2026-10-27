import "server-only";
export function pushConfig(){const appId=process.env.ONESIGNAL_APP_ID||process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;const key=process.env.ONESIGNAL_REST_API_KEY||process.env.ONE_SIGNAL_REST_API_KEY;return {appId,key};}
export async function verifiedSubscriptions(userId:string){
 const {appId,key}=pushConfig();if(!appId||!key)return {status:"configuration_missing",ids:[] as string[]};
 try{const r=await fetch(`https://api.onesignal.com/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(userId)}`,{headers:{Authorization:`Key ${key}`},cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!r.ok)return {status:r.status===404?"not_registered":r.status===401||r.status===403?"provider_auth_failed":"provider_unavailable",ids:[] as string[]};
 const data=await r.json();if(data.identity?.external_id!==userId)return {status:"identity_mismatch",ids:[] as string[]};
 const ids=(Array.isArray(data.subscriptions)?data.subscriptions:[]).filter((s:{id?:string;enabled?:boolean;type?:string})=>typeof s.id==="string"&&s.enabled===true&&/Push/i.test(s.type??"")).map((s:{id:string})=>s.id);
 return {status:"connected",ids:ids as string[]};}catch{return {status:"provider_unavailable",ids:[] as string[]};}
}
