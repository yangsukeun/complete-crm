import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {corporateInquiryAuthenticator} from '../src/lib/website-inquiry-auth';
it('limits synthetic credential to corporate POST, expiry and exact route; ignores cookie/origin',async()=>{
 const token='synthetic-test-only-not-a-real-credential';const config={tokenSha256:createHash('sha256').update(token).digest('hex'),issuedAt:1000,expiresAt:2000,consentVersions:['TEST-v1']};
 const auth=corporateInquiryAuthenticator(config,()=>1500);
 const req=(method='POST',path='/api/integrations/website-inquiries/v1',value=token)=>new Request('https://crm.invalid'+path,{method,headers:{authorization:'Bearer '+value}});
 expect(await auth(req())).toEqual({site:'corporate',consentVersions:['TEST-v1']});
 expect(await auth(req('GET'))).toBeNull();expect(await auth(req('POST','/api/website-inquiries'))).toBeNull();expect(await auth(req('POST',undefined,token+'x'))).toBeNull();
 expect(await auth(new Request('https://crm.invalid/api/integrations/website-inquiries/v1',{method:'POST',headers:{cookie:'synthetic-session',origin:'https://trusted.invalid'}}))).toBeNull();
 expect(await corporateInquiryAuthenticator(config,()=>2000)(req())).toBeNull();
 expect(()=>corporateInquiryAuthenticator({...config,expiresAt:config.issuedAt+8*86400000})).toThrow();
});
