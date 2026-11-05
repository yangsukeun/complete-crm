import {createHash, randomUUID} from 'node:crypto';
import {z} from 'zod';

export const INQUIRY_OWNER = 'cmmitn4830000fc0jt8c1l2jf';
export const CS_INQUIRY_MAILBOX = 'cjhwoghd@gmail.com';
export type InquiryMail={recipient:typeof CS_INQUIRY_MAILBOX;status:'queued'|'sending'|'accepted'|'uncertain';attemptId?:string};
const legacyInquiryInput = z.object({
 schema_version:z.literal('1'), request_id:z.string().uuid(), source_site:z.enum(['corporate','3pl','cs']),
 consultation_type:z.enum(['marketing','design','customer_service','logistics','general']),
 selected_services:z.array(z.enum(['marketing','design','customer_service','logistics','general'])).min(1).max(5).refine(v=>new Set(v).size===v.length).optional(),
 contact:z.object({name:z.string().trim().min(2).max(80),phone:z.string().trim().min(8).max(24).regex(/^[+\d()\s-]+$/).refine(v=>v.replace(/\D/g,'').length>=8),email:z.string().trim().email().max(254),company:z.string().trim().max(100)}).strict(),
 original_message:z.string().trim().min(1).max(2000),
 consent:z.object({accepted:z.literal(true),version:z.string().min(1).max(80),accepted_at:z.string().datetime()}).strict(),
}).strict();
const esgInquiryInput = legacyInquiryInput.omit({source_site:true,consultation_type:true,selected_services:true,contact:true}).extend({
 source_site:z.literal('esg'),consultation_type:z.literal('esg'),
 selected_services:z.never().optional(),
 esg_service:z.enum(['agency','software','both']),
 contact:z.object({name:z.string().trim().min(2).max(80),email:z.string().trim().email().max(254),company:z.string().trim().min(1).max(100)}).strict(),
 preferred_schedule:z.string().trim().max(200).optional(),
}).strict();
export const inquiryInput=z.union([legacyInquiryInput,esgInquiryInput]);
export type InquiryInput=z.infer<typeof inquiryInput>;
export type Site=InquiryInput['source_site'];
export type Inquiry=InquiryInput & {id:string;hash:string;receivedAt:string;retentionUntil:string;assignedTo:string|null;notificationId:string|null;status:'NEW'|'ASSIGNED';email?:InquiryMail};
export class InquiryError extends Error {constructor(public status:number,public code:string){super(code);}}
export interface InquiryTx {
 find(site:Site,key:string):Promise<Inquiry|null>;
 activeUser(id:string):Promise<boolean>;
 insert(row:Inquiry):Promise<void>;
 notify(id:string,userId:string,inquiryId:string):Promise<void>;
}
export interface InquiryDb {
 transaction<T>(fn:(tx:InquiryTx)=>Promise<T>):Promise<T>;
 readVisible(actor:string,owner:boolean,id?:string):Promise<Inquiry[]>;
 activeUser(id:string):Promise<boolean>;
}
// Authenticated website identity comes from a server credential adapter, never from JSON/Origin.
export type SiteIdentity={site:Site;consentVersions:readonly string[]};
export class WebsiteInquiryService {
 constructor(private db:InquiryDb,private now:()=>Date=()=>new Date(),private emailConsentVersions:readonly string[] = []){}
 async submit(identity:SiteIdentity,key:string|null,raw:unknown){
  const parsed=inquiryInput.safeParse(raw);if(!parsed.success)throw new InquiryError(422,'INVALID_INPUT');
  const input=parsed.data;
  if(identity.site!==input.source_site)throw new InquiryError(403,'SITE_MISMATCH');
  if(key!==input.request_id)throw new InquiryError(422,'INVALID_IDEMPOTENCY_KEY');
  const allowed=identity.site==='esg'?['esg']:identity.site==='corporate'?['marketing','design','customer_service','logistics','general']:identity.site==='3pl'?['logistics','general']:['customer_service','general'];
  if(!allowed.includes(input.consultation_type))throw new InquiryError(422,'INVALID_SERVICE');
  if(input.source_site!=='esg'&&input.selected_services){
   if(input.selected_services.some(service=>!allowed.includes(service))||(input.selected_services.length>1?input.consultation_type!=='general':input.consultation_type!==input.selected_services[0]))throw new InquiryError(422,'INVALID_SERVICE_SELECTION');
   input.selected_services.sort();
  }
  const now=this.now();
  if(input.consent.version.startsWith('DRAFT-')||!identity.consentVersions.includes(input.consent.version)||Date.parse(input.consent.accepted_at)>now.getTime()+300000)throw new InquiryError(422,'INVALID_CONSENT');
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return this.db.transaction(async tx=>{
   const old=await tx.find(input.source_site,input.request_id);
   if(old){if(old.hash!==hash)throw new InquiryError(409,'IDEMPOTENCY_CONFLICT');return this.receipt(old,true);}
   // No verified routing configuration exists yet: remain unassigned. Owner notification is a review request, not an assignment.
   const notificationId=await tx.activeUser(INQUIRY_OWNER)?randomUUID():null;
   const retention=new Date(now);retention.setUTCFullYear(retention.getUTCFullYear()+5);
   const row:Inquiry={...input,id:randomUUID(),hash,receivedAt:now.toISOString(),retentionUntil:retention.toISOString(),assignedTo:null,status:'NEW',notificationId};
   if(input.consultation_type==='customer_service'&&this.emailConsentVersions.includes(input.consent.version))row.email={recipient:CS_INQUIRY_MAILBOX,status:'queued'};
   await tx.insert(row);
   if(notificationId)await tx.notify(notificationId,INQUIRY_OWNER,row.id);
   return this.receipt(row,false);
  });
 }
 private receipt(row:Inquiry,duplicate:boolean){return {schema_version:'1' as const,mode:'production' as const,request_id:row.request_id,inquiry_id:row.id,persisted:true,duplicate,notification_status:row.notificationId?'queued' as const:'not_configured' as const};}
 async read(actor:string|null,id?:string){
  if(!actor)throw new InquiryError(401,'AUTH_REQUIRED');
  if(!await this.db.activeUser(actor))throw new InquiryError(403,'ACCESS_DENIED');
  if(id&&!z.string().uuid().safeParse(id).success)throw new InquiryError(400,'INVALID_ID');
  const rows=(await this.db.readVisible(actor,actor===INQUIRY_OWNER,id)).filter(row=>row.source_site!=='esg'||actor===INQUIRY_OWNER);
  if(id&&!rows.length)throw new InquiryError(404,'NOT_FOUND');
  return rows.map(({hash: _hash,notificationId: _notificationId,...row})=>{void _hash;void _notificationId;return row;});
 }
}
