import {it,expect,vi} from 'vitest';
import type {PrismaClient} from '@prisma/client';
import {inquiryExpiryNotice,sendInquiryExpiryNotice} from '../src/lib/website-inquiry-expiry';
import {inquiryExpiryStore} from '../src/lib/website-inquiry-expiry-pg';
import {INQUIRY_OWNER} from '../src/lib/website-inquiry';
const day=86400000;const key={issuedAt:0,expiresAt:90*day};
it('uses 14/7/1 day and expired thresholds without catch-up spam or key data',()=>{
 expect(inquiryExpiryNotice(key,75*day)).toBeNull();
 for(const days of [14,7,1,0]){const n=inquiryExpiryNotice(key,key.expiresAt-days*day)!;expect(n.kind).toBe(`WEBSITE_INTAKE_EXPIRY_D${days}`);expect(n.userId).toBe(INQUIRY_OWNER);}
 expect(inquiryExpiryNotice(key,key.expiresAt-2*day)?.kind).toBe('WEBSITE_INTAKE_EXPIRY_D7');
 expect(inquiryExpiryNotice(key,-1)).toBeNull();
 expect(inquiryExpiryNotice(key,89*day)?.id).not.toBe(inquiryExpiryNotice({...key,issuedAt:day,expiresAt:91*day},90*day)?.id);
});
function fixture(){
 const receipts=new Set<string>();const notices:string[]=[];let fail=false;let disabled=false;
 let queue=Promise.resolve();
 const client={$transaction:async<T>(fn:(tx:unknown)=>Promise<T>)=>{
  const prev=queue;let release!:()=>void;queue=new Promise<void>(r=>{release=r;});await prev;
  const before=new Set(receipts);
  try{return await fn({user:{findUnique:async()=>({accountDisabled:disabled})},notificationLog:{createMany:async({data}:{data:{id:string}[]})=>{const id=data[0].id;if(receipts.has(id))return {count:0};receipts.add(id);return {count:1};}},notification:{create:async({data}:{data:{id:string}})=>{if(fail)throw Error('synthetic');notices.push(data.id);}}});}
  catch(e){receipts.clear();for(const id of before)receipts.add(id);throw e;}finally{release();}
 }} as unknown as PrismaClient;
 return {store:inquiryExpiryStore(client),notices,fail:(value:boolean)=>{fail=value;},disable:()=>{disabled=true;}};
}
it('concurrent/repeated runs and dismissed notifications retain one durable receipt',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:8},()=>sendInquiryExpiryNotice(key,f.store,89*day)));
 expect(results.filter(v=>v==='created')).toHaveLength(1);expect(f.notices).toHaveLength(1);
 f.notices.length=0;expect(await sendInquiryExpiryNotice(key,f.store,89*day)).toBe('duplicate');expect(f.notices).toHaveLength(0);
});
it('failed notification rolls back receipt; retry succeeds, inactive owner never receives it',async()=>{
 const f=fixture();f.fail(true);await expect(sendInquiryExpiryNotice(key,f.store,89*day)).rejects.toThrow();
 f.fail(false);expect(await sendInquiryExpiryNotice(key,f.store,89*day)).toBe('created');
 const g=fixture();g.disable();expect(await sendInquiryExpiryNotice(key,g.store,89*day)).toBe('owner_unavailable');expect(g.notices).toHaveLength(0);
});
it('does no writes while not due',async()=>{const store={persistOnce:vi.fn()};expect(await sendInquiryExpiryNotice(key,store,70*day)).toBe('not_due');expect(store.persistOnce).not.toHaveBeenCalled();});
