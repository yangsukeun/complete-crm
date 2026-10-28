export const CORPORATE_CONSENT_VERSION='corporate-inquiry-v1-20261028';
export const APPROVED_CORPORATE_ORIGIN='https://complete-renewal-review-p9ialwoyh-completes-projects-652c4a87.vercel.app';
/** Contains only a verification digest and timestamps. Never accepts a plaintext bearer. */
export function corporateIntakeConfig(env:Record<string,string|undefined>){
 if(env.CRM_WEBSITE_INTAKE_ENABLED!=='true'||env.CRM_CORPORATE_INQUIRY_ORIGIN!==APPROVED_CORPORATE_ORIGIN)return null;
 const tokenSha256=env.CRM_CORPORATE_INQUIRY_SHA256??'';
 const issuedAt=Date.parse(env.CRM_CORPORATE_INQUIRY_ISSUED_AT??'');
 const expiresAt=Date.parse(env.CRM_CORPORATE_INQUIRY_EXPIRES_AT??'');
 if(!/^[a-f0-9]{64}$/.test(tokenSha256)||!Number.isFinite(issuedAt)||!Number.isFinite(expiresAt)||expiresAt<=issuedAt||expiresAt-issuedAt>7*86400000)return null;
 return {tokenSha256,issuedAt,expiresAt,consentVersions:[CORPORATE_CONSENT_VERSION],origin:APPROVED_CORPORATE_ORIGIN};
}
