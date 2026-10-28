import {getAppSession} from '@/auth';
import {getInquiryRuntime} from '@/lib/website-inquiry-http';
import {InquiryError} from '@/lib/website-inquiry';
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
 const actor=(await getAppSession())?.user?.id;
 if(!actor)return Response.json({code:'AUTH_REQUIRED'},{status:401,headers});
 const runtime=await getInquiryRuntime();
 if(!runtime)return Response.json({code:'INTAKE_NOT_CONFIGURED'},{status:503,headers});
 try{return Response.json({items:await runtime.service.read(actor,new URL(request.url).searchParams.get('id')??undefined)},{headers});}
 catch(error){return Response.json({code:error instanceof InquiryError?error.code:'READ_UNAVAILABLE'},{status:error instanceof InquiryError?error.status:503,headers});}
}
