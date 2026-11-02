import 'server-only';
import prisma from './prisma';
import {getSupabaseServer} from './supabase/server';
import {getProductionOcrBundle} from './ocr-production-runtime';
import {SupabaseOcrPrivateStorage} from './ocr-private-storage';
import {PgTestAuthStore,PgTestQueueStore} from './erp-ocr-test-pg';
import {createTestServerVerifier} from './erp-ocr-test-auth';
import {ErpOcrTestService} from './erp-ocr-test';
import type {TestRuntime} from './erp-ocr-test-http';
/** No migration, enrollment, key generation or fallback auth at startup. */
export async function configuredTestRuntime():Promise<TestRuntime|null>{
 if(process.env.CRM_ERP_OCR_TEST_ENABLED!=='true')return null;
 try{
  const rows=await prisma.$queryRaw<Array<{ready:boolean}>>`SELECT count(*)=4 AND bool_and(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) AS ready FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('crm_ocr_erp_test_clients','crm_ocr_erp_test_nonces','crm_ocr_erp_test_mappings','crm_ocr_erp_test_bindings')`;
  if(!rows[0]?.ready||!await getProductionOcrBundle())return null;
  const storage=getSupabaseServer();if(!storage)return null;
  return {service:new ErpOcrTestService(new PgTestQueueStore(prisma,new SupabaseOcrPrivateStorage(storage))),authenticate:createTestServerVerifier(new PgTestAuthStore(prisma))};
 }catch{return null;}
}
