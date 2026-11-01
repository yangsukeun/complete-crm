import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import {InquiryError,type Site} from './website-inquiry';
export const preflightInput=z.object({day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),subject_hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type PreflightInput=z.infer<typeof preflightInput>;
export function validatePreflight(raw:unknown,now=new Date()){
 const parsed=preflightInput.safeParse(raw);if(!parsed.success||parsed.data.day!==now.toISOString().slice(0,10))throw new InquiryError(422,'INVALID_LIMIT_SUBJECT');return parsed.data;
}
/** Call only in the website BFF. address must come from a verified hosting proxy, not browser JSON/forwarded headers. */
export function privateInquirySubject(address:string,token:string,now=new Date()):PreflightInput{
 if(!isIP(address)||token.length<32)throw new Error('Verified client address and server credential required');
 const day=now.toISOString().slice(0,10);
 const canonical=isIP(address)===6?new URL(`http://[${address}]/`).hostname:address;
 return {day,subject_hash:createHmac('sha256',token).update(JSON.stringify(['corporate-intake-limit-v1',day,canonical])).digest('hex')};
}
export type PreflightLimiter=(site:Site,input:PreflightInput)=>Promise<boolean>;
/** No key issuance; same corporate POST endpoint and existing intake credential. No CRM reads. */
export function createInquiryPreflightClient(config:{token:string;origin:string},send:typeof fetch=fetch){
 return async(address:string)=>{
  const response=await send('https://www.cpcrm.co.kr/api/integrations/website-inquiries/v1',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${config.token}`,Origin:config.origin,'Content-Type':'application/json','X-Inquiry-Operation':'rate-limit'},body:JSON.stringify(privateInquirySubject(address,config.token))});
  if(response.status===429)return false;
  if(response.status!==200||Number(response.headers.get('content-length')??0)>1024)throw new Error('Limiter unavailable');
  const reader=response.body?.getReader();if(!reader)throw new Error('Invalid limiter response');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024)throw new Error('Invalid limiter response');chunks.push(part.value);}}finally{await reader.cancel();}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(data.operation!=='rate-limit'||data.allowed!==true||data.persisted!==false)throw new Error('Invalid limiter receipt');return true;
 };
}
