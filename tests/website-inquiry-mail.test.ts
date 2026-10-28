import {it,expect,vi} from 'vitest';
import {deliverCsInquiry,type InquiryMailStore} from '../src/lib/website-inquiry-mail';
import {CS_INQUIRY_MAILBOX,type Inquiry} from '../src/lib/website-inquiry';
function setup(type='customer_service'){
 const row={id:'11111111-1111-4111-8111-111111111111',consultation_type:type,contact:{name:'합성',phone:'01000000000',email:'qa@example.invalid',company:'not needed'},original_message:'합성 CS 문의',email:{recipient:CS_INQUIRY_MAILBOX,status:'queued'}} as Inquiry;
 const store:InquiryMailStore={claim:async(_id,attempt)=>{if(row.email!.status!=='queued')return null;row.email!.status='sending';row.email!.attemptId=attempt;return row;},finish:async(_id,attempt,status)=>{if(row.email!.attemptId===attempt)row.email!.status=status;}};
 return {row,store};
}
it('sends only minimal CS inquiry to fixed mailbox once; accepted is not received/read',async()=>{const f=setup(),send=vi.fn(async(_input:unknown)=>{void _input;return {accepted:true};});const r=await deliverCsInquiry(f.row.id,f.store,{send});expect(r).toEqual({status:'accepted',received:false,read:false});expect(send.mock.calls[0][0]).toMatchObject({to:CS_INQUIRY_MAILBOX,idempotencyKey:`cs-inquiry:${f.row.id}`});expect(JSON.stringify(send.mock.calls)).not.toContain('not needed');await deliverCsInquiry(f.row.id,f.store,{send});expect(send).toHaveBeenCalledTimes(1);});
it('blocks other service and remains disabled without approved sender',async()=>{const f=setup('marketing'),send=vi.fn(async()=>({accepted:true}));await expect(deliverCsInquiry(f.row.id,f.store,{send})).rejects.toThrow();expect(send).not.toHaveBeenCalled();const g=setup();expect((await deliverCsInquiry(g.row.id,g.store,null)).status).toBe('not_configured');expect(g.row.email!.status).toBe('queued');});
it('lost response remains uncertain and cannot be automatically retried',async()=>{const f=setup(),send=vi.fn(async()=>{throw Error('lost response');});expect((await deliverCsInquiry(f.row.id,f.store,{send})).status).toBe('uncertain');await deliverCsInquiry(f.row.id,f.store,{send});expect(send).toHaveBeenCalledTimes(1);});
