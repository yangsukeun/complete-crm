import 'server-only';
import prisma from './prisma';
import { OWNER,ownerOnly,WorkError } from './rua-work';
import { PostgresRuaWorkStore } from './rua-work-postgres';
import {applyPrivateProjectRecord,type Store,type Result} from './rua-processing';
import {z} from 'zod';
export const processingInput=z.object({sourceId:z.string().min(1),version:z.number().int().positive(),index:z.number().int().nonnegative(),projectId:z.string().min(1),confirmed:z.literal(true)}).strict();
async function activeOwner(actor:string|null){ownerOnly(actor);const user=await prisma.user.findUnique({where:{id:actor!},select:{accountDisabled:true}});if(!user||user.accountDisabled)throw new WorkError(404,'찾을 수 없습니다');return actor!;}
export async function readRuaProcessing(actor:string|null){const id=await activeOwner(actor);const diary=await new PostgresRuaWorkStore(prisma).readDiary(id);const [projects,records]=await Promise.all([prisma.project.findMany({where:{deletedAt:null},select:{id:true,name:true,brand:{select:{name:true}}},orderBy:{name:'asc'}}),prisma.$queryRaw<Array<{body:Result}>>`SELECT body FROM rua_project_updates WHERE actor_id=${id} ORDER BY recorded_at`]);return{diary,projects,results:records.map(r=>r.body),delivery:'on-demand-tool-only',aiRead:false};}
export async function applyRuaProcessing(actor:string|null,input:unknown,processor:Result['processor']='owner-confirmed'){
 const id=await activeOwner(actor);const parsed=processingInput.safeParse(input);if(!parsed.success)throw new WorkError(400,'원문 구간·버전·실제 프로젝트·명시적 확인이 필요합니다');
 const store:Store={atomic:async(key,body)=>prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(724801,1)`;
  return body({source:async sourceId=>(await new PostgresRuaWorkStore(prisma).readDiaryTransaction(id,tx)).notes.find(n=>n.id===sourceId)??null,
   project:async projectId=>{const p=await tx.project.findFirst({where:{id:projectId},select:{id:true,deletedAt:true}});return p?{id:p.id,deleted:!!p.deletedAt}:null;},
   receipt:async requestKey=>{const rows=await tx.$queryRaw<Array<{body:Result}>>`SELECT body FROM rua_project_updates WHERE request_key=${requestKey} AND actor_id=${id}`;return rows[0]?.body??null;},
   insert:async result=>{await tx.$executeRaw`INSERT INTO rua_project_updates(request_key,actor_id,source_id,source_version,source_index,project_id,body,recorded_at) VALUES (${key},${id},${result.sourceId},${result.sourceVersion},${result.index},${result.projectId},${JSON.stringify(result)}::jsonb,${new Date(result.recordedAt)})`;}
  });
 },{isolationLevel:'ReadCommitted',timeout:10000})};
 return applyPrivateProjectRecord(store,{id,disabled:false},OWNER,parsed.data,undefined,processor);
}
