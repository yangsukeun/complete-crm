import { afterEach, it, expect, vi } from 'vitest';
const db=vi.hoisted(()=>({$queryRaw:vi.fn()}));
vi.mock('../src/lib/prisma',()=>({default:db}));
import { productionInquiryRuntime } from '../src/lib/website-inquiry-runtime';
afterEach(()=>{vi.unstubAllEnvs();db.$queryRaw.mockReset();});
function configure(){
 vi.stubEnv('CRM_WEBSITE_INTAKE_ENABLED','true');vi.stubEnv('CRM_CORPORATE_INQUIRY_ORIGIN','https://bscomplete.com');
 vi.stubEnv('CRM_CORPORATE_INQUIRY_SHA256','a'.repeat(64));
 vi.stubEnv('CRM_CORPORATE_INQUIRY_ISSUED_AT','2026-10-30T00:00:00Z');vi.stubEnv('CRM_CORPORATE_INQUIRY_EXPIRES_AT','2026-11-06T00:00:00Z');
}
it('does not reach storage while disabled',async()=>{vi.stubEnv('CRM_WEBSITE_INTAKE_ENABLED','false');expect(await productionInquiryRuntime()).toBeNull();expect(db.$queryRaw).not.toHaveBeenCalled();});
it('fails closed for missing bucket prerequisite, access protection or database failure',async()=>{
 configure(); db.$queryRaw.mockResolvedValueOnce([{ready:true}]).mockResolvedValueOnce([{ready:false}]);expect(await productionInquiryRuntime()).toBeNull();
 db.$queryRaw.mockResolvedValueOnce([{ready:false}]);expect(await productionInquiryRuntime()).toBeNull();
 db.$queryRaw.mockRejectedValueOnce(new Error('synthetic database failure'));expect(await productionInquiryRuntime()).toBeNull();
});
it('requires both schema checks and exact apex Origin even with credentials',async()=>{
 configure();db.$queryRaw.mockResolvedValue([{ready:true}]);const rt=await productionInquiryRuntime();expect(rt).not.toBeNull();
 const query=db.$queryRaw.mock.calls[1][0].join('');expect(query).toContain("ARRAY['source_site','bucket_key']");
 expect(await rt!.authenticateSite(new Request('https://www.cpcrm.co.kr/api/integrations/website-inquiries/v1',{method:'POST',headers:{origin:'https://www.bscomplete.com'}}))).toBeNull();
});
