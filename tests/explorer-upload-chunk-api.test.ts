import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({auth:vi.fn(),verify:vi.fn()}));
vi.mock('@/auth',()=>({getAppSession:mock.auth}));
vi.mock('@/lib/drive/upload-session-token',()=>({verifyExplorerUploadSession:mock.verify}));
import {PUT} from '../app/api/drive/upload-chunk/route';
const req=(range='bytes 0-299/300',size=300)=>new Request('https://crm.test/api/drive/upload-chunk',{method:'PUT',headers:{'x-upload-session':'synthetic','content-range':range},body:new Uint8Array(size)});
beforeEach(()=>{mock.auth.mockResolvedValue({user:{id:'owner'}});mock.verify.mockReturnValue({ok:true,payload:{uid:'owner',size:300,mime:'application/pdf',gUrl:'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic'}});});
afterEach(()=>vi.unstubAllGlobals());
it('forwards synthetic bytes and preserves 308 without following redirect',async()=>{
 const upstream=vi.fn().mockResolvedValue(new Response(null,{status:308,headers:{Range:'bytes=0-255'}}));vi.stubGlobal('fetch',upstream);
 const response=await PUT(req());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:308,range:'bytes=0-255'});expect(upstream.mock.calls[0][1].redirect).toBe('manual');expect(upstream.mock.calls[0][1].body.length).toBe(300);
});
it.each([404,410,403,400])('does not disguise permanent upstream %s as retryable 502',async(status)=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));const response=await PUT(req());expect(response.status).toBe(status===404||status===410?410:422);expect(await response.json()).toMatchObject({retryable:false,googleStatus:status});
});
it('rejects unauthenticated, wrong user and malformed ranges before forwarding',async()=>{
 const upstream=vi.fn();vi.stubGlobal('fetch',upstream);mock.auth.mockResolvedValueOnce(null);expect((await PUT(req())).status).toBe(401);mock.auth.mockResolvedValueOnce({user:{id:'other'}});expect((await PUT(req())).status).toBe(403);expect((await PUT(req('bytes 0-299/999'))).status).toBe(400);expect((await PUT(req('bytes 0-299/300',299))).status).toBe(400);expect(upstream).not.toHaveBeenCalled();
});
