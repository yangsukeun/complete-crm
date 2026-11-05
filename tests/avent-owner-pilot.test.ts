import {test,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {executeNodePreview} from '../src/lib/avent/node-executor';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createOwnerPilot} from '../src/lib/avent/owner-pilot';
import {WORKSPACE_OWNER} from '../src/lib/workspace-areas';
import {AVENT_PILOT_STAFF,canAccessAventPilot} from '../src/lib/avent/pilot-access';
import {workspaceAreas} from '../src/lib/workspace-areas';
import {workspacePageAreas} from '../src/lib/workspace-page-access';
import {requireSalesUser} from '../src/lib/logistics-sales';
import * as XLSX from 'xlsx';
const require=createRequire(import.meta.url),{execute}=require(path.resolve('src/lib/avent/engine/bounded_preview.cjs'));
function req(body:unknown={action:'run'},origin='http://localhost'){return new Request('http://localhost/api/avent/pilot',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});}
test('only current enabled existing owner, not staff/admin/anonymous',async()=>{let runs=0;for(const id of [null,'STAFF','ADMIN']){const handler=createOwnerPilot({sessionId:async()=>id,user:async id=>({id,accountDisabled:false}),execute:async()=>{runs++;return {};}});expect((await handler(req())).status).toBe(id?403:401);}const disabled=createOwnerPilot({sessionId:async()=>WORKSPACE_OWNER,user:async id=>({id,accountDisabled:true}),execute});expect((await disabled(req())).status).toBe(403);expect(runs).toBe(0);});
test('fixed synthetic XLS through actual Node adapter and bounded engine',async()=>{const handler=createOwnerPilot({sessionId:async()=>WORKSPACE_OWNER,user:async id=>({id,accountDisabled:false}),execute:executeNodePreview});const r=await handler(req());expect(r.status).toBe(200);const result=await r.json();expect(result).toMatchObject({rows:3,comparison:{match:true},downloadAllowed:true,syntheticOnly:true,uploadAllowed:false,dispatchEnabled:false,approval:'not_approved'});expect(result.outputBase64).toBeTruthy();});
test('reject file injection, tenant/profile fields, wrong origin and excessive body before execution',async()=>{let calls=0;const handler=createOwnerPilot({sessionId:async()=>WORKSPACE_OWNER,user:async id=>({id,accountDisabled:false}),execute:async()=>{calls++;return {};}});for(const body of [{action:'run',sourceBase64:'fake'},{action:'run',profile:'sabang'},{action:'run',companyId:'OTHER'},{action:'run',padding:'x'.repeat(150)},{action:'dispatch'}])expect((await handler(req(body))).status).toBe(422);expect((await handler(req({action:'run'},'http://other'))).status).toBe(403);expect(calls).toBe(0);});
test('latest owner disabled after calculation prevents result return',async()=>{let disabled=false;const handler=createOwnerPilot({sessionId:async()=>WORKSPACE_OWNER,user:async id=>({id,accountDisabled:disabled}),execute:async()=>{disabled=true;return {outputBase64:'x'};}});expect((await handler(req())).status).toBe(403);});

test('designated existing staff executes real synthetic engine; Excel totals stay 3/4/800',async()=>{
 const handler=createOwnerPilot({sessionId:async()=>AVENT_PILOT_STAFF,user:async id=>({id,accountDisabled:false}),execute:executeNodePreview});
 const response=await handler(req());expect(response.status).toBe(200);
 const result=await response.json();expect(result).toMatchObject({rows:3,comparison:{match:true},downloadAllowed:true,uploadAllowed:false,dispatchEnabled:false,persistence:'none'});
 const book=XLSX.read(Buffer.from(result.outputBase64,'base64'));
 const rows=XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.result,{header:1}).slice(1);
 expect(rows).toHaveLength(3);expect(rows.reduce((n,row)=>n+Number(row[3]),0)).toBe(4);expect(rows.reduce((n,row)=>n+Number(row[2]),0)).toBe(800);
});

test('staff access is ID-specific, current, disabled-safe and cannot authorize logistics data',async()=>{
 const staff={id:AVENT_PILOT_STAFF,department:'마케팅',accountDisabled:false};
 expect(canAccessAventPilot(staff)).toBe(true);
 expect(workspacePageAreas(staff)).toEqual(['marketing','logistics']);
 expect(workspaceAreas(staff)).toEqual(['marketing']);
 expect(()=>requireSalesUser(staff)).toThrow('3PL 접근 권한이 없습니다.');
 expect(workspacePageAreas({...staff,accountDisabled:true})).toEqual([]);
 expect(canAccessAventPilot({id:'조보미',accountDisabled:false})).toBe(false);
 expect(workspacePageAreas({...staff,id:'another-marketer'})).toEqual(['marketing']);
 for(const user of [null,{id:AVENT_PILOT_STAFF,accountDisabled:true},{id:WORKSPACE_OWNER,accountDisabled:false}]){
  const execute=vi.fn(async()=>({}));const handler=createOwnerPilot({sessionId:async()=>AVENT_PILOT_STAFF,user:async()=>user,execute});
  expect((await handler(req())).status).toBe(403);expect(execute).not.toHaveBeenCalled();
 }
 let disabled=false;
 const handler=createOwnerPilot({sessionId:async()=>AVENT_PILOT_STAFF,user:async id=>({id,accountDisabled:disabled}),execute:async()=>{disabled=true;return {outputBase64:'must-not-leak'};}});
 const response=await handler(req());expect(response.status).toBe(403);expect(await response.text()).not.toContain('must-not-leak');
});

test('staff obeys origin, strict small JSON and readiness constraints',async()=>{
 const execute=vi.fn(async()=>({}));const handler=createOwnerPilot({sessionId:async()=>AVENT_PILOT_STAFF,user:async id=>({id,accountDisabled:false}),execute});
 for(const body of [{action:'run',sourceBase64:'fake'},{action:'run',profile:'sabang'},{action:'run',companyId:'OTHER'},{action:'run',padding:'x'.repeat(150)},{action:'dispatch'}])expect((await handler(req(body))).status).toBe(422);
 expect((await handler(req({action:'run'},'http://other'))).status).toBe(403);
 expect((await handler(new Request('http://localhost/api/avent/pilot',{method:'POST',headers:{origin:'http://localhost','content-type':'multipart/form-data'},body:'file'}))).status).toBe(422);
 const ready=await handler(new Request('http://localhost/api/avent/pilot'));
 expect(await ready.json()).toMatchObject({ready:true,syntheticOnly:true,uploadAllowed:false,dispatchEnabled:false});
 expect(execute).not.toHaveBeenCalled();
});
