import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({executor:true,session:true,rows:[] as {id:string;status:string;requesterId:string;requester:{role:string}}[],changed:vi.fn(),latest:vi.fn(),alerts:vi.fn(),read:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:async()=>f.session?{user:{id:'executor'}}:null}));
vi.mock('@/lib/finance-access',()=>({resolveFinanceAccess:async()=>({scope:{isTransferExecutor:f.executor}})}));
vi.mock('@/lib/prisma',()=>({default:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({paymentRequest:{findMany:async()=>f.rows,updateMany:f.changed,findUnique:f.latest},paymentRequestAlert:{createMany:f.alerts,updateMany:f.read}})}}));
import {recordTransferCompletion} from '../src/lib/finance-transfer-completion';
import {canRecordTransferCompletion} from '../src/lib/finance-transfer-completion-policy';
import {WORKSPACE_OWNER} from '../src/lib/workspace-areas';
import {POST} from '../app/api/finance/requests/batch-complete/route';
beforeEach(()=>{vi.clearAllMocks();f.executor=true;f.session=true;f.rows=[{id:'r',status:'TEAM_LEAD_APPROVED',requesterId:'other-department-employee',requester:{role:'USER'}}];f.changed.mockResolvedValue({count:1});});
describe('completion-only permission and idempotency',()=>{
 it('allows designated executor to record another employee approved request',async()=>{
  expect((await recordTransferCompletion('executor',['r','r'])).count).toBe(1);
  expect(f.changed).toHaveBeenCalledTimes(1);expect(f.alerts).toHaveBeenCalledTimes(1);
  expect(f.changed.mock.calls[0][0].where.status).toBe('TEAM_LEAD_APPROVED');
 });
 it('rejects ordinary users before write',async()=>{f.executor=false;await expect(recordTransferCompletion('ordinary',['r'])).rejects.toMatchObject({status:403});expect(f.changed).not.toHaveBeenCalled();});
 it('does not broaden representative or executive requests',async()=>{
  for(const role of ['ADMIN','EXECUTIVE'])expect(canRecordTransferCompletion(true,{requesterId:'private',requester:{role}})).toBe(false);
  expect(canRecordTransferCompletion(true,{requesterId:WORKSPACE_OWNER,requester:{role:'USER'}})).toBe(false);
  expect(canRecordTransferCompletion(true,{requesterId:'unknown'})).toBe(false);
  f.rows[0].requester.role='EXECUTIVE';await expect(recordTransferCompletion('executor',['r'])).rejects.toMatchObject({status:403});
 });
 it('rejects unapproved and rejected requests',async()=>{for(const status of ['PENDING','EXECUTIVE_PENDING','CENTER_CHIEF_APPROVED','REJECTED']){f.rows[0].status=status;await expect(recordTransferCompletion('executor',['r'])).rejects.toMatchObject({status:409});}expect(f.changed).not.toHaveBeenCalled();});
 it('duplicate completion preserves timestamp and creates no second alert',async()=>{f.rows[0].status='COMPLETED';expect(await recordTransferCompletion('executor',['r'])).toMatchObject({count:0,noOp:true});expect(f.changed).not.toHaveBeenCalled();expect(f.alerts).not.toHaveBeenCalled();});
 it('concurrent winner is accepted without repeated notification',async()=>{f.changed.mockResolvedValue({count:0});f.latest.mockResolvedValue({status:'COMPLETED'});expect((await recordTransferCompletion('executor',['r'])).noOp).toBe(true);expect(f.alerts).not.toHaveBeenCalled();});
 it('concurrent approval cancellation is not overwritten',async()=>{f.changed.mockResolvedValue({count:0});f.latest.mockResolvedValue({status:'PENDING'});await expect(recordTransferCompletion('executor',['r'])).rejects.toMatchObject({status:409});expect(f.alerts).not.toHaveBeenCalled();});
 it('batch API requires login and rejects mixed missing IDs',async()=>{f.session=false;expect((await POST(new Request('https://crm.test',{method:'POST',body:'{"ids":["r"]}'}))).status).toBe(401);f.session=true;await expect(recordTransferCompletion('executor',['r','missing'])).rejects.toMatchObject({status:403});expect(f.changed).not.toHaveBeenCalled();});
});
