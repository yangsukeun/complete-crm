import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({session:vi.fn(),user:vi.fn(),findMany:vi.fn(),find:vi.fn(),create:vi.fn(),update:vi.fn(),tx:vi.fn(),pool:vi.fn(),notify:vi.fn(),consume:vi.fn(),adjust:vi.fn(),manager:vi.fn(),sync:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:f.session}));
vi.mock('@/lib/prisma',()=>({default:{user:{findUnique:f.user,findMany:f.findMany},leaveRequest:{findUnique:f.find,findMany:f.findMany,create:f.create,update:f.update},leaveBalance:{findUnique:vi.fn(async()=>null)},$transaction:f.tx}}));
vi.mock('@/lib/leave/calculate-pool',()=>({calculateLeavePool:f.pool}));
vi.mock('@/lib/notifications',()=>({createNotificationWithOptions:f.notify}));
vi.mock('@/lib/naver-calendar-sync',()=>({syncLeaveToNaverCalendar:vi.fn()}));
vi.mock('@/lib/leave/apply-approved-consumption',()=>({applyApprovedLeaveConsumption:f.consume,reverseApprovedLeaveConsumption:vi.fn()}));
vi.mock('@/lib/leave/apply-manual-adjustment',()=>({applyManualLeaveAdjustment:f.adjust}));
vi.mock('@/lib/leave/legacy-carry-sync',()=>({ensureLegacyCarryAccrual:vi.fn(),LEGACY_CARRY_ACCRUAL_YMD:'2026-01-01'}));
vi.mock('@/lib/leave-balance-sync',()=>({syncLeaveBalanceAnnualTotalIfStale:f.sync}));
vi.mock('@/lib/leave',()=>({getCurrentLeaveCalendarYearKst:()=>2026,completedFullMonthsSinceJoinKst:()=>1}));
vi.mock('@/lib/employee-admin-access-db',()=>({getEmployeeManagerContext:f.manager}));
import {GET as list,POST as apply} from '../app/api/leave/route';
import {PATCH as change} from '../app/api/leave/[id]/route';
import {GET as summary} from '../app/api/admin/employee-leave-summary/route';
import {GET as detail} from '../app/api/admin/employee-leave-detail/[userId]/route';
import {POST as adjust} from '../app/api/admin/employee-leave-detail/[userId]/adjust/route';
import {GET as balance} from '../app/api/users/[id]/leave-balance/route';
const req=(body:unknown={})=>new Request('https://synthetic.invalid/leave',{method:'POST',body:JSON.stringify(body)});
const endpoints=[
 ['list',()=>list()],['apply',()=>apply(req())],['change',()=>change(req(),{params:Promise.resolve({id:'leave'})})],
 ['summary',()=>summary(req())],['detail',()=>detail(req(),{params:Promise.resolve({userId:'target'})})],
 ['adjust',()=>adjust(req({days:1,reason:'synthetic'}),{params:Promise.resolve({userId:'target'})})],
 ['balance',()=>balance(req(),{params:Promise.resolve({id:'target'})})],
] as const;
const applicant={id:'leave',userId:'applicant',type:'ANNUAL',startDate:new Date('2026-11-04T00:00:00Z'),endDate:new Date('2026-11-04T00:00:00Z'),status:'TEAM_LEAD_APPROVED',user:{role:'USER',department:'마케팅',name:'synthetic'}};
beforeEach(()=>{
 vi.resetAllMocks();f.session.mockResolvedValue({user:{id:'viewer',role:'ADMIN',department:'old'}});
 f.user.mockResolvedValue({id:'viewer',role:'USER',department:'CS팀',accountDisabled:false});
 f.findMany.mockResolvedValue([]);f.find.mockResolvedValue(applicant);
 f.pool.mockResolvedValue({available:10,displayGranted:10,periodGranted:{validCarry:0,periodGranted:10}});
 f.create.mockImplementation(async({data})=>({...data,id:'new',user:{name:'synthetic',department:'CS팀',role:'USER'}}));
 f.update.mockImplementation(async({data})=>({...applicant,...data}));
 f.tx.mockImplementation(async fn=>fn({leaveRequest:{update:f.update}}));
 f.adjust.mockResolvedValue({id:'synthetic-adjustment'});
});
for(const [name,call] of endpoints){
 it(`${name}: denies disabled/deleted actor before leave reads or writes`,async()=>{
  for(const actor of [null,{id:'viewer',role:'ADMIN',department:'CS팀',accountDisabled:true}]){
   f.user.mockResolvedValue(actor);expect((await call()).status).toBe(403);
  }
  expect(f.find).not.toHaveBeenCalled();expect(f.findMany).not.toHaveBeenCalled();expect(f.create).not.toHaveBeenCalled();expect(f.tx).not.toHaveBeenCalled();expect(f.pool).not.toHaveBeenCalled();expect(f.manager).not.toHaveBeenCalled();
 });
 it(`${name}: lookup failure is fail-closed`,async()=>{f.user.mockRejectedValue(Error('synthetic DB unavailable'));expect((await call()).status).toBe(503);expect(f.pool).not.toHaveBeenCalled();expect(f.tx).not.toHaveBeenCalled();expect(f.find).not.toHaveBeenCalled();});
 it(`${name}: anonymous never reaches DB`,async()=>{f.session.mockResolvedValue(null);expect([401,403]).toContain((await call()).status);expect(f.user).not.toHaveBeenCalled();});
}
it.each(['ADMIN','EXECUTIVE','TEAM_LEAD'])('list ignores stale %s role and uses current CS USER scope',async role=>{
 f.session.mockResolvedValue({user:{id:'viewer',role,department:'old'}});expect((await list()).status).toBe(200);
 expect(f.findMany.mock.calls[0][0].where).toEqual({OR:[{status:'APPROVED',user:{department:{in:['CS','CS팀']}}},{userId:'viewer'}]});
});
it.each(['TEAM_LEAD','CENTER_CHIEF'])('application does not skip first approval for demoted %s',async role=>{
 f.session.mockResolvedValue({user:{id:'viewer',role}});expect((await apply(req({type:'ANNUAL',startDate:'2026-11-04',endDate:'2026-11-04',userId:'other',status:'APPROVED'}))).status).toBe(200);
 expect(f.create.mock.calls[0][0].data).toMatchObject({userId:'viewer',status:'PENDING'});
});
it.each(['ADMIN','EXECUTIVE'])('demoted %s cannot final approve or adjust',async role=>{
 f.session.mockResolvedValue({user:{id:'viewer',role}});expect((await change(req({status:'APPROVED'}),{params:Promise.resolve({id:'leave'})})).status).toBe(403);
 expect((await adjust(req({days:1,reason:'synthetic'}),{params:Promise.resolve({userId:'target'})})).status).toBe(403);expect(f.tx).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();
});
it('current CS team lead retains first approval and self approval stays denied',async()=>{
 f.user.mockResolvedValue({id:'viewer',role:'TEAM_LEAD',department:'CS팀',accountDisabled:false});
 f.find.mockResolvedValue({...applicant,status:'PENDING',user:{...applicant.user,department:'CS팀'}});
 expect((await change(req({status:'TEAM_LEAD_APPROVED'}),{params:Promise.resolve({id:'leave'})})).status).toBe(200);
 f.find.mockResolvedValue({...applicant,userId:'viewer'});expect((await change(req({status:'APPROVED'}),{params:Promise.resolve({id:'leave'})})).status).toBe(403);
});
it('current executive retains final approval despite stale USER session',async()=>{
 f.session.mockResolvedValue({user:{id:'viewer',role:'USER'}});f.user.mockResolvedValue({id:'viewer',role:'EXECUTIVE',department:'경영지원',accountDisabled:false});
 expect((await change(req({status:'APPROVED'}),{params:Promise.resolve({id:'leave'})})).status).toBe(200);expect(f.consume).toHaveBeenCalledOnce();
});
it('current executive retains manual adjustment',async()=>{
 f.user.mockResolvedValueOnce({id:'viewer',role:'EXECUTIVE',department:'경영지원',accountDisabled:false}).mockResolvedValueOnce({id:'target'});
 expect((await adjust(req({days:1,reason:'synthetic'}),{params:Promise.resolve({userId:'target'})})).status).toBe(200);expect(f.adjust).toHaveBeenCalledOnce();
});
