import {InquiryError,type SiteIdentity,type WebsiteInquiryService} from './website-inquiry';
import {validatePreflight,type PreflightLimiter} from './website-inquiry-preflight';
export type InquiryRuntime={service:WebsiteInquiryService;authenticateSite:(request:Request)=>Promise<SiteIdentity|null>;allowRequest:(request:Request,identity:SiteIdentity)=>Promise<boolean>;limitSubject?:PreflightLimiter};
// Must wire a verified site credential, shared rate limiter and approved database before activation.
export async function getInquiryRuntime():Promise<InquiryRuntime|null>{return (await import('./website-inquiry-runtime')).productionInquiryRuntime();}
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function inquiryPost(request:Request,runtime:InquiryRuntime|null){
 if(!runtime)return Response.json({code:'INTAKE_NOT_CONFIGURED',persisted:false},{status:503,headers});
 try{
  const identity=await runtime.authenticateSite(request);if(!identity)throw new InquiryError(401,'SITE_AUTH_REQUIRED');
  const operation=request.headers.get('X-Inquiry-Operation');
  if(operation&&operation!=='rate-limit')throw new InquiryError(422,'INVALID_OPERATION');
  if(!operation&&!await runtime.allowRequest(request,identity))throw new InquiryError(429,'RATE_LIMITED');
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new InquiryError(400,'JSON_REQUIRED');
  const reader=request.body?.getReader();if(!reader)throw new InquiryError(400,'BODY_REQUIRED');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384)throw new InquiryError(413,'BODY_TOO_LARGE');chunks.push(next.value);}}finally{await reader.cancel();}
  const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(operation==='rate-limit'){
   if(!runtime.limitSubject)throw new InquiryError(503,'LIMITER_NOT_CONFIGURED');
   if(!await runtime.limitSubject(identity.site,validatePreflight(raw)))throw new InquiryError(429,'RATE_LIMITED');
   return Response.json({operation:'rate-limit',allowed:true,persisted:false},{headers});
  }
  const result=await runtime.service.submit(identity,request.headers.get('Idempotency-Key'),raw);
  return Response.json(result,{status:result.duplicate?200:201,headers});
 }catch(error){const status=error instanceof InquiryError?error.status:error instanceof SyntaxError?400:503;
  // A transport/commit error can occur after persistence. Never call it definitely
  // unsaved; retry the same request_id/payload rather than generating another key.
  const uncertain=!(error instanceof InquiryError)&&!(error instanceof SyntaxError);
  return Response.json({code:error instanceof InquiryError?error.code:status===400?'INVALID_JSON':'STORAGE_UNAVAILABLE',persisted:uncertain?null:false,outcome:uncertain?'unknown':'rejected'},{status,headers:{...headers,...(status===429?{'Retry-After':'60'}:{})}});}
}
