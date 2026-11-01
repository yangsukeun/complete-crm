import {it,expect} from 'vitest';
import {privateInquirySubject,validatePreflight,createInquiryPreflightClient} from '../src/lib/website-inquiry-preflight';
import {inquiryPost,type InquiryRuntime} from '../src/lib/website-inquiry-http';
const token='synthetic-corporate-server-token-only';
it('daily keyed digest canonicalizes IP without preserving raw IP or allowing arbitrary identifiers',()=>{
 const now=new Date('2026-10-28T12:00:00Z');const a=privateInquirySubject('2001:db8::1',token,now);
 expect(a).toEqual(privateInquirySubject('2001:0db8:0:0:0:0:0:1',token,now));expect(JSON.stringify(a)).not.toContain('2001');
 expect(a.subject_hash).not.toBe(privateInquirySubject('2001:db8::1',token,new Date('2026-10-29')).subject_hash);
 expect(()=>privateInquirySubject('forged-header',token)).toThrow();expect(()=>validatePreflight({...a,ip:'192.0.2.1'},now)).toThrow();expect(()=>validatePreflight(a,new Date('2026-10-29'))).toThrow();
});
it('website BFF client reaches authenticated same POST limiter without storing inquiry or notifying',async()=>{
 let calls=0;const runtime={service:{submit:()=>{throw Error('must not store')}},authenticateSite:async(req:Request)=>req.headers.get('authorization')===`Bearer ${token}`?{site:'corporate',consentVersions:[]}:null,allowRequest:async()=>{throw Error('intake limiter should be separate')},limitSubject:async()=>++calls<=5} as unknown as InquiryRuntime;
 const client=createInquiryPreflightClient({token,origin:'https://approved.invalid'},async(url,options)=>{expect(options?.redirect).toBe('error');expect(String(options?.body)).not.toContain('192.0.2.1');return inquiryPost(new Request(url,options),runtime);});
 expect(await Promise.all(Array.from({length:8},()=>client('192.0.2.1')))).toEqual([true,true,true,true,true,false,false,false]);
});
it('unauthenticated and unavailable requests fail closed, never return a saved receipt',async()=>{
 const request=()=>new Request('https://www.cpcrm.co.kr/api/integrations/website-inquiries/v1',{method:'POST',headers:{'content-type':'application/json','X-Inquiry-Operation':'rate-limit'},body:JSON.stringify(privateInquirySubject('192.0.2.1',token))});
 expect((await inquiryPost(request(),null)).status).toBe(503);
 expect((await inquiryPost(request(),{authenticateSite:async()=>null} as unknown as InquiryRuntime)).status).toBe(401);
 const client=createInquiryPreflightClient({token,origin:'https://approved.invalid'},async()=>Response.json({persisted:true},{status:200}));await expect(client('192.0.2.1')).rejects.toThrow();
});
it('rejects saved-looking or oversized limiter receipts even without Content-Length',async()=>{
 for(const body of [{operation:'rate-limit',allowed:true,persisted:true},{operation:'rate-limit',allowed:true},{operation:'rate-limit',allowed:true,persisted:false,padding:'x'.repeat(1024)}]){
  const client=createInquiryPreflightClient({token,origin:'https://bscomplete.com'},async()=>Response.json(body));
  await expect(client('192.0.2.1')).rejects.toThrow();
 }
});
