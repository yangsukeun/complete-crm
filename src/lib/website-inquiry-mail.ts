import {randomUUID} from 'node:crypto';
import {CS_INQUIRY_MAILBOX,type Inquiry} from './website-inquiry';
export interface InquiryMailStore {
 // Atomically change queued -> sending, bind attempt. Never reclaim sending/uncertain automatically.
 claim(id:string,attempt:string):Promise<Inquiry|null>;
 finish(id:string,attempt:string,status:'accepted'|'uncertain'):Promise<void>;
}
export interface InquiryMailTransport {
 // Existing approved sender only. Provider acceptance is not delivery/read confirmation.
 send(input:{to:string;subject:string;text:string;idempotencyKey:string}):Promise<{accepted:boolean}>;
}
export async function deliverCsInquiry(id:string,store:InquiryMailStore,transport:InquiryMailTransport|null){
 if(!transport)return {status:'not_configured' as const,received:false,read:false};
 const attempt=randomUUID(),row=await store.claim(id,attempt);
 if(!row)return {status:'not_claimed' as const,received:false,read:false};
 if(row.consultation_type!=='customer_service'||(row.selected_services&&row.selected_services.some(s=>s!=='customer_service'))||row.email?.recipient!==CS_INQUIRY_MAILBOX||row.email.status!=='sending'||row.email.attemptId!==attempt){await store.finish(id,attempt,'uncertain');throw Error('CS mail scope mismatch');}
 const text=`접수번호: ${row.id}\n회신 연락처: ${row.contact.name}\n전화: ${row.contact.phone}\n이메일: ${row.contact.email}\n\n문의 내용:\n${row.original_message}`;
 try{
  const result=await transport.send({to:CS_INQUIRY_MAILBOX,subject:`[CRM CS 문의] ${row.id}`,text,idempotencyKey:`cs-inquiry:${row.id}`});
  const status=result.accepted?'accepted':'uncertain';await store.finish(id,attempt,status);
  return {status,received:false,read:false};
 }catch{
  // Network loss or provider acceptance followed by DB failure must not create a second email.
  await store.finish(id,attempt,'uncertain');return {status:'uncertain' as const,received:false,read:false};
 }
}
