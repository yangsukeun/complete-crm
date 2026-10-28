import {z} from 'zod';
import type {InternalOcrService} from './ocr-internal-review';
import {OcrBoundaryError} from './logistics-ocr';
import {SalesError} from './logistics-sales';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization','X-Content-Type-Options':'nosniff'};
export type OcrRuntime={service:InternalOcrService;sessionUser:()=>Promise<string|null>;authenticateDevice:(request:Request)=>Promise<{deviceId:string}|null>};
// Intentionally disconnected until reviewed DB, private storage and device authentication are approved.
export async function getInternalOcrRuntime():Promise<OcrRuntime|null>{return (await (await import('./ocr-production-runtime')).getProductionOcrBundle())?.ocr??null;}
async function json(request:Request,limit:number){const reader=request.body?.getReader();if(!reader)throw new OcrBoundaryError(400,'Empty body');let size=0;const chunks:Uint8Array[]=[];try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit)throw new OcrBoundaryError(413,'Body too large');chunks.push(r.value);}}finally{await reader.cancel();}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function failure(e:unknown){return Response.json({error:e instanceof OcrBoundaryError||e instanceof SalesError?e.message:'OCR 요청을 처리할 수 없습니다.'},{status:e instanceof OcrBoundaryError||e instanceof SalesError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:503,headers});}
export async function uploadHttp(request:Request,runtime:OcrRuntime|null){
 if(!runtime)return Response.json({error:'OCR 내부 저장 연결 준비 중',connected:false},{status:503,headers});
 try{if(request.method!=='POST')throw new OcrBoundaryError(405,'Method not allowed');const actor=await runtime.sessionUser();if(!actor)throw new OcrBoundaryError(401,'로그인 필요');if(request.headers.get('origin')!==new URL(request.url).origin)throw new OcrBoundaryError(403,'Invalid origin');
 const {base64,...input}=z.object({companyId:z.string().uuid(),requestKey:z.string().uuid(),kind:z.enum(['statement','box']),mimeType:z.enum(['image/png','image/jpeg']),base64:z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict().parse(await json(request,4*1024*1024+4096));
 const bytes=Buffer.from(base64,'base64');if(bytes.length>3*1024*1024)throw new OcrBoundaryError(413,'Pilot upload limit is 3 MiB');if(bytes.toString('base64')!==base64)throw new OcrBoundaryError(400,'Invalid encoding');
 const d=await runtime.service.upload(actor,input,bytes);return Response.json({id:d.id,revision:d.revision,state:d.state,registrationAuthorized:false},{headers});}catch(e){return failure(e);}
}
export async function workerHttp(request:Request,parts:string[],runtime:OcrRuntime|null){
 if(!runtime)return Response.json({error:'OCR 장치 연결 준비 중',connected:false},{status:503,headers});
 try{const auth=await runtime.authenticateDevice(request);if(!auth)throw new OcrBoundaryError(401,'장치 인증 필요');
 if(parts.length===1&&parts[0]==='claim'&&request.method==='POST'){const c=z.object({deviceId:z.string().uuid()}).strict().parse(await json(request,1024));if(c.deviceId!==auth.deviceId)throw new OcrBoundaryError(403,'장치 불일치');const lease=await runtime.service.claim(auth.deviceId);return lease?Response.json(lease,{headers}):new Response(null,{status:204,headers});}
 if(parts.length!==3||parts[0]!=='jobs')throw new OcrBoundaryError(404,'Not found');
 const job=z.string().uuid().parse(parts[1]),lease=z.string().uuid().parse(request.headers.get('X-OCR-Lease'));const revision=z.coerce.number().int().positive().parse(request.headers.get('X-OCR-Revision'));
 if(parts[2]==='lease'&&request.method==='GET')return Response.json(await runtime.service.current(auth.deviceId,job,lease,revision),{headers});
 if(parts[2]==='image'&&request.method==='GET'){const file=await runtime.service.image(auth.deviceId,job,lease,revision);return new Response(new Uint8Array(file.bytes),{headers:{...headers,'Content-Type':file.mimeType,'Content-Disposition':'inline'}});}
 if(parts[2]==='result'&&request.method==='POST')return Response.json(await runtime.service.result(auth.deviceId,job,lease,revision,await json(request,530*1024)),{headers});
 throw new OcrBoundaryError(405,'Method not allowed');}catch(e){return failure(e);}
}
export async function reviewHttp(request:Request,id:string,action:'read'|'original'|'review'|'cancel'|'retry',runtime:OcrRuntime|null){
 if(!runtime)return Response.json({error:'OCR 내부 저장 연결 준비 중',connected:false},{status:503,headers});
 try{const actor=await runtime.sessionUser();if(!actor)throw new OcrBoundaryError(401,'로그인 필요');z.string().uuid().parse(id);
 if(request.method==='GET'&&action==='read')return Response.json(await runtime.service.read(actor,id),{headers});
 if(request.method==='GET'&&action==='original'){const file=await runtime.service.original(actor,id);return new Response(new Uint8Array(file.bytes),{headers:{...headers,'Content-Type':file.mimeType}});}
 if(request.method!=='POST')throw new OcrBoundaryError(405,'Method not allowed');if(request.headers.get('origin')!==new URL(request.url).origin)throw new OcrBoundaryError(403,'Invalid origin');
 const input=await json(request,64*1024);
 if(action==='review')return Response.json(await runtime.service.review(actor,id,input),{headers});
 if(action==='cancel'||action==='retry'){const c=z.object({revision:z.number().int().positive(),requestKey:z.string().uuid()}).strict().parse(input);return Response.json(await runtime.service[action](actor,id,c.revision,c.requestKey),{headers});}
 throw new OcrBoundaryError(405,'Method not allowed');}catch(e){return failure(e);}
}
