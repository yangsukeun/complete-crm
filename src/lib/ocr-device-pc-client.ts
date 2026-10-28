import {z} from 'zod';
import {createPcPairing,envelopeDigest,type DeliveryProof} from './ocr-device-pairing';
import {OCR_PILOT} from './ocr-device-issuer';
const responseSchema=z.object({envelope:z.object({key:z.string().max(1024),iv:z.string().max(32),tag:z.string().max(32),data:z.string().max(16384)}).strict(),digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.literal('pending_delivery')}).strict();
const credentialSchema=z.object({version:z.literal(1),origin:z.literal(OCR_PILOT.origin),deviceId:z.literal(OCR_PILOT.deviceId),companyId:z.literal(OCR_PILOT.companyId),syntheticOnly:z.literal(true),issuedAt:z.number().int(),expiresAt:z.number().int(),token:z.string().regex(/^[A-Za-z0-9_-]{32,256}$/)}).strict();
const envelopeSchema=z.object({requestKey:z.string().uuid(),registeredAt:z.number().int(),registrationExpiresAt:z.number().int(),credential:credentialSchema}).strict();
export type PcStoreEnvelope=z.infer<typeof envelopeSchema>;
export type PcStoreAck={requestKey:string;deviceId:string;status:'stored';expiresAt:number;registrationAuthorized:false};
/** Fixed HTTPS endpoint, no redirects/cookies/bearer. Production worker imports this PC-only module. */
export async function postDeviceProof(proof:DeliveryProof):Promise<unknown>{
 const response=await fetch(`${OCR_PILOT.origin}/api/logistics-ocr/devices/${OCR_PILOT.deviceId}/delivery`,{method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Device delivery response not accepted');
 const reader=response.body?.getReader();if(!reader)throw Error('Missing response');let size=0;const chunks:Uint8Array[]=[];try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>24576)throw Error('Response too large');chunks.push(next.value);}}finally{await reader.cancel();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createPcDeliveryClient(now=Date.now,post=postDeviceProof){
 const pair=createPcPairing(OCR_PILOT.deviceId,now());let phase:'ready'|'busy'|'stored'|'active'|'failed'='ready',digest='';
 let revocation:Promise<{revoked:boolean}>|undefined,tokenExpiresAt=0;
 const nack=()=>{phase='failed';return revocation??=(async()=>{const result=await post(pair.proof('fail')) as {revoked?:boolean};return {revoked:result.revoked===true};})();};
 const ack=async()=>{if(phase!=='stored')throw Error('DPAPI storage acknowledgement required');if(now()>=pair.descriptor.pairExpiresAt||now()>=tokenExpiresAt){try{await nack();}catch{}throw Error('Pairing expired; activation blocked');}const result=await post(pair.proof('ack',digest)) as {state?:string};if(result.state!=='active')throw Error('Activation not confirmed');phase='active';return {state:'active',registrationAuthorized:false};};
 return {publicDescriptor:pair.descriptor,revoke:nack,resumeAck:ack,
  receiveAndStore:async(storeAndRead:(envelope:PcStoreEnvelope)=>Promise<PcStoreAck>)=>{
   if(phase!=='ready'||now()>=pair.descriptor.pairExpiresAt)throw Error('Inspect pairing state; do not redeliver');phase='busy';
   let envelope:PcStoreEnvelope|undefined;
   try{
    const response=responseSchema.parse(await post(pair.proof('receive')));if(envelopeDigest(response.envelope)!==response.digest)throw Error('Ciphertext digest mismatch');digest=response.digest;
    envelope=envelopeSchema.parse(pair.open(response.envelope));const c=envelope.credential;
    if(envelope.requestKey!==pair.descriptor.requestKey||envelope.registeredAt>c.issuedAt||envelope.registrationExpiresAt-envelope.registeredAt>7*86400000||envelope.registrationExpiresAt<=now()||c.expiresAt>envelope.registrationExpiresAt||c.issuedAt>now()||c.expiresAt<=now()||c.expiresAt-c.issuedAt>15*60000)throw Error('Credential scope or expiry mismatch');
    const stored=await storeAndRead(envelope);if(stored.status!=='stored'||stored.requestKey!==envelope.requestKey||stored.deviceId!==OCR_PILOT.deviceId||stored.expiresAt!==c.expiresAt||stored.registrationAuthorized!==false)throw Error('Storage acknowledgement mismatch');
    tokenExpiresAt=c.expiresAt;phase='stored';
   }catch{phase='failed';try{await nack();}catch{/* Remain disabled/unconfirmed; no retry. */}throw Error('Delivery failed or uncertain; inspect issuer and vault');}finally{if(envelope)envelope.credential.token='';}
   // Lost ACK response leaves phase=stored; retry only ACK, never store or issue again.
   return ack();
  },
 };
}
