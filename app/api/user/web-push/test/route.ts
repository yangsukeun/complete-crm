import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { pushConfig,verifiedSubscriptions } from "@/lib/onesignal/verified-subscriptions";
import { z } from "zod";
import { PUSH_TEST_TTL, PUSH_TEST_LINK, testBinding } from "@/lib/onesignal/push-test-state";
const headers={"Cache-Control":"private, no-store"};
export async function POST(req:Request){
 if(req.headers.get("origin")!==new URL(req.url).origin)return Response.json({error:"출처 확인 실패"},{status:403,headers});
 try{const userId=(await getAppSession())?.user?.id;if(!userId)return Response.json({error:"로그인 필요"},{status:401,headers});
 const user=await prisma.user.findUnique({where:{id:userId},select:{accountDisabled:true}});if(!user||user.accountDisabled)return Response.json({error:"계정 사용 불가"},{status:403,headers});
 const input=z.object({subscriptionId:z.string().uuid(),key:z.string().uuid()}).strict().safeParse(await req.json());if(!input.success)return Response.json({error:"현재 기기와 요청 키를 확인하세요."},{status:400,headers});
 const {subscriptionId,key}=input.data;const verified=await verifiedSubscriptions(userId);if(!verified.ids.includes(subscriptionId))return Response.json({error:"현재 계정의 활성 기기 구독 확인 실패",provider:verified.status},{status:409,headers});
 const reservation=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}),724803)`;
 const same=await tx.notification.findUnique({where:{id:key}});
 if(same){
  if(same.userId!==userId||same.type!=="CHAT_MESSAGE"||same.link!==PUSH_TEST_LINK||same.relatedId!==testBinding(subscriptionId))return {error:409};
  if(Date.now()-same.createdAt.getTime()>=PUSH_TEST_TTL)return {error:410};
  return {record:same};
 }
 const recent=await tx.notification.findFirst({where:{userId,link:PUSH_TEST_LINK,createdAt:{gte:new Date(Date.now()-PUSH_TEST_TTL)}}});
 if(recent)return {error:429};
 const record=await tx.notification.create({data:{id:key,userId,type:"CHAT_MESSAGE",message:"본인이 요청한 기기 알림 시험",link:PUSH_TEST_LINK,relatedId:testBinding(subscriptionId),isRead:true}});return {record};});
 if(reservation.error)return Response.json({error:reservation.error===410?"시험 재시도 기한이 끝났습니다. 실제 수신 여부를 먼저 확인하세요.":reservation.error===409?"기존 요청의 사용자·대상·종류와 일치하지 않습니다.":"최근 시험이 있습니다. 같은 요청으로 확인하거나 10분 뒤 새 시험을 준비하세요."},{status:reservation.error,headers});
 const record=reservation.record!;
 if(record.oneSignalNotificationId)return Response.json({accepted:true,delivered:false,message:"이미 접수된 시험입니다. 다시 발송하지 않았습니다. 실제 수신은 직접 확인하세요."},{headers});
 const config=pushConfig();const r=await fetch("https://api.onesignal.com/notifications",{method:"POST",headers:{Authorization:`Key ${config.key}`,"Content-Type":"application/json"},body:JSON.stringify({app_id:config.appId,target_channel:"push",include_subscription_ids:[subscriptionId],idempotency_key:key,headings:{en:"COMPLETE CRM"},contents:{en:"본인이 요청한 알림 시험입니다."},ttl:120,send_after:new Date(record.createdAt.getTime()+20000).toISOString()}),signal:AbortSignal.timeout(10000)});
 const result=await r.json().catch(()=>({}));const accepted=r.ok&&typeof result.id==="string"&&result.id.length>0&&result.recipients!==0;
 if(accepted)await prisma.notification.update({where:{id:key},data:{oneSignalNotificationId:result.id}});
 return Response.json({accepted,delivered:false,providerStatus:r.status,message:accepted?"시험 예약을 접수했습니다. 예정 시각은 최초 요청 기준 20초 뒤이며 재확인 시 이미 지났을 수 있습니다. 실제 수신은 직접 확인하세요.":"푸시 서비스가 접수하지 못했습니다. 구독·서버 설정을 확인하세요."},{status:accepted?200:502,headers});
 }catch{return Response.json({error:"전송 결과를 확인하지 못했습니다. 같은 요청으로 재시도하세요."},{status:503,headers});}
}
export async function GET(){return Response.json({error:"시험은 버튼을 눌러 POST로 요청하세요."},{status:405,headers});}
