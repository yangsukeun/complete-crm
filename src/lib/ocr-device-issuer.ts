import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {OcrBoundaryError} from './logistics-ocr';
import {pairingInput,deliveryProof,publicKeyDetails,sealCredential,envelopeDigest,verifyDelivery,type PairingInput,type CipherEnvelope} from './ocr-device-pairing';
export const OCR_PILOT={owner:'cmmitn4830000fc0jt8c1l2jf',deviceId:'2eacd22d-537e-4fe5-9a0c-0f848aa5321d',companyId:'e0c563ba-919f-456d-a645-46c5f2b2ec70',origin:'https://www.cpcrm.co.kr'} as const;
export type Enrollment={id:string;companyId:string;registeredBy:string;registeredAt:number;expiresAt:number;tokenIssuedAt:number|null;tokenExpiresAt:number|null;tokenHash:string|null;state:'pending_delivery'|'active'|'uncertain'|'revoked';requestKey:string;audit:{action:string;key:string;actor:string;at:number}[];delivery?:{pair:PairingInput;envelope?:CipherEnvelope;digest:string}};
export interface EnrollmentTx {activeUser(id:string):Promise<boolean>;get(id:string):Promise<Enrollment|null>;anyOtherRegistration(id:string):Promise<boolean>;save(row:Enrollment):Promise<void>}
export interface EnrollmentDb {transaction<T>(fn:(tx:EnrollmentTx)=>Promise<T>):Promise<T>}
export class OcrDeviceIssuer {
 constructor(private db:EnrollmentDb,private now=Date.now,private secret=()=>randomBytes(32).toString('base64url')){}
 private async authorize(tx:EnrollmentTx,actor:string|null){if(!actor)throw new OcrBoundaryError(401,'Authentication required');if(actor!==OCR_PILOT.owner||!await tx.activeUser(actor))throw new OcrBoundaryError(403,'Owner only');}
 private receipt(row:Enrollment){return {deviceId:row.id,companyId:row.companyId,state:row.state==='active'&&(this.now()>=row.expiresAt||this.now()>=(row.tokenExpiresAt??0))?'expired':row.state,registrationExpiresAt:row.expiresAt,tokenExpiresAt:row.tokenExpiresAt,registrationAuthorized:false};}
 private disable(row:Enrollment,state:'uncertain'|'revoked',key:string,actor:string){row.state=state;row.tokenHash=null;row.tokenIssuedAt=null;row.tokenExpiresAt=null;if(row.delivery)delete row.delivery.envelope;row.audit.push({action:state,key,actor,at:this.now()});}
 async issue(actor:string|null,id:string,raw:unknown){
  const pair=pairingInput.parse(raw);if(id!==OCR_PILOT.deviceId)throw new OcrBoundaryError(403,'Pilot device only');
  return this.db.transaction(async tx=>{
   await this.authorize(tx,actor);const old=await tx.get(id);
   if(old){if(old.companyId!==OCR_PILOT.companyId||old.registeredBy!==OCR_PILOT.owner)throw new OcrBoundaryError(403,'Registration scope mismatch');const p=old.delivery?.pair;if(!p||p.requestKey!==pair.requestKey||p.publicKey!==pair.publicKey||p.challenge!==pair.challenge||p.pairExpiresAt!==pair.pairExpiresAt||p.confirmedFingerprint!==pair.confirmedFingerprint)throw new OcrBoundaryError(409,'Device already registered; no automatic replacement');return this.receipt(old);}
   if(await tx.anyOtherRegistration(id))throw new OcrBoundaryError(409,'Another registration exists');
   const now=this.now();if(pair.pairExpiresAt<=now||pair.pairExpiresAt>now+5*60000)throw new OcrBoundaryError(400,'Pairing expired or lifetime invalid');
   const details=publicKeyDetails(pair.publicKey);if(details.fingerprint!==pair.confirmedFingerprint)throw new OcrBoundaryError(403,'Fingerprint mismatch');
   const token=this.secret();if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw new Error('Invalid issuer output');
   const row:Enrollment={id,companyId:OCR_PILOT.companyId,registeredBy:OCR_PILOT.owner,registeredAt:now,expiresAt:now+7*86400000,tokenIssuedAt:now,tokenExpiresAt:now+15*60000,tokenHash:createHash('sha256').update(token).digest('hex'),state:'pending_delivery',requestKey:pair.requestKey,audit:[{action:'sealed',key:pair.requestKey,actor:OCR_PILOT.owner,at:now}]};
   const envelope=sealCredential(details.key,{requestKey:pair.requestKey,registeredAt:now,registrationExpiresAt:row.expiresAt,credential:{version:1,origin:OCR_PILOT.origin,deviceId:id,companyId:OCR_PILOT.companyId,syntheticOnly:true,issuedAt:now,expiresAt:row.tokenExpiresAt,token}});
   row.delivery={pair,envelope,digest:envelopeDigest(envelope)};await tx.save(row);return this.receipt(row);
  });
 }
 async delivery(id:string,raw:unknown){
  const proof=deliveryProof.parse(raw);if(id!==OCR_PILOT.deviceId)throw new OcrBoundaryError(403,'Pilot device only');
  const outcome=await this.db.transaction(async tx=>{
   const row=await tx.get(id),d=row?.delivery;
   if(!row||!d||row.companyId!==OCR_PILOT.companyId||row.registeredBy!==OCR_PILOT.owner||proof.requestKey!==row.requestKey||!verifyDelivery(id,d.pair,proof))throw new OcrBoundaryError(403,'Invalid delivery proof');
   if(row.state==='revoked'&&proof.action==='fail')return {revoked:true as const};
   if(row.state==='revoked'||row.state==='uncertain')throw new OcrBoundaryError(409,'Device disabled');
   // A one-way failure report may revoke this device through its original 15-minute token window.
   if(proof.action==='fail'&&this.now()<=row.registeredAt+15*60000){this.disable(row,'revoked',proof.requestKey,'device');await tx.save(row);return {revoked:true as const};}
   if(this.now()>=d.pair.pairExpiresAt||this.now()>=(row.tokenExpiresAt??0)||!await tx.activeUser(OCR_PILOT.owner)){
    if(row.state==='pending_delivery'){this.disable(row,'uncertain',proof.requestKey,'device');await tx.save(row);}return {expired:true as const};
   }
   if(proof.action==='ack'){
    if(proof.digest!==d.digest)throw new OcrBoundaryError(409,'Receipt digest mismatch');
    if(row.state==='pending_delivery'){row.state='active';delete d.envelope;row.audit.push({action:'stored_ack',key:proof.requestKey,actor:'device',at:this.now()});await tx.save(row);}
    return this.receipt(row);
   }
   if(row.state!=='pending_delivery'||!d.envelope)throw new OcrBoundaryError(409,'Delivery already acknowledged');
   return {envelope:d.envelope,digest:d.digest,state:'pending_delivery' as const};
  });
  if('expired' in outcome)throw new OcrBoundaryError(410,'Delivery expired or owner disabled');return outcome;
 }
 async revoke(actor:string|null,id:string,requestKey:string){
  z.string().uuid().parse(requestKey);if(id!==OCR_PILOT.deviceId)throw new OcrBoundaryError(403,'Pilot device only');
  return this.db.transaction(async tx=>{await this.authorize(tx,actor);const row=await tx.get(id);if(!row)throw new OcrBoundaryError(404,'Not found');if(row.companyId!==OCR_PILOT.companyId||row.registeredBy!==OCR_PILOT.owner)throw new OcrBoundaryError(403,'Registration scope mismatch');if(row.state!=='revoked'){this.disable(row,'revoked',requestKey,OCR_PILOT.owner);await tx.save(row);}return this.receipt(row);});
 }
}
