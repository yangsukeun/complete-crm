import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {corporateIntakeConfig} from '../src/lib/website-inquiry-config';
import {corporateInquiryAuthenticator} from '../src/lib/website-inquiry-auth';
import {inquiryExpiryNotice} from '../src/lib/website-inquiry-expiry';
const day=86400000,start=Date.parse('2026-11-01T06:00:00Z');
const old='synthetic-old-token-for-next-slot-only',fresh='synthetic-new-token-for-next-slot-only';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const primary={tokenSha256:hash(old),issuedAt:start,expiresAt:start+7*day,consentVersions:['TEST']};
const next={tokenSha256:hash(fresh),issuedAt:start+3600000,expiresAt:start+3600000+90*day,acceptUntil:start+7200000};
const req=(s:string)=>new Request('https://crm.invalid/api/integrations/website-inquiries/v1',{method:'POST',headers:{authorization:`Bearer ${s}`}});
it('keeps primary working before NEXT issue, accepts both within overlap, rejects NEXT at cutoff',async()=>{
 for(const [time,a,b] of [[start+1,true,false],[next.issuedAt,true,true],[next.acceptUntil-1,true,true],[next.acceptUntil,true,false]] as const){
  const auth=corporateInquiryAuthenticator({...primary,next},()=>time);
  expect(Boolean(await auth(req(old)))).toBe(a);expect(Boolean(await auth(req(fresh)))).toBe(b);
 }
});
it('promotes the known new digest without reading old digest and revokes old token',async()=>{
 const promoted={tokenSha256:next.tokenSha256,issuedAt:next.issuedAt,expiresAt:next.expiresAt,consentVersions:['TEST']};
 const auth=corporateInquiryAuthenticator(promoted,()=>next.acceptUntil+1);
 expect(await auth(req(old))).toBeNull();expect(await auth(req(fresh))).not.toBeNull();
 expect(await corporateInquiryAuthenticator(promoted,()=>next.expiresAt)(req(fresh))).toBeNull();
});
it('rejects excessive overlap, backdating, duplicates, invalid times and three keys',()=>{
 for(const patch of [{acceptUntil:next.issuedAt+day+1},{issuedAt:start-1},{tokenSha256:primary.tokenSha256},{acceptUntil:next.issuedAt},{expiresAt:next.issuedAt+90*day+1},{acceptUntil:NaN}]){
  expect(()=>corporateInquiryAuthenticator({...primary,next:{...next,...patch}})).toThrow();
 }
 expect(()=>corporateInquiryAuthenticator({...primary,expiresAt:next.acceptUntil-1,next})).toThrow();
 expect(()=>corporateInquiryAuthenticator({...primary,next,previous:next})).toThrow();
});
it('requires all NEXT fields, rejects coexistence including blanks, preserves single-key compatibility',()=>{
 const env={CRM_WEBSITE_INTAKE_ENABLED:'true',CRM_CORPORATE_INQUIRY_ORIGIN:'https://bscomplete.com',CRM_CORPORATE_INQUIRY_SHA256:primary.tokenSha256,CRM_CORPORATE_INQUIRY_ISSUED_AT:new Date(start).toISOString(),CRM_CORPORATE_INQUIRY_EXPIRES_AT:new Date(primary.expiresAt).toISOString()};
 const fields={CRM_CORPORATE_INQUIRY_NEXT_SHA256:next.tokenSha256,CRM_CORPORATE_INQUIRY_NEXT_ISSUED_AT:new Date(next.issuedAt).toISOString(),CRM_CORPORATE_INQUIRY_NEXT_EXPIRES_AT:new Date(next.expiresAt).toISOString(),CRM_CORPORATE_INQUIRY_NEXT_ACCEPT_UNTIL:new Date(next.acceptUntil).toISOString()};
 expect(corporateIntakeConfig(env)).not.toBeNull();expect(corporateIntakeConfig({...env,...fields})?.next).toEqual(next);
 for(const key of Object.keys(fields))expect(corporateIntakeConfig({...env,...fields,[key]:''})).toBeNull();
 expect(corporateIntakeConfig({...env,CRM_CORPORATE_INQUIRY_NEXT_SHA256:next.tokenSha256})).toBeNull();
 expect(corporateIntakeConfig({...env,...fields,CRM_CORPORATE_INQUIRY_PREVIOUS_SHA256:''})).toBeNull();
});
it('keeps expiry alerts on primary until promotion, then uses the new actual dates',()=>{
 expect(inquiryExpiryNotice({...primary,next} as typeof primary,start+1)).toEqual(inquiryExpiryNotice(primary,start+1));
 expect(inquiryExpiryNotice(next,next.issuedAt+1)).toBeNull();
 expect(inquiryExpiryNotice(next,next.expiresAt-day)?.kind).toBe('WEBSITE_INTAKE_EXPIRY_D1');
});
