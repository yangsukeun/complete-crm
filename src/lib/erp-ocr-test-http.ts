import {z} from 'zod';
import {ErpOcrTestService,TestBridgeError,type TestPrincipal,bindingSchema} from './erp-ocr-test';
export type TestRuntime={service:ErpOcrTestService;authenticate:(r:Request)=>Promise<TestPrincipal|null>};
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
/** No cookie/device authentication fallback. Production verifier/mapping/queue deliberately not configured. */
export async function productionTestRuntime():Promise<TestRuntime|null>{return null;}
export async function testBridgeHttp(r:Request,id:string|null,getRuntime:()=>Promise<TestRuntime|null>=productionTestRuntime){
 try{
  const rt=await getRuntime();if(!rt)return Response.json({error:'OCR_TEST_CONNECTION_DISABLED'},{status:503,headers});
  const principal=await rt.authenticate(r);if(!principal)return Response.json({error:'ERP_SERVER_AUTH_REQUIRED'},{status:401,headers});
  if(r.method==='GET'&&id)return Response.json(await rt.service.read(principal,id,Object.fromEntries(Array.from(new URL(r.url).searchParams.entries()).map(([k,v])=>[k,k==='mappingRevision'?Number(v):v]))),{headers});
  if(r.method!=='POST'||id)return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers});
  if(!r.headers.get('content-type')?.startsWith('application/json'))throw new TestBridgeError(415,'JSON_REQUIRED');
  const reader=r.body?.getReader();if(!reader)throw new TestBridgeError(400,'BODY_REQUIRED');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>3*1024*1024){await reader.cancel();throw new TestBridgeError(413,'REQUEST_TOO_LARGE');}chunks.push(c.value);}
  const body=z.object({binding:bindingSchema,imageBase64:z.string().min(4)}).strict().parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const image=Buffer.from(body.imageBase64,'base64');if(image.toString('base64')!==body.imageBase64)throw new TestBridgeError(400,'BASE64_INVALID');
  return Response.json(await rt.service.enqueue(principal,body.binding,image),{headers});
 }catch(e){const known=e instanceof TestBridgeError;return Response.json({error:known?e.code:e instanceof z.ZodError||e instanceof SyntaxError?'INVALID_REQUEST':'OCR_TEST_UNAVAILABLE'},{status:known?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:503,headers});}
}
