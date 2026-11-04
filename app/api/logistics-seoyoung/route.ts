import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {SalesError} from '@/lib/logistics-sales';
import {SeoyoungDraftStore} from '@/lib/seoyoung/draft-store';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
async function handle(run:(store:SeoyoungDraftStore,actor:string|null)=>Promise<unknown>){try{return Response.json(await run(new SeoyoungDraftStore(prisma),(await getAppSession())?.user?.id??null),{headers});}catch(e){return Response.json({error:e instanceof SalesError?e.message:'정산 저장소가 준비되지 않았거나 연결할 수 없습니다. 입력 내용은 화면에 남아 있습니다.'},{status:e instanceof SalesError?e.status:e instanceof SyntaxError?400:503,headers});}}
export async function GET(request:Request){return handle(async(store,actor)=>{const q=new URL(request.url).searchParams;if([...q.keys()].some(k=>!['month','history'].includes(k)))throw new SalesError(400,'지원하지 않는 고객/조회 범위입니다.');const month=q.get('month')||undefined;if(q.get('history')==='1'){if(!month)throw new SalesError(400,'정산월 필요');return store.history(actor,month);}return store.read(actor,month);});}
export async function POST(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'허용하지 않는 요청 출처입니다.'},{status:403,headers});return handle(async(store,actor)=>{
 const reader=request.body?.getReader();if(!reader)throw new SalesError(400,'입력 없음');const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3*1024*1024){await reader.cancel();throw new SalesError(413,'초안 저장은 3MiB까지 지원합니다. 원본은 보존하고 검토 파일을 내려받으세요.');}chunks.push(value);}const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}return store.execute(actor,JSON.parse(new TextDecoder().decode(bytes)));
});}
