import {randomUUID} from 'node:crypto';
import prisma from './prisma';
import {resolveFinanceAccess} from './finance-access';
import {canRecordTransferCompletion} from './finance-transfer-completion-policy';

export class TransferCompletionError extends Error {
  constructor(public status:number,message:string){super(message);}
}

export async function recordTransferCompletion(userId:string,requestedIds:string[]){
  const {scope}=await resolveFinanceAccess(userId,'write');
  if(!scope.isTransferExecutor)throw new TransferCompletionError(403,'이체 담당자만 완료 표시할 수 있습니다.');
  const ids=[...new Set(requestedIds)];
  return prisma.$transaction(async tx=>{
    const rows=await tx.paymentRequest.findMany({where:{id:{in:ids}},select:{id:true,status:true,requesterId:true,requester:{select:{role:true}}}});
    if(rows.length!==ids.length||rows.some(row=>!canRecordTransferCompletion(true,row)))
      throw new TransferCompletionError(403,'완료 표시가 허용되지 않은 요청이 포함되어 있습니다.');
    if(rows.some(row=>!['TEAM_LEAD_APPROVED','COMPLETED'].includes(row.status)))
      throw new TransferCompletionError(409,'승인 완료된 요청만 처리할 수 있습니다. 목록을 새로고침해 주세요.');
    const now=new Date();
    let count=0;
    for(const row of rows){
      if(row.status==='COMPLETED')continue;
      const changed=await tx.paymentRequest.updateMany({where:{id:row.id,status:'TEAM_LEAD_APPROVED',requesterId:row.requesterId,requester:{role:{in:['USER','TEAM_LEAD','CENTER_CHIEF']}}},data:{status:'COMPLETED',completedAt:now}});
      if(changed.count===0){
        const latest=await tx.paymentRequest.findUnique({where:{id:row.id},select:{status:true}});
        if(latest?.status==='COMPLETED')continue;
        throw new TransferCompletionError(409,'요청 상태가 변경됐습니다. 다시 확인해 주세요.');
      }
      count++;
      await tx.paymentRequestAlert.createMany({data:[{id:randomUUID(),requestId:row.id,userId:row.requesterId!}],skipDuplicates:true});
    }
    await tx.paymentRequestAlert.updateMany({where:{requestId:{in:ids},userId},data:{readAt:now}});
    return {ok:true,count,noOp:count===0,status:'COMPLETED' as const};
  });
}
