import {it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync,createHash,sign} from 'node:crypto';
import {PgTestQueueStore,PgTestAuthStore} from '../src/lib/erp-ocr-test-pg';
import {ErpOcrTestService} from '../src/lib/erp-ocr-test';
import {createTestServerVerifier} from '../src/lib/erp-ocr-test-auth';
import {testBridgeHttp} from '../src/lib/erp-ocr-test-http';
// Never reads DATABASE_URL or falls back to production. Requires a pre-provisioned disposable DB.
const connection=process.env.CRM_ISOLATED_PG_TEST_URL;
it.skipIf(!connection)('real Prisma/PG: signed HTTP, concurrency, storage rollback, replay, revocation and customer isolation',async()=>{
 const url=new URL(connection!);if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.pathname!=='/crm_inquiry_synthetic_test'||url.search||url.hash)throw Error('Disposable loopback test database only');
 const db=new PrismaClient({datasources:{db:{url:connection}},log:[]});const schema='ocr_test_'+randomUUID().replaceAll('-','');
 const scoped={ $transaction:async<T>(fn:(tx:Parameters<Parameters<PrismaClient['$transaction']>[0]>[0])=>Promise<T>)=>db.$transaction(async tx=>{await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);return fn(tx);},{timeout:15000,isolationLevel:'ReadCommitted'}) } as unknown as Pick<PrismaClient,'$transaction'>;
 const actor='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002',company=randomUUID(),mapping=randomUUID(),owner='cmmitn4830000fc0jt8c1l2jf';
 let failStorage=false;const images=new Map<string,Uint8Array>();const storage={putOnce:async(_b:string,k:string,v:Uint8Array)=>{if(failStorage||images.has(k))throw Error('test storage');images.set(k,v);},read:async(_b:string,k:string)=>{const v=images.get(k);if(!v)throw Error('not found');return v;}};
 try{
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await scoped.$transaction(async tx=>{
   await tx.$executeRawUnsafe('CREATE TABLE "User"(id text PRIMARY KEY,"accountDisabled" boolean NOT NULL DEFAULT false)');
   await tx.$executeRawUnsafe('CREATE TABLE logistics_sales_records(id text PRIMARY KEY)');
   const old=readFileSync('prisma/drafts/ocr-internal-review.sql','utf8').replaceAll('public.',`"${schema}".`);
   const next=readFileSync('prisma/drafts/erp-ocr-test-persistence.sql','utf8').replaceAll('public.',`"${schema}".`);
   // No global roles are created. DDL shapes/RLS tested; production role grants require deployment preflight.
   for(const file of [old,next])for(const statement of file.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(s=>s&&!/^(BEGIN|ROLLBACK|REVOKE)/.test(s)))await tx.$executeRawUnsafe(statement);
   await tx.$executeRawUnsafe('ALTER TABLE crm_ocr_devices ADD COLUMN issuer_state jsonb');
   await tx.$executeRawUnsafe('INSERT INTO "User"(id) VALUES($1)',owner);
  });
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');const client='synthetic-pg';
  await scoped.$transaction(async tx=>{
   await tx.$executeRawUnsafe(`INSERT INTO crm_ocr_erp_test_clients VALUES($1,'test-kid',$2::jsonb,true,now()-interval '1 minute',now()+interval '1 day')`,client,JSON.stringify(publicKey.export({format:'jwk'})));
   await tx.$executeRawUnsafe(`INSERT INTO crm_ocr_devices(id,company_id,label,registered_by,registered_at,expires_at,issuer_state) VALUES($1::uuid,$2::uuid,'synthetic',$3,now(),now()+interval '1 day','{"state":"active"}')`,randomUUID(),company,owner);
   await tx.$executeRawUnsafe(`INSERT INTO crm_ocr_erp_test_mappings(id,revision,client_id,erp_user_id,erp_customer_id,crm_company_id,crm_custodian_id,active,approved_sha256,expires_at) VALUES($1::uuid,1,$2,$3::uuid,$4::uuid,$5::uuid,$6,true,ARRAY[$7],now()+interval '1 day')`,mapping,client,actor,customer,company,owner,createHash('sha256').update(Buffer.from([137,80,78,71,13,10,26,10,0])).digest('hex'));
  });
  const authStore=new PgTestAuthStore(scoped),service=new ErpOcrTestService(new PgTestQueueStore(scoped,storage));const runtime=async()=>({service,authenticate:createTestServerVerifier(authStore)});
  const image=Buffer.from([137,80,78,71,13,10,26,10,0]);const binding={requestKey:randomUUID(),erpUserId:actor,erpCustomerId:customer,mappingId:mapping,mappingRevision:1,companyId:company,sha256:createHash('sha256').update(image).digest('hex'),kind:'box',mimeType:'image/png',syntheticOnly:true};
  const request=(body:string,target='/api/integrations/erp/ocr-test/jobs',method='POST')=>{const iat=Math.floor(Date.now()/1000);const h=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'erp-ocr-test+jwt',kid:'test-kid'})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:'https://logistics-erp-mvp.vercel.app',aud:'https://www.cpcrm.co.kr',sub:client,scope:'ocr.synthetic.submit-read',erpUserId:actor,erpCustomerId:customer,iat,exp:iat+60,jti:randomUUID(),method,target,bodySha256:createHash('sha256').update(body).digest('hex')})).toString('base64url');return new Request('https://www.cpcrm.co.kr'+target,{method,headers:{'content-type':'application/json',authorization:'Bearer '+h+'.'+p+'.'+sign(null,Buffer.from(h+'.'+p),privateKey).toString('base64url')},...(method==='POST'?{body}:{})});};
  const body=JSON.stringify({binding,imageBase64:image.toString('base64')});
  const [a,b]=await Promise.all([testBridgeHttp(request(body),null,runtime),testBridgeHttp(request(body),null,runtime)]);expect(a.status).toBe(200);expect(b.status).toBe(200);const job=await a.json();expect(await b.json()).toEqual(job);
  const count=()=>scoped.$transaction(tx=>tx.$queryRawUnsafe<Array<{n:number}>>('SELECT count(*)::int AS n FROM crm_ocr_erp_test_bindings'));expect((await count())[0].n).toBe(1);
  const retry=request(body);expect((await testBridgeHttp(retry.clone(),null,runtime)).status).toBe(200);expect((await testBridgeHttp(retry,null,runtime)).status).toBe(401);
  expect((await testBridgeHttp(request(JSON.stringify({binding:{...binding,kind:'statement'},imageBase64:image.toString('base64')})),null,runtime)).status).toBe(409);
  failStorage=true;expect((await testBridgeHttp(request(JSON.stringify({binding:{...binding,requestKey:randomUUID()},imageBase64:image.toString('base64')})),null,runtime)).status).toBe(503);expect((await count())[0].n).toBe(1);failStorage=false;
  const target='/api/integrations/erp/ocr-test/jobs/'+job.jobId+'?'+new URLSearchParams({erpUserId:actor,erpCustomerId:customer,mappingId:mapping,mappingRevision:'1'});
  expect((await testBridgeHttp(request('',target,'GET'),job.jobId,runtime)).status).toBe(200);
  expect((await testBridgeHttp(request('',target.replace(customer,randomUUID()),'GET'),job.jobId,runtime)).status).toBe(403);
  await scoped.$transaction(tx=>tx.$executeRawUnsafe('UPDATE crm_ocr_erp_test_mappings SET revision=2'));
  expect((await testBridgeHttp(request('',target,'GET'),job.jobId,runtime)).status).toBe(409);
  await scoped.$transaction(tx=>tx.$executeRawUnsafe('UPDATE crm_ocr_erp_test_mappings SET expires_at=now()-interval \'1 second\''));
  expect((await testBridgeHttp(request('',target,'GET'),job.jobId,runtime)).status).toBe(403);
  await scoped.$transaction(tx=>tx.$executeRawUnsafe('UPDATE crm_ocr_erp_test_clients SET active=false'));
  expect((await testBridgeHttp(request(body),null,runtime)).status).toBe(401);
 }finally{
  // Only the locally generated isolated test schema; no production connection or existing schema allowed.
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.$disconnect();
 }
},60000);
