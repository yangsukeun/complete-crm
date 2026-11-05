import { beforeEach, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({session:null as {user:{id:string}}|null,user:null as {id:string;role:string;department:string|null;accountDisabled:boolean}|null,list:vi.fn(),read:vi.fn(),save:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:async()=>f.session}));
vi.mock('@/lib/prisma',()=>({default:{user:{findUnique:async()=>f.user}}}));
vi.mock('@/lib/cs-complete-test-store',()=>({listTestReviews:f.list,readTestReview:f.read,saveTestReview:f.save,TestConflict:class extends Error{}}));
import { GET,PUT } from '../app/api/cs-complete-test/route';
import { syntheticSnapshot } from '../src/lib/cs-complete-test';
beforeEach(()=>{vi.clearAllMocks();f.session={user:{id:'synthetic-staff'}};f.user={id:'synthetic-staff',role:'USER',department:'OTHER',accountDisabled:false};f.list.mockResolvedValue([]);f.save.mockResolvedValue({id:'a'.repeat(64),version:1});});
const url='https://crm.example.invalid/api/cs-complete-test';
const source=syntheticSnapshot();const review={format:'cs-test-review-v1',source,testEntries:source.entries,attendance:[],audit:[]};
const put=(origin='https://crm.example.invalid')=>PUT(new Request(url,{method:'PUT',headers:{origin},body:JSON.stringify({review,expectedVersion:0})}));
it('allows ordinary active staff to list, save and reopen isolated TEST data',async()=>{
 expect((await GET(new Request(url))).status).toBe(200);expect((await put()).status).toBe(200);expect(f.save).toHaveBeenCalledWith(review,0,'synthetic-staff');
 f.read.mockResolvedValue({id:'a'.repeat(64),version:1,payload:review});const result=await GET(new Request(url+'?id='+'a'.repeat(64)));expect(result.status).toBe(200);expect((await result.json()).payload).toEqual(review);
});
it('blocks anonymous, disabled, missing users and cross-origin writes',async()=>{
 f.session=null;expect((await GET(new Request(url))).status).toBe(401);expect((await put()).status).toBe(401);
 f.session={user:{id:'synthetic-staff'}};f.user!.accountDisabled=true;expect((await GET(new Request(url))).status).toBe(403);expect((await put()).status).toBe(403);
 f.user=null;expect((await put()).status).toBe(403);
 f.user={id:'synthetic-staff',role:'USER',department:null,accountDisabled:false};expect((await put('https://other.invalid')).status).toBe(403);expect(f.save).not.toHaveBeenCalled();
});
