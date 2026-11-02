import {createHash,createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {TestBridgeError,type TestPrincipal} from './erp-ocr-test';
export type TestClient={id:string;kid:string;publicJwk:{kty:'OKP';crv:'Ed25519';x:string};active:boolean;issuedAt:number;expiresAt:number};
export interface TestAuthStore{
 client(id:string):Promise<TestClient|null>;
 /** Atomic uniqueness and current client/revocation check; retained beyond assertion expiry. */
 consume(clientId:string,kid:string,jti:string,expiresAt:number):Promise<boolean>;
}
const claims=z.object({iss:z.literal('https://logistics-erp-mvp.vercel.app'),aud:z.literal('https://www.cpcrm.co.kr'),sub:z.string().min(1).max(100),scope:z.literal('ocr.synthetic.submit-read'),erpUserId:z.string().uuid(),erpCustomerId:z.string().uuid(),iat:z.number().int(),exp:z.number().int(),jti:z.string().uuid(),method:z.enum(['GET','POST']),target:z.string().max(1000),bodySha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const header=z.object({alg:z.literal('EdDSA'),typ:z.literal('erp-ocr-test+jwt'),kid:z.string().min(1).max(100)}).strict();
export async function boundedBody(r:Request){const reader=r.body?.getReader();if(!reader)return Buffer.alloc(0);const chunks:Uint8Array[]=[];let size=0;while(true){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>3*1024*1024){await reader.cancel();throw new TestBridgeError(413,'REQUEST_TOO_LARGE');}chunks.push(c.value);}return Buffer.concat(chunks);}
function decode(s:string){if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('encoding');const b=Buffer.from(s,'base64url');if(b.toString('base64url')!==s)throw Error('encoding');return JSON.parse(b.toString('utf8'));}
export function createTestServerVerifier(store:TestAuthStore,now=Date.now){return async(r:Request):Promise<TestPrincipal|null>=>{
 try{
  const authorization=r.headers.get('authorization');if(!authorization?.startsWith('Bearer ')||authorization.length>8192)return null;
  const parts=authorization.slice(7).split('.');if(parts.length!==3)return null;
  const h=header.parse(decode(parts[0])),c=claims.parse(decode(parts[1]));const time=now();
  if(c.iat*1000>time||c.exp*1000<=time||c.exp<=c.iat||c.exp-c.iat>60)return null;
  const u=new URL(r.url);if(u.origin!==c.aud||r.method!==c.method||u.pathname+u.search!==c.target||!/^\/api\/integrations\/erp\/ocr-test\/jobs(?:\/[a-f0-9-]{36})?$/.test(u.pathname))return null;
  const client=await store.client(c.sub);if(!client?.active||client.id!==c.sub||!Number.isFinite(client.issuedAt)||!Number.isFinite(client.expiresAt)||client.expiresAt<=client.issuedAt||client.kid!==h.kid||c.iat*1000<client.issuedAt||client.issuedAt>time||client.expiresAt<=time||client.expiresAt-client.issuedAt>7*86400000||c.exp*1000>client.expiresAt)return null;
  const jwk=z.object({kty:z.literal('OKP'),crv:z.literal('Ed25519'),x:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().parse(client.publicJwk);
  const sig=Buffer.from(parts[2],'base64url');if(sig.length!==64||sig.toString('base64url')!==parts[2]||!verify(null,Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:jwk,format:'jwk'}),sig))return null;
  if(createHash('sha256').update(await boundedBody(r.clone())).digest('hex')!==c.bodySha256)return null;
  if(!await store.consume(c.sub,h.kid,c.jti,c.exp*1000))return null;
  return {clientId:c.sub,issuer:c.iss,audience:c.aud,scope:c.scope,erpUserId:c.erpUserId,erpCustomerId:c.erpCustomerId,expiresAt:c.exp*1000,active:true};
 }catch(e){if(e instanceof TestBridgeError)throw e;return null;}
};}
