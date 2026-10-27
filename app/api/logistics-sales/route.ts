import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { LogisticsSalesStore } from "@/lib/logistics-sales-store";
import { SalesError } from "@/lib/logistics-sales";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store",Vary:"Cookie"};
async function handle(run:(store:LogisticsSalesStore,actor:string|null)=>Promise<unknown>){
 try{const actor=(await getAppSession())?.user?.id??null;return Response.json(await run(new LogisticsSalesStore(prisma),actor),{headers});}
 catch(e){return Response.json({error:e instanceof SalesError?e.message:"저장소를 사용할 수 없습니다."},{status:e instanceof SalesError?e.status:e instanceof SyntaxError?400:503,headers});}
}
export async function GET(){return handle((store,actor)=>store.read(actor));}
export async function POST(request:Request){
 if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"허용되지 않은 요청 출처입니다."},{status:403,headers});
 return handle(async(store,actor)=>{const body=await request.text();if(new TextEncoder().encode(body).length>16000)throw new SalesError(413,"입력이 너무 큽니다.");return store.execute(actor,JSON.parse(body));});
}
