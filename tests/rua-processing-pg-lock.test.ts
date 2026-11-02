import {it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({calls:[] as string[],records:[] as {body:unknown}[]}));
vi.mock('server-only',()=>({}));
vi.mock('../src/lib/prisma',()=>({default:{user:{findUnique:async()=>({accountDisabled:false})},$transaction:async(fn:(tx:unknown)=>unknown)=>fn({
 project:{findFirst:async()=>({id:'synthetic-project',deletedAt:null})},
 $queryRaw:async(parts:TemplateStringsArray)=>{const sql=parts.join('?');f.calls.push(sql);if(sql.includes('pg_advisory_xact_lock')){if(!sql.includes('::text AS lock_result'))throw Error('void deserialization');return[{lock_result:''}];}if(sql.includes('SELECT actor'))return [
  {actor:'cmmitn4830000fc0jt8c1l2jf',at:'2026-11-01T00:00:00Z',body:JSON.stringify({action:'diary',key:'synthetic-diary-key',source:'human',raw:'합성 진행'})},
  {actor:'cmmitn4830000fc0jt8c1l2jf',at:'2026-11-01T00:01:00Z',body:JSON.stringify({action:'classify',key:'synthetic-classify-key',source:'human',id:'local-note-1',version:1,classification:{index:0,project:'합성 프로젝트',stage:'진행 내용'}})}];return f.records;},
 $executeRaw:async(_parts:TemplateStringsArray,...values:unknown[])=>{f.records.push({body:JSON.parse(String(values[6]))});return 1;}
 })}}));
import {applyRuaProcessing} from '../src/lib/rua-processing-postgres';
it('private project application uses decodable lock and preserves idempotent receipt',async()=>{
 const body={sourceId:'local-note-1',version:2,index:0,projectId:'synthetic-project',confirmed:true};
 const first=await applyRuaProcessing('cmmitn4830000fc0jt8c1l2jf',body);const second=await applyRuaProcessing('cmmitn4830000fc0jt8c1l2jf',body);
 expect(first).toEqual(second);expect(f.records).toHaveLength(1);expect(f.calls[0]).toContain('pg_advisory_xact_lock(724801,1)::text');expect(first.aiRead).toBe(false);
});
