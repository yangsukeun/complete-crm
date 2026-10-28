import {it,expect} from 'vitest';
import {corporateIntakeConfig,APPROVED_CORPORATE_ORIGIN} from '../src/lib/website-inquiry-config';
it('requires deliberate activation, exact deployed origin, digest and at most seven days',()=>{
 const env={CRM_WEBSITE_INTAKE_ENABLED:'true',CRM_CORPORATE_INQUIRY_ORIGIN:APPROVED_CORPORATE_ORIGIN,CRM_CORPORATE_INQUIRY_SHA256:'a'.repeat(64),CRM_CORPORATE_INQUIRY_ISSUED_AT:'2026-10-28T00:00:00Z',CRM_CORPORATE_INQUIRY_EXPIRES_AT:'2026-11-04T00:00:00Z'};
 expect(corporateIntakeConfig(env)).not.toBeNull();expect(corporateIntakeConfig({})).toBeNull();
 for(const patch of [{CRM_WEBSITE_INTAKE_ENABLED:'false'},{CRM_CORPORATE_INQUIRY_ORIGIN:'https://other.invalid'},{CRM_CORPORATE_INQUIRY_SHA256:'plaintext-synthetic'},{CRM_CORPORATE_INQUIRY_EXPIRES_AT:'2026-11-05T00:00:00Z'},{CRM_CORPORATE_INQUIRY_ISSUED_AT:'invalid'}])expect(corporateIntakeConfig({...env,...patch})).toBeNull();
});
