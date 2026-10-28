import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({id:'cmmitn4830000fc0jt8c1l2jf' as string|null,department:'',disabled:false}));
vi.mock('@/auth',()=>({getAppSession:async()=>state.id?{user:{id:state.id}}:null}));
vi.mock('@/lib/prisma',()=>({default:{user:{findUnique:async()=>({id:state.id,department:state.department,accountDisabled:state.disabled})}}}));
import {GET,POST} from '../app/api/logistics-ocr/route';
it('uses current owner/logistics access and reports disconnected without accepting writes',async()=>{
 expect(await (await GET()).json()).toMatchObject({uploadConnected:false,workerConnected:false,inventoryConnected:false});
 expect((await POST(new Request('https://crm.test/api/logistics-ocr',{method:'POST',headers:{origin:'https://crm.test'},body:'{}'}))).status).toBe(503);
 expect((await POST(new Request('https://crm.test/api/logistics-ocr',{method:'POST',headers:{origin:'https://other.test'}}))).status).toBe(403);
 state.id='staff';state.department='물류';expect((await GET()).status).toBe(200);
 state.department='마케팅';expect((await GET()).status).toBe(403);
 state.department='물류';state.disabled=true;expect((await GET()).status).toBe(403);
 state.id=null;expect((await GET()).status).toBe(401);
});
