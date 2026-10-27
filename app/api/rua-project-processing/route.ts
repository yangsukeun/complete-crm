import {getAppSession} from '@/auth';
import {readRuaProcessing,applyRuaProcessing} from '@/lib/rua-processing-postgres';
import {ProcessingError} from '@/lib/rua-processing';
import {WorkError} from '@/lib/rua-work';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie','X-Robots-Tag':'noindex, nofollow'};
async function respond(fn:(id:string|null)=>Promise<unknown>){try{return Response.json(await fn((await getAppSession())?.user?.id??null),{headers});}catch(e){return Response.json({error:e instanceof WorkError||e instanceof ProcessingError?e.message:'저장/조회 결과를 확인하지 못했습니다. 같은 원문 구간으로 다시 확인하세요.'},{status:e instanceof WorkError||e instanceof ProcessingError?e.status:503,headers});}}
export async function GET(){return respond(readRuaProcessing);}
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'출처 확인 실패'},{status:403,headers});return respond(async id=>{const raw=await req.text();if(raw.length>4000)throw new WorkError(413,'요청이 너무 큽니다');return applyRuaProcessing(id,JSON.parse(raw));});}
