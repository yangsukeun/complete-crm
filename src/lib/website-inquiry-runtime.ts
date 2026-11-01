import prisma from './prisma';
import {createInquiryDb,allowInquirySite} from './website-inquiry-pg';
import {WebsiteInquiryService} from './website-inquiry';
import {corporateInquiryAuthenticator} from './website-inquiry-auth';
import {corporateIntakeConfig} from './website-inquiry-config';
import type {InquiryRuntime} from './website-inquiry-http';
import {createSubjectLimiter} from './website-inquiry-preflight-pg';
/** Existing Prisma only; no credential issuance, email, push, or external dispatch. */
export async function productionInquiryRuntime():Promise<InquiryRuntime|null>{
 const config=corporateIntakeConfig(process.env);if(!config)return null;
 try{
  const rows=await prisma.$queryRaw<{ready:boolean}[]>`SELECT count(*)=2 AND bool_and(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) AS ready FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('website_inquiries','website_inquiry_rate_limits')`;
  if(!rows[0]?.ready)return null;
  const columns=await prisma.$queryRaw<{ready:boolean}[]>`SELECT
   EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='website_inquiry_rate_limits' AND column_name='bucket_key' AND is_nullable='NO' AND column_default='''site''::text')
   AND EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.website_inquiry_rate_limits'::regclass AND c.contype='p'
    AND ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.ord)=ARRAY['source_site','bucket_key']) AS ready`;
  if(!columns[0]?.ready)return null;
  const authenticate=corporateInquiryAuthenticator(config);
  return {service:new WebsiteInquiryService(createInquiryDb(prisma)),authenticateSite:async request=>{
   // Origin is an additional bound input, never a substitute for server authentication.
   if(request.headers.get('origin')!==config.origin)return null;
   return authenticate(request);
  },allowRequest:(_request,identity)=>allowInquirySite(prisma,identity.site,60),limitSubject:createSubjectLimiter(prisma)};
 }catch{return null;}
}
