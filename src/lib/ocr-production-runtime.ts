import prisma from './prisma';
import {getAppSession} from '@/auth';
import {getSupabaseServer} from './supabase/server';
import {OcrPostgresDatabase} from './ocr-internal-pg';
import {SupabaseOcrPrivateStorage} from './ocr-private-storage';
import {InternalOcrService} from './ocr-internal-review';
import {OcrDeviceIssuer,OCR_PILOT} from './ocr-device-issuer';
import {enrollmentDatabase} from './ocr-device-issuer-pg';
import {ocrEnvironmentReady,ocrPilotReady,type OcrReadiness} from './ocr-runtime-readiness';
/** Default off. Reads existing server credentials in-process, never exports/logs them or creates credentials. */
export async function getProductionOcrBundle(){
 if(!ocrEnvironmentReady(process.env))return null;
 try{
  const storage=getSupabaseServer();if(!storage)return null;
  const rows=await prisma.$queryRaw<OcrReadiness['db'][]>`SELECT
   (SELECT count(*)=4 FROM pg_tables WHERE schemaname='public' AND tablename IN ('crm_ocr_devices','crm_ocr_documents','crm_ocr_jobs','crm_ocr_events')) AS "tablesReady",
   EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_ocr_devices' AND column_name='issuer_state') AS "issuerColumn",
   (SELECT count(*)=4 AND bool_and(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('crm_ocr_devices','crm_ocr_documents','crm_ocr_jobs','crm_ocr_events')) AS "browserDenied",
   (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS "serverBypass",
   (SELECT count(*)=4 AND bool_and(permissive='RESTRICTIVE' AND roles @> ARRAY['anon','authenticated']::name[] AND coalesce(qual,with_check,'') LIKE '%crm-ocr-originals%') FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN ('crm_ocr_block_browser_select','crm_ocr_block_browser_insert','crm_ocr_block_browser_update','crm_ocr_block_browser_delete')) AS "storageBoundary"`;
  const {data:bucket,error}=await storage.storage.getBucket('crm-ocr-originals');
  if(error||!bucket||!rows[0]||!ocrPilotReady({db:rows[0],bucket:{name:bucket.id,public:bucket.public,fileSizeLimit:bucket.file_size_limit??null,mimeTypes:bucket.allowed_mime_types??null}}))return null;
  const database=new OcrPostgresDatabase(prisma);
  return {issuer:new OcrDeviceIssuer(enrollmentDatabase(prisma)),ocr:{service:new InternalOcrService(database,new SupabaseOcrPrivateStorage(storage)),sessionUser:async()=>{
   const id=(await getAppSession())?.user?.id;if(id!==OCR_PILOT.owner)return null;
   const user=await prisma.user.findUnique({where:{id},select:{accountDisabled:true}});return user&&!user.accountDisabled?id:null;
  },authenticateDevice:(request:Request)=>database.authenticateDevice(request)}};
 }catch{return null;} // Missing/unavailable prerequisites never activate issuance or leak connection errors.
}
