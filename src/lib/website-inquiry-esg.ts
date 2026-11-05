import {createHash,timingSafeEqual} from 'node:crypto';
import {INQUIRY_KEY_MAX_AGE_MS,validInquiryKey} from './website-inquiry-key-policy';
import type {SiteIdentity} from './website-inquiry';
export const ESG_ORIGIN='https://complete-esg-pilot.yangsukeun.chatgpt.site';
export const ESG_CONSENT_VERSION='esg-inquiry-v1-20261105';
export function esgIntakeConfig(env:Record<string,string|undefined>){
 if(env.CRM_ESG_INQUIRY_ENABLED!=='true'||env.CRM_ESG_INQUIRY_ORIGIN!==ESG_ORIGIN)return null;
 const key={tokenSha256:env.CRM_ESG_INQUIRY_SHA256??'',issuedAt:Date.parse(env.CRM_ESG_INQUIRY_ISSUED_AT??''),expiresAt:Date.parse(env.CRM_ESG_INQUIRY_EXPIRES_AT??'')};
 if(!validInquiryKey(key)||key.expiresAt-key.issuedAt!==INQUIRY_KEY_MAX_AGE_MS)return null;
 return {...key,origin:ESG_ORIGIN,consentVersions:[ESG_CONSENT_VERSION]};
}
export function esgInquiryAuthenticator(config:NonNullable<ReturnType<typeof esgIntakeConfig>>,now:()=>number=Date.now){
 return async(request:Request):Promise<SiteIdentity|null>=>{
  const url=new URL(request.url),time=now();
  if(request.method!=='POST'||url.protocol!=='https:'||url.pathname!=='/api/integrations/website-inquiries/v1'||request.headers.get('origin')!==config.origin||(request.headers.has('X-Inquiry-Operation')&&request.headers.get('X-Inquiry-Operation')!=='rate-limit')||time<config.issuedAt||time>=config.expiresAt)return null;
  const header=request.headers.get('authorization');if(!header?.startsWith('Bearer '))return null;
  const token=header.slice(7);if(token.length<32||token.length>256||/\s/.test(token))return null;
  return timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(config.tokenSha256,'hex'))?{site:'esg',consentVersions:config.consentVersions}:null;
 };
}
