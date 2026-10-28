import {constants,createCipheriv,createDecipheriv,createHash,createPublicKey,generateKeyPairSync,privateDecrypt,publicEncrypt,randomBytes,randomUUID,sign,verify,type KeyObject} from 'node:crypto';
import {z} from 'zod';
export const pairingInput=z.object({requestKey:z.string().uuid(),publicKey:z.string().max(2000),challenge:z.string().regex(/^[a-f0-9]{64}$/),pairExpiresAt:z.number().int().positive(),confirmedFingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type PairingInput=z.infer<typeof pairingInput>;
export type CipherEnvelope={key:string;iv:string;tag:string;data:string};
export type DeliveryAction='receive'|'ack'|'fail';
export const deliveryProof=z.object({requestKey:z.string().uuid(),action:z.enum(['receive','ack','fail']),signature:z.string().max(1024),digest:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
export type DeliveryProof=z.infer<typeof deliveryProof>;
export function publicKeyDetails(pem:string){if(!pem.startsWith('-----BEGIN PUBLIC KEY-----')||!pem.trimEnd().endsWith('-----END PUBLIC KEY-----'))throw Error('Public SPKI only');const key=createPublicKey(pem);if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails?.modulusLength!==3072)throw Error('RSA3072 public key required');return {key,fingerprint:createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex')};}
export const envelopeDigest=(value:CipherEnvelope)=>createHash('sha256').update(JSON.stringify([value.key,value.iv,value.tag,value.data])).digest('hex');
export function sealCredential(key:KeyObject,value:unknown):CipherEnvelope{const secret=randomBytes(32),iv=randomBytes(12),plain=Buffer.from(JSON.stringify(value));try{const cipher=createCipheriv('aes-256-gcm',secret,iv);const data=Buffer.concat([cipher.update(plain),cipher.final()]);return {key:publicEncrypt({key,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},secret).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};}finally{secret.fill(0);plain.fill(0);}}
function frame(deviceId:string,pair:Pick<PairingInput,'requestKey'|'challenge'>,action:DeliveryAction,digest=''){return Buffer.from(JSON.stringify(['crm-ocr-pair-v1','https://www.cpcrm.co.kr',deviceId,pair.requestKey,pair.challenge,action,digest]));}
export function verifyDelivery(deviceId:string,pair:PairingInput,proof:DeliveryProof){return verify('sha256',frame(deviceId,pair,proof.action,proof.digest),{key:publicKeyDetails(pair.publicKey).key,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(proof.signature,'base64'));}
/** PC-only ephemeral key. Descriptor contains only public values. */
export function createPcPairing(deviceId:string,now=Date.now()){
 const keys=generateKeyPairSync('rsa',{modulusLength:3072});
 const publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString();
 const descriptor:PairingInput={requestKey:randomUUID(),publicKey,challenge:randomBytes(32).toString('hex'),pairExpiresAt:now+5*60000,confirmedFingerprint:publicKeyDetails(publicKey).fingerprint};
 return {descriptor,
  proof:(action:DeliveryAction,digest?:string):DeliveryProof=>({requestKey:descriptor.requestKey,action,...(digest?{digest}:{}),signature:sign('sha256',frame(deviceId,descriptor,action,digest),{key:keys.privateKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('base64')}),
  open:(value:CipherEnvelope):unknown=>{if(value.data.length>16384)throw Error('Envelope too large');const secret=privateDecrypt({key:keys.privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(value.key,'base64'));let plain:Buffer|undefined;try{const decipher=createDecipheriv('aes-256-gcm',secret,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));plain=Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]);return JSON.parse(plain.toString('utf8'));}finally{secret.fill(0);plain?.fill(0);}},
 };
}
