import {it,expect} from 'vitest';
import {corporateIntakeConfig,APPROVED_CORPORATE_ORIGIN} from '../src/lib/website-inquiry-config';
it('requires deliberate activation and exact origin while retaining existing seven-day configuration',()=>{
 const env={CRM_WEBSITE_INTAKE_ENABLED:'true',CRM_CORPORATE_INQUIRY_ORIGIN:APPROVED_CORPORATE_ORIGIN,CRM_CORPORATE_INQUIRY_SHA256:'a'.repeat(64),CRM_CORPORATE_INQUIRY_ISSUED_AT:'2026-10-28T00:00:00Z',CRM_CORPORATE_INQUIRY_EXPIRES_AT:'2026-11-04T00:00:00Z'};
 expect(corporateIntakeConfig(env)).not.toBeNull();expect(corporateIntakeConfig({})).toBeNull();
 expect(APPROVED_CORPORATE_ORIGIN).toBe('https://bscomplete.com');
 for(const origin of ['https://www.bscomplete.com','http://bscomplete.com','https://bscomplete.com/','https://bscomplete.com.evil.invalid','https://complete-renewal-review-p9ialwoyh-completes-projects-652c4a87.vercel.app'])expect(corporateIntakeConfig({...env,CRM_CORPORATE_INQUIRY_ORIGIN:origin})).toBeNull();
 for(const patch of [{CRM_WEBSITE_INTAKE_ENABLED:'false'},{CRM_CORPORATE_INQUIRY_ORIGIN:'https://other.invalid'},{CRM_CORPORATE_INQUIRY_SHA256:'plaintext-synthetic'},{CRM_CORPORATE_INQUIRY_EXPIRES_AT:'2027-02-05T00:00:00Z'},{CRM_CORPORATE_INQUIRY_ISSUED_AT:'invalid'}])expect(corporateIntakeConfig({...env,...patch})).toBeNull();
});
