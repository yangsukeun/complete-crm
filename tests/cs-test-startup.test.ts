import { expect, it, vi } from 'vitest';
import { readTestStartup, isSyntheticSnapshot } from '../src/lib/cs-test-startup';
import { syntheticSnapshot } from '../src/lib/cs-complete-test';
const id='a'.repeat(64);
const row={id,version:2,snapshotId:'synthetic-example',employeeCount:2,entryCount:3};
const source=syntheticSnapshot();
const payload={format:'cs-test-review-v1',source,testEntries:source.entries,attendance:[],audit:[]};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
it('reopens the single saved TEST state and its version, with no write request',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response({records:[row]})).mockResolvedValueOnce(response({id,version:2,payload}));
 const signal=new AbortController().signal;const result=await readTestStartup(fetcher,signal);
 expect(result.opened?.version).toBe(2);expect(result.opened?.payload.testEntries).toEqual(source.entries);
 expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['/api/cs-complete-test','/api/cs-complete-test?id='+id]);
 expect(fetcher.mock.calls.every(c=>c[1].method===undefined&&c[1].cache==='no-store'&&c[1].signal===signal)).toBe(true);
});
it('leaves empty and multiple-source inventories for explicit selection',async()=>{
 for(const records of [[],[row,{...row,id:'b'.repeat(64)}]]){const fetcher=vi.fn().mockResolvedValue(response({records}));expect((await readTestStartup(fetcher,new AbortController().signal)).opened).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);}
});
it('reports authorization, storage, malformed and mismatched-source failures without writes',async()=>{
 for(const status of [401,403,503])await expect(readTestStartup(vi.fn().mockResolvedValue(response({},status)),new AbortController().signal)).rejects.toThrow();
 await expect(readTestStartup(vi.fn().mockResolvedValue(response({records:'invalid'})),new AbortController().signal)).rejects.toThrow();
 const fetcher=vi.fn().mockResolvedValueOnce(response({records:[row]})).mockResolvedValueOnce(response({id:'b'.repeat(64),version:2,payload}));
 await expect(readTestStartup(fetcher,new AbortController().signal)).rejects.toThrow('식별자');
});
it('identifies known synthetic IDs without certifying other snapshots as real',()=>{expect(isSyntheticSnapshot('synthetic-remote-storage-verification-v1')).toBe(true);expect(isSyntheticSnapshot('unverified-import')).toBe(false);});
