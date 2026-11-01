import { it,expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Opt-in ONLY. Never falls back to DATABASE_URL, .env, or a production datasource.
// A separately provisioned disposable local PostgreSQL database must already exist.
const connection=process.env.CRM_ISOLATED_PG_TEST_URL;
it.skipIf(!connection)('real Prisma engine: void fails, text lock preserves transaction serialization',async()=>{
 const url=new URL(connection!);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.pathname!=='/crm_inquiry_synthetic_test'||url.search||url.hash){
  throw new Error('Only the explicitly named disposable loopback test database is permitted');
 }
 const db=new PrismaClient({datasources:{db:{url:connection}},log:[]});
 const rollback=Symbol('synthetic rollback');
 try{
  // Same query shape as deployed code; don't log the raw error (may include connection context).
  let unsupported=false;
  try{await db.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(724804,1)`;});}
  catch(error){const e=error as {code?:string;meta?:{message?:string}};unsupported=e.code==='P2010'&&/void|deserialize/i.test(e.meta?.message??'');}
  expect(unsupported).toBe(true);
  await db.$transaction(async tx=>{
   const result=await tx.$queryRaw<Array<{lock_result:string}>>`SELECT pg_advisory_xact_lock(724804,1)::text AS lock_result`;
   expect(typeof result[0].lock_result).toBe('string');
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(724804,2)::text AS lock_result`;
   await tx.$executeRaw`CREATE TEMP TABLE inquiry_lock_fixture (id integer PRIMARY KEY) ON COMMIT DROP`;
   await tx.$executeRaw`INSERT INTO inquiry_lock_fixture(id) VALUES(1)`;
   expect(await tx.$queryRaw`SELECT id FROM inquiry_lock_fixture`).toEqual([{id:1}]);
   throw rollback;
  }).catch(error=>{if(error!==rollback)throw new Error('Isolated database verification failed; inspect locally without printing credentials');});
 } finally {await db.$disconnect();}
},30000);
