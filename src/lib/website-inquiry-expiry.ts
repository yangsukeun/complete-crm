import {createHash} from 'node:crypto';
import type {InquiryKey} from './website-inquiry-key-policy';
import {INQUIRY_OWNER} from './website-inquiry';
export type ExpiryNotice={id:string;userId:string;kind:string;message:string};
export function inquiryExpiryNotice(key:Pick<InquiryKey,'issuedAt'|'expiresAt'>,now=Date.now()):ExpiryNotice|null{
 if(now<key.issuedAt)return null;
 const remaining=key.expiresAt-now;
 const stage=remaining<=0?0:remaining<=86400000?1:remaining<=7*86400000?7:remaining<=14*86400000?14:null;
 if(stage===null)return null;
 // Dates and stage only: never expose the credential or its verification digest.
 const id='inquiry-expiry-'+createHash('sha256').update(`${key.issuedAt}:${key.expiresAt}:${stage}`).digest('hex');
 const when=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(key.expiresAt));
 return {id,userId:INQUIRY_OWNER,kind:`WEBSITE_INTAKE_EXPIRY_D${stage}`,message:stage===0?`홈페이지 문의 접수 인증이 만료되었습니다 (${when} KST). 서버 키 교체와 접수 확인이 필요합니다.`:`홈페이지 문의 접수 인증 만료까지 ${stage}일 이하입니다 (${when} KST). 만료 전에 서버 키를 교체해 주세요. 자동 갱신되지 않습니다.`};
}
export interface ExpiryNoticeStore{persistOnce(notice:ExpiryNotice):Promise<'created'|'duplicate'|'owner_unavailable'>}
export async function sendInquiryExpiryNotice(key:Pick<InquiryKey,'issuedAt'|'expiresAt'>,store:ExpiryNoticeStore,now=Date.now()){
 const notice=inquiryExpiryNotice(key,now);
 return notice?store.persistOnce(notice):'not_due';
}
