import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({session:vi.fn(),user:vi.fn(),read:vi.fn(),create:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:mock.session}));
vi.mock('@/lib/prisma',()=>({default:{user:{findUnique:mock.user},dailyWorkLog:{findUnique:mock.read}}}));
vi.mock('@/lib/permissions-resolve',()=>({resolveEffectivePermissionsJson:async()=>null}));
vi.mock('@/lib/notifications',()=>({createNotificationWithOptions:vi.fn()}));
vi.mock('@/lib/activity-log',()=>({getOrCreateDailyWorkLog:mock.create,stripTaskStatusMarkers:(s:string)=>s,extractTaskStatusMarkers:()=>''}));
import {GET} from '../app/api/work-logs/route';
import {MARKETING_LOG_REVIEWER,MARKETING_LOG_TARGETS} from '../src/lib/work-log-review-scope';
const target=[...MARKETING_LOG_TARGETS][0];
const request=(id=target,date='2026-10-28')=>new Request(`https://crm.test/api/work-logs?userId=${id}&date=${date}`);
describe('named reviewer direct API',()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mock.session.mockResolvedValue({user:{id:MARKETING_LOG_REVIEWER,role:'TEAM_LEAD'}});
  mock.user.mockImplementation(async({where}:{where:{id:string}})=>({id:where.id,role:where.id===MARKETING_LOG_REVIEWER?'TEAM_LEAD':'USER',department:'마케팅',accountDisabled:false}));
  mock.read.mockResolvedValue({id:'synthetic-log',date:'2026-10-28',content:'synthetic',status:'SUBMITTED'});
 });
 it.each([...MARKETING_LOG_TARGETS])('reads exact target %s/date without creating staff drafts',async(target)=>{
  const response=await GET(request(target));expect(response.status).toBe(200);
  expect(mock.read).toHaveBeenCalledWith({where:{userId_date:{userId:target,date:'2026-10-28'}}});
  expect(mock.create).not.toHaveBeenCalled();expect(response.headers.get('cache-control')).toBe('private, no-store');
 });
 it.each(['cmmitn4830000fc0jt8c1l2jf','unlisted'])('blocks direct target %s before log read',async(id)=>{
  expect((await GET(request(id))).status).toBe(403);expect(mock.read).not.toHaveBeenCalled();expect(mock.create).not.toHaveBeenCalled();
 });
 it('blocks anonymous, inactive viewer and other ordinary team lead',async()=>{
  mock.session.mockResolvedValueOnce(null);expect((await GET(request())).status).toBe(401);
  mock.user.mockResolvedValueOnce({id:MARKETING_LOG_REVIEWER,role:'TEAM_LEAD',department:'마케팅',accountDisabled:true});expect((await GET(request())).status).toBe(403);
  mock.session.mockResolvedValueOnce({user:{id:'other-lead',role:'TEAM_LEAD'}});expect((await GET(request())).status).toBe(403);expect(mock.read).not.toHaveBeenCalled();
 });
 it('blocks moved or disabled targets',async()=>{
  mock.user.mockResolvedValueOnce({id:MARKETING_LOG_REVIEWER,role:'TEAM_LEAD',department:'마케팅',accountDisabled:false}).mockResolvedValueOnce({id:target,role:'USER',department:'CS',accountDisabled:false});
  expect((await GET(request())).status).toBe(403);
  mock.user.mockResolvedValueOnce({id:MARKETING_LOG_REVIEWER,role:'TEAM_LEAD',department:'마케팅',accountDisabled:false}).mockResolvedValueOnce({id:target,role:'USER',department:'마케팅',accountDisabled:true});
  expect((await GET(request())).status).toBe(403);expect(mock.read).not.toHaveBeenCalled();
 });
 it('validates date and returns missing day without generating it',async()=>{
  expect((await GET(request(target,'2026-02-30'))).status).toBe(400);
  mock.read.mockResolvedValueOnce(null);expect((await GET(request())).status).toBe(404);expect(mock.create).not.toHaveBeenCalled();
 });
});
