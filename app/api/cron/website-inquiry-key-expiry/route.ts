import {verifyCronRequest} from '@/lib/cron-auth';
import prisma from '@/lib/prisma';
import {corporateIntakeConfig} from '@/lib/website-inquiry-config';
import {sendInquiryExpiryNotice} from '@/lib/website-inquiry-expiry';
import {inquiryExpiryStore} from '@/lib/website-inquiry-expiry-pg';
export const runtime='nodejs';
export async function GET(request:Request){
 const denied=verifyCronRequest(request,'website-inquiry-key-expiry');if(denied)return denied;
 const config=corporateIntakeConfig(process.env);
 if(!config)return Response.json({ok:false,code:'INTAKE_NOT_CONFIGURED'},{status:503});
 try{
  const result=await sendInquiryExpiryNotice(config,inquiryExpiryStore(prisma));
  // No environment values, verification digests, tokens, or personal data in logs.
  console.info('[website-inquiry-key-expiry]',result);
  return Response.json({ok:result!=='owner_unavailable',result},{status:result==='owner_unavailable'?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{console.error('[website-inquiry-key-expiry] notification transaction failed');return Response.json({ok:false,code:'EXPIRY_NOTICE_FAILED'},{status:503});}
}
