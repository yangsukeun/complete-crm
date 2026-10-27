import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { pushConfig,verifiedSubscriptions } from "@/lib/onesignal/verified-subscriptions";
const headers={"Cache-Control":"private, no-store"};
export async function GET(){
 const id=(await getAppSession())?.user?.id;if(!id)return Response.json({error:"로그인 필요"},{status:401,headers});
 const user=await prisma.user.findUnique({where:{id},select:{accountDisabled:true}});if(!user||user.accountDisabled)return Response.json({error:"계정 사용 불가"},{status:403,headers});
 const {appId,key}=pushConfig();const result=await verifiedSubscriptions(id);return Response.json({configured:!!appId&&!!key,provider:result.status,activeSubscriptions:result.ids.length},{headers});
}
