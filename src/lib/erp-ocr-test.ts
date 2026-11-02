import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
const uuid=z.string().uuid();
export const bindingSchema=z.object({requestKey:uuid,erpUserId:uuid,erpCustomerId:uuid,mappingId:uuid,mappingRevision:z.number().int().positive(),companyId:uuid,sha256:z.string().regex(/^[a-f0-9]{64}$/),kind:z.enum(['statement','box']),mimeType:z.enum(['image/png','image/jpeg']),syntheticOnly:z.literal(true)}).strict();
export type TestBinding=z.infer<typeof bindingSchema>;
const observation=z.object({rawText:z.string().max(2000),productName:z.string().max(200).nullable(),quantity:z.number().int().nonnegative().nullable(),unit:z.enum(['ea','box']).nullable()}).strict();
export const testJobSchema=z.object({jobId:uuid,binding:bindingSchema,status:z.enum(['queued','processing','needs_review','failed','cancelled']),revision:z.number().int().nonnegative(),registrationAuthorized:z.literal(false),observations:z.array(observation).max(100)}).strict();
export type TestJob=z.infer<typeof testJobSchema>;
export type TestPrincipal={clientId:string;issuer:'https://logistics-erp-mvp.vercel.app';audience:'https://www.cpcrm.co.kr';scope:'ocr.synthetic.submit-read';erpUserId:string;erpCustomerId:string;expiresAt:number;active:boolean};
export type TestMapping={id:string;revision:number;clientId:string;erpUserId:string;erpCustomerId:string;crmCompanyId:string;active:boolean;syntheticOnly:boolean;expiresAt:number};
export class TestBridgeError extends Error{constructor(public status:number,public code:string){super(code);}}
const fail=(status:number,code:string):never=>{throw new TestBridgeError(status,code);};
/** Production transaction must lock mapping and unique(clientId,requestKey) across instances.
 * enqueue creates the private original, document, job, binding and audit atomically from caller perspective.
 * Storage failure must not commit a job. Orphan objects on DB rollback require reconciliation, not success.
 * No actor impersonation, worker token, receipt, stock, review approval or public image URL is exposed. */
export interface TestQueueTx{
 mappings(clientId:string,actor:string,customer:string):Promise<TestMapping[]>;
 byRequest(clientId:string,key:string):Promise<TestJob|null>;
 read(clientId:string,id:string):Promise<TestJob|null>;
 enqueue(clientId:string,job:TestJob,image:Uint8Array):Promise<void>;
}
export interface TestQueueStore{transaction<T>(fn:(tx:TestQueueTx)=>Promise<T>):Promise<T>}
const same=(a:TestBinding,b:TestBinding)=>JSON.stringify(bindingSchema.parse(a))===JSON.stringify(bindingSchema.parse(b));
export class ErpOcrTestService{
 constructor(private store:TestQueueStore,private now=Date.now){}
 private principal(p:TestPrincipal|null){
  if(!p)fail(401,'ERP_SERVER_AUTH_REQUIRED');
  if(!p!.active||!p!.clientId||p!.issuer!=='https://logistics-erp-mvp.vercel.app'||p!.audience!=='https://www.cpcrm.co.kr'||p!.scope!=='ocr.synthetic.submit-read'||!Number.isFinite(p!.expiresAt)||p!.expiresAt<=this.now()||p!.expiresAt>this.now()+60000)fail(403,'ERP_SERVER_SCOPE_DENIED');
  uuid.parse(p!.erpUserId);uuid.parse(p!.erpCustomerId);return p!;
 }
 private async mapping(tx:TestQueueTx,p:TestPrincipal){
  const rows=(await tx.mappings(p.clientId,p.erpUserId,p.erpCustomerId)).filter(m=>m.active);
  if(rows.length!==1)fail(403,'EXPLICIT_MAPPING_REQUIRED');const m=rows[0];
  if(m.clientId!==p.clientId||m.erpUserId!==p.erpUserId||m.erpCustomerId!==p.erpCustomerId||!m.syntheticOnly||!Number.isFinite(m.expiresAt)||m.expiresAt<=this.now())fail(403,'MAPPING_DENIED');return m;
 }
 private check(b:TestBinding,m:TestMapping){if(b.erpUserId!==m.erpUserId||b.erpCustomerId!==m.erpCustomerId||b.companyId!==m.crmCompanyId||b.mappingId!==m.id)fail(403,'BINDING_SCOPE_DENIED');if(b.mappingRevision!==m.revision)fail(409,'MAPPING_REVISION_CHANGED');}
 private result(raw:TestJob,m:TestMapping){const job=testJobSchema.parse(raw);this.check(job.binding,m);if(job.status!=='needs_review'&&job.observations.length)fail(409,'RESULT_STATE_INVALID');return job;}
 async enqueue(principal:TestPrincipal|null,input:unknown,image:Uint8Array){
  const p=this.principal(principal),b=bindingSchema.parse(input);
  if(!image.length||image.length>2*1024*1024)fail(413,'PILOT_IMAGE_LIMIT_2_MIB');
  const bytes=Buffer.from(image),png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!(b.mimeType==='image/png'?png:jpg)||createHash('sha256').update(bytes).digest('hex')!==b.sha256)fail(400,'IMAGE_INTEGRITY_INVALID');
  return this.store.transaction(async tx=>{
   const m=await this.mapping(tx,p);this.check(b,m);
   const prior=await tx.byRequest(p.clientId,b.requestKey);
   if(prior){if(!same(prior.binding,b))fail(409,'REQUEST_BINDING_CONFLICT');return this.result(prior,m);}
   const job:TestJob={jobId:randomUUID(),binding:b,status:'queued',revision:1,registrationAuthorized:false,observations:[]};
   await tx.enqueue(p.clientId,job,bytes);return this.result(job,m);
  });
 }
 async read(principal:TestPrincipal|null,id:string,scope:unknown){
  const p=this.principal(principal);uuid.parse(id);
  const s=z.object({erpUserId:uuid,erpCustomerId:uuid,mappingId:uuid,mappingRevision:z.number().int().positive()}).strict().parse(scope);
  return this.store.transaction(async tx=>{const m=await this.mapping(tx,p);if(s.erpUserId!==m.erpUserId||s.erpCustomerId!==m.erpCustomerId||s.mappingId!==m.id)fail(403,'RESULT_SCOPE_DENIED');if(s.mappingRevision!==m.revision)fail(409,'MAPPING_REVISION_CHANGED');const j=await tx.read(p.clientId,id);if(!j||j.jobId!==id)fail(404,'JOB_NOT_FOUND');return this.result(j!,m);});
 }
}
