import type {Prisma,PrismaClient} from '@prisma/client';
import type {Inquiry,InquiryDb,InquiryTx,Site} from './website-inquiry';
import {CS_INQUIRY_MAILBOX} from './website-inquiry';
import type {InquiryMailStore} from './website-inquiry-mail';
type Client=Pick<PrismaClient,'$transaction'|'$queryRaw'|'user'>;
async function active(tx:Pick<Prisma.TransactionClient,'user'>,id:string){const user=await tx.user.findUnique({where:{id},select:{accountDisabled:true}});return !!user&&!user.accountDisabled;}
export function createInquiryDb(client:Client):InquiryDb{
 return {
  activeUser:id=>active(client,id),
  async readVisible(actor,owner,id){
   const rows=await client.$queryRaw<{record:Inquiry}[]>`SELECT record FROM public.website_inquiries WHERE (${owner} OR (source_site<>'esg' AND assigned_to=${actor})) AND (${id??null}::uuid IS NULL OR id=${id??null}::uuid) ORDER BY received_at DESC LIMIT 100`;
   return rows.map(row=>row.record);
  },
  transaction:fn=>client.$transaction(async tx=>{
   // Pilot intake serialization plus a unique constraint makes concurrent/retried requests converge.
   // Prisma raw results cannot deserialize PostgreSQL void. Preserve the same
   // transaction lock, but expose its return value as a supported scalar.
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(724804, 1)::text AS lock_result`;
   const adapter:InquiryTx={
    async find(site:Site,key:string){const rows=await tx.$queryRaw<{record:Inquiry}[]>`SELECT record FROM public.website_inquiries WHERE source_site=${site} AND request_id=${key}::uuid`;return rows[0]?.record??null;},
    activeUser:id=>active(tx,id),
    async insert(row){await tx.$executeRaw`INSERT INTO public.website_inquiries (id,source_site,request_id,payload_hash,assigned_to,received_at,retention_until,record) VALUES (${row.id}::uuid,${row.source_site},${row.request_id}::uuid,${row.hash},${row.assignedTo},${new Date(row.receivedAt)},${new Date(row.retentionUntil)},${JSON.stringify(row)}::jsonb)`;},
    async notify(id,userId,inquiryId){await tx.notification.create({data:{id,userId,type:'NOTICE_POSTED',message:'새 홈페이지 문의가 접수되었습니다. 담당자 확인이 필요합니다.',link:`/website-inquiries?id=${inquiryId}`,relatedType:'SYSTEM',relatedId:inquiryId}});},
   };
   return fn(adapter);
  }),
 };
}

/** Shared per-site limit after authentication. Site BFF must also limit anonymous/IP traffic.
 * One row per site; no IP/contact data and no unbounded time-window rows. */
export async function allowInquirySite(client:Client,site:Site,maxPerMinute=60){
 if(!Number.isInteger(maxPerMinute)||maxPerMinute<1||maxPerMinute>1000)throw new Error('Invalid rate limit');
 return client.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{hits:number}[]>`INSERT INTO public.website_inquiry_rate_limits(source_site,window_start,hits) VALUES (${site},date_trunc('minute',clock_timestamp()),1)
   ON CONFLICT(source_site,bucket_key) DO UPDATE SET
    hits=CASE WHEN website_inquiry_rate_limits.window_start=date_trunc('minute',clock_timestamp()) THEN LEAST(website_inquiry_rate_limits.hits+1,1001) ELSE 1 END,
    window_start=date_trunc('minute',clock_timestamp()) RETURNING hits`;
  return rows[0].hits<=maxPerMinute;
 });
}

export function createInquiryMailStore(client:Client):InquiryMailStore {
 return {
  claim:(id,attempt)=>client.$transaction(async tx=>{
   const rows=await tx.$queryRaw<{record:Inquiry}[]>`SELECT record FROM public.website_inquiries WHERE id=${id}::uuid FOR UPDATE`;
   const row=rows[0]?.record;
   if(!row||row.consultation_type!=='customer_service'||row.email?.recipient!==CS_INQUIRY_MAILBOX||row.email.status!=='queued')return null;
   row.email={...row.email,status:'sending',attemptId:attempt};
   await tx.$executeRaw`UPDATE public.website_inquiries SET record=${JSON.stringify(row)}::jsonb WHERE id=${id}::uuid`;
   return row;
  }),
  finish:(id,attempt,status)=>client.$transaction(async tx=>{
   await tx.$executeRaw`UPDATE public.website_inquiries SET record=jsonb_set(record,'{email,status}',${JSON.stringify(status)}::jsonb) WHERE id=${id}::uuid AND record->'email'->>'attemptId'=${attempt} AND record->'email'->>'status'='sending'`;
  }),
 };
}
