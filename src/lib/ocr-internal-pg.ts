import type {PrismaClient,Prisma} from '@prisma/client';
import type {OcrDatabase,OcrTransaction,OcrDocument,OcrJob,OcrDevice,OcrEvent} from './ocr-internal-review';
import {createHash} from 'node:crypto';
const documents=`SELECT id::text,company_id::text AS "companyId",uploader_id AS "uploaderId",reviewer_id AS "reviewerId",request_key::text AS "requestKey",request_hash AS "requestHash",revision,kind,object_key AS "objectKey",sha256,mime_type AS "mimeType",byte_size AS "byteSize",state,review FROM crm_ocr_documents`;
const jobs=`SELECT id::text,document_id::text AS "documentId",revision,state,device_id::text AS "deviceId",lease_id::text AS "leaseId",(extract(epoch from lease_expires_at)*1000)::float8 AS "expiresAt",result_digest AS "resultDigest",result FROM crm_ocr_jobs`;
/** Not wired to production. Uses existing Prisma server connection only after schema/storage approval.
 * Pilot serializes OCR transactions with one transaction lock; no distributed worker race.
 */
export class OcrPostgresDatabase implements OcrDatabase{
 constructor(private db:Pick<PrismaClient,'$transaction'>){}
 async authenticateDevice(request:Request){const value=request.headers.get('authorization');if(!value?.startsWith('Bearer '))return null;const token=value.slice(7);if(token.length<32||token.length>256||/\s/.test(token))return null;const hash=createHash('sha256').update(token).digest('hex');return this.db.$transaction(async sql=>{const rows=await sql.$queryRawUnsafe<Array<{deviceId:string}>>(`SELECT d.id::text AS "deviceId" FROM crm_ocr_devices d WHERE d.token_hash=$1 AND d.is_synthetic=true AND d.client_id IS NULL AND d.revoked_at IS NULL AND d.issuer_state->>'state'='active' AND d.expires_at>now() AND d.token_expires_at>now()`,hash);return rows[0]??null;});}
 async transaction<T>(fn:(tx:OcrTransaction)=>Promise<T>):Promise<T>{return this.db.$transaction(async sql=>{
  await sql.$queryRaw`SELECT pg_advisory_xact_lock(724803,1)`;
  return fn(this.adapter(sql));
 },{maxWait:5000,timeout:15000,isolationLevel:'ReadCommitted'});}
 private adapter(sql:Prisma.TransactionClient):OcrTransaction{
  const query=<T>(text:string,...values:unknown[])=>sql.$queryRawUnsafe<T[]>(text,...values);
  const one=async<T>(text:string,...values:unknown[])=>(await query<T>(text,...values))[0]??null;
  return{
   user:id=>sql.user.findUnique({where:{id},select:{id:true,department:true,accountDisabled:true}}),
   clientActive:async id=>!!await one(`SELECT id FROM crm_ocr_devices WHERE company_id=$1::uuid AND is_synthetic=true AND client_id IS NULL AND registered_by='cmmitn4830000fc0jt8c1l2jf' AND revoked_at IS NULL AND issuer_state->>'state'='active' AND expires_at>now()`,id),
   device:id=>one<OcrDevice>(`SELECT id::text,company_id::text AS "companyId",(revoked_at IS NULL AND issuer_state->>'state'='active') AS active,(extract(epoch from expires_at)*1000)::float8 AS "expiresAt",COALESCE((extract(epoch from token_expires_at)*1000)::float8,0) AS "tokenExpiresAt" FROM crm_ocr_devices WHERE id=$1::uuid FOR UPDATE`,id),
   document:id=>one<OcrDocument>(documents+' WHERE id=$1::uuid FOR UPDATE',id),
   byRequest:(actor,key)=>one<OcrDocument>(documents+' WHERE uploader_id=$1 AND request_key=$2::uuid FOR UPDATE',actor,key),
   job:id=>one<OcrJob>(jobs+' WHERE id=$1::uuid FOR UPDATE',id),
   jobForDocument:(id,revision)=>one<OcrJob>(jobs+' WHERE document_id=$1::uuid AND revision=$2',id,revision),
   eventByKey:(id,action,key)=>one<OcrEvent>(`SELECT id::text,document_id::text AS "documentId",actor_kind AS "actorKind",actor_id AS "actorId",action,revision,request_key AS "requestKey",before_state AS "beforeState",after_state AS "afterState" FROM crm_ocr_events WHERE document_id=$1::uuid AND action=$2 AND request_key=$3`,id,action,key),
   nextQueued:async company=>{const row=await one<{id:string;documentId:string}>(`SELECT j.id::text,j.document_id::text AS "documentId" FROM crm_ocr_jobs j JOIN crm_ocr_documents d ON d.id=j.document_id WHERE d.company_id=$1::uuid AND d.state='queued' AND j.state='queued' AND j.revision=d.revision ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j,d SKIP LOCKED`,company);if(!row)return null;const document=await one<OcrDocument>(documents+' WHERE id=$1::uuid',row.documentId);const job=await one<OcrJob>(jobs+' WHERE id=$1::uuid',row.id);return document&&job?{document,job}:null;},
   saveDocument:async d=>{await sql.$executeRawUnsafe(`INSERT INTO crm_ocr_documents(id,company_id,client_id,uploader_id,reviewer_id,request_key,request_hash,revision,kind,object_key,sha256,mime_type,byte_size,state,review) VALUES($1::uuid,$2::uuid,NULL,$3,$4,$5::uuid,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,review=EXCLUDED.review,revision=EXCLUDED.revision,updated_at=now()`,d.id,d.companyId,d.uploaderId,d.reviewerId,d.requestKey,d.requestHash,d.revision,d.kind,d.objectKey,d.sha256,d.mimeType,d.byteSize,d.state,d.review==null?null:JSON.stringify(d.review));},
   saveJob:async j=>{await sql.$executeRawUnsafe(`INSERT INTO crm_ocr_jobs(id,document_id,revision,state,device_id,lease_id,lease_expires_at,result_digest,result) VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,to_timestamp($7::float8/1000),$8,$9::jsonb) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,device_id=EXCLUDED.device_id,lease_id=EXCLUDED.lease_id,lease_expires_at=EXCLUDED.lease_expires_at,result_digest=EXCLUDED.result_digest,result=EXCLUDED.result`,j.id,j.documentId,j.revision,j.state,j.deviceId??null,j.leaseId??null,j.expiresAt??null,j.resultDigest??null,j.result===undefined?null:JSON.stringify(j.result));},
   event:async e=>{await sql.$executeRawUnsafe(`INSERT INTO crm_ocr_events(id,document_id,actor_kind,actor_id,action,revision,request_key,before_state,after_state) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9)`,e.id,e.documentId,e.actorKind,e.actorId,e.action,e.revision,e.requestKey,e.beforeState,e.afterState);}
  };
 }
}
