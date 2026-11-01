import type {PrismaClient} from '@prisma/client';
import type {ExpiryNoticeStore} from './website-inquiry-expiry';
export function inquiryExpiryStore(db:Pick<PrismaClient,'$transaction'>):ExpiryNoticeStore{
 return {persistOnce:notice=>db.$transaction(async tx=>{
  const owner=await tx.user.findUnique({where:{id:notice.userId},select:{accountDisabled:true}});
  if(!owner||owner.accountDisabled)return 'owner_unavailable';
  // Separate durable receipt survives ordinary notification dismissal/deletion.
  // Unique PK + transaction also prevents concurrent cron/manual duplicate alerts.
  const receipt=await tx.notificationLog.createMany({data:[{id:notice.id,userId:notice.userId,kind:notice.kind}],skipDuplicates:true});
  if(receipt.count===0)return 'duplicate';
  await tx.notification.create({data:{id:notice.id,userId:notice.userId,type:'NOTICE_POSTED',message:notice.message,link:'/website-inquiries',relatedType:'SYSTEM'}});
  return 'created';
 })};
}
