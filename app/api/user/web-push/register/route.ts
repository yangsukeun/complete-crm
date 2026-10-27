import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { verifiedSubscriptions } from "@/lib/onesignal/verified-subscriptions";
import { isLikelyOneSignalSubscriptionId } from "@/lib/onesignal/subscription-id";
const headers={"Cache-Control":"private, no-store"};
async function handle(req:Request,remove:boolean){
 if(req.headers.get("origin")!==new URL(req.url).origin)return Response.json({error:"허용되지 않은 출처"},{status:403,headers});
 try{const id=(await getAppSession())?.user?.id;if(!id)return Response.json({error:"로그인 필요"},{status:401,headers});
 const user=await prisma.user.findUnique({where:{id},select:{accountDisabled:true,playerIds:true,playerId:true,oneSignalPlayerId:true}});
 if(!user||(!remove&&user.accountDisabled))return Response.json({error:"계정 사용 불가"},{status:403,headers});
 const body=await req.json();const subscription=body.subscriptionId??body.playerId;
 if(typeof subscription!=="string"||!isLikelyOneSignalSubscriptionId(subscription))return Response.json({error:"유효한 기기 구독이 필요합니다."},{status:400,headers});
 if(remove){if(![...user.playerIds,user.playerId,user.oneSignalPlayerId].includes(subscription))return Response.json({ok:true},{headers});
 await prisma.$executeRaw`UPDATE "User" SET "playerIds"=array_remove("playerIds",${subscription}),"playerId"=CASE WHEN "playerId"=${subscription} THEN NULL ELSE "playerId" END,"oneSignalPlayerId"=CASE WHEN "oneSignalPlayerId"=${subscription} THEN NULL ELSE "oneSignalPlayerId" END WHERE id=${id}`;
 await prisma.oneSignalSubscription.deleteMany({where:{userId:id,subscriptionId:subscription}});return Response.json({ok:true},{headers});}
 const verified=await verifiedSubscriptions(id);if(!verified.ids.includes(subscription))return Response.json({error:"현재 계정의 활성 구독 확인 실패. 알림 켜기를 다시 눌러주세요.",status:verified.status},{status:409,headers});
 const saved=await prisma.$transaction(async tx=>{
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${subscription}),724804)`;
 const other=await tx.user.findFirst({where:{id:{not:id},OR:[{playerIds:{has:subscription}},{playerId:subscription},{oneSignalPlayerId:subscription}]},select:{id:true}});
 const registered=await tx.oneSignalSubscription.findUnique({where:{subscriptionId:subscription}});
 if(other||(registered&&registered.userId!==id))return false;
 await tx.$executeRaw`UPDATE "User" SET "playerIds"=CASE WHEN ${subscription}=ANY("playerIds") THEN "playerIds" ELSE array_append("playerIds",${subscription}) END,"playerId"=${subscription},"oneSignalPlayerId"=${subscription} WHERE id=${id}`;
 await tx.oneSignalSubscription.upsert({where:{subscriptionId:subscription},create:{userId:id,subscriptionId:subscription},update:{lastSeenAt:new Date()}});return true;
 });
 if(!saved)return Response.json({error:"다른 계정에 등록된 기기입니다. 이전 계정에서 로그아웃 후 다시 연결하세요."},{status:409,headers});
 return Response.json({ok:true,savedSubscriptionId:true,oneSignalExternalLinked:true},{headers});
 }catch{return Response.json({error:"구독 변경을 확인하지 못했습니다."},{status:503,headers});}
}
export async function POST(req:Request){return handle(req,false);}
export async function DELETE(req:Request){return handle(req,true);}
