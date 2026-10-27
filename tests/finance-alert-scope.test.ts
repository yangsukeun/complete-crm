import {it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({insert:vi.fn().mockResolvedValue(1),notify:vi.fn()}));
vi.mock('@/lib/prisma',()=>({default:{paymentRequest:{findUnique:async()=>({requesterId:'requester',requester:{department:'CS팀',name:'Synthetic'},vendor:{name:'Synthetic'},amount:10,status:'PENDING'})},$executeRawUnsafe:f.insert}}));
vi.mock('@/lib/notifications',()=>({createNotificationWithOptions:f.notify}));
vi.mock('@/lib/finance-access',()=>({resolveFinanceAccess:async(id:string)=>({scope:{kind:id==='owner'?'ALL':id==='lead'?'DEPARTMENT':'SELF',userId:id,departments:id==='lead'?['CS팀']:[],department:null,isTransferExecutor:false,label:'test'}})}));
import {ensurePaymentRequestAlerts} from '../src/lib/finance-payment-request-alerts';
it('does not create or send financial notifications to out-of-scope recipients',async()=>{
 await ensurePaymentRequestAlerts('synthetic',['owner','lead','requester','unrelated','unrelated']);
 expect(f.insert.mock.calls.map(c=>c[3])).toEqual(['owner','lead','requester']);
 expect(f.notify.mock.calls.map(c=>c[0].userId)).toEqual(['owner','lead','requester']);
});
