import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {randomUUID} from 'node:crypto';
import * as XLSX from 'xlsx';
import {initialState,proposeParcels} from '../src/lib/seoyoung/settlement';
import {minimizeDraft} from '../src/lib/seoyoung/draft';
import {exportSettlement} from '../src/lib/seoyoung/export';
import {SEPTEMBER_SHEETS} from '../src/lib/seoyoung/statement';
// Explicit opt-in; real HTTP + Prisma + PostgreSQL. Only session identity is a synthetic fixture.
const f=vi.hoisted(()=>({actor:null as string|null}));
vi.mock('@/auth',()=>({getAppSession:async()=>f.actor?{user:{id:f.actor}}:null}));
import prisma from '../src/lib/prisma';
import {GET,POST} from '../app/api/logistics-seoyoung/route';
const enabled=process.env.SEOYOUNG_ISOLATED_PG_TEST==='1';
const phase=process.env.SEOYOUNG_TEST_PHASE;
let server:Server,origin='';
function snapshot(ready=false){const s=initialState('2026-10'),hash='a'.repeat(64);s.files=[{hash,name:'PRIVATE-FILENAME.xlsx',rows:1}];s.rows=[{id:'r1',fileHash:hash,fileName:'PRIVATE-FILENAME.xlsx',sheet:'PRIVATE-SHEET',line:2,item:'합성상품',quantity:2,invoice:'PRIVATE-INVOICE',boxType:'극소',boxUse:'N',packing:'Y',combined:'',issues:[]}];s.classification['합성상품']={category:'general',work:'none',reason:'합성 확인'};s.parcels=proposeParcels(s);Object.values(s.parcels).forEach(p=>{p.reviewed=true;p.reason='합성확인';p.boxTiny=0;p.boxSmall=0;});s.rates.forEach(r=>{r.confirmed=true;r.source='합성계약';});s.extras.forEach(e=>e.quantity=0);s.extrasReviewed=true;s.periodConfirmed=ready;return minimizeDraft(s);}
beforeAll(async()=>{
 if(!enabled)return;const url=new URL(process.env.DATABASE_URL||'');if(url.hostname!=='127.0.0.1'||url.port!=='45449'||url.pathname!=='/seoyoung_isolated_verification')throw Error('Isolated database required');
 if(phase==='write')await prisma.user.createMany({data:[{id:'syn-staff',email:'seoyoung-staff@example.invalid',name:'Synthetic',password:'not-a-login-hash',department:'물류',role:'USER'},{id:'syn-other',email:'seoyoung-other@example.invalid',name:'Synthetic',password:'not-a-login-hash',department:'CS',role:'USER'},{id:'syn-disabled',email:'seoyoung-disabled@example.invalid',name:'Synthetic',password:'not-a-login-hash',department:'물류',role:'USER',accountDisabled:true}]});
 server=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const request=new Request(origin+req.url,{method:req.method,headers:{origin:String(req.headers.origin||''),'Content-Type':'application/json'},...(req.method==='GET'?{}:{body:Buffer.concat(chunks).toString()})});const response=req.method==='GET'?await GET(request):await POST(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}catch{res.writeHead(500);res.end('isolated harness error');}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
},30000);
afterAll(async()=>{if(!enabled)return;if(server)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await prisma.$disconnect();});
function call(body?:unknown,query=''){return fetch(origin+'/api/logistics-seoyoung'+query,{method:body?'POST':'GET',headers:{origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
const save=(version:number,ready=false)=>({action:'save',key:randomUUID(),expectedVersion:version,state:snapshot(ready)});
it.skipIf(!enabled||phase!=='write')('real isolated PostgreSQL and HTTP enforce save, conflicts, roles, rollback, review',async()=>{
 expect((await call()).status).toBe(401);
 for(const actor of ['syn-other','syn-disabled']){f.actor=actor;expect((await call()).status).toBe(403);expect((await call(save(0))).status).toBe(403);}
 f.actor='syn-staff';expect((await call(undefined,'?customer=another')).status).toBe(400);expect((await call({...save(0),customer:'another'})).status).toBe(400);
 const first=save(0);expect((await call(first)).status).toBe(200);expect((await call(first)).status).toBe(200);expect((await call(save(0))).status).toBe(409);
 const race=await Promise.all([call(save(1)),call(save(1))]);expect(race.map(r=>r.status).sort()).toEqual([200,409]);
 expect((await call({action:'review',key:randomUUID(),month:'2026-10',expectedVersion:2})).status).toBe(409);
 expect((await call(save(2,true))).status).toBe(200);expect((await call({action:'review',key:randomUUID(),month:'2026-10',expectedVersion:3})).status).toBe(200);
 let record=await (await call(undefined,'?month=2026-10')).json();expect(record.status).toBe('reviewed');expect(record.state.approvedRevision).toBe(4);
 expect((await call(save(4,true))).status).toBe(200);record=await (await call(undefined,'?month=2026-10')).json();expect(record.status).toBe('draft');expect(record.state.approvedRevision).toBeNull();expect(JSON.stringify(record)).not.toContain('PRIVATE');
 await prisma.user.update({where:{id:'syn-staff'},data:{department:'CS'}});expect((await call()).status).toBe(403);expect((await call(save(5))).status).toBe(403);await prisma.user.update({where:{id:'syn-staff'},data:{department:'물류'}});
 // Force audit insert failure inside the real DB transaction, then verify no draft write leaked.
 await prisma.$executeRawUnsafe("CREATE FUNCTION seoyoung_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
 await prisma.$executeRawUnsafe('CREATE TRIGGER seoyoung_test_fail BEFORE INSERT ON seoyoung_settlement_events FOR EACH ROW EXECUTE FUNCTION seoyoung_test_fail_audit()');
 const retry=save(5,true);expect((await call(retry)).status).toBe(503);expect((await (await call(undefined,'?month=2026-10')).json()).version).toBe(5);
 await prisma.$executeRawUnsafe('DROP TRIGGER seoyoung_test_fail ON seoyoung_settlement_events');await prisma.$executeRawUnsafe('DROP FUNCTION seoyoung_test_fail_audit()');expect((await call(retry)).status).toBe(200);
 const counts=await prisma.$queryRaw<{n:bigint}[]>`SELECT count(*) AS n FROM seoyoung_settlement_events`;expect(Number(counts[0].n)).toBe(6);
},30000);
it.skipIf(!enabled||phase!=='read')('after DB and application process restart reopen persisted record and September XLSX',async()=>{
 f.actor='syn-staff';const response=await call(undefined,'?month=2026-10');expect(response.status).toBe(200);const record=await response.json();expect(record.version).toBe(6);expect(record.status).toBe('draft');expect(record.state.rows).toHaveLength(1);expect(record.state.rows[0].quantity).toBe(2);
 const book=XLSX.read(await exportSettlement(record.state),{type:'array',cellFormula:true});expect(book.SheetNames.slice(0,12)).toEqual(SEPTEMBER_SHEETS);const w=book.Sheets['거래명세표'];expect(w.B10.v).toBe('품목');expect(w.S17.v).toBe(1);expect(w.AA17.f).toBe('S17*V17');expect(w.AF17.f).toBe('AA17*10%');expect(w['!merges']?.map(XLSX.utils.encode_range)).toContain('B2:AG3');expect(w.F36.f).toBe('AA35+AF35');
 const audit=await (await call(undefined,'?month=2026-10&history=1')).json();expect(audit).toHaveLength(6);
},30000);
