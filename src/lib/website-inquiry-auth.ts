import {createHash,timingSafeEqual} from 'node:crypto';
import type {SiteIdentity} from './website-inquiry';
/** Inject approved configuration; this module never issues, stores or logs credentials.
 * Pilot credential is corporate intake-only, expires within seven days, and grants no GET access. */
export function corporateInquiryAuthenticator(config:{tokenSha256:string;issuedAt:number;expiresAt:number;consentVersions:readonly string[]},now:()=>number=Date.now){
 if(!/^[a-f0-9]{64}$/.test(config.tokenSha256)||!Number.isFinite(config.issuedAt)||!Number.isFinite(config.expiresAt)||config.expiresAt<=config.issuedAt||config.expiresAt-config.issuedAt>7*86400000)throw new Error('Invalid corporate intake configuration');
 const expected=Buffer.from(config.tokenSha256,'hex');
 return async(request:Request):Promise<SiteIdentity|null>=>{
  const time=now();if(time<config.issuedAt||time>=config.expiresAt||request.method!=='POST'||new URL(request.url).pathname!=='/api/integrations/website-inquiries/v1')return null;
  const header=request.headers.get('authorization');
  if(!header?.startsWith('Bearer '))return null;
  const token=header.slice(7);if(token.length<32||token.length>256||/\s/.test(token))return null;
  const actual=createHash('sha256').update(token).digest();
  return timingSafeEqual(expected,actual)?{site:'corporate',consentVersions:config.consentVersions}:null;
 };
}
