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
it('stores a checkpoint as a backward-readable diary journal row and deduplicates after replay', async () => {
  const rows: { actor: string; body: string; at: string }[] = [];
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => parts.join('?').includes('pg_advisory_xact_lock') ? [{ lock_result: '' }] : rows,
    $executeRaw: async (_parts: TemplateStringsArray, actor: string, _key: string, body: string, at: string) => {
      rows.push({ actor, body, at }); return 1;
    },
  };
  const db = { $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  const store = new PostgresRuaWorkStore(db as never);
  const command = {
    action: 'checkpoint', key: 'synthetic-checkpoint-1', source: 'human', checkpoint: {
      topic: '합성 프로젝트', summary: '검토 완료', stage: '진행 내용', evidence: '미확인', sources: [],
    },
  };
  await store.execute(OWNER, command);
  await store.execute(OWNER, command);
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].body)).toMatchObject({ action: 'diary', raw: expect.stringMatching(/^RUA_CHECKPOINT_V1_/) });
  expect((await store.readDiary(OWNER)).notes[0]).toMatchObject({
    checkpoint: { summary: '검토 완료' }, links: [{ project: '합성 프로젝트' }],
  });
});
