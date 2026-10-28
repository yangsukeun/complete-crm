import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {requireSalesUser,SalesError} from '@/lib/logistics-sales';
import {getOcrReviewAdapter} from '@/lib/logistics-ocr-runtime';
import {resumeOcrReview,OcrBoundaryError} from '@/lib/logistics-ocr';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
async function authorize(){const id=(await getAppSession())?.user?.id??null;requireSalesUser(id?await prisma.user.findUnique({where:{id},select:{id:true,department:true,accountDisabled:true}}):null);return id!;}
function failure(e:unknown){return Response.json({error:e instanceof OcrBoundaryError||e instanceof SalesError?e.message:'OCR 연결을 확인할 수 없습니다.'},{status:e instanceof OcrBoundaryError||e instanceof SalesError?e.status:503,headers});}
export async function GET(){try{await authorize();return Response.json({reviewResumeConnected:getOcrReviewAdapter()!==null,uploadConnected:false,workerConnected:false,inventoryConnected:false,registrationAuthorized:false},{headers});}catch(e){return failure(e);}}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'허용되지 않은 요청 출처입니다.'},{status:403,headers});
 try{const actor=await authorize();const adapter=getOcrReviewAdapter();if(!adapter)throw new OcrBoundaryError(503,'ERP 인증·고객사 매핑 연결 전입니다. 저장·승인·입고는 실행되지 않았습니다.');
 const body=await request.text();if(new TextEncoder().encode(body).length>2048)throw new OcrBoundaryError(413,'요청이 너무 큽니다.');let input:unknown;try{input=JSON.parse(body);}catch{throw new OcrBoundaryError(400,'올바른 검수 요청이 아닙니다.');}return Response.json(await resumeOcrReview(adapter,actor,input),{headers});
 }catch(e){return failure(e);}
}
