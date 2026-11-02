import {createHash,randomUUID} from 'node:crypto';
import type {Prisma,PrismaClient} from '@prisma/client';
import {type TestAuthStore,type TestClient} from './erp-ocr-test-auth';
import {TestBridgeError,type TestMapping,type TestJob,type TestQueueStore,type TestQueueTx,bindingSchema,testJobSchema} from './erp-ocr-test';
import {OCR_PRIVATE_BUCKET,type OcrPrivateStorage} from './ocr-internal-review';
type DB=Pick<PrismaClient,'$transaction'>;
const OWNER='cmmitn4830000fc0jt8c1l2jf';
const sha=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const deterministicId=(value:string)=>{const h=sha(value);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export class PgTestAuthStore implements TestAuthStore{
 constructor(private db:DB){}
 async client(id:string){return this.db.$transaction(async tx=>(await tx.$queryRawUnsafe<TestClient[]>(`SELECT id,kid,public_jwk AS "publicJwk",active,(extract(epoch FROM issued_at)*1000)::float8 AS "issuedAt",(extract(epoch FROM expires_at)*1000)::float8 AS "expiresAt" FROM crm_ocr_erp_test_clients WHERE id=$1`,id))[0]??null);}
 async consume(client:string,kid:string,jti:string,expiry:number){return this.db.$transaction(async tx=>{
  const current=await tx.$queryRawUnsafe<{id:string}[]>(`SELECT id FROM crm_ocr_erp_test_clients WHERE id=$1 AND kid=$2 AND active AND issued_at<=now() AND expires_at>=to_timestamp($3::float8/1000) AND expires_at>now() FOR SHARE`,client,kid,expiry);
  if(!current.length)return false;
  // Replay rows are never deleted inline; expiry cleanup needs a separately reviewed policy.
  return (await tx.$executeRawUnsafe(`INSERT INTO crm_ocr_erp_test_nonces(client_id,jti,expires_at) VALUES($1,$2::uuid,to_timestamp($3::float8/1000)) ON CONFLICT DO NOTHING`,client,jti,expiry))===1;
 });}
}
export class PgTestQueueStore implements TestQueueStore{
 constructor(private db:DB,private storage:OcrPrivateStorage){}
 async transaction<T>(fn:(tx:TestQueueTx)=>Promise<T>){return this.db.$transaction(async tx=>{
  // Same lock as the existing Windows queue: prevent races with claim/result/revision changes.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(724803,1)::text AS lock_result`;
  return fn(this.adapter(tx));
 },{isolationLevel:'ReadCommitted',maxWait:5000,timeout:15000});}
 private adapter(tx:Prisma.TransactionClient):TestQueueTx{
  const mappings=async(client:string,actor:string,customer:string)=>tx.$queryRawUnsafe<Array<TestMapping&{crmCustodianId:string}>>(`SELECT m.id::text,m.revision,m.client_id AS "clientId",m.erp_user_id::text AS "erpUserId",m.erp_customer_id::text AS "erpCustomerId",m.crm_company_id::text AS "crmCompanyId",m.crm_custodian_id AS "crmCustodianId",m.active,m.synthetic_only AS "syntheticOnly",m.approved_sha256 AS "approvedSha256",(extract(epoch FROM m.expires_at)*1000)::float8 AS "expiresAt" FROM crm_ocr_erp_test_mappings m JOIN crm_ocr_erp_test_clients c ON c.id=m.client_id JOIN "User" u ON u.id=m.crm_custodian_id WHERE m.client_id=$1 AND m.erp_user_id=$2::uuid AND m.erp_customer_id=$3::uuid AND c.active AND c.issued_at<=now() AND c.expires_at>now() AND m.expires_at>now() AND m.crm_custodian_id=$4 AND NOT u."accountDisabled" AND EXISTS(SELECT 1 FROM crm_ocr_devices d WHERE d.company_id=m.crm_company_id AND d.is_synthetic AND d.client_id IS NULL AND d.revoked_at IS NULL AND d.expires_at>now() AND d.issuer_state->>'state'='active') FOR SHARE OF m,c,u`,client,actor,customer,OWNER);
  const read=async(client:string,column:'request_key'|'job_id',value:string):Promise<TestJob|null>=>{
   const rows=await tx.$queryRawUnsafe<Array<{jobId:string;binding:unknown;revision:number;documentRevision:number;state:string;jobState:string;result:unknown;fresh:boolean;companyId:string;mappingId:string;mappingRevision:number}>>(`SELECT b.job_id::text AS "jobId",b.binding,b.mapping_id::text AS "mappingId",b.mapping_revision AS "mappingRevision",j.revision,d.revision AS "documentRevision",d.company_id::text AS "companyId",d.state,j.state AS "jobState",j.result,(d.retention_until>now() AND j.result_retention_until>now()) AS fresh FROM crm_ocr_erp_test_bindings b JOIN crm_ocr_documents d ON d.id=b.document_id JOIN crm_ocr_jobs j ON j.id=b.job_id AND j.document_id=d.id WHERE b.client_id=$1 AND b.${column}=$2::uuid AND d.is_synthetic AND d.client_id IS NULL FOR SHARE OF b,d,j`,client,value);
   if(!rows.length)return null;const r=rows[0],binding=bindingSchema.parse(r.binding);
   if(!r.fresh)throw new TestBridgeError(410,'OCR_TEST_RETENTION_EXPIRED');
   if(r.revision!==r.documentRevision||r.companyId!==binding.companyId||r.mappingId!==binding.mappingId||r.mappingRevision!==binding.mappingRevision)throw new TestBridgeError(409,'JOB_REVISION_OR_BINDING_CHANGED');
   const states:Record<string,string>={queued:'queued',processing:'processing',needs_review:'needs_review',cancelled:'cancelled'};
   if(!states[r.state]||({queued:'queued',processing:'leased',needs_review:'needs_review',cancelled:r.jobState} as Record<string,string>)[r.state]!==r.jobState)throw new TestBridgeError(409,'JOB_STATE_CHANGED');
   const result=r.result as {status?:string;registrationAuthorized?:boolean;extraction?:{observations?:Array<{rawText:string;productName:string|null;quantity:number|null;unit:'ea'|'box'|null}>}}|null;
   if(r.state==='needs_review'&&(result?.status!=='needs_review'||result.registrationAuthorized!==false||!Array.isArray(result.extraction?.observations)))throw new TestBridgeError(409,'RESULT_INVALID');
   // Explicitly project only candidate fields, excluding images, locations, tokens and final approvals.
   const observations=r.state==='needs_review'?result!.extraction!.observations!.map(o=>({rawText:o.rawText,productName:o.productName,quantity:o.quantity,unit:o.unit})):[];
   return testJobSchema.parse({jobId:r.jobId,binding,status:states[r.state],revision:r.revision,registrationAuthorized:false,observations});
  };
  return {mappings,byRequest:(c,k)=>read(c,'request_key',k),read:(c,k)=>read(c,'job_id',k),enqueue:async(client,j,image)=>{
   const b=bindingSchema.parse(j.binding),matches=await mappings(client,b.erpUserId,b.erpCustomerId);const m=matches.find(v=>v.id===b.mappingId&&v.revision===b.mappingRevision&&v.active&&v.syntheticOnly&&v.approvedSha256.includes(b.sha256)&&v.crmCompanyId===b.companyId);
   if(matches.length!==1||!m)throw new TestBridgeError(403,'MAPPING_DENIED');
   const documentId=deterministicId(client+':'+b.requestKey),objectKey=`${b.companyId}/${documentId}/original`;
   try{await this.storage.putOnce(OCR_PRIVATE_BUCKET,objectKey,image,b.mimeType);}catch{
    // Only accept an existing exact private object from a lost transaction; never overwrite it.
    const old=await this.storage.read(OCR_PRIVATE_BUCKET,objectKey);
    if(old.length!==image.length||sha(old)!==b.sha256)throw new TestBridgeError(409,'PRIVATE_OBJECT_CONFLICT');
   }
   await tx.$executeRawUnsafe(`INSERT INTO crm_ocr_documents(id,company_id,client_id,is_synthetic,uploader_id,reviewer_id,request_key,request_hash,revision,kind,object_key,sha256,mime_type,byte_size,state) VALUES($1::uuid,$2::uuid,NULL,true,$3,$3,$4::uuid,$5,1,$6,$7,$8,$9,$10,'queued')`,documentId,b.companyId,m.crmCustodianId,documentId,sha(JSON.stringify(b)),b.kind,objectKey,b.sha256,b.mimeType,image.length);
   await tx.$executeRawUnsafe(`INSERT INTO crm_ocr_jobs(id,document_id,revision,state) VALUES($1::uuid,$2::uuid,1,'queued')`,j.jobId,documentId);
   await tx.$executeRawUnsafe(`INSERT INTO crm_ocr_erp_test_bindings(client_id,request_key,mapping_id,mapping_revision,binding,document_id,job_id) VALUES($1,$2::uuid,$3::uuid,$4,$5::jsonb,$6::uuid,$7::uuid)`,client,b.requestKey,b.mappingId,b.mappingRevision,JSON.stringify(b),documentId,j.jobId);
   // Existing user-kind event is the explicit CRM custodian; the binding retains actual ERP submitter.
   await tx.$executeRawUnsafe(`INSERT INTO crm_ocr_events(id,document_id,actor_kind,actor_id,action,revision,request_key,before_state,after_state) VALUES($1::uuid,$2::uuid,'user',$3,'upload',1,$4,NULL,'queued')`,randomUUID(),documentId,m.crmCustodianId,'erp-test:'+b.requestKey);
  }};
 }
}
