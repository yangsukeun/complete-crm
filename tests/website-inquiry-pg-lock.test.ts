import { expect,it,vi } from 'vitest';
import type {PrismaClient} from '@prisma/client';
import {createInquiryDb} from '../src/lib/website-inquiry-pg';
import {createSubjectLimiter} from '../src/lib/website-inquiry-preflight-pg';

// Contract regression only: this models the unsupported void decode error and
// exercises the real adapters. It is not a live PostgreSQL/Prisma engine test.
function fixture(){
 const calls:string[]=[];
 const tx={
  $queryRaw:vi.fn(async(strings:TemplateStringsArray)=>{
   const sql=strings.join('?');calls.push(sql);
   if(sql.includes('pg_advisory_xact_lock')){
    if(!sql.includes('::text AS lock_result'))throw new Error('unsupported void');
    return [{lock_result:''}];
   }
   return [{hits:1}];
  }),
  $executeRaw:vi.fn(async()=>0),
 };
 const client={$transaction:async<T>(fn:(value:typeof tx)=>Promise<T>)=>fn(tx)} as unknown as PrismaClient;
 return {client,calls,tx};
}
it('intake acquires unchanged transaction lock without returning void to Prisma',async()=>{
 const f=fixture();let entered=false;
 await createInquiryDb(f.client).transaction(async()=>{entered=true;return null;});
 expect(entered).toBe(true);expect(f.calls[0]).toContain('pg_advisory_xact_lock(724804, 1)::text');
});
it('preflight reaches counters only after the supported lock result',async()=>{
 const f=fixture();expect(await createSubjectLimiter(f.client)('corporate',{day:'2026-11-01',subject_hash:'a'.repeat(64)})).toBe(true);
 expect(f.calls[0]).toContain('pg_advisory_xact_lock(724804,2)::text');expect(f.calls).toHaveLength(3);
});
it('lock failure still aborts the transaction callback rather than bypassing locking',async()=>{
 const f=fixture();f.tx.$queryRaw.mockRejectedValueOnce(new Error('synthetic lock failure'));
 const callback=vi.fn();await expect(createInquiryDb(f.client).transaction(callback)).rejects.toThrow('synthetic lock failure');expect(callback).not.toHaveBeenCalled();
});
