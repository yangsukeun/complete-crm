import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({session:vi.fn(),user:vi.fn(),mode:vi.fn(),client:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:f.session}));
vi.mock('@/lib/prisma',()=>({default:{user:{findUnique:f.user}}}));
vi.mock('@/lib/app-mode-server',()=>({resolveAppModeForUser:f.mode}));
vi.mock('next/headers',()=>({cookies:async()=>({})}));
vi.mock('next/navigation',()=>({redirect:(p:string)=>{throw Error(`redirect:${p}`)},notFound:()=>{throw Error('NOT_FOUND')}}));
vi.mock('../app/leave/leave-page-client',()=>({LeavePageClient:f.client}));
import Page from '../app/cs-tools/leave/page';
beforeEach(()=>{vi.resetAllMocks();f.session.mockResolvedValue({user:{id:'synthetic-cs',role:'ADMIN',department:'경영지원'}});f.user.mockResolvedValue({role:'USER',department:'CS팀',accountDisabled:false});f.mode.mockResolvedValue('company');});
it('renders the existing application with current USER flags, not stale ADMIN claims',async()=>{
 const result=await Page();const client=result.props.children[1];
 expect(client.props).toMatchObject({isTeamLead:false,isCsCenterChief:false,isExecutive:false,csScreen:true});
 expect(f.client).not.toHaveBeenCalled(); // no mounting, fetch or leave GET
});
it.each([['TEAM_LEAD',true,false],['CENTER_CHIEF',false,true]])('retains %s flags without executive adjustment',async(role,lead,chief)=>{
 f.user.mockResolvedValue({role,department:'CS팀',accountDisabled:false});
 const result=await Page();expect(result.props.children[1].props).toMatchObject({isTeamLead:lead,isCsCenterChief:chief,isExecutive:false});
});
it('denies management USER and other departments despite stale CS session',async()=>{
 f.session.mockResolvedValue({user:{id:'synthetic',role:'USER',department:'CS팀'}});
 for(const department of ['경영지원','마케팅','물류']){f.user.mockResolvedValue({role:'USER',department,accountDisabled:false});await expect(Page()).rejects.toThrow('NOT_FOUND');}
 expect(f.mode).not.toHaveBeenCalled();
});
it('denies disabled/missing account before leave client mounts',async()=>{
 f.user.mockResolvedValueOnce(null).mockResolvedValueOnce({role:'ADMIN',department:'CS팀',accountDisabled:true});
 await expect(Page()).rejects.toThrow('NOT_FOUND');await expect(Page()).rejects.toThrow('NOT_FOUND');expect(f.client).not.toHaveBeenCalled();
});
it('redirects anonymous and personal mode without running the leave client',async()=>{
 f.session.mockResolvedValueOnce(null);await expect(Page()).rejects.toThrow('redirect:/login');expect(f.user).not.toHaveBeenCalled();
 f.mode.mockResolvedValue('personal');await expect(Page()).rejects.toThrow('redirect:/choose-mode');expect(f.client).not.toHaveBeenCalled();
});
