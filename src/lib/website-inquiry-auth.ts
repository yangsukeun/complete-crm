import {createHash,timingSafeEqual} from 'node:crypto';
import type {SiteIdentity} from './website-inquiry';
import {validInquiryKey,validPreviousInquiryKey,type InquiryKey,type PreviousInquiryKey} from './website-inquiry-key-policy';
/** Inject approved configuration; this module never issues, stores or logs credentials.
 * Up to 90 days; at most one previous key with a 24-hour bounded overlap. */
export function corporateInquiryAuthenticator(config:InquiryKey & {previous?:PreviousInquiryKey;consentVersions:readonly string[]},now:()=>number=Date.now){
 if(!validInquiryKey(config)||(config.previous&&!validPreviousInquiryKey(config,config.previous)))throw new Error('Invalid corporate intake configuration');
 const keys=[{...config,acceptUntil:config.expiresAt},...(config.previous?[config.previous]:[])];
 return async(request:Request):Promise<SiteIdentity|null>=>{
  const time=now();if(request.method!=='POST'||new URL(request.url).pathname!=='/api/integrations/website-inquiries/v1')return null;
  const header=request.headers.get('authorization');
  if(!header?.startsWith('Bearer '))return null;
  const token=header.slice(7);if(token.length<32||token.length>256||/\s/.test(token))return null;
  const actual=createHash('sha256').update(token).digest();
  let accepted=false;
  for(const key of keys){const matches=timingSafeEqual(Buffer.from(key.tokenSha256,'hex'),actual);accepted=(matches&&time>=key.issuedAt&&time>=config.issuedAt&&time<key.expiresAt&&time<key.acceptUntil)||accepted;}
  return accepted?{site:'corporate',consentVersions:config.consentVersions}:null;
 };
}
