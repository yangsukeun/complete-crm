import {validInquiryKey,validPreviousInquiryKey,validNextInquiryKey,type PreviousInquiryKey,type NextInquiryKey} from './website-inquiry-key-policy';
export const CORPORATE_CONSENT_VERSION='corporate-inquiry-v1-20261028';
// Local deployment candidate only; changing this constant does not enable intake.
// Exact apex origin. www/preview hosts are not implicitly trusted.
export const APPROVED_CORPORATE_ORIGIN='https://bscomplete.com';
/** Contains only a verification digest and timestamps. Never accepts a plaintext bearer. */
export function corporateIntakeConfig(env:Record<string,string|undefined>){
 if(env.CRM_WEBSITE_INTAKE_ENABLED!=='true'||env.CRM_CORPORATE_INQUIRY_ORIGIN!==APPROVED_CORPORATE_ORIGIN)return null;
 const tokenSha256=env.CRM_CORPORATE_INQUIRY_SHA256??'';
 const issuedAt=Date.parse(env.CRM_CORPORATE_INQUIRY_ISSUED_AT??'');
 const expiresAt=Date.parse(env.CRM_CORPORATE_INQUIRY_EXPIRES_AT??'');
 const primary={tokenSha256,issuedAt,expiresAt};
 if(!validInquiryKey(primary))return null;
 const fields=['SHA256','ISSUED_AT','EXPIRES_AT','ACCEPT_UNTIL'].map(suffix=>env[`CRM_CORPORATE_INQUIRY_PREVIOUS_${suffix}`]);
 let previous:PreviousInquiryKey|undefined;
 // Entirely absent supports the deployed single 7-day key. Partial/blank values fail closed.
 if(fields.some(value=>value!==undefined)){
  if(fields.some(value=>!value))return null;
  previous={tokenSha256:fields[0]!,issuedAt:Date.parse(fields[1]!),expiresAt:Date.parse(fields[2]!),acceptUntil:Date.parse(fields[3]!)};
  if(!validPreviousInquiryKey(primary,previous))return null;
 }
 const nextFields=['SHA256','ISSUED_AT','EXPIRES_AT','ACCEPT_UNTIL'].map(suffix=>env[`CRM_CORPORATE_INQUIRY_NEXT_${suffix}`]);
 let next:NextInquiryKey|undefined;
 if(nextFields.some(value=>value!==undefined)){
  if(previous||nextFields.some(value=>!value))return null;
  next={tokenSha256:nextFields[0]!,issuedAt:Date.parse(nextFields[1]!),expiresAt:Date.parse(nextFields[2]!),acceptUntil:Date.parse(nextFields[3]!)};
  if(!validNextInquiryKey(primary,next))return null;
 }
 return {...primary,previous,next,consentVersions:[CORPORATE_CONSENT_VERSION],origin:APPROVED_CORPORATE_ORIGIN};
}
