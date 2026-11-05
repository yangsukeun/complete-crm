import { createHash } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { addTestRequest,reviewSchema,syntheticSnapshot,transitionEntry } from '../src/lib/cs-complete-test';
import { persistTestReview,type TestReviewDraft } from '../src/lib/cs-test-persist';
import { readTestStartup } from '../src/lib/cs-test-startup';
function fixture(){
 const source=syntheticSnapshot();const original=reviewSchema.parse({format:'cs-test-review-v1',source,testEntries:source.entries,attendance:[],audit:[]});
 const id=createHash('sha256').update(JSON.stringify(original.source)).digest('hex');
 let stored=structuredClone(original),version=1;let writes=0;let loseAck=false;let fail=false;
 const fetcher=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
  if(init?.method==='PUT'){
   if(fail)throw new Error('offline');const body=JSON.parse(String(init.body));
   if(body.expectedVersion!==version)return Response.json({error:'conflict'},{status:409});
   stored=structuredClone(body.review);version++;writes++;
   if(loseAck){loseAck=false;throw new Error('ack lost');}
   return Response.json({id,version});
  }
  if(fail)throw new Error('offline');
  return String(url).includes('?')?Response.json({id,version,payload:stored}):Response.json({records:[{id,version,snapshotId:source.snapshotId,employeeCount:2,entryCount:3}]});
 }) as typeof fetch;
 return {source,original,fetcher,state:()=>({stored,version,writes}),loseAck:()=>{loseAck=true;},offline:(value:boolean)=>{fail=value;}};
}
function request(original:TestReviewDraft){const entry={...original.testEntries[0],sourceId:'synthetic-request',date:'2026-11-12',status:'PENDING' as const,version:1};return {...original,testEntries:addTestRequest(original.source,original.testEntries,entry)};}
it('employee request survives a fresh client, and center-chief approval survives another fresh client',async()=>{
 const f=fixture();const draft=request(f.original);await persistTestReview(f.fetcher,draft,1);
 const employeeReentry=await readTestStartup(f.fetcher,new AbortController().signal);expect(employeeReentry.opened?.payload.testEntries.find(e=>e.sourceId==='synthetic-request')?.status).toBe('PENDING');
 const review=employeeReentry.opened!.payload;const approved={...review,testEntries:transitionEntry(review.source,review.testEntries,'synthetic-request',1,'APPROVED')};
 await persistTestReview(f.fetcher,approved,employeeReentry.opened!.version);
 const managerReentry=await readTestStartup(f.fetcher,new AbortController().signal);expect(managerReentry.opened?.payload.testEntries.find(e=>e.sourceId==='synthetic-request')?.status).toBe('APPROVED');expect(f.state().stored.source).toEqual(f.original.source);
});
it('keeps a failed draft unchanged and saves that same request once on explicit retry',async()=>{
 const f=fixture();const draft=request(f.original);const before=JSON.stringify(draft);f.offline(true);
 await expect(persistTestReview(f.fetcher,draft,1)).rejects.toThrow();expect(f.state().writes).toBe(0);expect(JSON.stringify(draft)).toBe(before);
 f.offline(false);await persistTestReview(f.fetcher,draft,1);expect(f.state().writes).toBe(1);expect(f.state().stored.testEntries.filter(e=>e.sourceId==='synthetic-request')).toHaveLength(1);
});
it('recovers a lost acknowledgement by exact readback, and retries do not add a revision',async()=>{
 const f=fixture();const draft=request(f.original);f.loseAck();expect((await persistTestReview(f.fetcher,draft,1)).version).toBe(2);
 expect((await persistTestReview(f.fetcher,draft,1)).version).toBe(2);expect(f.state().writes).toBe(1);
});
it('does not overwrite another session after concurrent divergent saves',async()=>{
 const f=fixture();const a=request(f.original);const b={...f.original,testEntries:transitionEntry(f.source,f.original.testEntries,'demo-3',1,'APPROVED')};
 const results=await Promise.allSettled([persistTestReview(f.fetcher,a,1),persistTestReview(f.fetcher,b,1)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);expect(f.state().writes).toBe(1);expect(f.state().stored).toEqual(a);
});
it('never reports success on session expiry or denied access',async()=>{
 for(const status of [401,403]){const f=vi.fn().mockResolvedValue(Response.json({error:'denied'},{status}));await expect(persistTestReview(f,fixture().original,1)).rejects.toThrow();expect(f).toHaveBeenCalledTimes(1);}
});
