import {NextResponse} from 'next/server';
import {getAppSession} from '@/auth';
import {z} from 'zod';
import {recordTransferCompletion,TransferCompletionError} from '@/lib/finance-transfer-completion';
const bodySchema=z.object({ids:z.array(z.string().min(1)).min(1).max(80)});
export async function POST(req:Request){
 try{
  const session=await getAppSession();
  if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
  const parsed=bodySchema.safeParse(await req.json());
  if(!parsed.success)return NextResponse.json({error:'요청 ID 목록이 올바르지 않습니다.'},{status:400});
  return NextResponse.json(await recordTransferCompletion(session.user.id,parsed.data.ids));
 }catch(error){
  if(error instanceof TransferCompletionError)return NextResponse.json({error:error.message},{status:error.status});
  return NextResponse.json({error:'완료 표시를 처리하지 못했습니다. 상태를 확인한 뒤 다시 시도해 주세요.'},{status:500});
 }
}
