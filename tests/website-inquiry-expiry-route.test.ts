import {afterEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('@/lib/prisma',()=>({default:{}}));
vi.mock('@/lib/website-inquiry-expiry-pg',()=>({inquiryExpiryStore:()=>({})}));
vi.mock('@/lib/website-inquiry-expiry',()=>({sendInquiryExpiryNotice:mock.send}));
import {GET} from '../app/api/cron/website-inquiry-key-expiry/route';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();mock.send.mockReset();});
it('requires existing cron authentication before reading config or writing alerts',async()=>{
 vi.stubEnv('CRON_SECRET','synthetic-cron-only');
 expect((await GET(new Request('https://crm.invalid/api/cron/website-inquiry-key-expiry'))).status).toBe(401);
 expect(mock.send).not.toHaveBeenCalled();
});
it('authenticated run fails closed without intake configuration and distinguishes alert failure',async()=>{
 vi.stubEnv('CRON_SECRET','synthetic-cron-only');vi.stubEnv('CRM_WEBSITE_INTAKE_ENABLED','false');
 const request=()=>new Request('https://crm.invalid/api/cron/website-inquiry-key-expiry',{headers:{authorization:'Bearer synthetic-cron-only'}});
 expect((await GET(request())).status).toBe(503);expect(mock.send).not.toHaveBeenCalled();
 vi.stubEnv('CRM_WEBSITE_INTAKE_ENABLED','true');vi.stubEnv('CRM_CORPORATE_INQUIRY_ORIGIN','https://bscomplete.com');vi.stubEnv('CRM_CORPORATE_INQUIRY_SHA256','a'.repeat(64));vi.stubEnv('CRM_CORPORATE_INQUIRY_ISSUED_AT','2026-11-01T00:00:00Z');vi.stubEnv('CRM_CORPORATE_INQUIRY_EXPIRES_AT','2026-11-08T00:00:00Z');
 vi.spyOn(console,'info').mockImplementation(()=>undefined);vi.spyOn(console,'error').mockImplementation(()=>undefined);
 mock.send.mockResolvedValueOnce('created');expect(await (await GET(request())).json()).toEqual({ok:true,result:'created'});
 mock.send.mockResolvedValueOnce('duplicate');expect(await (await GET(request())).json()).toEqual({ok:true,result:'duplicate'});
 mock.send.mockRejectedValueOnce(new Error('synthetic'));expect((await GET(request())).status).toBe(503);
});
