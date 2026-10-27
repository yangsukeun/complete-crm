import { getAppSession } from "@/auth";
import { ruaSessionActor } from "@/lib/rua-auth";
import { WorkError } from "@/lib/rua-work";
import { openRuaStore } from "@/lib/rua-store";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store",Vary:"Cookie","X-Robots-Tag":"noindex, nofollow"};
async function respond(fn:(actor:string)=>Promise<unknown>){try{return Response.json(await fn(ruaSessionActor(await getAppSession(),true)),{headers});}catch(e){return Response.json({error:e instanceof WorkError?e.message:"기록을 처리하지 못했습니다."},{status:e instanceof WorkError?e.status:e instanceof SyntaxError?400:503,headers});}}
export async function GET(r:Request){return respond(async actor=>{if(new URL(r.url).searchParams.get("view")!=="diary")throw new WorkError(404,"찾을 수 없습니다.");return (await openRuaStore()).readDiary(actor);});}
export async function POST(r:Request){const url=new URL(r.url);if(r.headers.get("origin")!==`${url.protocol}//${r.headers.get("host")??url.host}`)return Response.json({error:"허용되지 않은 출처입니다."},{status:403,headers});return respond(async actor=>{const raw=await r.text();if(new TextEncoder().encode(raw).length>48000)throw new WorkError(413,"기록이 너무 큽니다.");const body=JSON.parse(raw);if(!body||!["diary","classify"].includes(body.action)||body.source!=="human")throw new WorkError(400,"현재는 본인 일기와 분류 수정만 가능합니다.");return (await openRuaStore()).execute(actor,body);});}
