import {z} from 'zod';
import type {OcrDeviceIssuer} from './ocr-device-issuer';
import {OcrBoundaryError} from './logistics-ocr';
import {pairingInput} from './ocr-device-pairing';
export async function deviceIssuerHttp(request:Request,id:string,action:string,actor:string|null,issuer:OcrDeviceIssuer|null){
 const headers={'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff'};
 try{
  if(request.method!=='POST'||!['issue','revoke','delivery'].includes(action))throw new OcrBoundaryError(405,'Method not allowed');
  if(action==='delivery'){if(request.headers.has('origin'))throw new OcrBoundaryError(403,'PC delivery only');}
  else{if(!actor)throw new OcrBoundaryError(401,'Authentication required');if(request.headers.get('origin')!==new URL(request.url).origin)throw new OcrBoundaryError(403,'Invalid origin');}
  if(!issuer)throw new OcrBoundaryError(503,'Device issuance not connected');
  const reader=request.body?.getReader();if(!reader)throw new OcrBoundaryError(400,'Missing body');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>8192)throw new OcrBoundaryError(413,'Body too large');chunks.push(next.value);}}finally{await reader.cancel();}
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const result=action==='delivery'?await issuer.delivery(id,input):action==='issue'?await issuer.issue(actor,id,pairingInput.parse(input)):await issuer.revoke(actor,id,z.object({requestKey:z.string().uuid()}).strict().parse(input).requestKey);
  return Response.json(result,{headers});
 }catch(error){return Response.json({error:error instanceof OcrBoundaryError?error.message:'Device operation failed; inspect state before retry'},{status:error instanceof OcrBoundaryError?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:503,headers});}
}
// No real token issuance until approved public-key pairing, schema and runtime activation.
export async function getDeviceIssuer():Promise<OcrDeviceIssuer|null>{return (await (await import('./ocr-production-runtime')).getProductionOcrBundle())?.issuer??null;}
