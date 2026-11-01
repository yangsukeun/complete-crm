import {describe,it,expect} from 'vitest';
import {readWorkLogResponse,validWorkLogDate} from '../src/lib/work-log-response';
describe('Daily Report response classification',()=>{
 it('distinguishes missing record from a saved empty draft and submitted body',async()=>{
  expect(await readWorkLogResponse(Response.json({code:'WORK_LOG_NOT_FOUND'},{status:404}))).toEqual({kind:'missing'});
  expect(await readWorkLogResponse(Response.json({content:'',status:'DRAFT'}))).toMatchObject({kind:'loaded',content:'',status:'DRAFT'});
  expect(await readWorkLogResponse(Response.json({content:'synthetic report',status:'SUBMITTED'}))).toMatchObject({kind:'loaded',content:'synthetic report'});
 });
 it.each([400,401,403,404,429,500,503])('keeps HTTP %s errors distinct from missing',async status=>{
  expect(await readWorkLogResponse(Response.json({error:'synthetic'},{status}))).toMatchObject({kind:'error'});
 });
 it('rejects login HTML and malformed successful responses',async()=>{
  expect(await readWorkLogResponse(new Response('<html>login</html>',{status:200}))).toMatchObject({kind:'error'});
  expect(await readWorkLogResponse(Response.json({content:null,status:'DRAFT'}))).toMatchObject({kind:'error'});
 });
 it('validates actual calendar dates without converting KST date identifiers',()=>{
  expect(validWorkLogDate('2026-10-31')).toBe(true);expect(validWorkLogDate('2026-11-01')).toBe(true);
  for(const date of ['', '2026-02-30', '2026-13-01','2026-10-31T15:00:00Z'])expect(validWorkLogDate(date)).toBe(false);
 });
});
