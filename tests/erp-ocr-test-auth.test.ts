import {it,expect} from 'vitest';
import {generateKeyPairSync,sign,createHash,randomUUID} from 'node:crypto';
import {createTestServerVerifier,type TestClient} from '../src/lib/erp-ocr-test-auth';
// Ephemeral test-only key pairs in memory, never returned/logged/saved or registered.
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const base='https://www.cpcrm.co.kr/api/integrations/erp/ocr-test/jobs';
const body='{"synthetic":true}';
const user='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002';
const original:TestClient={id:'synthetic-test',kid:'test-key',publicJwk:publicKey.export({format:'jwk'}) as TestClient['publicJwk'],active:true,issuedAt:0,expiresAt:120000};
const claims=()=>({iss:'https://logistics-erp-mvp.vercel.app',aud:'https://www.cpcrm.co.kr',sub:'synthetic-test',scope:'ocr.synthetic.submit-read',erpUserId:user,erpCustomerId:customer,iat:10,exp:60,jti:randomUUID(),method:'POST',target:'/api/integrations/erp/ocr-test/jobs',bodySha256:createHash('sha256').update(body).digest('hex')});
function request(c:object,change?:{body?:string;url?:string;signature?:boolean}){const h=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'erp-ocr-test+jwt',kid:'test-key'})).toString('base64url'),p=Buffer.from(JSON.stringify(c)).toString('base64url'),sig=sign(null,Buffer.from(h+'.'+p),privateKey).toString('base64url');return new Request(change?.url??base,{method:'POST',headers:{authorization:'Bearer '+h+'.'+p+'.'+(change?.signature?'x'.repeat(86):sig)},body:change?.body??body});}
function fixture(client=original){const seen=new Set<string>();return createTestServerVerifier({client:async()=>client,consume:async(_c,_k,j)=>{if(seen.has(j))return false;seen.add(j);return true;}},()=>20000);}
it('verifies exact signed request and atomically rejects replay',async()=>{const auth=fixture(),c=claims();expect((await auth(request(c)))?.erpUserId).toBe(user);expect(await auth(request(c))).toBe(null);});
it('rejects changed method/path/query/body/signature',async()=>{for(const change of [{body:'changed'},{url:base+'?other=1'},{url:base+'/00000000-0000-4000-8000-000000000003'},{signature:true}])expect(await fixture()(request(claims(),change))).toBe(null);});
it('rejects wrong audience/issuer/scope, future/expired/long assertions',async()=>{for(const patch of [{aud:'https://other.test'},{iss:'https://other.test'},{scope:'ocr.review.export'},{iat:30},{exp:19},{exp:100},{erpUserId:'invalid'}])expect(await fixture()(request({...claims(),...patch}))).toBe(null);});
it('rejects revoked/expired registration and wrong public key',async()=>{const other=generateKeyPairSync('ed25519').publicKey.export({format:'jwk'}) as TestClient['publicJwk'];for(const patch of [{id:'wrong-client'},{issuedAt:15000},{issuedAt:Number.NaN},{expiresAt:Number.NaN},{active:false},{expiresAt:19000},{expiresAt:8*86400000},{publicJwk:other}])expect(await fixture({...original,...patch})(request(claims()))).toBe(null);});
it('does not accept cookies or device tokens',async()=>{expect(await fixture()(new Request(base,{headers:{cookie:'session=synthetic'}}))).toBe(null);expect(await fixture()(new Request(base,{headers:{authorization:'Bearer synthetic-device-token'}}))).toBe(null);});
