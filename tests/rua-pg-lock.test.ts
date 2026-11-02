import {it,expect} from 'vitest';
import {PostgresRuaWorkStore} from '../src/lib/rua-work-postgres';
import {OWNER} from '../src/lib/rua-work';
it('diary write acquires text-returning transaction lock before journal read/write',async()=>{
 const calls:string[]=[];
 const tx={$queryRaw:async(parts:TemplateStringsArray)=>{const sql=parts.join('?');calls.push(sql);if(sql.includes('pg_advisory_xact_lock')){if(!sql.includes('::text AS lock_result'))throw Error('void cannot deserialize');return [{lock_result:''}];}return [];},$executeRaw:async(parts:TemplateStringsArray)=>{calls.push(parts.join('?'));return 1;}};
 const db={$transaction:async(fn:(t:typeof tx)=>Promise<unknown>)=>fn(tx)};
 const store=new PostgresRuaWorkStore(db as never);const result=await store.execute(OWNER,{action:'diary',key:'synthetic-key-1',source:'human',raw:'synthetic diary'});
 expect(result).toMatchObject({raw:'synthetic diary'});expect(calls[0]).toContain('pg_advisory_xact_lock(724801, 1)::text');expect(calls[1]).toContain('SELECT actor');expect(calls[2]).toContain('INSERT INTO rua_private_commands');
});
