import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({session:vi.fn(),user:vi.fn(),read:vi.fn(),create:vi.fn(),update:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:f.session}));
vi.mock('@/lib/prisma',()=>({default:{user:{findUnique:f.user},dailyWorkLog:{findUnique:f.read,update:f.update}}}));
vi.mock('@/lib/permissions-resolve',()=>({resolveEffectivePermissionsJson:async()=>null}));
vi.mock('@/lib/notifications',()=>({createNotificationWithOptions:vi.fn()}));
vi.mock('@/lib/activity-log',()=>({getOrCreateDailyWorkLog:f.create,stripTaskStatusMarkers:(s:string)=>s,extractTaskStatusMarkers:()=>''}));
import {GET,PATCH} from '../app/api/work-logs/route';
import {canViewOthersDailyWorkLog,hasDailyReportMenuAccess} from '../src/lib/work-log-access';
import {GOPRO_LOG_REVIEWER as id} from '../src/lib/work-log-review-scope';
import {WORKSPACE_OWNER} from '../src/lib/workspace-areas';
const viewer={id,role:'USER',department:'경영지원',accountDisabled:false};
const req=(target='cmqu62595000d94im1hdpj79t')=>new Request(`https://crm.test/api/work-logs?userId=${target}&date=2026-10-29`);
beforeEach(()=>{vi.resetAllMocks();f.session.mockResolvedValue({user:{id,role:'USER'}});f.user.mockImplementation(async({where}:{where:{id:string}})=>where.id===id?viewer:{id:where.id,role:'USER',department:'마케팅',accountDisabled:false});f.read.mockResolvedValue({id:'synthetic',content:'synthetic',status:'SUBMITTED'});});
it('shows menu and permits Jo Bomi and staff across departments without generating drafts',async()=>{
 expect(hasDailyReportMenuAccess(viewer)).toBe(true);
 for(const department of ['마케팅','CS','물류','경영지원']) expect(canViewOthersDailyWorkLog({viewerId:id,viewerRole:'USER',viewerDepartment:'경영지원',target:{id:'staff',role:'USER',department}})).toBe(true);
 const res=await GET(req());expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');expect(f.create).not.toHaveBeenCalled();
});
it.each(['ADMIN','EXECUTIVE','TEAM_LEAD','CENTER_CHIEF'])('denies target role %s before reading',async role=>{f.user.mockResolvedValueOnce(viewer).mockResolvedValueOnce({id:'other',role,department:'경영지원'});expect((await GET(req('other'))).status).toBe(403);expect(f.read).not.toHaveBeenCalled();});
it('blocks owner ID even with staff role and disabled staff',async()=>{
 expect((await GET(req(WORKSPACE_OWNER))).status).toBe(403);
 f.user.mockResolvedValueOnce(viewer).mockResolvedValueOnce({id:'disabled',role:'USER',accountDisabled:true});expect((await GET(req('disabled'))).status).toBe(403);expect(f.read).not.toHaveBeenCalled();
});
it('blocks anonymous, disabled GoPro, other staff and changed GoPro role',async()=>{
 f.session.mockResolvedValueOnce(null);expect((await GET(req())).status).toBe(401);
 for(const changed of [{...viewer,accountDisabled:true},{...viewer,role:'ADMIN'},{...viewer,department:'물류'},{...viewer,id:'other'}])expect(hasDailyReportMenuAccess({...changed,permissions:'[]'})).toBe(false);
 f.user.mockResolvedValueOnce({...viewer,accountDisabled:true});expect((await GET(req())).status).toBe(403);
});
it('does not turn read access into another employee edit',async()=>{
 f.read.mockResolvedValueOnce(null);
 expect((await PATCH(new Request('https://crm.test/api/work-logs',{method:'PATCH',body:JSON.stringify({userId:'other',date:'2026-10-29',content:'forged'})}))).status).toBe(404);
 expect(f.read).toHaveBeenCalledWith({where:{userId_date:{userId:id,date:'2026-10-29'}}});expect(f.update).not.toHaveBeenCalled();
});
it('missing staff report is read-only 404',async()=>{f.read.mockResolvedValueOnce(null);expect((await GET(req())).status).toBe(404);expect(f.create).not.toHaveBeenCalled();});
