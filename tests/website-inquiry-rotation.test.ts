import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {corporateIntakeConfig} from '../src/lib/website-inquiry-config';
import {corporateInquiryAuthenticator} from '../src/lib/website-inquiry-auth';
const day=86400000;
const start=Date.parse('2026-11-01T06:00:00Z');
const secretA='synthetic-old-key-not-a-live-credential';
const secretB='synthetic-new-key-not-a-live-credential';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const config={tokenSha256:digest(secretB),issuedAt:start,expiresAt:start+90*day,consentVersions:['TEST'],previous:{tokenSha256:digest(secretA),issuedAt:start-day,expiresAt:start+6*day,acceptUntil:start+3600000}};
const request=(secret:string)=>new Request('https://crm.invalid/api/integrations/website-inquiries/v1',{method:'POST',headers:{authorization:`Bearer ${secret}`}});
it('accepts both during overlap, only new after cutoff, and neither when expired',async()=>{
 const during=corporateInquiryAuthenticator(config,()=>start+1);
 expect(await during(request(secretA))).not.toBeNull();expect(await during(request(secretB))).not.toBeNull();
 const after=corporateInquiryAuthenticator(config,()=>config.previous.acceptUntil);
 expect(await after(request(secretA))).toBeNull();expect(await after(request(secretB))).not.toBeNull();
 expect(await corporateInquiryAuthenticator(config,()=>config.expiresAt)(request(secretB))).toBeNull();
 expect(await corporateInquiryAuthenticator(config,()=>start-1)(request(secretA))).toBeNull();
});
it('removing previous key revokes old without affecting new; seven-day primary stays valid',async()=>{
 const auth=corporateInquiryAuthenticator({...config,previous:undefined},()=>start+1);
 expect(await auth(request(secretA))).toBeNull();expect(await auth(request(secretB))).not.toBeNull();
 expect(await corporateInquiryAuthenticator({...config,previous:undefined,expiresAt:start+7*day},()=>start+1)(request(secretB))).not.toBeNull();
});
it('fails closed for excessive overlap, duplicate keys, future previous issue or invalid expiry',()=>{
 for(const patch of [{acceptUntil:start+day+1},{tokenSha256:config.tokenSha256},{issuedAt:start+1},{expiresAt:start},{acceptUntil:NaN}])expect(()=>corporateInquiryAuthenticator({...config,previous:{...config.previous,...patch}})).toThrow();
 expect(()=>corporateInquiryAuthenticator({...config,expiresAt:start+90*day+1})).toThrow();
});
it('parses complete optional previous config and rejects partial/blank configurations',()=>{
 const env={CRM_WEBSITE_INTAKE_ENABLED:'true',CRM_CORPORATE_INQUIRY_ORIGIN:'https://bscomplete.com',CRM_CORPORATE_INQUIRY_SHA256:config.tokenSha256,CRM_CORPORATE_INQUIRY_ISSUED_AT:new Date(start).toISOString(),CRM_CORPORATE_INQUIRY_EXPIRES_AT:new Date(config.expiresAt).toISOString()};
 expect(corporateIntakeConfig(env)).not.toBeNull();
 expect(corporateIntakeConfig({...env,CRM_CORPORATE_INQUIRY_PREVIOUS_SHA256:config.previous.tokenSha256})).toBeNull();
 expect(corporateIntakeConfig({...env,CRM_CORPORATE_INQUIRY_PREVIOUS_SHA256:''})).toBeNull();
 const prior={CRM_CORPORATE_INQUIRY_PREVIOUS_SHA256:config.previous.tokenSha256,CRM_CORPORATE_INQUIRY_PREVIOUS_ISSUED_AT:new Date(config.previous.issuedAt).toISOString(),CRM_CORPORATE_INQUIRY_PREVIOUS_EXPIRES_AT:new Date(config.previous.expiresAt).toISOString(),CRM_CORPORATE_INQUIRY_PREVIOUS_ACCEPT_UNTIL:new Date(config.previous.acceptUntil).toISOString()};
 expect(corporateIntakeConfig({...env,...prior})?.previous).toEqual(config.previous);
});
