import {beforeEach,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({actor:'staff' as string|null,assignees:[] as string[],user:{role:'USER',department:'물류',additionalDepartments:null,accountDisabled:false},rows:[] as object[],findMany:vi.fn(),findUnique:vi.fn(),findFirst:vi.fn(),update:vi.fn(),remove:vi.fn(),count:vi.fn(),users:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:async()=>f.actor?{user:{id:f.actor,role:'ADMIN'}}:null}));
vi.mock('@/lib/prisma',()=>({default:{user:{findUnique:async()=>f.user,findMany:f.users},paymentRequest:{findMany:f.findMany,findUnique:f.findUnique,findFirst:f.findFirst,update:f.update,delete:f.remove},paymentRequestAlert:{count:f.count},vendor:{findUnique:f.findUnique,update:f.update,delete:f.remove}}}));
vi.mock('@/lib/permissions-resolve',()=>({resolveEffectivePermissionsJson:async()=>null}));
vi.mock('@/lib/finance-payment-request-alerts',()=>({loadTransferExecutorIds:async()=>f.assignees,ensurePaymentRequestAlerts:vi.fn(),notifyCenterChiefsOnCsTeamLeadApproval:vi.fn(),notifyExecutivesOnTeamLeadApproval:vi.fn(),notifyPaymentRequestDeleted:vi.fn(),notifyTransferExecutorsOnApproval:vi.fn()}));
import {resolveFinanceAccess,redactPaymentBank} from '../src/lib/finance-access';
import {attachmentIdentity,mayDownloadFinanceAttachment} from '../src/lib/finance-attachment-access';
import {GET as list} from '../app/api/finance/requests/route';
import {GET,PATCH,DELETE} from '../app/api/finance/requests/[id]/route';
import {GET as vendorDetail,PATCH as vendorUpdate} from '../app/api/finance/vendors/[id]/route';
beforeEach(()=>{vi.clearAllMocks();f.actor='staff';f.assignees=[];f.user={role:'USER',department:'물류',additionalDepartments:null,accountDisabled:false};f.findMany.mockResolvedValue([]);f.findFirst.mockResolvedValue(null);f.count.mockResolvedValue(0);f.users.mockResolvedValue([]);});
it('uses fresh account and exact owner rather than session ADMIN or transfer assignment',async()=>{
 expect((await resolveFinanceAccess('staff')).scope.kind).toBe('SELF');f.user.accountDisabled=true;await expect(resolveFinanceAccess('staff')).rejects.toThrow();
});
it('list filters data at query and response and does not write; unauthenticated is denied',async()=>{
 f.findMany.mockResolvedValue([{id:'own',requesterId:'staff',status:'PENDING',attachments:[],vendor:{accountNumber:'private'}},{id:'other',requesterId:'other',status:'PENDING',attachments:[]}]);
 const res=await list();const data=await res.json();expect(data.requests.map((r:{id:string})=>r.id)).toEqual(['own']);expect(data.requests[0].vendor.accountNumber).toBe('');expect(f.findMany.mock.calls[0][0].where).toEqual({requesterId:'staff'});expect(f.update).not.toHaveBeenCalled();expect(res.headers.get('cache-control')).toBe('private, no-store');
 f.actor=null;expect((await list()).status).toBe(401);
});
it('rejects other staff direct detail, status and delete IDs before mutation',async()=>{
 f.findUnique.mockResolvedValue({id:'other-id',requesterId:'other',status:'PENDING',requester:{department:'CS팀'}});
 const params={params:Promise.resolve({id:'other-id'})};
 expect((await GET(new Request('https://crm.test'),params)).status).toBe(403);
 expect((await PATCH(new Request('https://crm.test',{method:'PATCH',body:JSON.stringify({status:'COMPLETED'})}),params)).status).toBe(403);
 expect((await DELETE(new Request('https://crm.test',{method:'DELETE',body:'{}'}),params)).status).toBe(403);
 expect(f.update).not.toHaveBeenCalled();expect(f.remove).not.toHaveBeenCalled();
});
it('team scope permits only existing team and hides bank data',async()=>{
 f.user.role='TEAM_LEAD';const {scope}=await resolveFinanceAccess('staff');expect(scope.kind).toBe('DEPARTMENT');
 expect(redactPaymentBank({requesterId:'other',vendor:{accountNumber:'private'}},scope).vendor.accountNumber).toBe('');
 f.findMany.mockResolvedValue([{requesterId:'other',requester:{department:'CS팀'},attachment:'https://drive.google.com/file/d/file-id/view',attachments:null}]);
 expect(await mayDownloadFinanceAttachment('staff','https://drive.google.com/uc?id=file-id&export=download')).toBe(false);
 f.findMany.mockResolvedValue([{requesterId:'other',requester:{department:'물류'},attachment:'https://x.public.blob.vercel-storage.com/file.pdf',attachments:null}]);
 expect(await mayDownloadFinanceAttachment('staff','https://x.public.blob.vercel-storage.com/file.pdf?download=1')).toBe(true);
 expect(attachmentIdentity('https://x.test/a%20b?x=1')).toBe(attachmentIdentity('https://x.test/a b'));
});
it('vendor direct access and edits cannot use another requester vendor',async()=>{
 const params={params:Promise.resolve({id:'other-vendor'})};
 expect((await vendorDetail(new Request('https://crm.test'),params)).status).toBe(403);
 f.findMany.mockResolvedValue([{requesterId:'other'}]);
 expect((await vendorUpdate(new Request('https://crm.test',{method:'PATCH',body:JSON.stringify({accountNumber:'forged'})}),params)).status).toBe(403);
 expect(f.update).not.toHaveBeenCalled();
});
it('designated transfer executor can read all and bank/attachment data without new mutation rights',async()=>{
 f.assignees=['staff'];
 expect((await resolveFinanceAccess('staff')).scope.kind).toBe('ALL');
 expect((await resolveFinanceAccess('staff','write')).scope.kind).toBe('SELF');
 const row={id:'other-id',requesterId:'other',status:'PENDING',requester:{department:'CS팀'},vendor:{accountNumber:'synthetic-account'}};
 f.findMany.mockResolvedValue([row]);const listed=await (await list()).json();expect(listed.requests).toHaveLength(1);expect(listed.requests[0].canActWithinScope).toBe(false);expect(listed.requests[0].vendor.accountNumber).toBe('synthetic-account');
 f.findUnique.mockResolvedValue(row);const params={params:Promise.resolve({id:'other-id'})};
 const response=await GET(new Request('https://crm.test'),params);expect(response.status).toBe(200);expect((await response.json()).vendor.accountNumber).toBe('synthetic-account');
 expect(await mayDownloadFinanceAttachment('staff','https://drive.google.com/file/d/synthetic/view')).toBe(true);
 expect((await PATCH(new Request('https://crm.test',{method:'PATCH',body:JSON.stringify({status:'COMPLETED'})}),params)).status).toBe(403);
 expect((await DELETE(new Request('https://crm.test',{method:'DELETE',body:'{}'}),params)).status).toBe(403);
 expect(f.update).not.toHaveBeenCalled();expect(f.remove).not.toHaveBeenCalled();
 f.assignees=[];f.user.role='ADMIN';expect((await resolveFinanceAccess('staff')).scope.kind).toBe('SELF');
});
