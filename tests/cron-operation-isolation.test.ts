import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {verifyCronRequest} from '../src/lib/cron-auth';

afterEach(()=>vi.unstubAllEnvs());
const request=(path:string,token='synthetic-cron-only')=>new Request(`https://crm.invalid${path}`,{headers:{authorization:`Bearer ${token}`}});

it('denies unapproved operations even with valid credentials or spoofed expiry URL',()=>{
 vi.stubEnv('CRON_SECRET','synthetic-cron-only');
 expect(verifyCronRequest(request('/api/cron/hard-delete'))?.status).toBe(503);
 expect(verifyCronRequest(request('/api/cron/website-inquiry-key-expiry'))?.status).toBe(503);
});
it('still requires valid authentication for the explicitly approved handler',()=>{
 vi.stubEnv('CRON_SECRET','synthetic-cron-only');
 expect(verifyCronRequest(request('/api/cron/website-inquiry-key-expiry','wrong'),'website-inquiry-key-expiry')?.status).toBe(401);
 expect(verifyCronRequest(request('/api/cron/website-inquiry-key-expiry'),'website-inquiry-key-expiry')).toBeNull();
});
it('all eleven scheduled legacy handlers return the default-deny result before side effects',()=>{
 const config=JSON.parse(readFileSync('vercel.json','utf8')) as {crons:{path:string;schedule:string}[]};
 const legacy=config.crons.filter(x=>x.path!=='/api/cron/website-inquiry-key-expiry');
 expect(legacy).toHaveLength(11);
 for(const {path} of legacy){
  const source=readFileSync(`app${path}/route.ts`,'utf8');
  expect(source).toMatch(/export async function GET\(req: Request\)\s*\{\s*const (denied|unauthorized) = verifyCronRequest\(req\);\s*if \(\1\) return \1;/);
 }
});
