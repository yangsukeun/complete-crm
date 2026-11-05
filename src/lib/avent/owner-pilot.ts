import * as XLSX from 'xlsx';
import {isAventPilotId,canAccessAventPilot} from './pilot-access';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff'};
type Dependencies={sessionId:()=>Promise<string|null>;user:(id:string)=>Promise<{id:string;accountDisabled:boolean}|null>;execute:(input:{source:Buffer;expected:Buffer;profile:'payment';stage:'pre_order'},options:{timeoutMs:number;signal:AbortSignal})=>Promise<Record<string,unknown>>};
export const FIXTURE_ID='avent-owner-synthetic-v1';
function fixture(expected:boolean){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['주문번호','품목별주문번호','최종 결제 금액','수량'],['SYN-A','SYN-A-1',300,1],['SYN-A','SYN-A-2',expected?0:300,1],['SYN-B','SYN-B-1',500,2]]),'synthetic');return XLSX.write(book,{type:'buffer',bookType:'xls'}) as Buffer;}
async function command(request:Request){if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||!request.body)throw Error('BAD_REQUEST');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0,timer:ReturnType<typeof setTimeout>|undefined;const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('BODY_TIMEOUT')),1000);});try{while(true){const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;length+=value.byteLength;if(length>128)throw Error('BODY_LIMIT');chunks.push(value);}const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||Object.keys(value).length!==1||value.action!=='run')throw Error('BAD_REQUEST');}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{clearTimeout(timer);reader.releaseLock();}}
export function createOwnerPilot(d:Dependencies){return async(request:Request)=>{
 try{
  const id=await d.sessionId();if(!id)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers});
  const authorized=async()=>{if(!isAventPilotId(id))return false;const user=await d.user(id);return user?.id===id&&canAccessAventPilot(user);};
  if(!await authorized())return Response.json({error:'PILOT_ONLY'},{status:403,headers});
  if(request.method==='GET')return Response.json({ready:true,fixtureId:FIXTURE_ID,syntheticOnly:true,uploadAllowed:false,dispatchEnabled:false},{headers});
  if(request.method!=='POST')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers});
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'ORIGIN_DENIED'},{status:403,headers});
  await command(request);
  const result=await d.execute({source:fixture(false),expected:fixture(true),profile:'payment',stage:'pre_order'},{timeoutMs:2000,signal:request.signal});
  if(!await authorized())return Response.json({error:'PILOT_ONLY'},{status:403,headers});
  const body=JSON.stringify({...result,fixtureId:FIXTURE_ID,syntheticOnly:true,uploadAllowed:false,dispatchEnabled:false,approval:'not_approved',persistence:'none'});
  if(Buffer.byteLength(body)>256*1024)throw Error('RESPONSE_LIMIT');
  return new Response(body,{headers:{...headers,'Content-Type':'application/json'}});
 }catch{return Response.json({error:'SYNTHETIC_TEST_STOPPED',dispatchEnabled:false},{status:422,headers});}
};}
