import {beforeEach,test,expect,vi} from 'vitest';
import {AVENT_PILOT_STAFF} from '../src/lib/avent/pilot-access';
import {WORKSPACE_OWNER} from '../src/lib/workspace-areas';
const f=vi.hoisted(()=>({session:vi.fn(),user:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:f.session}));
vi.mock('@/lib/prisma',()=>({default:{user:{findUnique:f.user}}}));
vi.mock('next/navigation',()=>({redirect:(p:string)=>{throw Error(`redirect:${p}`);},notFound:()=>{throw Error('NOT_FOUND');}}));
import Page from '../app/logistics/orders/page';
import GeneralPage from '../app/logistics/orders/general/page';
import Home from '../app/workspaces/[area]/page';
beforeEach(()=>vi.resetAllMocks());

test('page admits only enabled exact owner or designated staff from current DB',async()=>{
 for(const id of [WORKSPACE_OWNER,AVENT_PILOT_STAFF]){
  f.session.mockResolvedValue({user:{id}});f.user.mockResolvedValue({id,accountDisabled:false});
  await expect(Page()).resolves.toBeDefined();
  f.user.mockResolvedValue({id,accountDisabled:true});await expect(Page()).rejects.toThrow('NOT_FOUND');
  f.user.mockResolvedValue(null);await expect(Page()).rejects.toThrow('NOT_FOUND');
 }
 for(const id of ['STAFF','ADMIN','조보미']){
  f.user.mockClear();f.session.mockResolvedValue({user:{id,role:'ADMIN'}});
  await expect(Page()).rejects.toThrow('NOT_FOUND');expect(f.user).not.toHaveBeenCalled();
 }
 f.user.mockClear();f.session.mockResolvedValue(null);
 await expect(Page()).rejects.toThrow('redirect:/login');expect(f.user).not.toHaveBeenCalled();
});

test('designated marketing staff gets only pilot navigation flags from server home',async()=>{
 f.session.mockResolvedValue({user:{id:AVENT_PILOT_STAFF}});
 f.user.mockResolvedValue({id:AVENT_PILOT_STAFF,department:'마케팅',accountDisabled:false});
 const page=await Home({params:Promise.resolve({area:'logistics'})});
 expect(page.props).toMatchObject({aventPilot:true,owner:false,limitedAccess:true});
 f.user.mockResolvedValue({id:AVENT_PILOT_STAFF,department:'마케팅',accountDisabled:true});
 await expect(Home({params:Promise.resolve({area:'logistics'})})).rejects.toThrow('NOT_FOUND');
});

test('general file review keeps the same exact account and disabled-account boundary',async()=>{
 for(const id of [WORKSPACE_OWNER,AVENT_PILOT_STAFF]){
  f.session.mockResolvedValue({user:{id}});f.user.mockResolvedValue({id,accountDisabled:false});await expect(GeneralPage()).resolves.toBeDefined();
  f.user.mockResolvedValue({id,accountDisabled:true});await expect(GeneralPage()).rejects.toThrow('NOT_FOUND');
 }
 f.session.mockResolvedValue({user:{id:'ADMIN',role:'ADMIN'}});await expect(GeneralPage()).rejects.toThrow('NOT_FOUND');
 f.session.mockResolvedValue(null);await expect(GeneralPage()).rejects.toThrow('redirect:/login');
});
