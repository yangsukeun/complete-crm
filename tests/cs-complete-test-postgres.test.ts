import { afterAll,beforeAll,expect,it,vi } from 'vitest';
import { createServer,type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
const fixture=vi.hoisted(()=>({actor:null as string|null}));
vi.mock('@/auth',()=>({getAppSession:async()=>fixture.actor?{user:{id:fixture.actor}}:null}));
import prisma from '../src/lib/prisma';
import { GET,PUT } from '../app/api/cs-complete-test/route';
import { addTestRequest,syntheticSnapshot,transitionEntry } from '../src/lib/cs-complete-test';
import { persistTestReview } from '../src/lib/cs-test-persist';
const enabled=process.env.CS_ISOLATED_PG_TEST==='1';let server:Server;let origin='';
beforeAll(async()=>{if(!enabled)return;const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=='127.0.0.1'||u.pathname!=='/cs_isolated_verification')throw new Error('Isolated DB only');
 await prisma.user.createMany({data:[{id:'test-manager',email:'m@example.invalid',name:'Synthetic manager',password:'not-valid',department:'CS',role:'TEAM_LEAD'},{id:'test-admin',email:'a@example.invalid',name:'Synthetic admin',password:'not-valid',department:'CS',role:'ADMIN'},{id:'test-user',email:'u@example.invalid',name:'Synthetic user',password:'not-valid',department:'CS',role:'USER'},{id:'test-disabled',email:'d@example.invalid',name:'Synthetic disabled',password:'not-valid',department:'CS',role:'ADMIN',accountDisabled:true}]});
 server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(Buffer.from(c));const request=new Request(origin+req.url,{method:req.method,headers:{origin:String(req.headers.origin??'')},...(req.method==='PUT'?{body:Buffer.concat(chunks).toString()}:{})});const result=req.method==='PUT'?await PUT(request):await GET(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());}catch{res.writeHead(500);res.end();}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
},30000);

afterAll(async()=>{if(!enabled)return;if(server)await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
const call=(method='GET',body?:unknown,id='',requestOrigin=origin)=>fetch(origin+'/api/cs-complete-test'+(id?'?id='+id:''),{method,headers:{origin:requestOrigin},...(body?{body:JSON.stringify(body)}:{})});
it.skipIf(!enabled)('persists isolated TEST through HTTP, allows active staff, preserves snapshots and serializes revisions',async()=>{
 expect((await call()).status).toBe(401);for(const actor of ['test-disabled']){fixture.actor=actor;expect((await call()).status).toBe(403);}
 fixture.actor='test-manager';const source=syntheticSnapshot();const review={format:'cs-test-review-v1',source,testEntries:source.entries,attendance:[],audit:[]};
 expect((await call('PUT',{review,expectedVersion:0},'','https://other.invalid')).status).toBe(403);
 const first=await call('PUT',{review,expectedVersion:0});expect(first.status).toBe(200);const saved=await first.json();expect(saved.version).toBe(1);
 expect((await call('PUT',{review,expectedVersion:0})).status).toBe(409);
 fixture.actor='test-user';const reopened=await (await call('GET',undefined,saved.id)).json();expect(reopened.payload).toEqual(review);expect(reopened.version).toBe(1);
 const updated={...review,testEntries:transitionEntry(source,source.entries,'demo-3',1,'APPROVED')};
 const racing=await Promise.all([call('PUT',{review:updated,expectedVersion:1}),call('PUT',{review:updated,expectedVersion:1})]);expect(racing.map(r=>r.status).sort()).toEqual([200,409]);
 const after=await (await call('GET',undefined,saved.id)).json();expect(after.version).toBe(2);expect(after.payload.source.entries[2].status).toBe('PENDING');expect(after.payload.testEntries[2].status).toBe('APPROVED');
 const rows=await prisma.$queryRaw<{version:number}[]>`SELECT "version" FROM "CsCompleteTestRevision" ORDER BY "version"`;expect(rows.map(r=>r.version)).toEqual([1,2]);
 await expect(prisma.$executeRaw`UPDATE "CsCompleteTestSource" SET "snapshot"='{}'::jsonb WHERE "id"=${saved.id}`).rejects.toThrow();
 await expect(prisma.$executeRaw`DELETE FROM "CsCompleteTestRevision" WHERE "id"=${saved.id}`).rejects.toThrow();
 const rollback=await call('PUT',{review,expectedVersion:2});expect(rollback.status).toBe(200);const restored=await (await call('GET',undefined,saved.id)).json();expect(restored.version).toBe(3);expect(restored.payload.testEntries).toEqual(source.entries);
 const before=await prisma.user.count();expect(before).toBe(4);expect((await (await call()).json()).records).toHaveLength(1);
},30000);

it.skipIf(!enabled)('staff request and center-chief approval persist across fresh HTTP sessions',async()=>{
 await prisma.user.create({data:{id:'test-center-chief',email:'chief@example.invalid',name:'Synthetic chief',password:'not-valid',department:'CS',role:'CENTER_CHIEF'}});
 fixture.actor='test-user';const list=await (await call()).json();const id=list.records[0].id;const before=await (await call('GET',undefined,id)).json();
 const entry={...before.payload.source.entries[0],sourceId:'test-reconnect-request',date:'2026-11-20',status:'PENDING' as const,version:1};
 const draft={...before.payload,testEntries:addTestRequest(before.payload.source,before.payload.testEntries,entry)};
 const localFetch:typeof fetch=(input,init)=>fetch(origin+String(input),{...init,headers:{...init?.headers,origin}});
 const saved=await persistTestReview(localFetch,draft,before.version);
 fixture.actor=null;expect((await call()).status).toBe(401);fixture.actor='test-user';
 const reopened=await (await call('GET',undefined,id)).json();expect(reopened.version).toBe(saved.version);expect(reopened.payload.testEntries.find((r:{sourceId:string})=>r.sourceId===entry.sourceId).status).toBe('PENDING');
 fixture.actor='test-center-chief';const approved={...reopened.payload,testEntries:transitionEntry(reopened.payload.source,reopened.payload.testEntries,entry.sourceId,1,'APPROVED')};
 const confirmed=await persistTestReview(localFetch,approved,reopened.version);
 fixture.actor=null;expect((await call()).status).toBe(401);fixture.actor='test-center-chief';
 const final=await (await call('GET',undefined,id)).json();expect(final.version).toBe(confirmed.version);expect(final.payload.testEntries.find((r:{sourceId:string})=>r.sourceId===entry.sourceId).status).toBe('APPROVED');expect(final.payload.source).toEqual(before.payload.source);
 expect((await persistTestReview(localFetch,approved,reopened.version)).version).toBe(confirmed.version);
},30000);
